// The local JSON store: what runs when MongoDB is not installed (the desktop app, or a
// plain "npm run dev" on a fresh machine). Accounts and the library must work there too.
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import crypto from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { bootApi, call, makeUser } from './helpers.js';

let api;
let dir;
let dataFile;

before(async () => {
  dir = mkdtempSync(path.join(os.tmpdir(), 'exam-studio-file-'));
  dataFile = path.join(dir, 'store.json');
  api = await bootApi({
    MONGODB_URI: 'mongodb://127.0.0.1:59999/none', // nothing is listening here
    MONGODB_TIMEOUT_MS: '400',
    DATA_FILE: dataFile,
    SETTINGS_FILE: path.join(dir, 'settings.json'),
  });
});

after(async () => {
  await api?.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('file storage backend', () => {
  it('falls back to the file store when MongoDB is unreachable, and says so', async () => {
    const { body } = await call(api.base, '/api/health');
    assert.equal(body.storage.backend, 'file');
    assert.equal(body.storage.connected, true);
  });

  it('creates an account, signs in, and keeps the library', async () => {
    const user = await makeUser(api.base, { name: 'File Store User' });
    assert.equal(user.response.status, 201);

    const login = await call(api.base, '/api/auth/login', { method: 'POST', body: { email: user.email, password: user.password } });
    assert.equal(login.status, 200);
    const token = login.body.token;

    const exam = { title: 'Stored exam', questions: [{ type: 'mcq', marks: 5, prompt: 'p', items: [] }] };
    const saved = await call(api.base, '/api/library', { method: 'POST', token, body: { kind: 'exam', data: exam } });
    assert.equal(saved.status, 201);

    const list = await call(api.base, '/api/library', { token });
    assert.equal(list.body.length, 1);
    assert.equal(list.body[0].title, 'Stored exam');

    const one = await call(api.base, `/api/library/${list.body[0].id}`, { token });
    assert.equal(one.status, 200);
    assert.equal(one.body.data.title, 'Stored exam');
  });

  it('writes a real file, hashed passwords only', async () => {
    const raw = readFileSync(dataFile, 'utf8');
    const store = JSON.parse(raw);
    assert.ok(store.users.length >= 1, 'the account was written to disk');
    assert.ok(store.items.length >= 1, 'the saved item was written to disk');
    for (const user of store.users) {
      assert.match(user.passwordHash, /^\$2[aby]\$\d{2}\$/, 'passwords are stored as bcrypt hashes');
    }
    assert.ok(!raw.includes('Str0ngPass'), 'the plain password never reaches the file');
  });

  it('rejects a duplicate account and a bad password in file mode too', async () => {
    const user = await makeUser(api.base, { name: 'Dupe' });
    const again = await call(api.base, '/api/auth/register', { method: 'POST', body: { email: user.email.toUpperCase(), password: user.password, name: 'Dupe 2' } });
    assert.equal(again.status, 409);

    const wrong = await call(api.base, '/api/auth/login', { method: 'POST', body: { email: user.email, password: 'N0tThePassword' } });
    assert.equal(wrong.status, 401);
  });

  // Password hashing is asynchronous, so two requests can both pass the "already exists"
  // check before either writes. The file store must still end up with a single account.
  it('lets only one of two simultaneous registrations through', async () => {
    const email = `race.${Date.now()}@example.com`;
    const body = { email, password: 'Str0ngPass', name: 'Race' };
    const [first, second] = await Promise.all([
      call(api.base, '/api/auth/register', { method: 'POST', body }),
      call(api.base, '/api/auth/register', { method: 'POST', body }),
    ]);
    assert.deepEqual([first.status, second.status].sort((a, b) => a - b), [201, 409]);

    const store = JSON.parse(readFileSync(dataFile, 'utf8'));
    assert.equal(store.users.filter((u) => u.email === email).length, 1);
  });

  it('gives a 404 (not a crash) for an id that is not in the file', async () => {
    const user = await makeUser(api.base);
    const missing = await call(api.base, `/api/library/${crypto.randomUUID()}`, { token: user.token });
    assert.equal(missing.status, 404);
  });
});
