// Auth service: where the session token lives, and how requests are signed.
//
// The token is kept in localStorage so a refresh keeps you signed in. Everything that talks
// to the API goes through authenticatedFetch, which adds the Authorization header and — this
// matters — leaves the Content-Type alone for FormData uploads so the browser can set the
// multipart boundary itself.

const TOKEN_KEY = 'token';
const USER_KEY = 'user';

export async function register({ email, password, name }) {
  return post('/api/auth/register', { email, password, name }, 'Could not create your account.');
}

export async function login({ email, password }) {
  return post('/api/auth/login', { email, password }, 'Could not sign you in.');
}

async function post(path, body, fallbackMessage) {
  let response;
  try {
    response = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error('Cannot reach the server. Is it running?');
  }
  const data = await safeJson(response);
  if (!response.ok) throw new Error(data?.error || fallbackMessage);
  return data;
}

async function safeJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

export async function logout() {
  try {
    await authenticatedFetch('/api/auth/logout', { method: 'POST' });
  } catch { /* the token is going away regardless */ }
  clearSession();
}

export function getToken() {
  try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
}

export function getUser() {
  try {
    const raw = localStorage.getItem(USER_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && parsed.email ? parsed : null;
  } catch {
    // A half-written or hand-edited value must not crash the app on start.
    try { localStorage.removeItem(USER_KEY); } catch { /* ignore */ }
    return null;
  }
}

export function setSession({ token, user }) {
  try {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  } catch { /* private mode: the session simply will not survive a refresh */ }
}

export function clearSession() {
  try {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  } catch { /* ignore */ }
}

export function isAuthenticated() {
  return Boolean(getToken());
}

// ---------------------------------------------------------------- token helpers
export function tokenPayload(token = getToken()) {
  if (!token || typeof token !== 'string') return null;
  try {
    const part = token.split('.')[1];
    if (!part) return null;
    const base64 = part.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
    const bytes = Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return null;
  }
}

/** True when the stored token is missing or already past its expiry. */
export function isTokenExpired(token = getToken()) {
  if (!token) return true;
  const payload = tokenPayload(token);
  if (!payload?.exp) return false; // no expiry claim: let the server decide
  return payload.exp * 1000 <= Date.now();
}

/** Ask the server who we are. Used on start so an expired session is noticed immediately. */
export async function currentUser() {
  if (!isAuthenticated() || isTokenExpired()) {
    clearSession();
    return null;
  }
  try {
    const response = await authenticatedFetch('/api/auth/me');
    if (!response.ok) return null;
    const data = await safeJson(response);
    if (!data?.user) {
      clearSession();
      return null;
    }
    setSession({ token: getToken(), user: data.user });
    return data.user;
  } catch {
    // Server not reachable: keep whatever we had rather than throwing the user out.
    return getUser();
  }
}

// ---------------------------------------------------------------- requests
export async function authenticatedFetch(endpoint, options = {}) {
  const token = getToken();
  const headers = new Headers(options.headers || {});
  const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;

  // Never set Content-Type for FormData: fetch has to add the multipart boundary itself.
  if (options.body !== undefined && !isFormData && !headers.has('content-type')) {
    headers.set('content-type', 'application/json');
  }
  if (token) headers.set('authorization', `Bearer ${token}`);

  return fetch(endpoint, { ...options, headers });
}
