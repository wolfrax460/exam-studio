// Settings saved from the app's Settings screen (provider, model, address, API key).
// They live in one JSON file next to the library, readable only by the current user.
// Values here win over server/.env, so a person can change provider without editing files.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Default location is the server folder's data/ directory, whatever folder the program was started from,
// so the app and the agent (MCP) server read the same file.
const DATA_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../data');
const FILE = path.resolve(process.env.SETTINGS_FILE || path.join(process.env.DATA_FILE ? path.dirname(path.resolve(process.env.DATA_FILE)) : DATA_DIR, 'settings.json'));
let cache = null;
let stamp = null;

// Cheap change detection: re-read only when the file actually changed. Without this the
// first read is cached forever, so a settings.json edited (or removed) outside this process
// would be ignored until a restart.
function fileStamp() {
  try {
    const stat = fs.statSync(FILE);
    return `${stat.mtimeMs}:${stat.size}`;
  } catch {
    return 'missing';
  }
}

function load() {
  const current = fileStamp();
  if (cache && current === stamp) return cache;
  stamp = current;
  try {
    cache = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  } catch (error) {
    cache = {};
    if (error instanceof SyntaxError) {
      // Never overwrite a file we could not understand: keep it for the person to look at.
      console.warn(`Settings: ${FILE} is not valid JSON. Keeping it as ${FILE}.corrupt and starting with empty settings.`);
      try { fs.renameSync(FILE, `${FILE}.corrupt`); } catch { /* keep going with empty settings */ }
    } else if (error.code !== 'ENOENT') {
      console.warn(`Settings: ${FILE} could not be read (${error.message}). Using empty settings.`);
    }
  }
  if (!cache || typeof cache !== 'object') cache = {};
  cache.profiles = cache.profiles && typeof cache.profiles === 'object' ? cache.profiles : {};
  return cache;
}

export const getSettings = () => load();

// patch = { provider, profile: { model, baseURL, apiKey, maxOutput, chunkChars }, update: { repo, feedUrl } }
// apiKey: undefined keeps the saved key, '' removes it and falls back to the provider default.
export function updateSettings({ provider, profile, update }) {
  const s = load();
  if (update && typeof update === 'object') {
    // Where the app looks for a newer version. Editable in the app, because a packaged desktop
    // build has no .env to put it in.
    s.update = { ...(s.update || {}) };
    for (const key of ['repo', 'feedUrl']) {
      if (update[key] === undefined) continue;
      if (update[key] === '') delete s.update[key];
      else s.update[key] = update[key];
    }
  }
  if (provider) s.provider = provider;
  if (provider && profile) {
    const next = { ...(s.profiles[provider] || {}) };
    for (const key of ['model', 'baseURL', 'maxOutput', 'chunkChars', 'apiKey']) {
      if (profile[key] === undefined) continue;
      // An empty string means "clear this" and must remove the key, otherwise the stale value
      // would keep winning over the provider default.
      if (profile[key] === '') delete next[key];
      else next[key] = profile[key];
    }
    s.profiles[provider] = next;
  }
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  const tmp = `${FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(s, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, FILE);
  stamp = fileStamp();
  return s;
}
