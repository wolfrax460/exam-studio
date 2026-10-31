import mongoose from 'mongoose';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { httpError } from './errors.js';
import { initStorage, storageMode, getFileStore, saveFileStore } from './repository.js';
import User from './models/User.js';
import Plan from './models/Plan.js';
import UsageEvent from './models/UsageEvent.js';
import Announcement from './models/Announcement.js';
import AIConfig from './models/AIConfig.js';
import AuditLog from './models/AuditLog.js';
import Setting from './models/Setting.js';
import LibraryItem from './models/LibraryItem.js';

const mode = async () => { await initStorage(); return storageMode(); };

// ---- encryption for the AI API key (master key from env) ----
function masterKey() {
  const raw = String(process.env.EXAM_STUDIO_MASTER_KEY || '').trim();
  if (!raw) return null;
  // Derive a 32-byte key.
  return crypto.createHash('sha256').update(raw).digest();
}
function encryptSecret(plain) {
  const key = masterKey();
  if (!key) return plain ? `plain:${plain}` : null; // dev fallback, not secure
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString('base64');
}
export function decryptSecret(stored) {
  if (!stored) return null;
  if (stored.startsWith('plain:')) return stored.slice(6);
  const key = masterKey();
  if (!key) return null;
  try {
    const buf = Buffer.from(stored, 'base64');
    const iv = buf.subarray(0, 12);
    const tag = buf.subarray(12, 28);
    const enc = buf.subarray(28);
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    return decipher.update(enc, undefined, 'utf8') + decipher.final('utf8');
  } catch {
    return null;
  }
}

// ---- in-memory cache of AI config ----
let aiConfigCache = null;
let aiConfigCacheDecryptedKey = null;
export function getCachedAIConfig() { return aiConfigCache; }
export function getCachedAIKey() { return aiConfigCacheDecryptedKey; }

function newId() { return new mongoose.Types.ObjectId().toString(); }

// ---------------- Users ----------------
export async function listUsers({ search = '', role = '', page = 1, limit = 20 } = {}) {
  await initStorage();
  if (storageMode() === 'mongo') {
    const q = {};
    if (search) q.$or = [{ name: new RegExp(search, 'i') }, { email: new RegExp(search, 'i') }];
    if (role) q.role = role;
    const skip = (page - 1) * limit;
    const [items, total] = await Promise.all([
      User.find(q).select('-passwordHash').sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      User.countDocuments(q),
    ]);
    return { items: items.map(u => ({ ...u, id: u._id.toString() })), total };
  }
  const store = getFileStore();
  let users = store.users || [];
  if (search) { const s = search.toLowerCase(); users = users.filter(u => (u.name||'').toLowerCase().includes(s) || (u.email||'').toLowerCase().includes(s)); }
  if (role) users = users.filter(u => u.role === role);
  const total = users.length;
  const skip = (page - 1) * limit;
  const items = users.slice(skip, skip + limit).map(u => { const { passwordHash, ...rest } = u; return rest; });
  return { items, total };
}

export async function getUserById(id) {
  await initStorage();
  if (storageMode() === 'mongo') {
    if (!mongoose.isValidObjectId(id)) return null;
    const doc = await User.findById(id).select('-passwordHash').lean();
    return doc ? { ...doc, id: doc._id.toString() } : null;
  }
  const store = getFileStore();
  const u = (store.users || []).find(x => x.id === id);
  if (!u) return null;
  const { passwordHash, ...rest } = u;
  return rest;
}

