const BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';
const TOKEN_KEY = 'octopi_token';

export const tokenStore = {
  get: () => (typeof window === 'undefined' ? null : localStorage.getItem(TOKEN_KEY)),
  set: (token) => localStorage.setItem(TOKEN_KEY, token),
  clear: () => localStorage.removeItem(TOKEN_KEY),
};

/** Carries the server's message and per-field details through to the UI. */
export class ApiError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }

  /** Field-level messages keyed by field name, for inline form errors. */
  get fieldErrors() {
    if (!this.details) return {};
    return Object.fromEntries(this.details.map((d) => [d.field, d.message]));
  }
}

export async function api(path, { method = 'GET', body, headers = {}, ...rest } = {}) {
  const token = tokenStore.get();

  let response;
  try {
    response = await fetch(`${BASE_URL}${path}`, {
      method,
      headers: {
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...headers,
      },
      body: body ? JSON.stringify(body) : undefined,
      ...rest,
    });
  } catch {
    // fetch only rejects when the request never reached the server.
    throw new ApiError(0, 'Cannot reach the server. Check your connection and try again.');
  }

  if (response.status === 204) return null;

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    // An expired or revoked session: drop the token so the app falls back to
    // the login screen instead of retrying with a dead credential.
    if (response.status === 401 && token) {
      tokenStore.clear();
      if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
        window.location.href = '/login?expired=1';
      }
    }
    throw new ApiError(response.status, payload.message || 'Something went wrong', payload.details);
  }

  return payload;
}

/** Downloads a PDF (invoices) with the auth header attached. */
export async function downloadFile(path, filename) {
  const token = tokenStore.get();
  const response = await fetch(`${BASE_URL}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new ApiError(response.status, payload.message || 'Could not download the file');
  }

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
