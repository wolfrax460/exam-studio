import mongoose from 'mongoose';
import { initStorage, storageMode } from './store.js';
import { encryptSecret, decryptSecret } from './adminStore.js';

const userAISettingsSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true, index: true },
  provider: { type: String, default: 'custom' },
  model: { type: String, default: '' },
  baseURL: { type: String, default: '' },
  maxOutput: { type: Number, default: 0 },
  chunkChars: { type: Number, default: 0 },
  timeoutMs: { type: Number, default: 0 },
  apiKeyEncrypted: { type: String, default: null },
}, { timestamps: true });

const UserAISettings = mongoose.models.UserAISettings || mongoose.model('UserAISettings', userAISettingsSchema);
const memory = new Map();

function publicView(doc) {
  if (!doc) return null;
  const key = doc.apiKeyEncrypted ? decryptSecret(doc.apiKeyEncrypted) : '';
  return {
    provider: doc.provider || 'custom',
    model: doc.model || '',
    baseURL: doc.baseURL || '',
    maxOutput: doc.maxOutput || 0,
    chunkChars: doc.chunkChars || 0,
    timeoutMs: doc.timeoutMs || 0,
    hasKey: Boolean(key),
    keyLast4: key ? String(key).slice(-4) : '',
  };
}

export async function getUserAISettings(userId) {
  if (!userId) return null;
  await initStorage();
  if (storageMode() === 'mongo') {
    const doc = await UserAISettings.findOne({ userId }).lean();
    if (!doc) return null;
    return { ...publicView(doc), apiKey: doc.apiKeyEncrypted ? decryptSecret(doc.apiKeyEncrypted) : '' };
  }
  const doc = memory.get(String(userId));
  if (!doc) return null;
  return { ...doc, apiKey: doc.apiKeyEncrypted ? decryptSecret(doc.apiKeyEncrypted) : '' };
}

export async function getPublicUserAISettings(userId) {
  const doc = await getUserAISettings(userId);
  if (!doc) return null;
  const { apiKey, ...rest } = doc;
  return rest;
}

export async function saveUserAISettings(userId, patch = {}) {
  if (!userId) return null;
  await initStorage();
  const update = {};
  if (patch.provider !== undefined) update.provider = String(patch.provider || 'custom').slice(0, 40);
  if (patch.model !== undefined) update.model = String(patch.model || '').slice(0, 160);
  if (patch.baseURL !== undefined) update.baseURL = String(patch.baseURL || '').slice(0, 300);
  if (patch.maxOutput !== undefined) update.maxOutput = Number(patch.maxOutput) || 0;
  if (patch.chunkChars !== undefined) update.chunkChars = Number(patch.chunkChars) || 0;
  if (patch.timeoutMs !== undefined) update.timeoutMs = Math.max(1000, Math.min(300000, Number(patch.timeoutMs) || 0));
  if (patch.apiKey !== undefined) update.apiKeyEncrypted = patch.apiKey ? encryptSecret(String(patch.apiKey).slice(0, 500)) : null;

  if (storageMode() === 'mongo') {
    const doc = await UserAISettings.findOneAndUpdate(
      { userId },
      { $set: update, $setOnInsert: { userId } },
      { upsert: true, new: true }
    ).lean();
    return publicView(doc);
  }
  const current = memory.get(String(userId)) || {};
  const next = { ...current, ...update };
  memory.set(String(userId), next);
  return publicView(next);
}

export async function deleteUserAISettings(userId) {
  if (!userId) return;
  await initStorage();
  if (storageMode() === 'mongo') await UserAISettings.deleteOne({ userId }).catch(() => {});
  else memory.delete(String(userId));
}
