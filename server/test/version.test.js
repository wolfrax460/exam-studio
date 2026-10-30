// The update check: version comparison, the 24-hour cache, a failing feed, and the routes.
// A stub HTTP server stands in for GitHub, so the tests never touch the network.
import http from 'node:http';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { compareVersions, isNewer, currentVersion, updateSource, checkForUpdate, CHECK_INTERVAL_MS } from '../lib/version.js';
import { bootApi, call, makeUser } from './helpers.js';

describe('version comparison', () => {
  it('knows a newer release when it sees one', () => {
    assert.equal(compareVersions('1.0.1', '0.2.0'), 1);
    assert.equal(compareVersions('0.2.0', '0.2.0'), 0);
    assert.equal(compareVersions('0.2.0', '1.0.1'), -1);
    assert.equal(isNewer('v1.0.1', '0.2.0'), true);
    assert.equal(isNewer('0.2.0', '0.2.0'), false);
    assert.equal(isNewer('0.1.9', '0.2.0'), false);
  });

  it('handles the v prefix, short versions and extra segments', () => {
    assert.equal(compareVersions('v1.2.3', '1.2.3'), 0);
    assert.equal(compareVersions('2.0', '1.9.9'), 1);
    assert.equal(compareVersions('1.2.3.4', '1.2.3'), 1);
    assert.equal(compareVersions('1.10.0', '1.9.0'), 1, 'ten is more than nine, not a string compare');
  });

  it('puts a release candidate below the release', () => {
    assert.equal(compareVersions('1.0.0-beta.1', '1.0.0'), -1);
    assert.equal(compareVersions('1.0.0', '1.0.0-beta.1'), 1);
    assert.equal(isNewer('1.0.0', '1.0.0-beta.1'), true);
  });

  it('treats an unreadable version as older than a real one', () => {
    assert.equal(compareVersions('garbage', '1.0.0'), -1);
    assert.equal(compareVersions('1.0.0', 'garbage'), 1);
    assert.equal(compareVersions('garbage', 'also garbage'), 0);
  });

  it('reports the version of this build', () => {
    assert.match(currentVersion(), /^\d+\.\d+\.\d+/);
  });
});

describe('update source', () => {
  const saved = { url: process.env.UPDATE_FEED_URL, repo: process.env.UPDATE_REPO };
  after(() => {
    delete process.env.UPDATE_FEED_URL;
    delete process.env.UPDATE_REPO;
    if (saved.url) process.env.UPDATE_FEED_URL = saved.url;
    if (saved.repo) process.env.UPDATE_REPO = saved.repo;
  });

  it('is off when nothing is configured', () => {
    delete process.env.UPDATE_FEED_URL;
    delete process.env.UPDATE_REPO;
    assert.equal(updateSource(), null);
  });

  it('prefers an explicit feed URL', () => {
    process.env.UPDATE_FEED_URL = 'https://example.test/version.json';
    assert.deepEqual(updateSource(), { kind: 'url', url: 'https://example.test/version.json' });
    delete process.env.UPDATE_FEED_URL;
  });

  it('turns an owner/repo into the GitHub releases API', () => {
    process.env.UPDATE_REPO = 'mugishaishaq/exam-studio';
    assert.deepEqual(updateSource(), { kind: 'github', repo: 'mugishaishaq/exam-studio', url: 'https://api.github.com/repos/mugishaishaq/exam-studio/releases/latest' });
    process.env.UPDATE_REPO = 'https://github.com/someone/thing.git';
    assert.equal(updateSource().repo, 'someone/thing');
    delete process.env.UPDATE_REPO;
  });

  it('ignores a repo that is not owner/repo', () => {
    process.env.UPDATE_REPO = 'just-a-name';
    assert.equal(updateSource(), null);
  });
});

