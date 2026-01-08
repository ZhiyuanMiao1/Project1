import axios from 'axios';
import { clearAuth, ensureFreshAuth } from '../utils/auth';
import { getAuthToken, initAuthSync } from '../utils/authStorage';

// Prefer env var; fall back to local dev server
const baseURL = process.env.REACT_APP_API_BASE || 'http://localhost:5000';

const client = axios.create({
  baseURL,
  withCredentials: false,
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
  (error) => {
    if (error?.response?.status === 401) {
      // Only clear auth when request actually carried an auth header; avoid wiping token due to a missing-header race.
      const headers = error?.config?.headers || {};
      const hadAuthHeader =
        !!headers?.Authorization
        || !!headers?.authorization;
      if (hadAuthHeader) {
        clearAuth(client);
      }
    }
    return Promise.reject(error);
  }
);

export default client;
