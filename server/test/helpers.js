// Shared harness for the API tests.
//
// Every test file runs in its own process (that is how `node --test` works), so each one gets
// a fresh module graph: env vars set here are the ones the server sees when it is imported.
//
// Database isolation: each test process gets its own disposable database named
// `examstudio_test_<pid>_<random>`. The name is generated here, so concurrent test files can never
// see or drop each other's data, and nothing can fall back to the real `examstudio` database.
// The database is dropped when its API is closed.
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const TEST_DB_PREFIX = 'examstudio_test_';

// Only the server address is taken from an explicitly supplied URI; the database name is always
// generated, so two runs can never share a database.
function mongoServer(uri) {
  try {
    const url = new URL(uri);
    url.pathname = '/';
    url.search = '';
    url.hash = '';
    return url.toString().replace(/\/$/, '');
  } catch {
    return 'mongodb://127.0.0.1:27017';
  }
}

const MONGO_SERVER = mongoServer(process.env.TEST_MONGODB_URI || 'mongodb://127.0.0.1:27017');
export const TEST_DB_NAME = `${TEST_DB_PREFIX}${process.pid}_${crypto.randomBytes(4).toString('hex')}`;
export const TEST_MONGO = `${MONGO_SERVER}/${TEST_DB_NAME}`;

// Set the database before any test imports the server: the storage layer reads it once, at module
// load. dotenv does not override variables that are already set.
process.env.MONGODB_URI = TEST_MONGO;
process.env.TEST_MONGODB_URI = TEST_MONGO;
if (process.env.TEST_DB_LOG === '1') console.log(`[test-db] ${TEST_DB_NAME}`);

// A few tests point at a dead port on purpose to exercise the local-file fallback. Those URIs are
// never used as databases, so they are the only non-test URIs bootApi accepts.
const FILE_MODE_URI = /^mongodb:\/\/127\.0\.0\.1:59999(\/|$)/;

/** The database name in a MongoDB URI, or '' when it has none. */
export function databaseName(uri) {
  try {
    return decodeURIComponent(new URL(uri).pathname.replace(/^\//, ''));
  } catch {
    return '';
  }
}

function isTestDatabase(uri) {
  return databaseName(uri).startsWith(TEST_DB_PREFIX);
}

/**
 * Start the API in-process on a free port.
 * @param {object} [overrides] env vars (and an optional beforeImport(dir) hook)
 */
export async function bootApi(overrides = {}) {
  const { beforeImport, ...envOverrides } = overrides;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'exam-studio-test-'));
  const mongoUri = envOverrides.MONGODB_URI || TEST_MONGO;

  if (!isTestDatabase(mongoUri) && !FILE_MODE_URI.test(mongoUri)) {
    fs.rmSync(dir, { recursive: true, force: true });
    throw new Error(`Refusing to run tests against database "${databaseName(mongoUri) || '(none)'}"; only ${TEST_DB_PREFIX}* databases are allowed.`);
  }

  Object.assign(process.env, {
    DEMO_MODE: '1',
    JWT_SECRET: 'test-secret-0123456789abcdef0123456789abcdef',
    SETTINGS_FILE: path.join(dir, 'settings.json'),
    DATA_FILE: path.join(dir, 'store.json'),
    GENERATE_LIMIT_PER_HOUR: '10000',
    LOGIN_LIMIT_PER_15_MIN: '10000',
    REGISTER_LIMIT_PER_HOUR: '10000',
    BCRYPT_ROUNDS: '4', // keeps the suite fast; production uses 12
    MONGODB_URI: mongoUri,
    ...envOverrides,
  });

  if (beforeImport) beforeImport(dir);

  const { start } = await import('../index.js');
  const server = await start(0, '127.0.0.1');
  const base = `http://127.0.0.1:${server.address().port}`;
  let closed = false;

  return {
    base,
    dir,
    dbName: databaseName(mongoUri),
    async close() {
      if (closed) return;
      closed = true;
      server.closeIdleConnections?.();
      const serverClosed = new Promise((resolve) => server.close(() => resolve()));
      // Tests are done at this point: drop sockets that keep-alive would otherwise hold open, so
      // server.close() cannot wait on a connection no test is using.
      server.closeAllConnections?.();
      await serverClosed;
      // Reset the storage singletons so a later boot in the same process reconnects instead of
      // reusing a cached mode after the connection has been closed.
      const { closeDatabaseConnections } = await import('../lib/database.js');
      await closeDatabaseConnections();
      const { _resetFileCache } = await import('../lib/repository.js');
      _resetFileCache();
      if (isTestDatabase(mongoUri)) await dropTestDatabase(mongoUri);
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

/**
 * Drop a disposable test database. Refuses anything without the `examstudio_test_` prefix, so a
 * mistake can never remove the real `examstudio` data.
 */
export async function dropTestDatabase(uri = TEST_MONGO) {
  if (!isTestDatabase(uri)) {
    throw new Error(`Refusing to drop database "${databaseName(uri) || '(none)'}"; only ${TEST_DB_PREFIX}* databases may be dropped.`);
  }
  const { MongoClient } = await import('mongodb');
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 2000 });
  try {
    await client.connect();
    await client.db().dropDatabase();
  } catch { /* nothing to drop, or no MongoDB: tests that use it already failed */ }
  finally { await client.close().catch(() => {}); }
}
