// A damaged data file must be kept, not silently replaced.
//
// Both settings.json and the file store are read once and written back on the next change. If
// the read failed and the result was treated as "empty", the first write would destroy whatever
// was there. The server should carry on with empty state and leave the broken file behind for
// the person to look at.
import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { bootApi, call } from './helpers.js';

let api;

before(async () => {
  api = await bootApi({
    MONGODB_URI: 'mongodb://127.0.0.1:59999/none',
    MONGODB_TIMEOUT_MS: '400',
    beforeImport: (dir) => {
      // Truncated JSON, the classic half-written-file failure.
      writeFileSync(path.join(dir, 'settings.json'), '{"provider": "cust');
      writeFileSync(path.join(dir, 'store.json'), '{"version": 1, "users": [');
    },
  });
});

after(async () => {
  await api?.close();
});

describe('a damaged data file', () => {
  it('does not stop the server from starting', async () => {
    const { status, body } = await call(api.base, '/api/health');
    assert.equal(status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.storage.backend, 'file');
  });

  it('keeps the unreadable file instead of overwriting it', () => {
    const files = readdirSync(api.dir);
    assert.ok(files.includes('settings.json.corrupt'), `settings.json.corrupt missing (saw ${files.join(', ')})`);
    assert.ok(files.includes('store.json.corrupt'), `store.json.corrupt missing (saw ${files.join(', ')})`);
    assert.ok(!existsSync(path.join(api.dir, 'settings.json')), 'a fresh settings file is only written when settings change');
  });

  it('still creates an account and a library item', async () => {
    const email = `corrupt.${Date.now()}@example.com`;
    const registered = await call(api.base, '/api/auth/register', { method: 'POST', body: { email, password: 'Str0ngPass', name: 'After Damage' } });
    assert.equal(registered.status, 201, registered.body?.error);
    const token = registered.body.token;

    const saved = await call(api.base, '/api/library', { method: 'POST', token, body: { kind: 'notes', data: { title: 'Recovered', sections: [] } } });
    assert.equal(saved.status, 201);
    const list = await call(api.base, '/api/library', { token });
    assert.equal(list.body.length, 1);
  });
});