export async function updateUser(id, patch) {
  await initStorage();
  if (storageMode() === 'mongo') {
    if (!mongoose.isValidObjectId(id)) return null;
  const allowed = ['name', 'role', 'planId', 'active', 'mustChangePassword', 'totpSecret', 'totpEnabled'];
    const update = {};
    for (const k of allowed) if (patch[k] !== undefined) update[k] = patch[k];
    if (patch.overrides !== undefined) update.overrides = patch.overrides;
    if (patch.passwordHash) update.passwordHash = patch.passwordHash;
    if (patch.forceSignOut) update.$inc = { tokenVersion: 1 };
    const doc = await User.findByIdAndUpdate(id, update, { new: true }).select('-passwordHash').lean();
    return doc ? { ...doc, id: doc._id.toString() } : null;
  }
  const store = getFileStore();
  const u = (store.users || []).find(x => x.id === id);
  if (!u) return null;
  const allowed = ['name', 'role', 'planId', 'active', 'mustChangePassword'];
  for (const k of allowed) if (patch[k] !== undefined) u[k] = patch[k];
  if (patch.overrides !== undefined) u.overrides = patch.overrides;
  if (patch.passwordHash) u.passwordHash = patch.passwordHash;
  if (patch.forceSignOut) u.tokenVersion = (u.tokenVersion || 0) + 1;
  saveFileStore();
  const { passwordHash, ...rest } = u;
  return rest;
}

export async function deleteUser(id) {
  await initStorage();
  if (storageMode() === 'mongo') {
    if (!mongoose.isValidObjectId(id)) return false;
    const r = await User.deleteOne({ _id: id });
    await LibraryItem.deleteMany({ userId: id });
    return r.deletedCount > 0;
  }
  const store = getFileStore();
  const before = (store.users || []).length;
  store.users = (store.users || []).filter(x => x.id !== id);
  store.items = (store.items || []).filter(x => x.userId !== id);
  saveFileStore();
  return store.users.length < before;
}

export async function resetUserPassword(id, newPasswordHash) {
  return updateUser(id, { passwordHash: newPasswordHash, mustChangePassword: true, forceSignOut: true });
}

// ---------------- Plans ----------------
export async function ensureStarterPlans() {
  await initStorage();
  const existing = await listPlans();
  if (existing.length > 0) return existing;
  const starters = [
    { name: 'Free', description: 'Starter plan with daily limits.', requestsPerDay: 50, requestsPerMonth: 500, tokensPerDay: 20000, tokensPerMonth: 100000, maxSourceSize: 10000, maxExamMarks: 50, maxFlashcardCount: 30, maxHandoutPages: 10, concurrentJobs: 1, allowedFeatures: ['study-notes', 'flashcards', 'export-pdf'], allowOwnKey: false, active: true },
    { name: 'Teacher', description: 'Higher limits for teachers.', requestsPerDay: 500, requestsPerMonth: 5000, tokensPerDay: 200000, tokensPerMonth: 1000000, maxSourceSize: 40000, maxExamMarks: 100, maxFlashcardCount: 100, maxHandoutPages: 50, concurrentJobs: 3, allowedFeatures: ['study-notes', 'handout', 'exam', 'flashcards', 'export-pdf', 'export-word', 'notes-library', 'library-saving'], allowOwnKey: true, active: true },
    { name: 'Unlimited', description: 'No limits.', requestsPerDay: null, requestsPerMonth: null, tokensPerDay: null, tokensPerMonth: null, maxSourceSize: null, maxExamMarks: null, maxFlashcardCount: null, maxHandoutPages: null, concurrentJobs: 5, allowedFeatures: ['study-notes', 'handout', 'exam', 'flashcards', 'export-pdf', 'export-word', 'teacher-pack', 'notes-library', 'library-saving'], allowOwnKey: true, active: true },
  ];
  for (const s of starters) await createPlan(s);
  return listPlans();
}

