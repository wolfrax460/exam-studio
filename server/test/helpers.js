// Shared harness for the API tests.
//
// Every test file runs in its own process (that is how `node --test` works), so each one gets
// a fresh module graph: env vars set here are the ones the server sees when it is imported.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const TEST_MONGO = process.env.TEST_MONGODB_URI || 'mongodb://localhost:27017/examstudio_dsh_test';

/**
 * Start the API in-process on a free port.
 * @param {object} [overrides] env vars (and an optional beforeImport(dir) hook)
 */
export async function bootApi(overrides = {}) {
  const { beforeImport, ...envOverrides } = overrides;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'exam-studio-test-'));

  Object.assign(process.env, {
    DEMO_MODE: '1',
    JWT_SECRET: 'test-secret-0123456789abcdef0123456789abcdef',
    SETTINGS_FILE: path.join(dir, 'settings.json'),
    DATA_FILE: path.join(dir, 'store.json'),
    GENERATE_LIMIT_PER_HOUR: '10000',
    LOGIN_LIMIT_PER_15_MIN: '10000',
    REGISTER_LIMIT_PER_HOUR: '10000',
    BCRYPT_ROUNDS: '4', // keeps the suite fast; production uses 12
    MONGODB_URI: TEST_MONGO,
    ...envOverrides,
  });

  if (beforeImport) beforeImport(dir);

  const { start } = await import('../index.js');
  const server = await start(0, '127.0.0.1');
  const base = `http://127.0.0.1:${server.address().port}`;

  return {
    base,
    dir,
    async close() {
      await new Promise((resolve) => server.close(resolve));
      const mongoose = (await import('mongoose')).default;
      await mongoose.disconnect();
      fs.rmSync(dir, { recursive: true, force: true });
    },
  };
}

/** Small fetch wrapper: returns { status, body } and never throws on a non-2xx. */
export async function call(base, path, { method = 'GET', token, body, raw } = {}) {
  const headers = {};
  if (token) headers.authorization = `Bearer ${token}`;
  let payload = raw;
  if (body !== undefined) {
    headers['content-type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  const response = await fetch(`${base}${path}`, { method, headers, body: payload });
  const textType = response.headers.get('content-type') || '';
  const parsed = textType.includes('application/json') ? await response.json() : await response.text();
  return { status: response.status, body: parsed };
}

export async function makeUser(base, overrides = {}) {
  const user = { email: `user${Date.now()}${Math.random().toString(16).slice(2, 8)}@example.com`, password: 'Str0ngPass', name: 'Test User', ...overrides };
  const response = await call(base, '/api/auth/register', { method: 'POST', body: user });
  return { ...user, response, token: response.body?.token };
}

export async function dropTestDatabase(uri = TEST_MONGO) {
  const { MongoClient } = await import('mongodb');
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 2000 });
  try {
    await client.connect();
    await client.db().dropDatabase();
  } catch { /* nothing to drop, or no MongoDB: tests that use it already failed */ }
  finally { await client.close().catch(() => {}); }
}
