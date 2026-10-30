// Is there a newer version of Exam Studio?
//
// The check is deliberately quiet: it runs at most once every 24 hours, the answer is cached on
// disk, and a failure is recorded rather than thrown, because the app has to work offline and
// must never block on a network call to a server that may not exist yet.
//
// Where it looks, in order:
//   UPDATE_FEED_URL  any URL. A JSON body with "version" or "tag_name", or plain text.
//   UPDATE_REPO      "owner/repo", read through the GitHub releases API.
// With neither set, update checks are simply off.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getSettings } from './settings.js';

const here = path.dirname(fileURLToPath(import.meta.url));

export const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 8000;

/** The version of the running app, from the package the installer was built from. */
export function currentVersion() {
  for (const candidate of [path.resolve(here, '../../package.json'), path.resolve(here, '../package.json')]) {
    try {
      const version = JSON.parse(fs.readFileSync(candidate, 'utf8')).version;
      if (version) return String(version);
    } catch { /* try the next one */ }
  }
  return '0.0.0';
}

const dataDir = () => {
  if (process.env.UPDATE_FILE) return path.dirname(path.resolve(process.env.UPDATE_FILE));
  if (process.env.SETTINGS_FILE) return path.dirname(path.resolve(process.env.SETTINGS_FILE));
  if (process.env.DATA_FILE) return path.dirname(path.resolve(process.env.DATA_FILE));
  return path.resolve(here, '../data');
};
export const cacheFile = () => path.resolve(process.env.UPDATE_FILE || path.join(dataDir(), 'update-check.json'));

// ---------------------------------------------------------------- versions
/** Split "v1.2.3-beta.1" into [1,2,3] and the pre-release part. */
function parseVersion(value) {
  const text = String(value ?? '').trim().replace(/^v/i, '');
  const match = /^(\d+(?:\.\d+)*)(?:[-+](.*))?$/.exec(text);
  if (!match) return null;
  return { numbers: match[1].split('.').map((n) => Number(n)), pre: match[2] || '' };
}

/** -1, 0 or 1. Anything unparseable sorts below a real version. */
export function compareVersions(a, b) {
  const left = parseVersion(a);
  const right = parseVersion(b);
  if (!left && !right) return 0;
  if (!left) return -1;
  if (!right) return 1;
  const length = Math.max(left.numbers.length, right.numbers.length);
  for (let i = 0; i < length; i++) {
    const one = left.numbers[i] || 0;
    const two = right.numbers[i] || 0;
    if (one !== two) return one < two ? -1 : 1;
  }
  // 1.0.0-beta is older than 1.0.0, which is what people expect from a release candidate.
  if (left.pre === right.pre) return 0;
  if (!left.pre) return 1;
  if (!right.pre) return -1;
  return left.pre < right.pre ? -1 : 1;
}

export const isNewer = (candidate, than) => compareVersions(candidate, than) > 0;

// ---------------------------------------------------------------- source
const asRepo = (value) => String(value || '').trim().replace(/^https?:\/\/github\.com\//i, '').replace(/\.git$/i, '');
const asUrl = (value) => String(value || '').trim();

// Where to look, most specific first: the environment (a server install), then the app's own
// settings file (a packaged desktop build has no .env, so the Settings screen writes it there).
export function updateSource() {
  const saved = getSettings().update || {};
  const fromEnvUrl = asUrl(process.env.UPDATE_FEED_URL);
  const fromSavedUrl = asUrl(saved.feedUrl);
  const url = fromEnvUrl || fromSavedUrl;
  if (url) return { kind: 'url', url };

  const repo = asRepo(process.env.UPDATE_REPO) || asRepo(saved.repo);
  if (/^[\w.-]+\/[\w.-]+$/.test(repo)) return { kind: 'github', repo, url: `https://api.github.com/repos/${repo}/releases/latest` };
  return null;
}

function versionFromBody(text) {
  const trimmed = String(text || '').trim();
  try {
    const data = JSON.parse(trimmed);
    const candidate = data?.version || data?.tag_name || data?.tag || data?.latest || data?.name;
    if (candidate) return { version: String(candidate).trim(), notes: String(data?.notes || data?.body || '').slice(0, 2000), url: data?.html_url || data?.url || '' };
  } catch { /* not JSON: fall through to plain text */ }
  const plain = /^v?\d+(?:\.\d+)*/.exec(trimmed);
  if (plain) return { version: plain[0], notes: '', url: '' };
  return null;
}

async function fetchLatest(source) {
  const headers = { accept: 'application/json, text/plain;q=0.9', 'user-agent': `Exam-Studio/${currentVersion()}` };
  // GitHub answers 403 without a token when the rate limit is small; a token is optional.
  if (source.kind === 'github') {
    headers.accept = 'application/vnd.github+json';
    if (process.env.UPDATE_GITHUB_TOKEN) headers.authorization = `Bearer ${process.env.UPDATE_GITHUB_TOKEN}`;
  }
  let response;
  try {
    response = await fetch(source.url, { headers, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS), redirect: 'follow' });
  } catch (error) {
    throw new Error(error?.name === 'TimeoutError' ? 'The update server did not answer in time.' : `Could not reach the update server (${error.message}).`);
  }
  if (response.status === 404) throw new Error(source.kind === 'github' ? 'No published release was found for this repository yet.' : 'The update feed was not found.');
  if (!response.ok) throw new Error(`The update server answered ${response.status}.`);
  const parsed = versionFromBody(await response.text());
  if (!parsed) throw new Error('The update feed did not contain a version.');
  return parsed;
}