export async function listPlans() {
  await initStorage();
  let items;
  if (storageMode() === 'mongo') {
    const docs = await Plan.find().sort({ createdAt: -1 }).lean();
    items = docs.map(p => ({ ...p, id: p._id.toString() }));
  } else {
    items = (getFileStore().plans || []).map(p => ({ ...p }));
  }
  if (items.length === 0) {
    items = await ensureStarterPlans();
  }
  // attach user counts
  const { items: users } = await listUsers({ page: 1, limit: 100000 });
  const counts = {};
  for (const u of users) { if (u.planId) counts[u.planId] = (counts[u.planId] || 0) + 1; }
  for (const p of items) p.userCount = counts[p.id] || 0;
  const def = await getSystemSetting('defaultPlan');
  for (const p of items) p.isDefault = (def === p.id) || (def === p.name);
  return items;
}

export async function createPlan(data) {
  await initStorage();
  if (storageMode() === 'mongo') {
    const doc = await Plan.create(data);
    return { ...doc.toObject(), id: doc._id.toString() };
  }
  const store = getFileStore();
  const plan = { id: newId(), ...data, createdAt: new Date().toISOString() };
  store.plans = store.plans || [];
  store.plans.push(plan);
  saveFileStore();
  return plan;
}

export async function updatePlan(id, patch) {
  await initStorage();
  if (storageMode() === 'mongo') {
    if (!mongoose.isValidObjectId(id)) return null;
    const doc = await Plan.findByIdAndUpdate(id, patch, { new: true }).lean();
    return doc ? { ...doc, id: doc._id.toString() } : null;
  }
  const store = getFileStore();
  const p = (store.plans || []).find(x => x.id === id);
  if (!p) return null;
  Object.assign(p, patch);
  saveFileStore();
  return p;
}

export async function deletePlan(id, movePlanId) {
  await initStorage();
  const def = await getSystemSetting('defaultPlan');
  if (def === id || def === (await (async () => { const ps = await listPlans(); return ps.find(p=>p.id===id)?.name; })())) {
    throw httpError(400, 'The default plan cannot be deleted.');
  }
  // users on this plan
  const { items: users } = await listUsers({ page: 1, limit: 100000 });
  const onPlan = users.filter(u => u.planId === id);
  if (onPlan.length > 0) {
    if (!movePlanId) throw httpError(400, 'Move users to another plan before deleting.');
    for (const u of onPlan) await updateUser(u.id, { planId: movePlanId });
  }
  if (storageMode() === 'mongo') {
    if (!mongoose.isValidObjectId(id)) return false;
    const r = await Plan.deleteOne({ _id: id });
    return r.deletedCount > 0;
  }
  const store = getFileStore();
  const before = (store.plans || []).length;
  store.plans = (store.plans || []).filter(x => x.id !== id);
  saveFileStore();
  return (store.plans || []).length < before;
}

export async function duplicatePlan(id) {
  await initStorage();
  const plans = await listPlans();
  const p = plans.find(x => x.id === id);
  if (!p) return null;
  const { id: _id, _id: __, userCount, isDefault, createdAt, ...rest } = p;
  const copy = { ...rest, name: `${p.name} (copy)` };
  return createPlan(copy);
}

export async function setDefaultPlan(id) {
  await initStorage();
  const plans = await listPlans();
  const p = plans.find(x => x.id === id);
  if (!p) throw httpError(404, 'Plan not found.');
  await setSystemSetting('defaultPlan', id, null);
  return p;
}

// ---------------- Usage ----------------
export async function recordUsage(event) {
  await initStorage();
  if (storageMode() === 'mongo') {
    const doc = await UsageEvent.create(event);
    return { ...doc.toObject(), id: doc._id.toString() };
  }
  const store = getFileStore();
  const e = { id: newId(), ...event, createdAt: new Date().toISOString() };
  store.usageEvents = store.usageEvents || [];
  store.usageEvents.push(e);
  saveFileStore();
  return e;
}

