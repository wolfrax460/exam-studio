import { authenticatedFetch, clearSession } from './auth.js';

// One place that turns a failed request into a useful Error.
async function request(path, { json, ...opts } = {}) {
  let res;
  try {
    res = await authenticatedFetch(`/api${path}`, {
      ...opts,
      ...(json !== undefined ? { body: JSON.stringify(json) } : {}),
    });
  } catch {
    throw Object.assign(new Error('Cannot reach the server. Is it running?'), { status: 0 });
  }

  if (res.status === 401) {
    // The session is gone (expired or signed out elsewhere). Drop it and tell the app, so the
    // screen goes back to sign-in instead of showing a shell where nothing works.
    clearSession();
    if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('exam-studio:signed-out'));
  }

  if (!res.ok) {
    let message = res.statusText || 'Request failed';
    try { message = (await res.json()).error || message; } catch { /* not JSON */ }
    throw Object.assign(new Error(message), { status: res.status });
  }
  return res;
}

export const get = async (path) => (await request(path)).json();
export const post = async (path, json) => (await request(path, { method: 'POST', json })).json();
export const put = async (path, json) => (await request(path, { method: 'PUT', json })).json();
export const del = async (path, json) => { await request(path, { method: 'DELETE', ...(json ? { json } : {}) }); };

export async function uploadFile(file) {
  // The body is FormData, so authenticatedFetch deliberately leaves Content-Type unset and
  // the browser adds "multipart/form-data; boundary=...".
  const fd = new FormData();
  fd.append('file', file);
  return (await request('/extract', { method: 'POST', body: fd })).json();
}

export async function download(path, body, filename) {
  const res = await request(path, { method: 'POST', json: body });
  const url = URL.createObjectURL(await res.blob());
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Give the browser a moment to start the download before the blob is released.
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
