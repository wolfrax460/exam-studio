// One storage API for user accounts and library items.
//
// Two backends behind the same functions:
//   mongo - used whenever MongoDB is reachable (multi-user, shared server)
//   file  - a single JSON file, used when MongoDB is not installed (desktop app, quick start)
//
// Callers never care which one is in use. `storageMode()` tells the health endpoint which is live.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mongoose from 'mongoose';
import { connectToDatabase, isMongoReady } from './database.js';
import User from './models/User.js';
import LibraryItem from './models/LibraryItem.js';

const here = path.dirname(fileURLToPath(import.meta.url));

// The desktop app points DATA_FILE at its own user-data folder.
export const dataFilePath = () => path.resolve(process.env.DATA_FILE || path.join(here, '../data/store.json'));

// Owner used by the MCP/agent tools (and by imported legacy data) when there is no signed-in user.
export const LOCAL_OWNER = 'local';

let mode = null;          // 'mongo' | 'file'
let file = null;          // { version, users: [], items: [] }
let fileLoaded = false;

// ---------------------------------------------------------------- file backend
const emptyFile = () => ({ version: 1, users: [], items: [] });

function readFileStore() {
  if (fileLoaded) return file;
  fileLoaded = true;
  const target = dataFilePath();
  try {
    const raw = JSON.parse(fs.readFileSync(target, 'utf8'));
    if (Array.isArray(raw)) {
      // Very old format: a bare list of library items with no owner and no accounts.
      file = { ...emptyFile(), items: raw.map((it) => ({ ...it, userId: it.userId || LOCAL_OWNER })) };
    } else if (raw && typeof raw === 'object') {
      file = {
        version: 1,
        users: Array.isArray(raw.users) ? raw.users : [],
        items: Array.isArray(raw.items) ? raw.items : [],
      };
    } else {
      file = emptyFile();
    }
  } catch (error) {
    file = emptyFile();
    if (error instanceof SyntaxError) {
      // Never overwrite accounts and library we could not understand.
      console.warn(`Storage: ${target} is not valid JSON. Keeping it as ${target}.corrupt and starting a new store.`);
      try { fs.renameSync(target, `${target}.corrupt`); } catch { /* keep going with a new store */ }
    } else if (error.code !== 'ENOENT') {
      console.warn(`Storage: could not read ${target} (${error.message}). Starting a new store.`);
    }
  }
  return file;
}