export async function listUsage({ userId, taskType, page = 1, limit = 50 } = {}) {
  await initStorage();
  if (storageMode() === 'mongo') {
    const q = {};
    if (userId) q.userId = userId;
    if (taskType) q.taskType = taskType;
    const skip = (page - 1) * limit;
    const [items, total] = await Promise.all([
      UsageEvent.find(q).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      UsageEvent.countDocuments(q),
    ]);
    return { items: items.map(e => ({ ...e, id: e._id.toString() })), total };
  }
  const store = getFileStore();
  let events = store.usageEvents || [];
  if (userId) events = events.filter(e => e.userId === userId);
  if (taskType) events = events.filter(e => e.taskType === taskType);
  events = [...events].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  const total = events.length;
  const skip = (page - 1) * limit;
  return { items: events.slice(skip, skip + limit), total };
}

export async function usageSummary() {
  await initStorage();
  const since = (days) => new Date(Date.now() - days * 86400000);
  if (storageMode() === 'mongo') {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const [todayCount, weekCount, monthCount, failures] = await Promise.all([
      UsageEvent.countDocuments({ createdAt: { $gte: today } }),
      UsageEvent.countDocuments({ createdAt: { $gte: since(7) } }),
      UsageEvent.countDocuments({ createdAt: { $gte: since(30) } }),
      UsageEvent.countDocuments({ success: false, createdAt: { $gte: since(30) } }),
    ]);
    return { requestsToday: todayCount, requestsWeek: weekCount, requestsMonth: monthCount, failuresMonth: failures };
  }
  const store = getFileStore();
  const events = store.usageEvents || [];
  const inRange = (d) => new Date(e.createdAt) >= d;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return {
    requestsToday: events.filter(e => new Date(e.createdAt) >= today).length,
    requestsWeek: events.filter(e => new Date(e.createdAt) >= since(7)).length,
    requestsMonth: events.filter(e => new Date(e.createdAt) >= since(30)).length,
    failuresMonth: events.filter(e => !e.success && new Date(e.createdAt) >= since(30)).length,
  };
}

// ---------------- Announcements ----------------
export async function listAnnouncements({ activeOnly = false } = {}) {
  await initStorage();
  if (storageMode() === 'mongo') {
    const q = activeOnly ? { active: true } : {};
    const items = await Announcement.find(q).sort({ createdAt: -1 }).lean();
    return items.map(a => ({ ...a, id: a._id.toString() }));
  }
  const store = getFileStore();
  let items = store.announcements || [];
  if (activeOnly) items = items.filter(a => a.active);
  return items.map(a => ({ ...a }));
}

export async function createAnnouncement(data) {
  await initStorage();
  if (storageMode() === 'mongo') {
    const doc = await Announcement.create(data);
    return { ...doc.toObject(), id: doc._id.toString() };
  }
  const store = getFileStore();
  const a = { id: newId(), ...data, createdAt: new Date().toISOString() };
  store.announcements = store.announcements || [];
  store.announcements.push(a);
  saveFileStore();
  return a;
}

export async function updateAnnouncement(id, patch) {
  await initStorage();
  if (storageMode() === 'mongo') {
    if (!mongoose.isValidObjectId(id)) return null;
    const doc = await Announcement.findByIdAndUpdate(id, patch, { new: true }).lean();
    return doc ? { ...doc, id: doc._id.toString() } : null;
  }
  const store = getFileStore();
  const a = (store.announcements || []).find(x => x.id === id);
  if (!a) return null;
  Object.assign(a, patch);
  saveFileStore();
  return a;
}

export async function deleteAnnouncement(id) {
  await initStorage();
  if (storageMode() === 'mongo') {
    if (!mongoose.isValidObjectId(id)) return false;
    const r = await Announcement.deleteOne({ _id: id });
    return r.deletedCount > 0;
  }
  const store = getFileStore();
  const before = (store.announcements || []).length;
  store.announcements = (store.announcements || []).filter(x => x.id !== id);
  saveFileStore();
  return (store.announcements || []).length < before;
}

