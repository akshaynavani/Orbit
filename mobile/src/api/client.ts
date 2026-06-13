import Constants from 'expo-constants';

export const API_URL: string = (
  process.env.EXPO_PUBLIC_API_URL ??
  (Constants.expoConfig?.extra as { apiUrl?: string } | undefined)?.apiUrl ??
  'http://localhost:8000'
).replace(/\/$/, '');

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

let token: string | null = null;
let onUnauthorized: (() => void) | null = null;

export const api = {
  setToken(t: string | null) {
    token = t;
  },
  isAuthenticated() {
    return token !== null;
  },
  /** Called when the server rejects our token so the app can log out. */
  setUnauthorizedHandler(fn: (() => void) | null) {
    onUnauthorized = fn;
  },

  async request<T>(method: string, path: string, body?: unknown, timeoutMs = 15_000): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(`${API_URL}${path}`, {
        method,
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      if (res.status === 401 && token) onUnauthorized?.();
      if (!res.ok) {
        let detail = res.statusText;
        try {
          const json = await res.json();
          detail = typeof json.detail === 'string' ? json.detail : JSON.stringify(json.detail);
        } catch {
          /* non-JSON error body */
        }
        throw new ApiError(res.status, detail);
      }
      return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
    } finally {
      clearTimeout(timer);
    }
  },

  get<T>(path: string, timeoutMs?: number) {
    return api.request<T>('GET', path, undefined, timeoutMs);
  },
  post<T>(path: string, body?: unknown, timeoutMs?: number) {
    return api.request<T>('POST', path, body, timeoutMs);
  },
};
