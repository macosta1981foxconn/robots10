import { API_URL } from '$app/env/public';

const BASE_URL = (API_URL || '/api').replace(/\/$/, '');
const TOKEN_KEY = 'robot_admin_token';

export function getToken() {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

export function setToken(token) {
  if (typeof window === 'undefined') return;
  if (token) window.localStorage.setItem(TOKEN_KEY, token);
  else window.localStorage.removeItem(TOKEN_KEY);
}

export function clearToken() {
  setToken(null);
}

const PUBLIC_PATHS = new Set(['/auth/config', '/auth/login', '/auth/signup']);

export async function api(path, options = {}) {
  const token = getToken();
  if (!token && !PUBLIC_PATHS.has(path)) {
    const error = new Error('No autenticado');
    error.status = 401;
    throw error;
  }
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers,
    body: options.body && typeof options.body !== 'string' ? JSON.stringify(options.body) : options.body
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401 && !path.startsWith('/auth')) {
      clearToken();
    }
    const error = new Error(data.error || `Error ${response.status}`);
    error.status = response.status;
    error.data = data;
    throw error;
  }
  return data;
}

export const auth = {
  login: (email, password) => api('/auth/login', { method: 'POST', body: { email, password } }),
  signup: (email, password, name, role) =>
    api('/auth/signup', { method: 'POST', body: { email, password, name, role } }),
  me: () => api('/auth/me'),
  logout: () => {
    clearToken();
  }
};

export function setAuthSession(session) {
  if (session?.access_token) setToken(session.access_token);
}