export async function activeAnnouncements() {
  const now = new Date();
  const all = await listAnnouncements({ activeOnly: true });
  return all.filter(a => {
    const s = a.startDate ? new Date(a.startDate) : null;
    const e = a.endDate ? new Date(a.endDate) : null;
    if (s && now < s) return false;
    if (e && now > e) return false;
    return true;
  });
}

// ---------------- AI Config ----------------
export async function getAIConfig() {
  await initStorage();
  let cfg;
  if (storageMode() === 'mongo') {
    let doc = await AIConfig.findOne().lean();
    if (!doc) doc = await AIConfig.create({}).then(d => d.toObject());
    cfg = { ...doc, id: doc._id.toString() };
  } else {
    const store = getFileStore();
    if (!store.aiConfig) {
      store.aiConfig = { enabled: true, provider: 'nvidia', model: '', baseUrl: '', temperature: 0.7, maxTokens: {}, timeouts: {}, updatedAt: new Date().toISOString() };
      saveFileStore();
    }
    cfg = { ...store.aiConfig };
  }
  // Strip encrypted key; expose hasKey only.
  const { apiKeyEncrypted, ...rest } = cfg;
  const out = { ...rest, hasKey: Boolean(apiKeyEncrypted) };
  aiConfigCache = out;
  // Keep a decrypted key in a separate cache slot for engine use (never sent to client).
  aiConfigCacheDecryptedKey = decryptSecret(apiKeyEncrypted);
  return out;
}

export async function updateAIConfig(patch) {
  await initStorage();
  const { apiKey, ...rest } = patch || {};
  // Encrypt apiKey if provided.
  let encrypted;
  if (apiKey !== undefined) {
    if (apiKey === '' || apiKey === null) encrypted = null;
    else encrypted = encryptSecret(apiKey);
  }
  const toSave = { ...rest };
  if (apiKey !== undefined) toSave.apiKeyEncrypted = encrypted;

  if (storageMode() === 'mongo') {
    let doc = await AIConfig.findOne();
    if (!doc) doc = new AIConfig();
    Object.assign(doc, toSave);
    doc.updatedAt = new Date();
    await doc.save();
    const cfg = { ...doc.toObject(), id: doc._id.toString() };
    const { apiKeyEncrypted, ...r } = cfg;
    const out = { ...r, hasKey: Boolean(apiKeyEncrypted) };
    aiConfigCache = out;
    aiConfigCacheDecryptedKey = decryptSecret(apiKeyEncrypted);
    return out;
  }
  const store = getFileStore();
  if (!store.aiConfig) store.aiConfig = {};
  Object.assign(store.aiConfig, toSave, { updatedAt: new Date().toISOString() });
  saveFileStore();
  const { apiKeyEncrypted, ...r } = store.aiConfig;
  const out = { ...r, hasKey: Boolean(apiKeyEncrypted) };
  aiConfigCache = out;
  aiConfigCacheDecryptedKey = decryptSecret(apiKeyEncrypted);
  return out;
}

// ---------------- Audit ----------------
export async function recordAudit(entry) {
  await initStorage();
  if (storageMode() === 'mongo') {
    const doc = await AuditLog.create(entry);
    return { ...doc.toObject(), id: doc._id.toString() };
  }
  const store = getFileStore();
  const e = { id: newId(), ...entry, createdAt: new Date().toISOString() };
  store.auditLog = store.auditLog || [];
  store.auditLog.push(e);
  saveFileStore();
  return e;
}

export async function listAudit({ page = 1, limit = 50 } = {}) {
  await initStorage();
  if (storageMode() === 'mongo') {
    const skip = (page - 1) * limit;
    const [items, total] = await Promise.all([
      AuditLog.find().sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      AuditLog.countDocuments(),
    ]);
    return { items: items.map(e => ({ ...e, id: e._id.toString() })), total };
  }
  const store = getFileStore();
  const items = [...(store.auditLog || [])].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  const total = items.length;
  const skip = (page - 1) * limit;
  return { items: items.slice(skip, skip + limit), total };
}

