const AUTH_TOKEN_KEY = 'authToken';
const AUTH_USER_KEY = 'authUser';

const CHANNEL_NAME = 'mx-auth';
const SOURCE_ID = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
let authChannel = null;
let authSyncInited = false;

const getLocalStorage = () => {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
};

const getSessionStorage = () => {
  if (typeof window === 'undefined') return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
};

const safeGet = (storage, key) => {
  try {
    return storage?.getItem?.(key) ?? null;
  } catch {
    return null;
  }
};

const safeSet = (storage, key, value) => {
  try {
    storage?.setItem?.(key, value);
    return true;
  } catch {
    return false;
  }
};

const safeRemove = (storage, key) => {
  try {
    storage?.removeItem?.(key);
  } catch {}
};

export const getAuthToken = () => safeGet(getLocalStorage(), AUTH_TOKEN_KEY) || safeGet(getSessionStorage(), AUTH_TOKEN_KEY);

export const setAuthToken = (token) => {
  const value = String(token ?? '');
  if (!value) return false;
  const okLocal = safeSet(getLocalStorage(), AUTH_TOKEN_KEY, value);
  const okSession = safeSet(getSessionStorage(), AUTH_TOKEN_KEY, value);
  return okLocal || okSession;
};

export const getAuthUserRaw = () => safeGet(getLocalStorage(), AUTH_USER_KEY) || safeGet(getSessionStorage(), AUTH_USER_KEY);

export const getAuthUser = () => {
  const raw = getAuthUserRaw();
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
};

export const setAuthUser = (user) => {
  const value = JSON.stringify(user || {});
  const okLocal = safeSet(getLocalStorage(), AUTH_USER_KEY, value);
  const okSession = safeSet(getSessionStorage(), AUTH_USER_KEY, value);
  return okLocal || okSession;
};

export const clearAuthStorage = () => {
  safeRemove(getLocalStorage(), AUTH_TOKEN_KEY);
  safeRemove(getLocalStorage(), AUTH_USER_KEY);
  safeRemove(getSessionStorage(), AUTH_TOKEN_KEY);
  safeRemove(getSessionStorage(), AUTH_USER_KEY);
};

export const hasAuthToken = () => !!getAuthToken();

export const AUTH_STORAGE_KEYS = {
  token: AUTH_TOKEN_KEY,
  user: AUTH_USER_KEY,
};

const ensureChannel = () => {
  if (typeof window === 'undefined') return null;
  if (typeof window.BroadcastChannel === 'undefined') return null;
  try {
    if (!authChannel) authChannel = new window.BroadcastChannel(CHANNEL_NAME);
    return authChannel;
  } catch {
    return null;
  }
};

export const broadcastAuthLogin = ({ token, user } = {}) => {
  const t = String(token ?? '');
  if (!t) return;
  const channel = ensureChannel();
  if (!channel) return;
  try {
    channel.postMessage({ type: 'login', token: t, user: user || null, sourceId: SOURCE_ID, ts: Date.now() });
  } catch {}
};

export const broadcastAuthLogout = () => {
  const channel = ensureChannel();
  if (!channel) return;
  try {
    channel.postMessage({ type: 'logout', sourceId: SOURCE_ID, ts: Date.now() });
  } catch {}
};

export const initAuthSync = (client) => {
  if (authSyncInited) return;
  authSyncInited = true;

  const channel = ensureChannel();
  if (!channel) return;

  channel.onmessage = (event) => {
    const msg = event?.data || {};
    if (!msg || msg.sourceId === SOURCE_ID) return;

    if (msg.type === 'login') {
      if (msg.token) setAuthToken(msg.token);
      if (typeof msg.user !== 'undefined') setAuthUser(msg.user || {});
      try {
        if (client?.defaults?.headers?.common && msg.token) {
          client.defaults.headers.common['Authorization'] = `Bearer ${String(msg.token)}`;
        }
      } catch {}
      try {
        window.dispatchEvent(new CustomEvent('auth:changed', { detail: { isLoggedIn: true, role: msg?.user?.role, user: msg.user } }));
      } catch {}
      return;
    }

    if (msg.type === 'logout') {
      clearAuthStorage();
      try {
        if (client?.defaults?.headers?.common) {
          delete client.defaults.headers.common['Authorization'];
        }
      } catch {}
      try {
        window.dispatchEvent(new CustomEvent('auth:changed', { detail: { isLoggedIn: false } }));
      } catch {}
    }
  };
};
