export class ApiError extends Error {
  status: number;
  data: unknown;

  constructor(message: string, status: number, data?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }
}

let fallbackSessionToken = '';
export function setApiSessionToken(token?: string | null) {
  fallbackSessionToken = token || '';
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  if (fallbackSessionToken) {
    if (!headers.has('Authorization')) headers.set('Authorization', `Bearer ${fallbackSessionToken}`);
    if (!headers.has('X-AIHolding-Session')) headers.set('X-AIHolding-Session', fallbackSessionToken);
  }
  if (options.body && !(options.body instanceof FormData) && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  const response = await fetch(path.startsWith('/api') ? path : `/api${path}`, {
    ...options,
    headers,
    credentials: 'include',
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = typeof data?.error === 'string' ? data.error : `Request failed (${response.status}).`;
    throw new ApiError(message, response.status, data);
  }
  return data as T;
}

export const post = <T>(path: string, body?: unknown) => api<T>(path, {
  method: 'POST',
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});
export const patch = <T>(path: string, body?: unknown) => api<T>(path, {
  method: 'PATCH',
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});
export const put = <T>(path: string, body?: unknown) => api<T>(path, {
  method: 'PUT',
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});
export const del = <T>(path: string) => api<T>(path, { method: 'DELETE' });