// ---------------- System settings ----------------
export async function getSystemSetting(key) {
  await initStorage();
  if (storageMode() === 'mongo') {
    const doc = await Setting.findOne({ key }).lean();
    return doc ? doc.value : null;
  }
  const store = getFileStore();
  const s = (store.settings || []).find(x => x.key === key);
  return s ? s.value : null;
}

export async function setSystemSetting(key, value, updatedBy) {
  await initStorage();
  if (storageMode() === 'mongo') {
    await Setting.findOneAndUpdate({ key }, { key, value, updatedAt: new Date(), updatedBy }, { upsert: true });
    return value;
  }
  const store = getFileStore();
  store.settings = store.settings || [];
  const idx = store.settings.findIndex(x => x.key === key);
  if (idx >= 0) store.settings[idx] = { key, value, updatedAt: new Date().toISOString(), updatedBy };
  else store.settings.push({ key, value, updatedAt: new Date().toISOString(), updatedBy });
  saveFileStore();
  return value;
}

export async function allSystemSettings() {
  const keys = ['privacyNotice', 'defaultPlan', 'registrationOpen', 'passwordRules', 'sessionLength', 'retentionDays', 'maintenanceMode'];
  const out = {};
  for (const k of keys) out[k] = await getSystemSetting(k);
  return out;
}

// ---------------- Content (library items admin) ----------------
export async function listLibraryItemsAdmin({ kind, page = 1, limit = 20 } = {}) {
  await initStorage();
  if (storageMode() === 'mongo') {
    const q = kind ? { kind } : {};
    const skip = (page - 1) * limit;
    const [items, total] = await Promise.all([
      LibraryItem.find(q).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      LibraryItem.countDocuments(q),
    ]);
    return { items: items.map(i => ({ ...i, id: i._id.toString() })), total };
  }
  const store = getFileStore();
  let items = store.items || [];
  if (kind) items = items.filter(i => i.kind === kind);
  items = [...items].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  const total = items.length;
  const skip = (page - 1) * limit;
  return { items: items.slice(skip, skip + limit), total };
}

export async function deleteLibraryItemAdmin(id, userId) {
  await initStorage();
  if (storageMode() === 'mongo') {
    if (!mongoose.isValidObjectId(id)) return false;
    const r = await LibraryItem.deleteOne({ _id: id });
    return r.deletedCount > 0;
  }
  const store = getFileStore();
  const before = (store.items || []).length;
  store.items = (store.items || []).filter(i => i.id !== id);
  saveFileStore();
  return (store.items || []).length < before;
}

// ---------------- Quota helpers ----------------
export async function getUserPlan(userId) {
  const user = await (async () => {
    // reuse repository
    const { findUserById } = await import('./repository.js');
    return findUserById(userId);
  })();
  if (!user) return null;
  await initStorage();
  if (user.planId) {
    if (storageMode() === 'mongo') {
      if (mongoose.isValidObjectId(user.planId)) {
        const p = await Plan.findById(user.planId).lean();
        if (p) return { ...p, id: p._id.toString() };
      }
    } else {
      const store = getFileStore();
      const p = (store.plans || []).find(x => x.id === user.planId);
      if (p) return p;
    }
  }
  // default plan from system settings
  const defaultPlanName = await getSystemSetting('defaultPlan');
  if (defaultPlanName) {
    if (storageMode() === 'mongo') {
      const p = await Plan.findOne({ name: defaultPlanName }).lean();
      if (p) return { ...p, id: p._id.toString() };
    } else {
      const store = getFileStore();
      const p = (store.plans || []).find(x => x.name === defaultPlanName);
      if (p) return p;
    }
  }
  return null;
}

export async function usageCount(userId, sinceDate) {
  const { items } = await listUsage({ userId, page: 1, limit: 100000 });
  return items.filter(e => new Date(e.createdAt) >= sinceDate).length;
}

