import { clearAuthStorage, getAuthToken } from './authStorage';

const safeAtob = (value) => {
  try {
    return atob(value);
  } catch {
    try {
      return Buffer.from(value, 'base64').toString('binary');
    } catch {
      return null;
    }
  }
};

const decodeTokenExp = (token) => {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length < 2) return null;
  try {
    const payloadStr = safeAtob(parts[1].replace(/-/g, '+').replace(/_/g, '/'));
    if (!payloadStr) return null;
    const payload = JSON.parse(payloadStr);
    if (typeof payload.exp !== 'number') return null;
    return payload.exp;
  } catch {
    return null;
  }
};

export const isTokenExpired = (token, skewSeconds = 30) => {
  const exp = decodeTokenExp(token);
  if (!exp) return false;
  const now = Math.floor(Date.now() / 1000);
  return exp <= now + skewSeconds;
};

export const clearAuth = (client) => {
  clearAuthStorage();
  if (client?.defaults?.headers?.common) {
    try {
      delete client.defaults.headers.common['Authorization'];
    } catch {}
  }
  try {
    window.dispatchEvent(new CustomEvent('auth:changed', { detail: { isLoggedIn: false } }));
  } catch {}
};

export const ensureFreshAuth = (client) => {
  const token = getAuthToken();

  if (!token) {
    clearAuth(client);
    return { token: null, expired: false };
  }

  const expired = isTokenExpired(token);
  if (expired) {
    clearAuth(client);
    return { token: null, expired: true };
  }

  if (client?.defaults?.headers?.common) {
    try {
      client.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    } catch {}
  }
  return { token, expired: false };
};
