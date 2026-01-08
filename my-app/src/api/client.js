import axios from 'axios';
import { clearAuth, ensureFreshAuth } from '../utils/auth';
import { initAuthSync } from '../utils/authStorage';

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

client.interceptors.response.use(
  (res) => res,
  (error) => {
    if (error?.response?.status === 401) {
      clearAuth(client);
    }
    return Promise.reject(error);
  }
);

export default client;