export async function systemInfo() {
  await initStorage();
  const { storageStatus } = await import('./store.js');
  const st = storageStatus();
  const mem = process.memoryUsage();
  // mongo size
  let mongoSize = null, collections = [];
  if (storageMode() === 'mongo') {
    try {
      const db = mongoose.connection.db;
      const stats = await db.stats();
      mongoSize = stats.dataSize || stats.storageSize || null;
      collections = (await db.listCollections().toArray()).map(c => c.name);
    } catch { /* ignore */ }
  }
  // host
  const cpus = os.cpus();
  const load = os.loadavg();
  const freeMem = os.freemem();
  const totalMem = os.totalmem();
  // disk
  let diskFree = null, diskTotal = null;
  try {
    const s = fs.statfsSync(process.cwd());
    diskFree = s.bavail * s.bsize;
    diskTotal = s.blocks * s.bsize;
  } catch { /* ignore */ }
  // backups
  const backupDir = path.resolve(process.cwd(), 'backups');
  let backups = [];
  try {
    if (fs.existsSync(backupDir)) {
      backups = fs.readdirSync(backupDir).map(f => {
        const stf = fs.statSync(path.join(backupDir, f));
        return { name: f, size: stf.size, mtime: stf.mtime.toISOString() };
      }).sort((a, b) => b.mtime.localeCompare(a.mtime));
    }
  } catch { /* ignore */ }
  // jobs
  let queueLen = 0;
  try {
    const { handoutJobs } = await import('../index.js');
    queueLen = handoutJobs ? handoutJobs.size : 0;
  } catch { /* ignore */ }
  // AI failures last 10 min
  const since = new Date(Date.now() - 10 * 60 * 1000);
  const { items: recent } = await listUsage({ page: 1, limit: 100000 });
  const recentFails = recent.filter(e => !e.success && new Date(e.createdAt) >= since).length;
  const cfg = await getAIConfig();
  return {
    api: { uptime: process.uptime(), version: process.env.npm_package_version || '0.2.1', node: process.version, memory: mem, rss: mem.rss },
    mongo: { connected: storageMode() === 'mongo', backend: storageMode(), size: mongoSize, collections, collectionCount: collections.length },
    ai: { enabled: cfg.enabled !== false, healthy: true, failuresLast10m: recentFails },
    host: { cpuCores: cpus.length, load1: load[0], freeMem, totalMem, freeMemMB: Math.round(freeMem / 1048576), diskFree, diskTotal, diskFreeGB: diskFree ? Math.round(diskFree / 1073741824) : null },
    jobs: { queueLength: queueLen },
    backups: { latest: backups[0] || null, count: backups.length, stale: backups[0] ? (Date.now() - new Date(backups[0].mtime).getTime() > 48 * 3600 * 1000) : true },
  };
}

const DIAGNOSTICS = {
  'disk-space': async () => {
    let free = null;
    try { const s = fs.statfsSync(process.cwd()); free = s.bavail * s.bsize; } catch {}
    return { id: 'disk-space', ok: free == null || free > 1024 * 1024 * 1024, detail: free ? `${Math.round(free / 1073741824)} GB free` : 'unknown' };
  },
  'memory': async () => {
    const free = os.freemem();
    return { id: 'memory', ok: free > 100 * 1048576, detail: `${Math.round(free / 1048576)} MB free` };
  },
  'service-status': async () => ({ id: 'service-status', ok: true, detail: 'Exam Studio process running' }),
  'log-tail': async () => ({ id: 'log-tail', ok: true, detail: 'no log file configured' }),
  'backup-list': async () => {
    const backupDir = path.resolve(process.cwd(), 'backups');
    const exists = fs.existsSync(backupDir);
    const count = exists ? fs.readdirSync(backupDir).length : 0;
    return { id: 'backup-list', ok: count > 0, detail: `${count} backup files` };
  },
};

