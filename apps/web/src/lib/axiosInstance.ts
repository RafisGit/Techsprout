import axios from 'axios';
import { getSessionToken } from './session';

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ||
  (typeof window !== 'undefined' ? 'http://localhost:3001' : 'http://localhost:3001');

const axiosInstance = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true, // Send and receive secure HttpOnly cookies
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor: inject Authorization header from session cookie for cross-origin API calls
axiosInstance.interceptors.request.use((config) => {
  const token = getSessionToken();
  if (token && !config.headers.Authorization) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export { axiosInstance, API_BASE_URL };
