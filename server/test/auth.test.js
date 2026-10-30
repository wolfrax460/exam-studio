// Authentication, account creation and per-user library isolation.
// These are the flows the app's login screen depends on.
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { bootApi, call, dropTestDatabase, makeUser, TEST_MONGO } from './helpers.js';

let api;

before(async () => {
  await dropTestDatabase();
  api = await bootApi();
});

after(async () => {
  await api?.close();
  await dropTestDatabase();
});

describe('health', () => {
  it('is public and reports the provider and storage backend', async () => {
    const { status, body } = await call(api.base, '/api/health');
    assert.equal(status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.demo, true);
    assert.ok(body.provider, 'provider name is reported');
    assert.ok(body.storage?.backend, 'storage backend is reported');
    assert.equal(body.user, null);
  });
});

describe('POST /api/auth/register', () => {
  it('creates an account and returns a token', async () => {
    const { response, token } = await makeUser(api.base, { name: 'Ada Lovelace' });
    assert.equal(response.status, 201);
    assert.ok(response.body.token, 'a token is returned');
    assert.equal(response.body.user.name, 'Ada Lovelace');
    assert.ok(response.body.user.id);
    assert.equal(response.body.user.passwordHash, undefined, 'the hash is never sent to the client');
    assert.equal(response.body.user.password, undefined);

    const me = await call(api.base, '/api/auth/me', { token });
    assert.equal(me.status, 200);
    assert.equal(me.body.user.name, 'Ada Lovelace');
  });

  it('lower-cases and trims the email so the same address cannot register twice', async () => {
    const email = `Mixed.Case.${Date.now()}@Example.COM`;
    const first = await call(api.base, '/api/auth/register', { method: 'POST', body: { email, password: 'Str0ngPass', name: 'First' } });
    assert.equal(first.status, 201);
    assert.equal(first.body.user.email, email.toLowerCase());

    const again = await call(api.base, '/api/auth/register', { method: 'POST', body: { email: email.toLowerCase(), password: 'Str0ngPass', name: 'Second' } });
    assert.equal(again.status, 409);
    assert.match(again.body.error, /already exists/i);
  });

  it('explains which password rule is missing', async () => {
    for (const [password, expected] of [
      ['Short1', /at least 8/i],
      ['alllowercase1', /uppercase/i],
      ['ALLUPPERCASE1', /lowercase/i],
      ['NoDigitsHere', /digit/i],
    ]) {
      const { status, body } = await call(api.base, '/api/auth/register', { method: 'POST', body: { email: `pw${Math.random().toString(16).slice(2)}@example.com`, password, name: 'P' } });
      assert.equal(status, 400, `password ${password} must be rejected`);
      assert.match(body.error, expected);
    }
  });

  it('rejects a malformed address', async () => {
    const { status, body } = await call(api.base, '/api/auth/register', { method: 'POST', body: { email: 'not-an-email', password: 'Str0ngPass', name: 'N' } });
    assert.equal(status, 400);
    assert.match(body.error, /email/i);
  });

  // These used to crash the server with a 500 because the handler assumed strings.
  it('answers 400 (not 500) when a field has the wrong type', async () => {
    const cases = [
      { email: 12345, password: 'Str0ngPass', name: 'N' },
      { email: 'ok@example.com', password: 12345678, name: 'N' },
      { email: 'ok@example.com', password: 'Str0ngPass', name: { evil: true } },
      { email: 'ok@example.com', password: ['Str0ngPass'], name: 'N' },
      { email: null, password: 'Str0ngPass', name: 'N' },
    ];
    for (const body of cases) {
      const response = await call(api.base, '/api/auth/register', { method: 'POST', body });
      assert.equal(response.status, 400, `expected 400 for ${JSON.stringify(body)}`);
      assert.ok(response.body.error);
    }
  });

  it('caps very long input instead of storing it', async () => {
    const { status, body } = await call(api.base, '/api/auth/register', { method: 'POST', body: { email: `${'a'.repeat(300)}@example.com`, password: 'Str0ngPass', name: 'N' } });
    assert.equal(status, 400);
    assert.match(body.error, /email/i);
  });
});

describe('POST /api/auth/login', () => {
  it('signs in with the right password', async () => {
    const user = await makeUser(api.base);
    const { status, body } = await call(api.base, '/api/auth/login', { method: 'POST', body: { email: user.email, password: user.password } });
    assert.equal(status, 200);
    assert.ok(body.token);
    assert.equal(body.user.email, user.email);
    assert.equal(body.user.passwordHash, undefined);
  });

  it('accepts a differently-cased email', async () => {
    const user = await makeUser(api.base);
    const { status } = await call(api.base, '/api/auth/login', { method: 'POST', body: { email: user.email.toUpperCase(), password: user.password } });
    assert.equal(status, 200);
  });

  it('gives the same answer for a wrong password and an unknown account', async () => {
    const user = await makeUser(api.base);
    const wrongPassword = await call(api.base, '/api/auth/login', { method: 'POST', body: { email: user.email, password: 'Wr0ngPassword' } });
    const unknown = await call(api.base, '/api/auth/login', { method: 'POST', body: { email: 'nobody@example.com', password: 'Wr0ngPassword' } });
    assert.equal(wrongPassword.status, 401);
    assert.equal(unknown.status, 401);
    assert.equal(wrongPassword.body.error, unknown.body.error, 'the reply must not reveal whether the account exists');
  });

  it('rejects an empty password without a crash', async () => {
    const user = await makeUser(api.base);
    const { status } = await call(api.base, '/api/auth/login', { method: 'POST', body: { email: user.email, password: '' } });
    assert.equal(status, 400);
  });
});

