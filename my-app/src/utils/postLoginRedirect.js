const REDIRECT_KEY = 'postLoginRedirect';
const ROLE_KEY = 'requiredRole';

const isSafeInternalPath = (value) => {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (!trimmed.startsWith('/')) return false;
  if (trimmed.startsWith('//')) return false;
  // Disallow URLs with a scheme (e.g. https://)
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)) return false;
  return true;
};

export const inferRequiredRoleFromPath = (path) => {
  if (typeof path !== 'string') return '';
  const trimmed = path.trim();
  if (trimmed.startsWith('/mentor')) return 'mentor';
  if (trimmed.startsWith('/student')) return 'student';
  return '';
};

export const setPostLoginRedirect = (path, requiredRole) => {
  if (!isSafeInternalPath(path)) return false;
  try {
    sessionStorage.setItem(REDIRECT_KEY, path.trim());
    if (typeof requiredRole === 'string' && requiredRole.trim()) {
      sessionStorage.setItem(ROLE_KEY, requiredRole.trim());
    } else {
      sessionStorage.removeItem(ROLE_KEY);
    }
    return true;
  } catch {
    return false;
  }
};

export const peekPostLoginRedirect = () => {
  try {
    const value = sessionStorage.getItem(REDIRECT_KEY);
    return isSafeInternalPath(value) ? value.trim() : null;
  } catch {
    return null;
  }
};

export const clearPostLoginRedirect = () => {
  try {
    sessionStorage.removeItem(REDIRECT_KEY);
    sessionStorage.removeItem(ROLE_KEY);
  } catch {}
};

export const consumePostLoginRedirect = () => {
  const value = peekPostLoginRedirect();
  clearPostLoginRedirect();
  return value;
};