describe('checkForUpdate', () => {
  let stub;
  let dir;
  let hits = 0;
  let body = { version: '1.0.1', notes: 'Big release', url: 'https://example.test/v1.0.1' };
  let status = 200;

  before(async () => {
    dir = mkdtempSync(path.join(os.tmpdir(), 'exam-studio-update-'));
    stub = http.createServer((_req, res) => {
      hits += 1;
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(typeof body === 'string' ? body : JSON.stringify(body));
    });
    await new Promise((resolve) => stub.listen(0, '127.0.0.1', resolve));
    process.env.UPDATE_FEED_URL = `http://127.0.0.1:${stub.address().port}/version.json`;
    process.env.UPDATE_FILE = path.join(dir, 'update-check.json');
  });

  after(async () => {
    await new Promise((resolve) => stub.close(resolve));
    delete process.env.UPDATE_FEED_URL;
    delete process.env.UPDATE_FILE;
    rmSync(dir, { recursive: true, force: true });
  });

  beforeEach(() => {
    rmSync(process.env.UPDATE_FILE, { force: true });
    hits = 0;
    body = { version: '1.0.1', notes: 'Big release', url: 'https://example.test/v1.0.1' };
    status = 200;
  });

  it('finds a newer release and caches the answer', async () => {
    const first = await checkForUpdate({ force: true });
    assert.equal(first.updateAvailable, true);
    assert.equal(first.latest, '1.0.1');
    assert.equal(first.notes, 'Big release');
    assert.equal(first.fromCache, false);
    assert.equal(hits, 1);

    // The second call is inside the 24-hour window, so it must not go out again.
    const second = await checkForUpdate();
    assert.equal(second.fromCache, true);
    assert.equal(second.updateAvailable, true);
    assert.equal(hits, 1, 'a cached answer within 24 hours must not hit the network');
    assert.equal(second.nextCheckAt, new Date(Date.parse(first.checkedAt) + CHECK_INTERVAL_MS).toISOString());
  });

  it('does not go out again when the cache is fresh, even when forced off', async () => {
    await checkForUpdate({ force: true });
    await checkForUpdate();
    await checkForUpdate();
    assert.equal(hits, 1);
  });

  it('goes out again when the cached answer is older than 24 hours', async () => {
    await checkForUpdate({ force: true });
    const stale = Date.parse(readFileSync(process.env.UPDATE_FILE, 'utf8').match(/"checkedAt": "([^"]+)"/)[1]);
    // Rewrite the record as if it had been taken two days ago.
    const cached = JSON.parse(readFileSync(process.env.UPDATE_FILE, 'utf8'));
    cached.checkedAt = new Date(stale - 2 * CHECK_INTERVAL_MS).toISOString();
    writeFileSync(process.env.UPDATE_FILE, JSON.stringify(cached));
    hits = 0;

    const again = await checkForUpdate();
    assert.equal(again.fromCache, false);
    assert.equal(hits, 1, 'a stale answer must be refreshed');
  });

  it('reads a tag_name, a plain-text version and a v prefix', async () => {
    body = { tag_name: 'v2.5.0' };
    assert.equal((await checkForUpdate({ force: true })).latest, 'v2.5.0');
    body = 'v3.0.0\n';
    assert.equal((await checkForUpdate({ force: true })).latest, 'v3.0.0');
  });

  it('reports "up to date" when the feed is not newer', async () => {
    body = { version: '0.0.1' };
    const result = await checkForUpdate({ force: true });
    assert.equal(result.updateAvailable, false);
    assert.equal(result.error, null);
  });

  it('keeps the last known version when the feed fails', async () => {
    body = { version: '1.0.1' };
    await checkForUpdate({ force: true });

    status = 500;
    const failed = await checkForUpdate({ force: true });
    assert.match(failed.error, /answered 500/);
    assert.equal(failed.latest, '1.0.1', 'a network failure must not wipe what we already knew');
    assert.equal(failed.updateAvailable, true);
  });

  it('explains a feed with no version in it', async () => {
    body = { message: 'not a version' };
    const result = await checkForUpdate({ force: true });
    assert.match(result.error, /did not contain a version/);
  });

  it('says update checks are off when nothing is configured', async () => {
    const saved = process.env.UPDATE_FEED_URL;
    delete process.env.UPDATE_FEED_URL;
    const result = await checkForUpdate({ force: true });
    assert.equal(result.configured, false);
    assert.equal(result.updateAvailable, false);
    assert.match(result.message, /UPDATE_REPO/);
    process.env.UPDATE_FEED_URL = saved;
  });
});

describe('update routes', () => {
  let api;
  let token;
  let stub;
  let dir;
  let hits = 0;

  before(async () => {
    stub = http.createServer((_req, res) => {
      hits += 1;
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ tag_name: 'v9.9.9', body: 'From the stub' }));
    });
    await new Promise((resolve) => stub.listen(0, '127.0.0.1', resolve));

    api = await bootApi({
      MONGODB_URI: 'mongodb://127.0.0.1:59999/none',
      MONGODB_TIMEOUT_MS: '400',
      UPDATE_FEED_URL: `http://127.0.0.1:${stub.address().port}/latest`,
      beforeImport: (target) => { dir = target; process.env.UPDATE_FILE = path.join(target, 'update-check.json'); },
    });
    token = (await makeUser(api.base)).token;
  });

  after(async () => {
    await api?.close();
    await new Promise((resolve) => stub.close(resolve));
  });

  it('reports the current version and whether an update is available', async () => {
    // The background check at start-up may still be running; force one so the answer is settled.
    const forced = await call(api.base, '/api/update/check', { method: 'POST', token, body: {} });
    assert.equal(forced.status, 200, JSON.stringify(forced.body));
    assert.equal(forced.body.latest, 'v9.9.9');
    assert.equal(forced.body.updateAvailable, true);
    assert.equal(forced.body.configured, true);
    assert.ok(forced.body.notes.includes('From the stub'));

    const read = await call(api.base, '/api/update', { token });
    assert.equal(read.status, 200);
    assert.equal(read.body.updateAvailable, true);
    assert.equal(read.body.checking, false);
    assert.match(read.body.current, /^\d+\.\d+\.\d+/);
  });

  it('needs a signed-in user', async () => {
    const anonymous = await call(api.base, '/api/update');
    assert.equal(anonymous.status, 401);
  });

  it('writes the cache outside the application folder', () => {
    const file = path.join(dir, 'update-check.json');
    assert.ok(readFileSync(file, 'utf8').includes('v9.9.9'));
  });
});