// ---------------------------------------------------------------- cache
function readCache() {
  try {
    const cached = JSON.parse(fs.readFileSync(cacheFile(), 'utf8'));
    return cached && typeof cached === 'object' ? cached : null;
  } catch {
    return null;
  }
}

function writeCache(value) {
  try {
    fs.mkdirSync(path.dirname(cacheFile()), { recursive: true });
    const tmp = `${cacheFile()}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(value, null, 2), { mode: 0o600 });
    fs.renameSync(tmp, cacheFile());
  } catch { /* a read-only folder must not break the check */ }
}

/** The stored answer without going to the network. */
export function cachedUpdateStatus() {
  const cached = readCache();
  const current = currentVersion();
  if (!cached) return null;
  return { ...cached, current, updateAvailable: Boolean(cached.latest) && isNewer(cached.latest, current) };
}

/**
 * The update status. Goes to the network only when the cached answer is older than 24 hours,
 * or when `force` is set.
 */
export async function checkForUpdate({ force = false, now = Date.now() } = {}) {
  const current = currentVersion();
  const source = updateSource();
  const cached = readCache();
  const checkedAt = cached?.checkedAt ? Date.parse(cached.checkedAt) : 0;
  const fresh = checkedAt && now - checkedAt < CHECK_INTERVAL_MS;

  if (!force && fresh) {
    return {
      ...cached, current, source: source?.kind || null,
      updateAvailable: Boolean(cached.latest) && isNewer(cached.latest, current),
      fromCache: true, nextCheckAt: new Date(checkedAt + CHECK_INTERVAL_MS).toISOString(),
    };
  }

  if (!source) {
    return {
      current, latest: cached?.latest || '', updateAvailable: false, configured: false,
      checkedAt: cached?.checkedAt || null, nextCheckAt: null, url: '', notes: '',
      source: null, fromCache: false,
      message: 'Update checks are off. Set UPDATE_REPO (owner/repo) or UPDATE_FEED_URL in server/.env to turn them on.',
    };
  }

  try {
    const latest = await fetchLatest(source);
    const record = {
      latest: latest.version, notes: latest.notes, url: latest.url,
      checkedAt: new Date(now).toISOString(), error: null, source: source.kind,
    };
    writeCache(record);
    return {
      ...record, current, configured: true, updateAvailable: isNewer(latest.version, current),
      fromCache: false, nextCheckAt: new Date(now + CHECK_INTERVAL_MS).toISOString(),
    };
  } catch (error) {
    // Record the failure but keep the last known version, so a bad network does not look like
    // "you are up to date" and does not wipe what we already knew.
    const record = {
      latest: cached?.latest || '', notes: cached?.notes || '', url: cached?.url || '',
      checkedAt: new Date(now).toISOString(), error: error.message, source: source.kind,
    };
    writeCache(record);
    return {
      ...record, current, configured: true,
      updateAvailable: Boolean(record.latest) && isNewer(record.latest, current),
      fromCache: false, nextCheckAt: new Date(now + CHECK_INTERVAL_MS).toISOString(),
    };
  }
}

export default { checkForUpdate, cachedUpdateStatus, compareVersions, isNewer, currentVersion, updateSource, CHECK_INTERVAL_MS };