describe('protected routes', () => {
  it('refuses requests without a token', async () => {
    for (const path of ['/api/library', '/api/settings', '/api/agents/info']) {
      const { status } = await call(api.base, path);
      assert.equal(status, 401, `${path} must require sign-in`);
    }
  });

  // The session-restore endpoint must answer 200 with a null user, not 401: the app asks it
  // on every page load, including while nobody is signed in.
  it('reports "signed out" from /api/auth/me instead of failing', async () => {
    const { status, body } = await call(api.base, '/api/auth/me');
    assert.equal(status, 200);
    assert.equal(body.user, null);
  });

  it('refuses a forged or malformed token', async () => {
    const cases = ['', 'garbage', 'a.b.c', `${'x'.repeat(20)}.${'y'.repeat(20)}.${'z'.repeat(20)}`];
    for (const token of cases) {
      const response = await fetch(`${api.base}/api/library`, { headers: token ? { authorization: `Bearer ${token}` } : {} });
      assert.equal(response.status, 401, `token ${JSON.stringify(token)} must be refused`);
    }
  });

  it('reports a missing token as a 401 with a readable message', async () => {
    const { body } = await call(api.base, '/api/library');
    assert.match(body.error, /sign in/i);
  });

  it('accepts the raw token as well as the Bearer form', async () => {
    const user = await makeUser(api.base);
    const response = await fetch(`${api.base}/api/auth/me`, { headers: { authorization: user.token } });
    assert.equal(response.status, 200);
  });
});

describe('library', () => {
  const exam = { title: 'Isolation exam', questions: [{ type: 'mcq', marks: 5, prompt: 'Pick one', items: [{ text: 'q', options: ['a', 'b'], answer: 'A' }] }] };

  it('saves, lists, reads and deletes an item', async () => {
    const user = await makeUser(api.base);
    const saved = await call(api.base, '/api/library', { method: 'POST', token: user.token, body: { kind: 'exam', data: exam, title: exam.title } });
    assert.equal(saved.status, 201);
    assert.ok(saved.body.id);

    const list = await call(api.base, '/api/library', { token: user.token });
    assert.equal(list.status, 200);
    assert.equal(list.body.length, 1);
    assert.equal(list.body[0].title, 'Isolation exam');
    assert.equal(list.body[0].data, undefined, 'the list stays light');

    const one = await call(api.base, `/api/library/${saved.body.id}`, { token: user.token });
    assert.equal(one.status, 200);
    assert.equal(one.body.data.title, 'Isolation exam');

    const removed = await call(api.base, `/api/library/${saved.body.id}`, { method: 'DELETE', token: user.token });
    assert.equal(removed.status, 204);

    const gone = await call(api.base, `/api/library/${saved.body.id}`, { token: user.token });
    assert.equal(gone.status, 404);
  });

  it('keeps one user out of another user\'s library', async () => {
    const owner = await makeUser(api.base);
    const other = await makeUser(api.base);
    const saved = await call(api.base, '/api/library', { method: 'POST', token: owner.token, body: { kind: 'notes', data: { title: 'Private', sections: [] } } });

    const peek = await call(api.base, `/api/library/${saved.body.id}`, { token: other.token });
    assert.equal(peek.status, 404);

    const del = await call(api.base, `/api/library/${saved.body.id}`, { method: 'DELETE', token: other.token });
    assert.equal(del.status, 404);

    const list = await call(api.base, '/api/library', { token: other.token });
    assert.equal(list.body.length, 0);
  });

  // A malformed id used to produce a 500 (Mongoose CastError).
  it('answers 404 for an id that is not a real id', async () => {
    const user = await makeUser(api.base);
    for (const id of ['not-an-id', '123', '%20', 'x'.repeat(40)]) {
      const read = await call(api.base, `/api/library/${encodeURIComponent(id)}`, { token: user.token });
      assert.equal(read.status, 404, `GET ${id}`);
      const del = await call(api.base, `/api/library/${encodeURIComponent(id)}`, { method: 'DELETE', token: user.token });
      assert.equal(del.status, 404, `DELETE ${id}`);
    }
  });

  it('validates the kind and the payload', async () => {
    const user = await makeUser(api.base);
    const badKind = await call(api.base, '/api/library', { method: 'POST', token: user.token, body: { kind: 'virus', data: { a: 1 } } });
    assert.equal(badKind.status, 400);

    const noData = await call(api.base, '/api/library', { method: 'POST', token: user.token, body: { kind: 'exam' } });
    assert.equal(noData.status, 400);

    const arrayData = await call(api.base, '/api/library', { method: 'POST', token: user.token, body: { kind: 'exam', data: [1, 2, 3] } });
    assert.equal(arrayData.status, 400);
  });

  it('falls back to a default title and caps long ones', async () => {
    const user = await makeUser(api.base);
    const untitled = await call(api.base, '/api/library', { method: 'POST', token: user.token, body: { kind: 'notes', data: { sections: [] } } });
    assert.equal(untitled.body.title, 'Untitled');

    const long = await call(api.base, '/api/library', { method: 'POST', token: user.token, body: { kind: 'notes', data: {}, title: 'x'.repeat(500) } });
    assert.equal(long.body.title.length, 120);
  });
});

describe('auth endpoints that do not exist', () => {
  it('answers 401 rather than leaking which routes exist', async () => {
    const { status } = await call(api.base, '/api/does-not-exist');
    assert.equal(status, 401);
  });
});
