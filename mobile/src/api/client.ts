// Typed API client for the Quality Market backend.
// - baseURL points at the deployed Next.js app (EXPO_PUBLIC_API_URL).
// - A Clerk session JWT is injected as `Authorization: Bearer <token>` on every
//   request. The existing backend's getAuth(request)/clerkMiddleware accept this,
//   so no server-side auth changes are required.
// - Responses are normalized: the backend returns `{ error }` on failure (any
//   non-2xx) and a plain JSON object on success. We surface errors as ApiError.
import axios, { AxiosError, type AxiosRequestConfig } from 'axios';
import { API_URL } from '@/constants';

export class ApiError extends Error {
  status?: number;
  data?: unknown;
  constructor(message: string, status?: number, data?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }
}

type TokenGetter = () => Promise<string | null>;

// Registered once at startup by <ApiAuthBridge/> (see src/api/authBridge.tsx),
// which bridges Clerk's useAuth().getToken into this non-React axios instance.
let tokenGetter: TokenGetter | null = null;
export function setAuthTokenGetter(getter: TokenGetter | null): void {
  tokenGetter = getter;
}

export const api = axios.create({
  baseURL: API_URL,
  timeout: 20_000,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use(async (config) => {
  if (tokenGetter) {
    try {
      const token = await tokenGetter();
      if (token) {
        config.headers = config.headers ?? {};
        (config.headers as Record<string, string>).Authorization = `Bearer ${token}`;
      }
    } catch {
      // No token available — request proceeds unauthenticated and the backend
      // will return 401 where auth is required.
    }
  }
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (error: AxiosError<{ error?: string; message?: string }>) => {
    const data = error.response?.data;
    const message =
      data?.error || data?.message || error.message || 'Request failed';
    return Promise.reject(new ApiError(message, error.response?.status, data));
  },
);

// Thin typed helpers that return the parsed JSON body.
export async function apiGet<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
  const res = await api.get<T>(url, config);
  return res.data;
}

export async function apiPost<T>(
  url: string,
  body?: unknown,
  config?: AxiosRequestConfig,
): Promise<T> {
  const res = await api.post<T>(url, body, config);
  return res.data;
}

export async function apiPut<T>(
  url: string,
  body?: unknown,
  config?: AxiosRequestConfig,
): Promise<T> {
  const res = await api.put<T>(url, body, config);
  return res.data;
}

export async function apiPatch<T>(
  url: string,
  body?: unknown,
  config?: AxiosRequestConfig,
): Promise<T> {
  const res = await api.patch<T>(url, body, config);
  return res.data;
}

export async function apiDelete<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
  const res = await api.delete<T>(url, config);
  return res.data;
}
