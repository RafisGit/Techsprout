import axios from 'axios';

export function getApiBaseUrl(isBrowser: boolean = typeof window !== 'undefined'): string {
  return isBrowser
    ? ''
    : process.env.INTERNAL_API_URL ||
      process.env.NEXT_PUBLIC_API_URL ||
      'http://localhost:3001';
}

const API_BASE_URL = getApiBaseUrl();

const axiosInstance = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true, // Send same-origin HttpOnly cookies
  headers: {
    'Content-Type': 'application/json',
  },
});

export { axiosInstance, API_BASE_URL };
