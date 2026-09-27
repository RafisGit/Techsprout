import axios from 'axios';

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

export { axiosInstance };