export async function runDiagnostic(id) {
  const fn = DIAGNOSTICS[id];
  if (!fn) throw httpError(400, 'Unknown diagnostic id.');
  const start = Date.now();
  const result = await Promise.race([fn(), new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 5000))]);
  return { ...result, durationMs: Date.now() - start };
}

export async function tokenCount(userId, sinceDate) {
  const { items } = await listUsage({ userId, page: 1, limit: 100000 });
  return items.filter(e => new Date(e.createdAt) >= sinceDate).reduce((s, e) => s + (e.actualTokens || e.estimatedTokens || 0), 0);
}

const FEATURE_MAP = { notes: 'study-notes', cards: 'flashcards', exam: 'exam', handout: 'handout', flashcards: 'flashcards' };

export async function checkFeature(userId, feature) {
  if (!userId) return true;
  const plan = await getUserPlan(userId);
  if (!plan) return true;
  if (Array.isArray(plan.allowedFeatures) && !plan.allowedFeatures.includes(feature)) {
    throw httpError(403, 'Your plan does not include this feature. Ask your teacher/admin.');
  }
  return true;
}

export async function isAIEnabled() {
  const cfg = await getAIConfig();
  return cfg.enabled !== false;
}

export async function enforceLimits(userId, taskType, sourceText = '') {
  // AI on/off
  if (!(await isAIEnabled())) {
    throw httpError(503, 'Exam Studio is being updated.');
  }
  const { findUserById } = await import('./repository.js');
  const user = await findUserById(userId);
  if (!user) throw httpError(401, 'Please sign in to continue.');
  if (user.active === false) throw httpError(403, 'This account is disabled. Contact your administrator.');
  const plan = await getUserPlan(userId);
  const ov = user.overrides || {};
  const boostActive = ov.boostExpiry ? new Date(ov.boostExpiry) > now : false;
  // feature check
  const feature = FEATURE_MAP[taskType] || taskType;
  if (plan && Array.isArray(plan.allowedFeatures) && !plan.allowedFeatures.includes(feature)) {
    throw httpError(403, 'Your plan does not include this feature. Ask your teacher/admin.');
  }
  const now = new Date();
  const startOfDay = new Date(now); startOfDay.setHours(0, 0, 0, 0);
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const reqsToday = await usageCount(userId, startOfDay);
  const reqsMonth = await usageCount(userId, startOfMonth);
  const toksToday = await tokenCount(userId, startOfDay);
  const toksMonth = await tokenCount(userId, startOfMonth);
  const srcTokens = Math.max(1, Math.ceil((sourceText || '').length / 4));
  if (plan) {
    const rpd = plan.requestsPerDay != null ? plan.requestsPerDay + (boostActive ? (ov.extraDailyRequests || 0) : 0) : null;
    const tpd = plan.tokensPerDay != null ? plan.tokensPerDay + (boostActive ? (ov.extraDailyTokens || 0) : 0) : null;
    if (rpd != null && reqsToday >= rpd) {
      throw httpError(429, 'Daily limit reached. Resets at 00:00. Ask your teacher/admin or add your own model.');
    }
    if (plan.requestsPerMonth != null && reqsMonth >= plan.requestsPerMonth) {
      throw httpError(429, 'Monthly limit reached. Ask your teacher/admin or add your own model.');
    }
    if (tpd != null && (toksToday + srcTokens) > tpd) {
      throw httpError(429, 'Daily token limit reached. Resets at 00:00. Ask your teacher/admin or add your own model.');
    }
    if (plan.tokensPerMonth != null && (toksMonth + srcTokens) > plan.tokensPerMonth) {
      throw httpError(429, 'Monthly token limit reached. Ask your teacher/admin or add your own model.');
    }
    if (plan.maxSourceSize != null && srcTokens > plan.maxSourceSize) {
      throw httpError(413, 'The source is too large for your plan. Ask your teacher/admin or add your own model.');
    }
  }
  return { plan, user };
}
