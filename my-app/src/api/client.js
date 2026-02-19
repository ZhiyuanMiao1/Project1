import axios from 'axios';
import { clearAuth, ensureFreshAuth } from '../utils/auth';
import { broadcastAuthLogin, getAuthToken, initAuthSync, setAuthToken, setAuthUser } from '../utils/authStorage';

const getApiBase = () => {
  const base = process.env.REACT_APP_API_BASE;
  if (base && base.trim().length > 0) {
    return base.trim();
  }
  return '';
};

const baseURL = getApiBase();

const client = axios.create({
  baseURL,
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
});

// A dedicated client without interceptors (prevents refresh recursion)
const refreshClient = axios.create({
  baseURL,
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
});

// Sync stored token into axios; clears storage if已过期
ensureFreshAuth(client);
initAuthSync(client);

// Always attach latest token before requests (prevents race where defaults aren't ready)
client.interceptors.request.use(
  (config) => {
    const token = getAuthToken();
    if (!token) return config;

    const url = String(config?.url || '');
    const isAbsolute = /^https?:\/\//i.test(url);
    if (isAbsolute) {
      try {
        const base = new URL(String(config?.baseURL || ''));
        const target = new URL(url);
        if (base.origin && target.origin && base.origin !== target.origin) {
          return config;
        }
      } catch {
        return config;
      }
    }

    const headers = config.headers || {};
    if (headers && typeof headers?.set === 'function') {
      try {
        const hasAuth = headers.has?.('Authorization') || headers.has?.('authorization');
        if (!hasAuth) headers.set('Authorization', `Bearer ${token}`);
      } catch {}
      return config;
    }

    const hasAuthHeader =
      typeof headers?.Authorization !== 'undefined'
      || typeof headers?.authorization !== 'undefined';
    if (!hasAuthHeader) {
      try {
        headers.Authorization = `Bearer ${token}`;
      } catch {}
    }
    config.headers = headers;
    return config;
  },
  (error) => Promise.reject(error)
);

client.interceptors.response.use(
  (res) => res,
  async (error) => {
    const status = error?.response?.status;
    const url = String(error?.config?.url || '');

    if (status !== 401) return Promise.reject(error);

    // Avoid loops / refresh recursion
    const isAuthEndpoint = url.includes('/api/login') || url.includes('/api/register') || url.includes('/api/auth/refresh') || url.includes('/api/auth/logout');
    if (isAuthEndpoint) return Promise.reject(error);

    const config = error?.config || {};
    if (config._retry) return Promise.reject(error);

    // Only refresh when request actually carried an auth header; avoid wiping token due to a missing-header race.
    const headers = config.headers || {};
    const authHeaderValue =
      typeof headers?.get === 'function'
        ? (headers.get('Authorization') || headers.get('authorization'))
        : (headers?.Authorization || headers?.authorization);
    const hadAuthHeader = !!authHeaderValue;
    if (!hadAuthHeader) return Promise.reject(error);

    try {
      config._retry = true;

      if (!client.__refreshPromise) {
        client.__refreshPromise = refreshClient
          .post('/api/auth/refresh')
          .then((r) => r?.data || {})
          .finally(() => { client.__refreshPromise = null; });
      }

      const payload = await client.__refreshPromise;
      const newToken = payload?.token || payload?.accessToken;
      if (!newToken) throw new Error('Refresh did not return token');

      setAuthToken(newToken);
      if (payload?.user) setAuthUser(payload.user);
      broadcastAuthLogin({ token: newToken, user: payload?.user || null });
      try { client.defaults.headers.common['Authorization'] = `Bearer ${newToken}`; } catch {}

      const nextHeaders = config.headers || {};
      if (nextHeaders && typeof nextHeaders?.set === 'function') {
        try { nextHeaders.set('Authorization', `Bearer ${newToken}`); } catch {}
      } else {
        try { nextHeaders.Authorization = `Bearer ${newToken}`; } catch {}
      }
      config.headers = nextHeaders;

      return client(config);
    } catch (e) {
      clearAuth(client);
      return Promise.reject(error);
    }
  }
);

export default client;
