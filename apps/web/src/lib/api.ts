const BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3001/api/v1';

export class ApiError extends Error {
  constructor(public readonly status: number, message: string, public readonly body?: unknown) {
    super(message);
  }
}

let accessToken: string | null = null;
let onAuthLost: (() => void) | null = null;

export function setAccessToken(token: string | null) {
  accessToken = token;
}
export function setOnAuthLost(handler: (() => void) | null) {
  onAuthLost = handler;
}

export async function api<T = unknown>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const headers = new Headers(init.headers);
  // Only declare a JSON content-type when we actually send a body. Otherwise
  // Fastify rejects POSTs with `Content-Type: application/json` + empty body
  // ("Body cannot be empty when content-type is set to 'application/json'").
  if (init.body !== undefined && init.body !== null && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`);

  const res = await fetch(`${BASE}${path}`, { ...init, headers });

  if (res.status === 204) return undefined as T;

  const body = (await res.json().catch(() => null)) as unknown;

  if (!res.ok) {
    if (res.status === 401 && onAuthLost) onAuthLost();
    const fromBody =
      body && typeof body === 'object' && 'message' in body
        ? String((body as { message: unknown }).message)
        : null;
    throw new ApiError(res.status, fromBody ?? res.statusText, body);
  }

  return body as T;
}

/**
 * Multipart upload helper. {@link api} forces `Content-Type: application/json`
 * on any body, which breaks FormData (the browser needs to set the multipart
 * boundary itself). This bypasses that path while still attaching the bearer.
 */
export async function apiUpload<T = unknown>(
  path: string,
  form: FormData,
): Promise<T> {
  const headers = new Headers();
  if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`);
  const res = await fetch(`${BASE}${path}`, { method: 'POST', body: form, headers });
  if (res.status === 204) return undefined as T;
  const body = (await res.json().catch(() => null)) as unknown;
  if (!res.ok) {
    if (res.status === 401 && onAuthLost) onAuthLost();
    const fromBody =
      body && typeof body === 'object' && 'message' in body
        ? String((body as { message: unknown }).message)
        : null;
    throw new ApiError(res.status, fromBody ?? res.statusText, body);
  }
  return body as T;
}

/**
 * Downloads the response body as a Blob, then triggers a browser download
 * with the given filename. Honours the bearer token like {@link api} so
 * authenticated endpoints work without juggling localStorage tokens.
 */
export async function apiDownload(path: string, filename: string): Promise<void> {
  const headers = new Headers();
  if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`);

  const res = await fetch(`${BASE}${path}`, { headers });
  if (!res.ok) {
    if (res.status === 401 && onAuthLost) onAuthLost();
    throw new ApiError(res.status, `Falha ao baixar (${res.status})`);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
