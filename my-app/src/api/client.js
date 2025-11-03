import axios from 'axios';

// Prefer env var; fall back to local dev server
const baseURL = process.env.REACT_APP_API_BASE || 'http://localhost:5000';

const client = axios.create({
  baseURL,
  withCredentials: false,
  headers: { 'Content-Type': 'application/json' },
});

// Initialize Authorization header from stored token (page refresh case)
try {
  const token = localStorage.getItem('authToken');
  if (token) client.defaults.headers.common['Authorization'] = `Bearer ${token}`;
} catch {}

export default client;
