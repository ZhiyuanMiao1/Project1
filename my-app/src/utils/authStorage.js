const AUTH_TOKEN_KEY = 'authToken';
const AUTH_USER_KEY = 'authUser';

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
