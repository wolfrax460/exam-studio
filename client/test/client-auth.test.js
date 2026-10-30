// Client-side session handling and request signing.
//
// These two files are the whole reason the login screen failed before: a session that was
// never checked, and a Content-Type that broke every file upload. They are plain ES modules,
// so they can be tested in Node without a browser.
import { describe, it, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';

// A localStorage stand-in (Node only provides one when started with --localstorage-file).
const store = new Map();
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => { store.set(key, String(value)); },
    removeItem: (key) => { store.delete(key); },
    clear: () => store.clear(),
  },
});

const realFetch = globalThis.fetch;
let calls = [];

/** Replace fetch with a recorder that answers with the given status. */
function stubFetch(status = 200, body = {}) {
  calls = [];
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url, options, headers: options.headers });
    return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  };
}

const auth = await import('../src/auth.js');
const api = await import('../src/api.js');

const jwt = (payload) => `header.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.signature`;
const inOneHour = () => Math.floor(Date.now() / 1000) + 3600;
const tenMinutesAgo = () => Math.floor(Date.now() / 1000) - 600;

beforeEach(() => {
  store.clear();
  stubFetch();
});

after(() => { globalThis.fetch = realFetch; });

describe('session storage', () => {
  it('round-trips a session', () => {
    auth.setSession({ token: jwt({ exp: inOneHour() }), user: { id: '1', email: 'a@b.c', name: 'A' } });
    assert.equal(auth.getUser().email, 'a@b.c');
    assert.ok(auth.isAuthenticated());
    auth.clearSession();
    assert.equal(auth.getUser(), null);
    assert.equal(auth.isAuthenticated(), false);
  });

  it('survives a corrupted stored user instead of crashing the app on start', () => {
    store.set('user', '{ this is not json');
    assert.equal(auth.getUser(), null);
    assert.equal(store.has('user'), false, 'the unusable value is cleaned out');
  });

  it('ignores a stored user that has no email', () => {
    store.set('user', JSON.stringify({ id: '1' }));
    assert.equal(auth.getUser(), null);
  });
});

describe('token expiry', () => {
  it('reads the expiry out of the token', () => {
    assert.equal(auth.isTokenExpired(jwt({ exp: inOneHour() })), false);
    assert.equal(auth.isTokenExpired(jwt({ exp: tenMinutesAgo() })), true);
  });

  it('treats a missing token as expired', () => {
    assert.equal(auth.isTokenExpired(null), true);
    assert.equal(auth.isTokenExpired(''), true);
  });

  it('does not reject a token it cannot read (the server has the last word)', () => {
    assert.equal(auth.isTokenExpired('not-a-jwt'), false);
  });

  it('decodes unicode payloads', () => {
    assert.equal(auth.tokenPayload(jwt({ name: 'Aimée Ünicode' })).name, 'Aimée Ünicode');
  });
});

describe('authenticatedFetch', () => {
  it('adds the bearer token', async () => {
    auth.setSession({ token: 'abc.def.ghi', user: { email: 'a@b.c' } });
    await auth.authenticatedFetch('/api/library');
    assert.equal(calls[0].headers.get('authorization'), 'Bearer abc.def.ghi');
  });

  // The upload bug: a JSON Content-Type on a FormData body leaves out the multipart boundary.
  it('never sets Content-Type for FormData, so the browser can add the boundary', async () => {
    await auth.authenticatedFetch('/api/extract', { method: 'POST', body: new FormData() });
    assert.equal(calls[0].headers.has('content-type'), false);
  });

  it('sets Content-Type for a JSON body', async () => {
    await auth.authenticatedFetch('/api/library', { method: 'POST', body: JSON.stringify({ a: 1 }) });
    assert.equal(calls[0].headers.get('content-type'), 'application/json');
  });

  it('does not overwrite a Content-Type the caller chose', async () => {
    await auth.authenticatedFetch('/api/x', { method: 'POST', body: 'raw', headers: { 'content-type': 'text/plain' } });
    assert.equal(calls[0].headers.get('content-type'), 'text/plain');
  });
});

describe('api helpers', () => {
  it('sends a PUT for put()', async () => {
    stubFetch(200, { ok: true });
    await api.put('/settings', { provider: 'deepseek' });
    assert.equal(calls[0].options.method, 'PUT');
    assert.equal(JSON.parse(calls[0].options.body).provider, 'deepseek');
  });

  it('surfaces the server error message and its status', async () => {
    stubFetch(409, { error: 'An account with this email already exists.' });
    await assert.rejects(() => api.post('/auth/register', {}), (error) => {
      assert.equal(error.status, 409);
      assert.match(error.message, /already exists/);
      return true;
    });
  });

  it('explains an unreachable server instead of throwing a network error', async () => {
    globalThis.fetch = async () => { throw new TypeError('fetch failed'); };
    await assert.rejects(() => api.get('/health'), /Cannot reach the server/);
  });

  it('clears the session and announces a 401', async () => {
    auth.setSession({ token: 'a.b.c', user: { email: 'a@b.c' } });
    let announced = 0;
    const listener = () => { announced += 1; };
    // Node has no window; the module guards for that, so provide one for this check.
    globalThis.window = { dispatchEvent: (event) => { if (event.type === 'exam-studio:signed-out') announced += 1; } };
    stubFetch(401, { error: 'Please sign in to continue.' });

    await assert.rejects(() => api.get('/library'));
    assert.equal(auth.getToken(), null, 'the unusable token is dropped');
    assert.equal(announced, 1, 'the app is told to show the sign-in screen');
    delete globalThis.window;
  });
});
