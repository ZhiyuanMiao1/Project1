import axios from 'axios';

// Prefer env var; fall back to local dev server
const baseURL = process.env.REACT_APP_API_BASE || 'http://localhost:5000';

const client = axios.create({
  baseURL,
  // Attach cookies if backend ever needs them
  withCredentials: false,
  headers: { 'Content-Type': 'application/json' },
});

export default client;