function writeFileStore() {
  const target = dataFilePath();
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const tmp = `${target}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(file, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, target);
}

const newId = () => crypto.randomUUID();
const nowIso = () => new Date().toISOString();

// ---------------------------------------------------------------- mongo helpers
// A non-ObjectId owner (the "local" agent owner) is mapped to a stable ObjectId so it can
// live in the same collections without a cast error.
const ownerObjectId = (owner) => new mongoose.Types.ObjectId(
  crypto.createHash('sha1').update(`exam-studio:${owner}`).digest('hex').slice(0, 24),
);
const toOwnerId = (userId) => (mongoose.isValidObjectId(userId) ? userId : ownerObjectId(String(userId)));
const asIso = (value) => (value instanceof Date ? value.toISOString() : new Date(value || Date.now()).toISOString());

// ---------------------------------------------------------------- init
export async function initStorage() {
  if (mode) return mode;
  const connected = await connectToDatabase();
  if (connected && isMongoReady()) {
    mode = 'mongo';
    // Fail fast and clearly if the schema indexes cannot be built (for example a duplicate email).
    try {
      await User.init();
      await LibraryItem.init();
    } catch (error) {
      console.warn(`Storage: could not prepare MongoDB indexes (${error.message}).`);
    }
  } else {
    mode = 'file';
    readFileStore();
  }
  return mode;
}

export const storageMode = () => mode || 'file';

export function storageStatus() {
  return mode === 'mongo'
    ? { backend: 'mongodb', connected: isMongoReady(), error: null }
    : { backend: 'file', connected: true, file: dataFilePath(), error: null };
}

// ---------------------------------------------------------------- users
export async function countUsers() {
  await initStorage();
  if (mode === 'mongo') return User.estimatedDocumentCount();
  return readFileStore().users.length;
}

export async function firstUserId() {
  await initStorage();
  if (mode === 'mongo') {
    const doc = await User.findOne().sort({ createdAt: 1 }).select('_id').lean();
    return doc ? doc._id.toString() : null;
  }
  return readFileStore().users[0]?.id || null;
}

// Owner id for tools that run without a signed-in user (MCP server, desktop).
export async function resolveOwnerId() {
  const explicit = process.env.EXAM_STUDIO_OWNER;
  if (explicit) return explicit;
  return (await firstUserId()) || LOCAL_OWNER;
}

export const normalizeEmail = (email) => String(email || '').trim().toLowerCase();

export async function createUser({ email, name, passwordHash }) {
  await initStorage();
  const wanted = normalizeEmail(email);
  if (mode === 'mongo') {
    const doc = await User.create({ email: wanted, name, passwordHash });
    return { id: doc._id.toString(), email: doc.email, name: doc.name };
  }
  const store = readFileStore();
  // Two registrations can pass the "already exists" check at the same time (hashing is
  // asynchronous); the check is repeated here, where the write happens, and reported the
  // same way MongoDB reports it.
  if (store.users.some((user) => user.email === wanted)) {
    const duplicate = new Error('An account with this email already exists.');
    duplicate.code = 11000;
    throw duplicate;
  }
  const user = { id: newId(), email: wanted, name, passwordHash, createdAt: nowIso() };
  store.users.push(user);
  writeFileStore();
  return { id: user.id, email: user.email, name: user.name };
}

export async function findUserByEmail(email) {
  await initStorage();
  const wanted = normalizeEmail(email);
  if (mode === 'mongo') {
    // +passwordHash: the field is select:false on the schema.
    const doc = await User.findOne({ email: wanted }).select('+passwordHash').lean();
    return doc ? { id: doc._id.toString(), email: doc.email, name: doc.name, passwordHash: doc.passwordHash } : null;
  }
  return readFileStore().users.find((u) => u.email === wanted) || null;
}

export async function findUserById(id) {
  await initStorage();
  if (mode === 'mongo') {
    if (!mongoose.isValidObjectId(id)) return null;
    const doc = await User.findById(id).select('email name').lean();
    return doc ? { id: doc._id.toString(), email: doc.email, name: doc.name } : null;
  }
  const user = readFileStore().users.find((u) => u.id === id);
  return user ? { id: user.id, email: user.email, name: user.name } : null;
}

// ---------------------------------------------------------------- library
export async function listItems(userId) {
  await initStorage();
  if (mode === 'mongo') {
    const items = await LibraryItem.find({ userId: toOwnerId(userId) }).sort({ createdAt: -1 }).select('kind title createdAt').lean();
    return items.map((it) => ({ id: it._id.toString(), kind: it.kind, title: it.title, createdAt: asIso(it.createdAt) }));
  }
  return readFileStore().items
    .filter((it) => it.userId === userId)
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
    .map((it) => ({ id: it.id, kind: it.kind, title: it.title, createdAt: it.createdAt }));
}

export async function getItem(id, userId) {
  await initStorage();
  if (mode === 'mongo') {
    if (!mongoose.isValidObjectId(id)) return null; // a malformed id is "not found", never a crash
    const item = await LibraryItem.findOne({ _id: id, userId: toOwnerId(userId) }).lean();
    if (!item) return null;
    return { id: item._id.toString(), kind: item.kind, title: item.title, data: item.data, createdAt: asIso(item.createdAt) };
  }
  const item = readFileStore().items.find((it) => it.id === id && it.userId === userId);
  return item ? { id: item.id, kind: item.kind, title: item.title, data: item.data, createdAt: item.createdAt } : null;
}

export async function saveItem({ kind, title, data, userId }) {
  await initStorage();
  if (mode === 'mongo') {
    const doc = await LibraryItem.create({ userId: toOwnerId(userId), kind, title, data });
    return { id: doc._id.toString(), kind: doc.kind, title: doc.title, createdAt: asIso(doc.createdAt) };
  }
  const store = readFileStore();
  const item = { id: newId(), userId, kind, title, data, createdAt: nowIso() };
  store.items.push(item);
  writeFileStore();
  return { id: item.id, kind: item.kind, title: item.title, createdAt: item.createdAt };
}

export async function deleteItem(id, userId) {
  await initStorage();
  if (mode === 'mongo') {
    if (!mongoose.isValidObjectId(id)) return false;
    const result = await LibraryItem.deleteOne({ _id: id, userId: toOwnerId(userId) });
    return result.deletedCount > 0;
  }
  const store = readFileStore();
  const before = store.items.length;
  store.items = store.items.filter((it) => !(it.id === id && it.userId === userId));
  if (store.items.length === before) return false;
  writeFileStore();
  return true;
}

// Only used by tests and the desktop reset action.
export function _resetFileCache() {
  file = null;
  fileLoaded = false;
  mode = null;
}

export { User, LibraryItem };
export default {
  initStorage, storageMode, storageStatus, resolveOwnerId, firstUserId, countUsers,
  createUser, findUserByEmail, findUserById,
  listItems, getItem, saveItem, deleteItem, LOCAL_OWNER,
};
