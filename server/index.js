import 'dotenv/config';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import express from 'express';
import crypto from 'node:crypto';
import User from './lib/models/User.js';
import helmet from 'helmet';
import cors from 'cors';
import multer from 'multer';
import rateLimit from 'express-rate-limit';
import { httpError } from './lib/errors.js';
import { extractText } from './lib/extract.js';
import { scanNotes, loadNote } from './lib/notesLib.js';
import { generateNotes, generateNotesDocument, generateCards, generateExam, generateHandout, activeInfo, DEMO, MAX_NOTES_CHARS, detectStructure, suggestOutcomeTitles } from './lib/ai.js';
import { examDocx, keyDocx, notesDocx, handoutDocx } from './lib/docx.js';
import { handoutPdf, examPdf, keyPdf } from './lib/pdf.js';
import { examCsv, keyCsv } from './lib/csv.js';
import { listItems, getItem, saveItem, deleteItem, initStorage, storageStatus, storageMode } from './lib/store.js';
import { normalizeEmail, findUserByEmail, createUser, countUsers, findUserById } from './lib/repository.js';
import {
  authenticateUser, optionalAuthenticateUser, validatePassword, hashPassword, verifyPassword,
  generateToken, verifyToken, publicUser, dummyCompare, JWT_EXPIRES_IN,
} from './lib/auth.js';
import { updateSettings, getSettings } from './lib/settings.js';
import { PROVIDERS, activeProviderId, providerCatalog, runWithUserAI, resolve as resolveProvider } from './lib/providers.js';
import * as admin from './lib/adminStore.js';
import { verifyPatToken } from './lib/adminStore.js';
import { getUserAISettings, getPublicUserAISettings, saveUserAISettings, deleteUserAISettings } from './lib/userAISettings.js';
import { listProviderModelIds, testProviderConnection } from './lib/userAiApi.js';
import { assertSafeBaseURL } from './lib/ssrf.js';
import * as mailer from './lib/mailer.js';
import PublicQuota from './lib/models/PublicQuota.js';
import McpQuota from './lib/models/McpQuota.js';
import { dailyGenerationLimit, anonymousGenerationLimit, generationRateLimit, resetsAtIso, kigaliDay } from './lib/dailyLimit.js';
import { requireAdmin } from './lib/auth.js';
import { institutionAccess, institutionRoutes, protectSuperadminAccount } from './lib/institutionRoutes.js';
import * as totp from './lib/totp.js';
import { pingProvider, listProviderModels } from './lib/engine.js';
import { launchInfo, snippets } from './lib/agents.js';
import { createMcpServer, PUBLIC_INPUT_MAX_CHARS } from './lib/mcpServer.js';
import ExamPublication from './lib/models/ExamPublication.js';
import ExamAttempt from './lib/models/ExamAttempt.js';
import { studentQuestion, questionList, totalMarks as examTotalMarks, signAttemptToken, verifyAttemptToken, markObjective, aiMarkAnswer } from './lib/examTake.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { checkForUpdate, cachedUpdateStatus, currentVersion, updateSource, CHECK_INTERVAL_MS } from './lib/version.js';
import { QUESTION_TYPES, validateExam, totalMarks, isSectionsExam, numberedItems, itemMarks, answerText } from '../shared/format.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3001;
const VERSION = currentVersion();

// Per-user MCP generation window (default 5 hours / 10 generations).
const MCP_WINDOW_HOURS = Number(process.env.MCP_WINDOW_HOURS) || 5;
const MCP_WINDOW_LIMIT = Number(process.env.MCP_WINDOW_LIMIT) || 10;
const MCP_GLOBAL_WINDOW_CAP = Number(process.env.MCP_GLOBAL_WINDOW_CAP) || 0; // 0 = disabled
const MCP_BURST_SECONDS = 10;
const MCP_BURST_LIMIT = 1;

const app = express();
app.disable('x-powered-by');
// Only enable this when the server really sits behind a proxy, otherwise clients could spoof
// which address they came from. A number ("trust the first N proxies") is the safe form;
// `true` is refused by express-rate-limit for exactly that reason, so it is read as one hop.
if (process.env.TRUST_PROXY) {
  const raw = String(process.env.TRUST_PROXY).trim();
  const hops = Number(raw);
  app.set('trust proxy', Number.isInteger(hops) && hops >= 0 ? hops : raw.toLowerCase() === 'true' ? 1 : raw);
}
app.use(helmet({ crossOriginResourcePolicy: false }));
const MCP_ALLOW_HEADERS = 'Content-Type, Accept, Authorization, Mcp-Session-Id, Mcp-Protocol-Version, Last-Event-ID';
if (process.env.CORS_ORIGIN) {
  const webCors = cors({ origin: process.env.CORS_ORIGIN.split(',').map((s) => s.trim()) });
  app.use((req, res, next) => (req.path.startsWith('/mcp') ? next() : webCors(req, res, next)));
}
// CORS for MCP endpoints: intercept OPTIONS before Express router auto-handles them,
// and set cross-origin headers for all /mcp requests from AI connectors (ChatGPT, Claude).
app.use((req, res, next) => {
  if (!req.path.startsWith('/mcp')) return next();
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', MCP_ALLOW_HEADERS);
  res.setHeader('Access-Control-Expose-Headers', 'Mcp-Session-Id');
  res.setHeader('Access-Control-Max-Age', '86400');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  if (req.method === 'OPTIONS') return res.status(204).end();
  next();
});
// A handout is planned from a whole trainee's manual, which runs to about 600,000 characters
// before JSON escaping.
app.use(express.json({ limit: '4mb' }));
// Always emit JSON as UTF-8 so dashes and accents never mojibake on the wire.
app.use((_req, res, next) => {
  const json = res.json.bind(res);
  res.json = (body) => {
    res.type('application/json; charset=utf-8');
    return json(body);
  };
  next();
});

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// Load a signed-in user's own AI settings and make them visible to the provider resolver for
// the whole downstream async chain. No request runs without a context, so this is opt-in per route.
const withUserAI = wrap(async (req, res, next) => {
  let settings = null;
  if (req.user?.id) settings = await getUserAISettings(req.user.id).catch(() => null);
  req.userAI = settings;
  return runWithUserAI(settings, next);
});

// MCP endpoints (Streamable HTTP) need cross-origin access from AI connectors
// (ChatGPT, Claude, etc.) and must never leak raw IPs or secrets in logs.
app.use('/mcp', (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', MCP_ALLOW_HEADERS);
  res.setHeader('Access-Control-Expose-Headers', 'Mcp-Session-Id');
  res.setHeader('Access-Control-Max-Age', '86400');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  if (req.method === 'OPTIONS') return res.status(204).end();
  next();
});

// Extract an MCP bearer token from either the Authorization header or the path
// (/mcp/<token>). Claude and ChatGPT connectors with "No authentication" cannot
// send headers, so the token-in-path form is required for them.
const mcpTokenFromReq = (req) => {
  const header = req.headers?.authorization || '';
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  if (match) return match[1].trim();
  const path = req.path || '';
  const m = /^\/mcp\/([A-Za-z0-9_-]+)$/.exec(path);
  if (m) return m[1];
  return '';
};

// Public MCP generate-only tools (no-auth endpoint).
const PUBLIC_GEN_TOOLS = [
  'exam_studio_generate_notes',
  'exam_studio_generate_exam',
  'exam_studio_generate_handout',
  'exam_studio_generate_flashcards',
];

// MCP quota state (per-user 5-hour window). Stored in MongoDB via McpQuota model.
const PUBLIC_GEN_TOOLS_SET = new Set(PUBLIC_GEN_TOOLS);

function isPublicGenCall(req) {
  const body = req.body || {};
  return body.method === 'tools/call' && PUBLIC_GEN_TOOLS_SET.has(String(body.params?.name || ''));
}

// Per-user MCP quota (5-hour window). Counters live in MongoDB via McpQuota model.
const MCP_QUOTA_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const mcpQuotaFallback = new Map();

function mcpQuotaFallbackKey(userId, windowStart) {
  return `${userId}:${windowStart.getTime()}`;
}

function mcpQuotaFallbackGet(userId, windowStart) {
  const entry = mcpQuotaFallback.get(mcpQuotaFallbackKey(userId, windowStart));
  return entry ? { ...entry, value: entry.value || 0 } : null;
}
function mcpQuotaFallbackSet(userId, windowStart, value, ttlMs) {
  mcpQuotaFallback.set(mcpQuotaFallbackKey(userId, windowStart), { value, expiresAt: Date.now() + ttlMs });
}
function mcpQuotaFallbackInc(userId, windowStart, amount, ttlMs) {
  const key = mcpQuotaFallbackKey(userId, windowStart);
  const entry = mcpQuotaFallback.get(key);
  const next = (entry && entry.expiresAt > Date.now() ? entry.value : 0) + amount;
  mcpQuotaFallback.set(key, { value: next, expiresAt: Date.now() + ttlMs });
  return next;
}

// Check and record a per-user generation against the 5-hour window quota.
// Returns { ok, used, limit, windowHours, windowStart, resetsAt } or throws httpError(429).
async function checkAndRecordGeneration(userId) {
  await initStorage();
  const windowMs = MCP_WINDOW_HOURS * 3600 * 1000;
  const now = Date.now();

  if (storageMode() === 'mongo') {
    let current = await McpQuota.findOne({ userId }).sort({ windowStart: -1 }).lean();
    let windowStart = current ? new Date(current.windowStart) : new Date(now);
    if (!current || windowStart.getTime() + windowMs <= now) {
      windowStart = new Date(now);
      if (current) {
        await McpQuota.updateOne({ _id: current._id }, { $set: { windowStart, count: 0 } });
      }
    }
    const resetsAt = new Date(windowStart.getTime() + windowMs);
    let result;
    try {
      result = await McpQuota.findOneAndUpdate(
        { userId, windowStart, count: { $lt: MCP_WINDOW_LIMIT } },
        { $inc: { count: 1 }, $setOnInsert: { createdAt: new Date() } },
        { upsert: true, new: true }
      );
    } catch (error) {
      if (error?.code === 11000) {
        throw httpError(429, {
          error: 'usage_limit_reached',
          message: `You've used ${MCP_WINDOW_LIMIT} of ${MCP_WINDOW_LIMIT} generations. Resets in ${formatRetryAfter(windowStart, now)}.`,
          limit: MCP_WINDOW_LIMIT, used: MCP_WINDOW_LIMIT, windowHours: MCP_WINDOW_HOURS,
          windowStart, resetsAt, retryAfterSeconds: Math.max(1, Math.ceil((resetsAt.getTime() - now) / 1000)),
        });
      }
      throw error;
    }
    const used = result?.count || 0;
    if (!result || used > MCP_WINDOW_LIMIT) {
      throw httpError(429, {
        error: 'usage_limit_reached',
        message: `You've used ${MCP_WINDOW_LIMIT} of ${MCP_WINDOW_LIMIT} generations. Resets in ${formatRetryAfter(windowStart, now)}.`,
        limit: MCP_WINDOW_LIMIT, used: MCP_WINDOW_LIMIT, windowHours: MCP_WINDOW_HOURS,
        windowStart, resetsAt, retryAfterSeconds: Math.max(1, Math.ceil((resetsAt.getTime() - now) / 1000)),
      });
    }
    return { ok: true, used, limit: MCP_WINDOW_LIMIT, windowHours: MCP_WINDOW_HOURS, windowStart, resetsAt };
  }

  // File-store fallback.
  let key = null;
  let doc = null;
  for (const [candidate, entry] of mcpQuotaFallback) {
    if (!candidate.startsWith(`${userId}:`)) continue;
    if (entry.expiresAt <= Date.now()) continue;
    if (!doc || entry.expiresAt > doc.expiresAt) { doc = entry; key = candidate; }
  }
  let windowStart = doc ? new Date(Number(key.split(':').pop())) : new Date(now);
  if (!doc || windowStart.getTime() + windowMs <= now) {
    windowStart = new Date(now);
    doc = { value: 0, expiresAt: now + MCP_QUOTA_TTL_MS };
  }
  const resetsAt = new Date(windowStart.getTime() + windowMs);
  if (doc.value >= MCP_WINDOW_LIMIT) {
    throw httpError(429, {
      error: 'usage_limit_reached',
      message: `You've used ${doc.value} of ${MCP_WINDOW_LIMIT} generations. Resets in ${formatRetryAfter(windowStart, now)}.`,
      limit: MCP_WINDOW_LIMIT, used: doc.value, windowHours: MCP_WINDOW_HOURS,
      windowStart, resetsAt, retryAfterSeconds: Math.max(1, Math.ceil((resetsAt.getTime() - now) / 1000)),
    });
  }
  mcpQuotaFallbackSet(userId, windowStart, doc.value + 1, MCP_QUOTA_TTL_MS);
  return { ok: true, used: doc.value + 1, limit: MCP_WINDOW_LIMIT, windowHours: MCP_WINDOW_HOURS, windowStart, resetsAt };
}

// Decrement a per-user generation counter (refund on generation failure).
async function publicRefundGeneration(userId) {
  await initStorage();
  const windowMs = MCP_WINDOW_HOURS * 3600 * 1000;
  if (storageMode() === 'mongo') {
    const current = await McpQuota.findOne({ userId }).sort({ windowStart: -1 });
    if (current && new Date(current.windowStart).getTime() + windowMs > Date.now() && current.count > 0) {
      await McpQuota.updateOne({ _id: current._id }, { $inc: { count: -1 } }).catch(() => {});
    }
  } else {
    for (const [key, entry] of mcpQuotaFallback) {
      if (!key.startsWith(`${userId}:`) || entry.value <= 0 || entry.expiresAt <= Date.now()) continue;
      mcpQuotaFallback.set(key, { ...entry, value: entry.value - 1 });
      break;
    }
  }
}

async function currentQuotaStatus(userId) {
  await initStorage();
  const windowMs = MCP_WINDOW_HOURS * 3600 * 1000;
  let windowStart = new Date();
  let used = 0;
  if (storageMode() === 'mongo') {
    const doc = await McpQuota.findOne({ userId }).sort({ windowStart: -1 }).lean();
    if (doc && new Date(doc.windowStart).getTime() + windowMs > Date.now()) {
      windowStart = new Date(doc.windowStart);
      used = doc.count || 0;
    }
  } else {
    for (const [key, entry] of mcpQuotaFallback) {
      if (!key.startsWith(`${userId}:`) || entry.expiresAt <= Date.now()) continue;
      if (entry.value > used) { used = entry.value; windowStart = new Date(Number(key.split(':').pop())); }
    }
  }
  const resetsAt = new Date(windowStart.getTime() + windowMs);
  return {
    limit: MCP_WINDOW_LIMIT, used, remaining: Math.max(0, MCP_WINDOW_LIMIT - used),
    windowHours: MCP_WINDOW_HOURS, windowStart, resetsAt,
    retryAfterSeconds: Math.max(1, Math.ceil((resetsAt.getTime() - Date.now()) / 1000)),
  };
}

function formatRetryAfter(windowStart, now) {
  const windowMs = MCP_WINDOW_HOURS * 3600 * 1000;
  const resetsAt = new Date(windowStart.getTime() + windowMs);
  const seconds = Math.max(1, Math.ceil((resetsAt.getTime() - now) / 1000));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

// Check and record an anonymous (public) generation against per-IP daily/burst quotas.
// Returns { ok } or throws an httpError.
async function publicCheckAndRecord(ipHash, isGeneration) {
  await initStorage();
  const day = publicDayKey();
  const now = Date.now();
  const resetsAt = resetsAtIso();
  const useMongo = storageMode() === 'mongo';

  if (useMongo) {
    const globalDoc = await PublicQuota.findOne({ key: 'global:day', day }).lean();
    const globalUsed = globalDoc?.generations || 0;
    if (isGeneration && globalUsed >= PUBLIC_GLOBAL_DAILY_CAP) {
      return { ok: false, reason: 'daily_limit_reached', resetsAt, retryAfterSeconds: Math.max(1, Math.ceil((new Date(resetsAt).getTime() - now) / 1000)) };
    }
    const ipKey = `ip:${ipHash}`;
    const doc = await PublicQuota.findOne({ key: ipKey, day }).lean() || {};
    const used = doc.generations || 0;
    const requests = doc.requests || 0;
    if (isGeneration) {
      if (used >= PUBLIC_GENERATIONS_PER_DAY_PER_IP) {
        return { ok: false, reason: 'daily_limit_reached', resetsAt, retryAfterSeconds: Math.max(1, Math.ceil((new Date(resetsAt).getTime() - now) / 1000)) };
      }
      const burstWindow = doc.burstWindow ? new Date(doc.burstWindow).getTime() : 0;
      if (doc.burst >= PUBLIC_BURST_LIMIT && now - burstWindow < PUBLIC_BURST_SECONDS * 1000) {
        return { ok: false, reason: 'ai_rate_limited', resetsAt, retryAfterSeconds: Math.max(1, Math.ceil((burstWindow + PUBLIC_BURST_SECONDS * 1000 - now) / 1000)) };
      }
      if (publicConcurrentGenerations >= PUBLIC_MAX_CONCURRENT_GENERATIONS) {
        return { ok: false, reason: 'ai_rate_limited', resetsAt, retryAfterSeconds: PUBLIC_BURST_SECONDS };
      }
    } else {
      const reqWindow = doc.requestsWindow ? new Date(doc.requestsWindow).getTime() : 0;
      if (now - reqWindow >= 60 * 1000) {
        await PublicQuota.updateOne({ key: ipKey, day }, { $set: { requests: 1, requestsWindow: new Date() } }, { upsert: true }).catch(() => {});
        return { ok: true };
      }
      if (requests >= PUBLIC_NON_GEN_PER_MIN) {
        return { ok: false, reason: 'ai_rate_limited', resetsAt, retryAfterSeconds: Math.max(1, Math.ceil((reqWindow + 60 * 1000 - now) / 1000)) };
      }
      await PublicQuota.updateOne({ key: ipKey, day }, { $inc: { requests: 1 } }, { upsert: true }).catch(() => {});
      return { ok: true };
    }
    return { ok: true, used };
  }

  // File-store fallback: in-memory counters.
  const globalUsed = Number(publicFallbackGet(ipHash, day, 'global')?.value || 0);
  if (isGeneration && globalUsed >= PUBLIC_GLOBAL_DAILY_CAP) {
    return { ok: false, reason: 'daily_limit_reached', resetsAt, retryAfterSeconds: Math.max(1, Math.ceil((new Date(resetsAt).getTime() - now) / 1000)) };
  }
  const used = Number(publicFallbackGet(ipHash, day, 'generations')?.value || 0);
  const requests = Number(publicFallbackGet(ipHash, day, 'requests')?.value || 0);
  if (isGeneration) {
    if (used >= PUBLIC_GENERATIONS_PER_DAY_PER_IP) {
      return { ok: false, reason: 'daily_limit_reached', resetsAt, retryAfterSeconds: Math.max(1, Math.ceil((new Date(resetsAt).getTime() - now) / 1000)) };
    }
    const burst = publicFallbackGet(ipHash, day, 'burst');
    const burstWindowStart = burst ? burst.expiresAt - PUBLIC_BURST_SECONDS * 1000 : 0;
    if (burst && burst.value >= PUBLIC_BURST_LIMIT && now - burstWindowStart < PUBLIC_BURST_SECONDS * 1000) {
      return { ok: false, reason: 'ai_rate_limited', resetsAt, retryAfterSeconds: Math.max(1, Math.ceil((burstWindowStart + PUBLIC_BURST_SECONDS * 1000 - now) / 1000)) };
    }
    if (publicConcurrentGenerations >= PUBLIC_MAX_CONCURRENT_GENERATIONS) {
      return { ok: false, reason: 'ai_rate_limited', resetsAt, retryAfterSeconds: PUBLIC_BURST_SECONDS };
    }
  } else {
    const reqWindow = publicFallbackGet(ipHash, day, 'requestsWindow');
    if (reqWindow && now - reqWindow.value >= 60 * 1000) {
      publicFallbackSet(ipHash, day, 'requests', 1, 60 * 1000);
      publicFallbackSet(ipHash, day, 'requestsWindow', now, 60 * 1000);
      return { ok: true };
    }
    if (requests >= PUBLIC_NON_GEN_PER_MIN) {
      return { ok: false, reason: 'ai_rate_limited', resetsAt, retryAfterSeconds: Math.max(1, Math.ceil(((reqWindow ? reqWindow.value : 0) + 60 * 1000 - now) / 1000)) };
    }
    publicFallbackInc(ipHash, day, 'requests', 1, 60 * 1000);
    return { ok: true };
  }
  return { ok: true, used };
}

// Record a public generation after it completes (success or failure).
async function publicRecordGeneration(ipHash) {
  await initStorage();
  const day = publicDayKey();
  const now = Date.now();
  if (storageMode() === 'mongo') {
    const ipKey = `ip:${ipHash}`;
    await PublicQuota.updateOne({ key: ipKey, day }, { $setOnInsert: { createdAt: new Date() }, $inc: { generations: 1 }, $set: { burst: 1, burstWindow: new Date() } }, { upsert: true }).catch(() => {});
    await PublicQuota.updateOne({ key: 'global:day', day }, { $setOnInsert: { createdAt: new Date() }, $inc: { generations: 1 } }, { upsert: true }).catch(() => {});
  } else {
    publicFallbackInc(ipHash, day, 'generations', 1, 24 * 60 * 60 * 1000);
    publicFallbackSet(ipHash, day, 'burst', 1, PUBLIC_BURST_SECONDS * 1000);
    publicFallbackInc(ipHash, day, 'global', 1, 24 * 60 * 60 * 1000);
  }
}


async function authenticateAny(req, res, next) {
  const header = req.headers?.authorization || '';
  const token = /^Bearer\s+(.+)$/i.exec(header.trim())?.[1]?.trim() || header.trim();
  if (!token) return next(httpError(401, 'Please sign in to continue.'));
  if (token.startsWith('est_')) {
    const info = await verifyPatToken(token);
    if (!info) return next(httpError(401, 'Invalid or expired token.'));
    const user = await findUserById(info.userId);
    if (!user) return next(httpError(401, 'Account no longer exists.'));
    req.user = user;
    req.userId = user.id;
    req.scopes = info.scopes;
    return next();
  }
  // JWT
  try {
    const decoded = verifyToken(token);
    const id = decoded.sub || decoded.userId;
    const user = await findUserById(id);
    if (!user) return next(httpError(401, 'Account no longer exists.'));
    if (user.active === false) return next(httpError(403, 'Account disabled.'));
    req.user = user;
    req.userId = user.id;
    req.scopes = ['*'];
    return next();
  } catch (e) {
    return next(e.status ? e : httpError(401, 'Invalid session.'));
  }
}

// ---------------------------------------------------------------- helpers
// Text fields: anything that is not a string or a number becomes empty, so an array or an
// object can never end up stored as "[object Object]".
const s = (v, max) => (typeof v === 'string' || typeof v === 'number' ? String(v).trim().slice(0, max) : '');

// Strict text field: a number or object where a string belongs is a 400, never a crash.
function text(value, { field, min = 1, max = 500 }) {
  if (typeof value !== 'string') throw httpError(400, `${field} must be text.`);
  const trimmed = value.trim();
  if (trimmed.length < min) throw httpError(400, `${field} is required.`);
  if (trimmed.length > max) throw httpError(400, `${field} must be ${max} characters or fewer.`);
  return trimmed;
}

function int(value, def, min, max) {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def;
}

// Optional number coming from a form: '' means "use the provider default again".
function numberOrBlank(value, min, max, field) {
  if (value === '' || value === null || value === undefined) return '';
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n)) throw httpError(400, `${field} must be a number.`);
  return Math.min(max, Math.max(min, n));
}

function notesFrom(body) {
  const value = String(body?.text ?? '');
  if (value.trim().length < 50) throw httpError(400, 'Add your notes first (at least a few sentences).');
  if (value.length > MAX_NOTES_CHARS) throw httpError(413, `The notes are too long. The limit is ${MAX_NOTES_CHARS.toLocaleString()} characters. Split them by chapter.`);
  return value.slice(0, MAX_NOTES_CHARS);
}

function examFrom(body) {
  const exam = body?.exam;
  // A sectioned paper holds its questions inside sections; an older paper holds them flat.
  if (exam && Array.isArray(exam.sections) && exam.sections.length) {
    if (exam.sections.length > 12) throw httpError(400, 'That exam has too many sections.');
    for (const section of exam.sections) {
      if (!section || typeof section !== 'object' || Array.isArray(section)) throw httpError(400, 'That exam has a section that is not a section.');
      if (!Array.isArray(section.items) || section.items.length === 0) throw httpError(400, 'A section of that exam has no questions.');
      if (section.items.length > 200) throw httpError(400, 'A section of that exam has too many questions.');
      if (section.items.some((item) => !item || typeof item !== 'object' || Array.isArray(item))) {
        throw httpError(400, 'That exam has a question that is not a question. Remove it and try again.');
      }
    }
    return exam;
  }
  if (!exam || !Array.isArray(exam.questions) || exam.questions.length === 0 || exam.questions.length > 100) {
    throw httpError(400, 'No exam to export.');
  }
  // Every entry has to be a real object. A null (or a string) used to reach the Word/PDF
  // writer and come back as a 500.
  if (exam.questions.some((q) => !q || typeof q !== 'object' || Array.isArray(q))) {
    throw httpError(400, 'That exam has a question that is not a question. Remove it and try again.');
  }
  return exam;
}

const metaFrom = (b) => ({
  module: s(b?.meta?.module, 120),
  level: s(b?.meta?.level, 20),
  trade: s(b?.meta?.trade, 120),
  school: s(b?.meta?.school, 120),
  duration: s(b?.meta?.duration, 40) || '3 HOURS',
});

const safeName = (v, fallback) => (s(v, 60).replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '_') || fallback);

/** `<Module>_Exam`, `<Module>_Exam_Marking_Scheme` - the names the papers are handed out under. */
function examFileName(exam, suffix) {
  const code = s(exam?.moduleCode, 24);
  const name = s(exam?.moduleName, 90);
  const base = code && name ? safeName(`${code} ${name}`, 'Exam') : safeName(exam?.title, 'Exam');
  return `${base}_${suffix}`;
}

function send(res, buf, filename, type) {
  res.set({ 'Content-Type': type, 'Content-Disposition': `attachment; filename="${filename}"`, 'Cache-Control': 'no-store' });
  res.send(buf);
}
const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const PDF = 'application/pdf';

// Requests that come from this computer. Only these may change the server-wide AI settings
// or see the local agent setup (a terminal tool only exists on this machine anyway).
// Addresses arrive in several forms: 127.0.0.1, ::1, or an IPv4-mapped ::ffff:127.0.0.1.
const normalizeIp = (value) => {
  const ip = String(value || '').replace(/^\[|\]$/g, '');
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(ip);
  return mapped ? mapped[1] : ip;
};
const requestIsLocal = (req) => {
  const ip = normalizeIp(req.ip || req.socket?.remoteAddress);
  return ip === '::1' || ip === 'localhost' || ip.startsWith('127.');
};
// True hosted servers must never unlock the server-wide defaults just because Caddy connects
// from loopback. The admin role is the only remote path; localhost remains for desktop use.
const isHostedServer = Boolean(process.env.FRONTEND_URL || process.env.EXAM_STUDIO_HOSTED === '1' || process.env.NODE_ENV === 'production');
const canConfigure = (req) => Boolean(req.user?.role === 'admin') || (!isHostedServer && requestIsLocal(req));

const settingsPayload = (req) => {
  const source = updateSource();
  const saved = getSettings().update || {};
  return {
    active: activeProviderId(),
    canChange: canConfigure(req),
    isAdmin: req.user?.role === 'admin',
    signedIn: Boolean(req.user),
    providers: providerCatalog({ requestIsLocal: requestIsLocal(req), isAdmin: req.user?.role === 'admin' }),
    update: {
      repo: String(saved.repo || ''),
      feedUrl: String(saved.feedUrl || ''),
      configured: Boolean(source),
      source: source?.kind || null,
      // Never the token: just whether one is in use, and where the setting came from.
      fromEnvironment: Boolean(process.env.UPDATE_REPO || process.env.UPDATE_FEED_URL),
    },
  };
};

// ---------------------------------------------------------------- public routes
app.get('/api/health', optionalAuthenticateUser, wrap(async (req, res) => {
  res.set('Cache-Control', 'private, no-store');
  const info = activeInfo();
  const storage = storageStatus();
  const isDefaultAI = info.id === 'nvidia';
  res.json({
    ok: true,
    status: 'ok',
    service: 'exam-studio-api',
    version: VERSION,
    demo: info.demo,
    provider: isDefaultAI ? 'Exam Studio AI' : info.provider,
    providerId: isDefaultAI ? 'exam-studio-ai' : info.id,
    model: isDefaultAI ? null : info.model,
    defaultAI: isDefaultAI,
    storage: {
      backend: storage.backend,
      connected: storage.connected,
      // The absolute path is only useful (and only appropriate) on this computer.
      ...(requestIsLocal(req) && storage.file ? { file: storage.file } : {}),
    },
    authRequired: true,
    sessionDays: JWT_EXPIRES_IN,
    institutions: institutionAccess(req.user),
    user: req.user ? publicUser(req.user) : null,
  });
}));

// Auth ---------------------------------------------------------------
const loginLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: Number(process.env.LOGIN_LIMIT_PER_15_MIN) || 30,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true, // only failed attempts count towards the limit
  message: { error: 'Too many sign-in attempts. Please wait 15 minutes and try again.' },
});
const registerLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: Number(process.env.REGISTER_LIMIT_PER_HOUR) || 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many accounts created from this address. Try again later.' },
});
const recoveryLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many password recovery requests. Please wait 15 minutes and try again.' },
});

const isDuplicateKey = (error) => error?.code === 11000 || error?.code === 11001 || /duplicate key/i.test(String(error?.message || ''));

app.post('/api/auth/register', registerLimit, wrap(async (req, res) => {
  const email = normalizeEmail(text(req.body?.email, { field: 'Email', min: 3, max: 254 }));
  const name = text(req.body?.name, { field: 'Your name', min: 1, max: 80 });
  const password = req.body?.password;

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) throw httpError(400, 'That email address does not look right.');
  if (typeof password !== 'string') throw httpError(400, 'Password must be text.');
  const passwordProblem = validatePassword(password);
  if (passwordProblem) throw httpError(400, passwordProblem);

  const existing = await findUserByEmail(email);
  if (existing) throw httpError(409, 'An account with this email already exists. Sign in instead.');

  const passwordHash = await hashPassword(password);
  const verificationToken = crypto.randomBytes(32).toString('hex');
  const emailVerificationTokenHash = crypto.createHash('sha256').update(verificationToken).digest('hex');
  let user;
  try {
    user = await createUser({ email, name, passwordHash, emailVerified: false, emailVerificationTokenHash, emailVerificationExpires: new Date(Date.now() + 24 * 60 * 60 * 1000) });
  } catch (error) {
    if (isDuplicateKey(error)) throw httpError(409, 'An account with this email already exists. Sign in instead.');
    throw error;
  }
  mailer.sendVerificationEmail({ email, name, token: verificationToken }).catch(() => {});
  res.status(201).json({ token: generateToken(user), user: publicUser(user) });
}));

app.post('/api/auth/login', loginLimit, wrap(async (req, res) => {
  const email = normalizeEmail(text(req.body?.email, { field: 'Email', min: 3, max: 254 }));
  const password = req.body?.password;
  if (typeof password !== 'string' || !password) throw httpError(400, 'Enter your email and password.');

  const user = await findUserByEmail(email);
  if (!user) {
    // Spend the same time as a real check so the reply does not reveal whether the account exists.
    await dummyCompare(password);
    throw httpError(401, 'Email or password is not correct.');
  }
  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) throw httpError(401, 'Email or password is not correct.');
  if (user.active === false) throw httpError(403, 'This account is disabled. Contact your administrator.');

  if (user.totpEnabled) {
    const code = String(req.body?.totpCode || '').trim();
    if (!code || !totp.verifyTotp(user.totpSecret, code)) {
      throw httpError(401, 'Invalid or missing two-factor code.');
    }
  }

  const token = generateToken(user);
  const redirect = String(req.query.redirect || '');
  if (redirect) {
    return res.redirect(redirect);
  }
  res.json({ token, user: publicUser(user) });
}));

// Registered before the required-auth middleware, so it simply reports "signed out".
app.get('/api/auth/me', optionalAuthenticateUser, wrap(async (req, res) => {
  res.json({ user: req.user ? publicUser(req.user) : null });
}));

app.get('/api/limits', wrap(async (_req, res) => {
  res.json({ dailyGenerationLimit: dailyGenerationLimit(), anonymousGenerationLimit: anonymousGenerationLimit(), resetsAt: resetsAtIso() });
}));

app.get('/api/usage', optionalAuthenticateUser, wrap(async (req, res) => {
  const ip = req.ip || req.socket?.remoteAddress || 'unknown';
  const userId = req.user?.id || req.user?._id;
  const key = userId ? 'user:'+userId : 'ip:'+ip;
  const day = new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Kigali' });
  const doc = await (await import('./lib/models/DailyUsage.js')).default.findOne({ key, day }).lean();
  const limit = userId ? dailyGenerationLimit() : anonymousGenerationLimit();
  res.json({ used: doc?.count || 0, limit, resetsAt: resetsAtIso() });
}));


app.get('/api/auth/verify-email', wrap(async (req, res) => {
  const token = String(req.query?.token || '');
  if (!token) throw httpError(400, 'Verification token is required.');
  const hashed = crypto.createHash('sha256').update(token).digest('hex');
  const user = await User.findOne({ emailVerificationTokenHash: hashed, emailVerificationExpires: { $gt: new Date() } });
  if (!user) throw httpError(400, 'Verification link is invalid or expired.');
  user.emailVerified = true;
  user.emailVerificationTokenHash = undefined;
  user.emailVerificationExpires = undefined;
  await user.save();
  res.json({ message: 'Email verified. You can now sign in.', user: publicUser(user) });
}));

app.post('/api/auth/forgot-password', recoveryLimit, wrap(async (req, res) => {
  if (storageMode() !== 'mongo') throw httpError(503, 'Email password recovery is unavailable for this workspace.');
  const email = normalizeEmail(text(req.body?.email, { field: 'Email', min: 3, max: 254 }));
  const user = await User.findOne({ email });
  if (user) {
    const token = crypto.randomBytes(32).toString('hex');
    user.passwordResetTokenHash = crypto.createHash('sha256').update(token).digest('hex');
    user.passwordResetExpires = new Date(Date.now() + 60 * 60 * 1000);
    await user.save();
    mailer.sendPasswordResetEmail({ email, name: user.name, token }).catch(() => {});
  }
  // Always generic response to prevent account probing.
  res.json({ message: 'If an account exists for that email, password reset instructions have been sent.' });
}));

app.post('/api/auth/reset-password', recoveryLimit, wrap(async (req, res) => {
  if (storageMode() !== 'mongo') throw httpError(503, 'Email password recovery is unavailable for this workspace.');
  const token = String(req.body?.token || '');
  const password = req.body?.password;
  if (!/^[a-f0-9]{64}$/.test(token)) throw httpError(400, 'Reset link is invalid or expired.');
  if (typeof password !== 'string' || !password) throw httpError(400, 'A new password is required.');
  const passwordProblem = validatePassword(password);
  if (passwordProblem) throw httpError(400, passwordProblem);
  const hashed = crypto.createHash('sha256').update(token).digest('hex');
  const passwordHash = await hashPassword(password);
  const user = await User.findOneAndUpdate(
    { passwordResetTokenHash: hashed, passwordResetExpires: { $gt: new Date() } },
    {
      $set: { passwordHash },
      $unset: { passwordResetTokenHash: 1, passwordResetExpires: 1 },
      $inc: { tokenVersion: 1 },
    },
  );
  if (!user) throw httpError(400, 'Reset link is invalid or expired.');
  res.json({ message: 'Password reset successfully. You can now sign in.' });
}));
const OPENAPI_SPEC = {
  openapi: '3.1.0',
  info: { title: 'Exam Studio API', version: '0.2.1', description: 'Turn course notes into study notes, handouts, exams and flashcards.' },
  servers: [{ url: 'https://examstudio.duckdns.org', description: 'Production' }],
  tags: [
    { name: 'auth', description: 'Sign in, sign out, tokens' },
    { name: 'generate', description: 'AI generation: notes, flashcards, exams, handouts' },
    { name: 'library', description: 'Saved notes, exams, flashcards, handouts' },
    { name: 'mcp', description: 'Model Context Protocol (Streamable HTTP)' },
    { name: 'health', description: 'Health checks' },
  ],
  paths: {
    '/api/v1/openapi.json': { get: { summary: 'OpenAPI specification', tags: ['health'] } },
    '/health/ai': { get: { summary: 'AI health check', tags: ['health'] } },
    '/api/v1/public/plans': {
      get: { summary: 'List public plans', tags: ['auth'], responses: { 200: { description: 'Plans list' } } },
    },
    '/api/v1/me/quota': {
      get: { summary: 'User plan and usage', tags: ['auth'], security: [{ bearerAuth: [] }], responses: { 200: { description: 'Plan and usage' } } },
    },
    '/api/v1/generate/notes': {
      post: {
        summary: 'Generate study notes from text',
        tags: ['generate'],
        security: [{ bearerAuth: [] }],
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', properties: { text: { type: 'string' }, title: { type: 'string' }, focus: { type: 'string' } }, required: ['text'] } } } },
        responses: { 200: { description: 'Study notes' }, 429: { description: 'Daily limit reached' } },
      },
    },
    '/api/v1/generate/flashcards': {
      post: {
        summary: 'Generate flashcards from text',
        tags: ['generate'],
        security: [{ bearerAuth: [] }],
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', properties: { text: { type: 'string' }, title: { type: 'string' }, count: { type: 'integer' } }, required: ['text'] } } } },
        responses: { 200: { description: 'Flashcards' }, 429: { description: 'Daily limit reached' } },
      },
    },
    '/api/v1/generate/exam': {
      post: {
        summary: 'Generate an exam from text',
        tags: ['generate'],
        security: [{ bearerAuth: [] }],
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', properties: { text: { type: 'string' }, title: { type: 'string' }, level: { type: 'string' }, types: { type: 'array', items: { type: 'string' } }, totalMarks: { type: 'integer' }, layout: { type: 'string' } }, required: ['text'] } } } },
        responses: { 200: { description: 'Exam' }, 429: { description: 'Daily limit reached' } },
      },
    },
    '/api/v1/generate/handout': {
      post: {
        summary: 'Generate a study handout from text',
        tags: ['generate'],
        security: [{ bearerAuth: [] }],
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', properties: { text: { type: 'string' }, title: { type: 'string' }, level: { type: 'string' } }, required: ['text'] } } } },
        responses: { 200: { description: 'Study handout' }, 429: { description: 'Daily limit reached' } },
      },
    },
    '/api/v1/library': {
      get: { summary: 'List library items', tags: ['library'], security: [{ bearerAuth: [] }], responses: { 200: { description: 'Library items' } } },
      post: { summary: 'Save a library item', tags: ['library'], security: [{ bearerAuth: [] }], responses: { 201: { description: 'Created' } } },
    },
    '/mcp': { post: { summary: 'MCP Streamable HTTP endpoint', tags: ['mcp'], security: [{ bearerAuth: [] }], responses: { 200: { description: 'MCP response or event stream' } } } },
  },
  components: {
    securitySchemes: {
      bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT', description: 'PAT (est_...) or session JWT from /api/auth/login' },
    },
  },
};

// ---------------------------------------------------------------- public API v1 (PAT or session)
app.get('/api/v1/public/plans', wrap(async (_req, res) => {
  const items = await admin.listPlans();
  res.json({ items: items.map(p => ({ name: p.name, description: p.description, requestsPerDay: p.requestsPerDay, requestsPerMonth: p.requestsPerMonth, tokensPerMonth: p.tokensPerMonth, allowedFeatures: p.allowedFeatures, allowOwnKey: p.allowOwnKey })) });
}));
app.get('/api/v1/openapi.json', wrap(async (_req, res) => {
  res.json(OPENAPI_SPEC);
}));
app.use('/api/v1', authenticateAny);
app.use('/api/v1', withUserAI);
app.get('/api/v1/me/quota', wrap(async (req, res) => { res.json({ plan: await admin.getUserPlan(req.user.id), quota: await currentQuotaStatus(req.user.id), ownProvider: Boolean(req.userAI?.apiKey) }); }));
app.get('/api/v1/library', wrap(async (req, res) => { const items = await listItems(req.user.id); res.json({ items }); }));
app.get('/api/v1/notes/structure', wrap(async (req, res) => { const text = String(req.query.text || ''); const structure = detectStructure(text, req.query.title); res.json({ structure }); }));

// Remote MCP (streamable HTTP) - session-aware, shares tools with the stdio server.
// Each HTTP session gets its own StreamableHTTPServerTransport + McpServer instance.
// PATs (est_...) and session JWTs are required - no anonymous access.
// Sessions are bound to the authenticated user; session ids from other users are rejected.
const mcpTransports = new Map(); // sessionId -> { transport, userId }
// One generation at a time per user. This protects the shared provider key and the 300 MB
// service memory limit from overlapping long exams; queued requests still get their own result.
const mcpUserLocks = new Map();
async function withUserGenerationLock(userId, fn) {
  const previous = mcpUserLocks.get(String(userId)) || Promise.resolve();
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const current = previous.then(() => gate);
  mcpUserLocks.set(String(userId), current);
  await previous;
  try { return await fn(); }
  finally {
    release();
    if (mcpUserLocks.get(String(userId)) === current) mcpUserLocks.delete(String(userId));
  }
}
function createTransport(sessionId, userId) {
  const sessionIdFinal = sessionId || crypto.randomUUID();
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => sessionIdFinal,
    onsessionclosed: (id) => { mcpTransports.delete(String(id)); },
  });
  const server = createMcpServer({ remote: true, userId });
  server.connect(transport);
  mcpTransports.set(sessionIdFinal, { transport, userId });
  return transport;
}

// ---------------------------------------------------------------- public MCP (no auth)
// A separate transport map for anonymous sessions on /mcp/public. Sessions are bound to the
// hashed client IP; session ids from other IPs are rejected.
const publicTransports = new Map(); // sessionId -> { transport, ipHash }
function createPublicTransport(sessionId, ipHash) {
  const sessionIdFinal = sessionId || crypto.randomUUID();
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => sessionIdFinal,
    onsessionclosed: (id) => { publicTransports.delete(String(id)); },
  });
  const server = createMcpServer({ remote: true, public: true });
  server.connect(transport);
  publicTransports.set(sessionIdFinal, { transport, ipHash });
  return transport;
}

// Public anonymous quota and abuse protection. Raw IPs are never stored: they are hashed with a
// server secret before being written to MongoDB. Counters expire on their own (TTL) and survive
// restarts.
const PUBLIC_GENERATIONS_PER_DAY_PER_IP = 5;
const PUBLIC_GLOBAL_DAILY_CAP = Number(process.env.PUBLIC_MCP_DAILY_CAP) || 200;
const PUBLIC_BURST_SECONDS = 20;
const PUBLIC_BURST_LIMIT = 1;
const PUBLIC_NON_GEN_PER_MIN = 30;
const PUBLIC_MAX_SESSIONS_PER_IP = 50;
const PUBLIC_MAX_CONCURRENT_GENERATIONS = 3;

let publicConcurrentGenerations = 0;

// Fallback in-memory counters used when MongoDB is not available (file-store / desktop mode).
// Keyed by `ipKey:day` (for example `ip:<sha256>:2026-11-01`).
const publicQuotaFallback = new Map();

function publicFallbackKey(ipHash, day, subKey) { return `${ipHash}:${day}:${subKey}`; }

function publicFallbackGet(ipHash, day, subKey) {
  const entry = publicQuotaFallback.get(publicFallbackKey(ipHash, day, subKey));
  return entry ? { ...entry, value: entry.value || 0 } : null;
}
function publicFallbackSet(ipHash, day, subKey, value, ttlMs) {
  const key = publicFallbackKey(ipHash, day, subKey);
  publicQuotaFallback.set(key, { value, expiresAt: Date.now() + ttlMs });
}
function publicFallbackInc(ipHash, day, subKey, amount, ttlMs) {
  const key = publicFallbackKey(ipHash, day, subKey);
  const entry = publicQuotaFallback.get(key);
  const next = (entry && entry.expiresAt > Date.now() ? entry.value : 0) + amount;
  publicQuotaFallback.set(key, { value: next, expiresAt: Date.now() + ttlMs });
  return next;
}

function publicIpHash(ip) {
  const secret = process.env.PUBLIC_MCP_IP_SECRET || process.env.JWT_SECRET || 'exam-studio-public-default';
  return crypto.createHash('sha256').update(`${secret}:${String(ip || 'unknown')}`).digest('hex');
}

function publicDayKey() { return kigaliDay(); }

// Increments counters for a public IP and returns { ok, reason, resetsAt, retryAfterSeconds }.
// Counters live in MongoDB when it is available, otherwise in an in-memory map (file-store mode).

// Session bookkeeping: open/close a session for an IP.
async function publicSessionOpen(ipHash) {
  await initStorage();
  const day = publicDayKey();
  const now = Date.now();
  if (storageMode() === 'mongo') {
    const ipKey = `ip:${ipHash}`;
    const doc = await PublicQuota.findOne({ key: ipKey, day }).lean() || {};
    const sessionsWindow = doc.sessionsWindow ? new Date(doc.sessionsWindow).getTime() : 0;
    const sessions = (now - sessionsWindow < 60 * 1000 ? doc.sessions || 0 : 0);
    if (sessions >= PUBLIC_MAX_SESSIONS_PER_IP) return false;
    await PublicQuota.updateOne({ key: ipKey, day }, {
      $setOnInsert: { createdAt: new Date() },
      $set: { sessions: sessions + 1, sessionsWindow: new Date() },
    }, { upsert: true }).catch(() => {});
  } else {
    const sessions = publicFallbackGet(ipHash, day, 'sessions');
    const windowStart = sessions ? sessions.expiresAt - 60 * 1000 : 0;
    const count = (sessions && now - windowStart < 60 * 1000 ? sessions.value : 0);
    if (count >= PUBLIC_MAX_SESSIONS_PER_IP) return false;
    publicFallbackInc(ipHash, day, 'sessions', 1, 60 * 1000);
    publicFallbackSet(ipHash, day, 'sessionsWindow', now, 60 * 1000);
  }
  return true;
}
async function publicSessionClose(ipHash) {
  await initStorage();
  const day = publicDayKey();
  if (storageMode() === 'mongo') {
    const ipKey = `ip:${ipHash}`;
    await PublicQuota.updateOne({ key: ipKey, day }, { $inc: { sessions: -1 } }).catch(() => {});
  } else {
    const entry = publicFallbackGet(ipHash, day, 'sessions');
    if (entry && entry.value > 0) {
      publicQuotaFallback.set(publicFallbackKey(ipHash, day, 'sessions'), { value: entry.value - 1, expiresAt: entry.expiresAt });
    }
  }
}

// POST /mcp (Bearer token in Authorization header) and POST /mcp/<token> (token in path).
app.post('/mcp', wrap(mcpHandler));
app.post('/mcp/public', wrap(async (req, res) => {  // Kill switch.
  if (process.env.PUBLIC_MCP_ENABLED === 'false') {
    return res.status(503).type('application/json; charset=utf-8').json({ error: 'unavailable', message: 'The public demo is temporarily disabled.' });
  }

  // Real client IP behind Caddy: trust proxy, take the first address in X-Forwarded-For.
  let ip = req.ip || req.socket?.remoteAddress || 'unknown';
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded && Array.isArray(forwarded) === false) {
    const first = String(forwarded).split(',')[0]?.trim();
    if (first) ip = first;
  } else if (Array.isArray(forwarded) && forwarded[0]) {
    ip = String(forwarded[0]).split(',')[0]?.trim() || ip;
  }
  const ipHash = publicIpHash(ip);
  res.set('Cache-Control', 'no-store');

  const sessionId = req.headers['mcp-session-id'] || req.query.session_id;
  if (sessionId && !publicTransports.has(String(sessionId))) {
    return res.status(404).json({ jsonrpc: '2.0', error: { code: -32001, message: 'Session not found' }, id: null });
  }
  if (sessionId && publicTransports.has(String(sessionId))) {
    const existing = publicTransports.get(String(sessionId));
    if (existing.ipHash !== ipHash) {
      return res.status(401).json({ error: 'invalid_session', message: 'Session belongs to another client.' });
    }
  }

  // Open / track a session for this IP (cap of 50 open sessions per IP).
  if (!(await publicSessionOpen(ipHash))) {
    return res.status(429).json({ error: 'too_many_sessions', message: 'Too many open sessions from this address.' });
  }

  // Decide whether this request is a generation (so we can apply and record the generation quota).
  const body = req.body || {};
  const isGeneration = body.method === 'tools/call' && ['exam_studio_generate_notes', 'exam_studio_generate_exam', 'exam_studio_generate_handout', 'exam_studio_generate_flashcards'].includes(String(body.params?.name || ''));

  // Reject oversize input before it consumes a rate-limit slot, with a clear JSON error.
  if (isGeneration) {
    const text = String(body.params?.arguments?.text || '');
    if (text.length > PUBLIC_INPUT_MAX_CHARS) {
      res.set('Cache-Control', 'no-store');
      return res.status(400).json({ error: 'input_too_large', message: `Input is too long. The limit is ${PUBLIC_INPUT_MAX_CHARS.toLocaleString()} characters.` });
    }
  }

  // Enforce the quota before doing any work.
  const allowance = await publicCheckAndRecord(ipHash, isGeneration);
  if (!allowance.ok) {
    const status = allowance.reason === 'daily_limit_reached' ? 429 : 429;
    res.set('Cache-Control', 'no-store');
    return res.status(status).json({ error: allowance.reason, message: allowance.reason === 'daily_limit_reached' ? 'Daily public generation limit reached. Try again tomorrow.' : 'Rate limited. Please slow down.', retryAfterSeconds: allowance.retryAfterSeconds, resetsAt: allowance.resetsAt });
  }

  try {
    let transportEntry = sessionId && publicTransports.get(String(sessionId));
    let transport = transportEntry ? transportEntry.transport : null;
    if (!transport) transport = createPublicTransport(sessionId, ipHash);
    await transport.handleRequest(req, res, req.body);
  } finally {
    // Record a generation after the call (success or failure) so the daily/burst counters advance.
    if (isGeneration) await publicRecordGeneration(ipHash);
    // best-effort session decrement; the transport's onsessionclosed is the real signal
    // Best-effort bookkeeping must not keep the process alive (tests, or a server shutting down).
    setTimeout(() => publicSessionClose(ipHash), 1000).unref();
  }
}));

app.post('/mcp/:token', wrap(mcpHandler));

// Public, no-auth MCP endpoint. Same Streamable HTTP transport and session handling as /mcp,
// but with no bearer token required and a generate-only tool set. See /.well-known/mcp-public.json.

// OPTIONS handled by the CORS middleware above; ensure a 204 response.
app.options('/mcp', (_req, res) => { res.set('Access-Control-Allow-Origin', '*'); res.set('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS'); res.set('Access-Control-Allow-Headers', 'Content-Type, Accept, Authorization, Mcp-Session-Id, Mcp-Protocol-Version, Last-Event-ID'); res.set('Access-Control-Expose-Headers', 'Mcp-Session-Id'); res.set('Access-Control-Max-Age', '86400'); res.set('Cross-Origin-Resource-Policy', 'cross-origin'); res.set('Cache-Control', 'no-store'); res.status(204).end(); });
app.options('/mcp/:token', (_req, res) => { res.set('Access-Control-Allow-Origin', '*'); res.set('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS'); res.set('Access-Control-Allow-Headers', 'Content-Type, Accept, Authorization, Mcp-Session-Id, Mcp-Protocol-Version, Last-Event-ID'); res.set('Access-Control-Expose-Headers', 'Mcp-Session-Id'); res.set('Access-Control-Max-Age', '86400'); res.set('Cross-Origin-Resource-Policy', 'cross-origin'); res.set('Cache-Control', 'no-store'); res.status(204).end(); });

app.options('/mcp/public', (_req, res) => { res.set('Access-Control-Allow-Origin', '*'); res.set('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS'); res.set('Access-Control-Allow-Headers', 'Content-Type, Accept, Authorization, Mcp-Session-Id, Mcp-Protocol-Version, Last-Event-ID'); res.set('Access-Control-Expose-Headers', 'Mcp-Session-Id'); res.set('Access-Control-Max-Age', '86400'); res.set('Cross-Origin-Resource-Policy', 'cross-origin'); res.set('Cache-Control', 'no-store'); res.status(204).end(); });
app.options('/mcp/public/:token', (_req, res) => { res.set('Access-Control-Allow-Origin', '*'); res.set('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS'); res.set('Access-Control-Allow-Headers', 'Content-Type, Accept, Authorization, Mcp-Session-Id, Mcp-Protocol-Version, Last-Event-ID'); res.set('Access-Control-Expose-Headers', 'Mcp-Session-Id'); res.set('Access-Control-Max-Age', '86400'); res.set('Cross-Origin-Resource-Policy', 'cross-origin'); res.set('Cache-Control', 'no-store'); res.status(204).end(); });

app.get('/mcp', (_req, res) => {
  res.status(405).set('Allow', 'POST, DELETE, OPTIONS').json({
    jsonrpc: '2.0',
    error: { code: -32600, message: 'Method Not Allowed. Use POST with a JSON-RPC body.' },
    id: null,
  });
});

app.get('/mcp/:token', (_req, res) => {
  res.status(405).set('Allow', 'POST, DELETE, OPTIONS').json({
    jsonrpc: '2.0',
    error: { code: -32600, message: 'Method Not Allowed. Use POST with a JSON-RPC body.' },
    id: null,
  });
});

app.get('/mcp/public', (_req, res) => {
  res.status(405).set('Allow', 'POST, DELETE, OPTIONS').json({
    jsonrpc: '2.0',
    error: { code: -32600, message: 'Method Not Allowed. Use POST with a JSON-RPC body.' },
    id: null,
  });
});

app.delete('/mcp/:token', (req, res, next) => {
  if (req.params.token === 'public') return next();
  const sessionId = req.headers['mcp-session-id'];
  if (!sessionId) return res.status(400).json({ error: 'mcp-session-id header required.' });
  if (!mcpTransports.has(String(sessionId))) {
    return res.status(404).json({ jsonrpc: '2.0', error: { code: -32001, message: 'Session not found' }, id: null });
  }
  mcpTransports.delete(String(sessionId));
  return res.status(204).end();
});

app.delete('/mcp', (req, res) => {
  const sessionId = req.headers['mcp-session-id'];
  if (!sessionId) return res.status(400).json({ error: 'mcp-session-id header required.' });
  if (!mcpTransports.has(String(sessionId))) {
    return res.status(404).json({ jsonrpc: '2.0', error: { code: -32001, message: 'Session not found' }, id: null });
  }
  mcpTransports.delete(String(sessionId));
  return res.status(204).end();
});

app.delete('/mcp/public', (req, res) => {
  const sessionId = req.headers['mcp-session-id'];
  if (!sessionId) return res.status(400).json({ error: 'mcp-session-id header required.' });
  if (!publicTransports.has(String(sessionId))) {
    return res.status(404).json({ jsonrpc: '2.0', error: { code: -32001, message: 'Session not found' }, id: null });
  }
  publicTransports.delete(String(sessionId));
  return res.status(204).end();
});

app.get('/icon-256.png', (_req, res) => {
  const iconPath = path.resolve(__dirname, 'assets/icon-256.png');
  if (!fs.existsSync(iconPath)) return res.status(404).json({ error: 'Not found.' });
  res.type('image/png').set('Cache-Control', 'public, max-age=86400').set('Cross-Origin-Resource-Policy', 'cross-origin').sendFile(iconPath);
});

app.get('/favicon.ico', (_req, res) => {
  const icoPath = path.resolve(__dirname, 'assets/favicon.ico');
  if (!fs.existsSync(icoPath)) return res.status(404).json({ error: 'Not found.' });
  res.type('image/x-icon').set('Cache-Control', 'public, max-age=86400').set('Cross-Origin-Resource-Policy', 'cross-origin').sendFile(icoPath);
});

// Shared MCP request handler for /mcp and /mcp/<token>. Authenticates via an est_ API key
// sent either as a Bearer header or embedded in the path (/mcp/<token>). Claude and ChatGPT
// connectors with "No authentication" cannot send headers, so the path form is required.
async function mcpHandler(req, res) {
  const token = mcpTokenFromReq(req);
  if (!token || !token.startsWith('est_')) {
    return res.status(401).json({
      error: 'invalid_api_key',
      message: 'Create an API key in Exam Studio > Settings > API Tokens and put it in the connector URL: https://examstudio.duckdns.org/mcp/<your-key>',
    });
  }
  const info = await verifyPatToken(token);
  if (!info) {
    return res.status(401).json({
      error: 'invalid_api_key',
      message: 'Create an API key in Exam Studio > Settings > API Tokens and put it in the connector URL: https://examstudio.duckdns.org/mcp/<your-key>',
    });
  }
  const userId = info.userId;

  const sessionId = req.headers['mcp-session-id'] || req.query.session_id;
  if (sessionId && !mcpTransports.has(String(sessionId))) {
    return res.status(404).json({ jsonrpc: '2.0', error: { code: -32001, message: 'Session not found' }, id: null });
  }
  // Reject session ids bound to a different user (session hijacking attempt)
  if (sessionId && mcpTransports.has(String(sessionId))) {
    const existing = mcpTransports.get(String(sessionId));
    if (existing.userId !== userId) {
      return res.status(401).json({ error: 'invalid_token', message: 'Session belongs to another user.' });
    }
  }

  // Per-user quota: check and reserve a generation slot before processing.
  const isGeneration = isPublicGenCall(req);
  if (isGeneration) await checkAndRecordGeneration(userId);

  let transportEntry = sessionId && mcpTransports.get(String(sessionId));
  let transport = transportEntry ? transportEntry.transport : null;
  if (!transport) transport = createTransport(sessionId, userId);
  const userAI = await getUserAISettings(userId).catch(() => null);
  try {
    const run = () => runWithUserAI(userAI, async () => transport.handleRequest(req, res, req.body));
    await (isGeneration ? withUserGenerationLock(userId, run) : run());
  } catch (e) {
    if (isGeneration) await publicRefundGeneration(userId);
    throw e;
  }
}

app.post('/api/v1/generate/handout', wrap(async (req, res) => {
  const text = notesFrom(req.body);
  if (!req.userAI?.apiKey) await admin.enforceLimits(req.user.id, 'handout', text);
  await checkAndRecordGeneration(req.user.id);
  const started = Date.now();
  try {
    const handout = await generateHandout({ text, title: s(req.body?.title, 120), level: s(req.body?.level, 20), includeRevision: req.body?.includeRevision !== false, includePractical: req.body?.includePractical !== false });
      try { admin.recordAISuccess(Date.now() - started); } catch {}
      try { await admin.recordUsage({ userId: req.user.id, taskType: 'handout', estimatedTokens: Math.ceil(text.length / 4), success: true }); } catch {}
      res.json(handout);
  } catch (e) { await publicRefundGeneration(req.user.id); try { admin.recordAIFailure(e); } catch {} throw e; }
}));

app.post('/api/v1/generate/notes', wrap(async (req, res) => {
  const text = notesFrom(req.body);
  if (!req.userAI?.apiKey) await admin.enforceLimits(req.user.id, 'notes', text);
  await checkAndRecordGeneration(req.user.id);
  const started = Date.now();
  try {
    const notes = await generateNotes({ text, title: s(req.body?.title, 120), focus: s(req.body?.focus, 300) });
    try { admin.recordAISuccess(Date.now() - started); } catch {}
    try { await admin.recordUsage({ userId: req.user.id, taskType: 'notes', estimatedTokens: Math.ceil(text.length / 4), success: true }); } catch {}
    res.json(notes);
  } catch (e) { await publicRefundGeneration(req.user.id); try { admin.recordAIFailure(e); } catch {} throw e; }
}));

app.post('/api/v1/generate/flashcards', wrap(async (req, res) => {
  const text = notesFrom(req.body);
  if (!req.userAI?.apiKey) await admin.enforceLimits(req.user.id, 'flashcards', text);
  await checkAndRecordGeneration(req.user.id);
  const started = Date.now();
  try {
    const cards = await generateCards({ text, title: s(req.body?.title, 120), count: int(req.body?.count, 30, 5, 80) });
    try { admin.recordAISuccess(Date.now() - started); } catch {}
    try { await admin.recordUsage({ userId: req.user.id, taskType: 'flashcards', estimatedTokens: Math.ceil(text.length / 4), success: true }); } catch {}
    res.json(cards);
  } catch (e) { await publicRefundGeneration(req.user.id); try { admin.recordAIFailure(e); } catch {} throw e; }
}));

app.post('/api/v1/generate/exam', wrap(async (req, res) => {
  const text = notesFrom(req.body);
  if (!req.userAI?.apiKey) await admin.enforceLimits(req.user.id, 'exam', text);
  await checkAndRecordGeneration(req.user.id);
  const started = Date.now();
  try {
    const exam = await generateExam({
      text, title: s(req.body?.title, 120), level: s(req.body?.level, 20),
      types: Array.isArray(req.body?.types) ? req.body.types : ['mcq'],
      totalMarksTarget: int(req.body?.totalMarks, 100, 10, 200),
    });
    try { admin.recordAISuccess(Date.now() - started); } catch {}
    try { await admin.recordUsage({ userId: req.user.id, taskType: 'exam', estimatedTokens: Math.ceil(text.length / 4), success: true }); } catch {}
    res.json(exam);
  } catch (e) { await publicRefundGeneration(req.user.id); try { admin.recordAIFailure(e); } catch {} throw e; }
}));

// ---------------------------------------------------------------- protected routes
app.use('/api', institutionRoutes);
app.use('/api', (req, res, next) => (req.path.startsWith('/take') ? next() : authenticateUser(req, res, next)));
app.use('/api', (req, res, next) => (req.path.startsWith('/take') ? next() : generationRateLimit(req, res, next)));

// Personal access tokens
app.get('/api/tokens', wrap(async (req, res) => {
  res.json({ items: await admin.listTokens(req.user.id) });
}));
app.post('/api/tokens', wrap(async (req, res) => {
  const created = await admin.createToken(req.user.id, {
    name: s(req.body?.name || 'token', 60),
    scopes: Array.isArray(req.body?.scopes) ? req.body.scopes : ['read'],
    expiresInDays: req.body?.expiresInDays,
  });
  await admin.recordAudit({ actorId: req.user.id, actorEmail: req.user.email, action: 'token.create', targetType: 'token', targetId: created.id });
  res.status(201).json(created);
}));
app.delete('/api/tokens/:id', wrap(async (req, res) => {
  const ok = await admin.revokeToken(req.user.id, req.params.id);
  if (!ok) throw httpError(404, 'Token not found.');
  await admin.recordAudit({ actorId: req.user.id, actorEmail: req.user.email, action: 'token.revoke', targetType: 'token', targetId: req.params.id });
  res.json({ ok: true });
}));

app.post('/api/auth/logout', wrap(async (_req, res) => {
  // Tokens are stateless; the client drops its copy. Answer so the UI can confirm.
  res.status(204).end();
}));

const generateLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: Number(process.env.GENERATE_LIMIT_PER_HOUR) || 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many generations this hour. Try again later.' },
});

// ---------------------------------------------------------------- upload
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024, files: 1 } });
app.post('/api/extract', upload.single('file'), wrap(async (req, res) => {
  if (!req.file) throw httpError(400, 'Choose a file to upload.');
  const extracted = await extractText(req.file);
  res.json({
    text: extracted.slice(0, MAX_NOTES_CHARS),
    chars: extracted.length,
    truncated: extracted.length > MAX_NOTES_CHARS,
    name: req.file.originalname,
  });
}));

app.get('/api/notes-lib/list', wrap(async (_req, res) => {
  res.json({ root: 'notes', files: await scanNotes() });
}));

app.post('/api/notes-lib/load', wrap(async (req, res) => {
  const file = await loadNote(String(req.body?.name || ''), Array.isArray(req.body?.units) ? req.body.units : []);
  res.json({
    name: file.name,
    moduleCode: file.moduleCode,
    moduleTitle: file.moduleTitle,
    numPages: file.numPages,
    charCount: (file.text || '').length,
    units: file.units,
    text: (file.text || '').slice(0, MAX_NOTES_CHARS),
  });
}));

// ---------------------------------------------------------------- detect structure
// Detect modules, learning outcomes, units and sections in notes text.
app.post('/api/notes/detect-structure', wrap(async (req, res) => {
  const text = String(req.body?.text ?? '');
  const title = s(req.body?.title, 120);
  if (text.length < 50) throw httpError(400, 'No notes text provided.');
  const structure = detectStructure(text, title);
  if (!structure) {
    return res.json({ structure: null, message: 'No structure detected. The whole notes will be processed.' });
  }
  res.json({ structure, message: 'Structure detected successfully.' });
}));
// ---------------------------------------------------------------- suggest outcomes
// The module creator runs the shared heuristic in the browser first and only calls this when the
// notes have no marked outcomes, so the model sees at most 8k characters.
app.post('/api/modules/suggest-outcomes', generateLimit, optionalAuthenticateUser, wrap(async (req, res) => {
  const text = String(req.body?.text ?? '').slice(0, 8000);
  if (text.trim().length < 50) throw httpError(400, 'Pick or paste at least a few lines of notes first.');
  let outcomes;
  try {
    outcomes = await suggestOutcomeTitles({ text, title: s(req.body?.title, 120) });
  } catch (error) {
    throw httpError(502, `Could not suggest outcomes: ${error.message}`);
  }
  if (!outcomes.length) throw httpError(502, 'The model returned no outcomes. Type them in below.');
  res.json({ outcomes });
}));
// ---------------------------------------------------------------- generate
app.post('/api/notes/generate', generateLimit, optionalAuthenticateUser, withUserAI, wrap(async (req, res) => {
  const text = notesFrom(req.body);
  if (req.user && !req.userAI?.apiKey) { await admin.enforceLimits(req.user.id, 'notes', text); }
  const started = Date.now();
  try {
    const notes = await generateNotesDocument({ text, title: s(req.body?.title, 120), level: s(req.body?.level, 20), focus: s(req.body?.focus, 300) });
    if (req.user) { try { admin.recordAISuccess(Date.now() - started); } catch {} try { await admin.recordUsage({ userId: req.user.id, taskType: 'notes', estimatedTokens: Math.ceil(text.length / 4), success: true }); } catch {} }
    res.json(notes);
  } catch (e) { try { if (req.user) admin.recordAIFailure(e); } catch {} throw e; }
}));

app.post('/api/flashcards/generate', generateLimit, optionalAuthenticateUser, withUserAI, wrap(async (req, res) => {
  const text = notesFrom(req.body);
  if (req.user && !req.userAI?.apiKey) { await admin.enforceLimits(req.user.id, 'flashcards', text); }
  const started = Date.now();
  try {
    const cards = await generateCards({ text, title: s(req.body?.title, 120), count: int(req.body?.count, 30, 5, 80) });
    if (req.user) { try { admin.recordAISuccess(Date.now() - started); } catch {} try { await admin.recordUsage({ userId: req.user.id, taskType: 'flashcards', estimatedTokens: Math.ceil(text.length / 4), success: true }); } catch {} }
    res.json(cards);
  } catch (e) { try { if (req.user) admin.recordAIFailure(e); } catch {} throw e; }
}));

app.post('/api/exams/generate', generateLimit, optionalAuthenticateUser, withUserAI, wrap(async (req, res) => {
  const text = notesFrom(req.body);
  if (req.user && !req.userAI?.apiKey) { await admin.enforceLimits(req.user.id, 'exam', text); }
  const layout = req.body?.layout === 'classic' ? 'classic' : 'sections-a-e';
  const totalMarksTarget = int(req.body?.totalMarks, 100, 10, 200);
  const avoid = (Array.isArray(req.body?.avoid) ? req.body.avoid : []).slice(0, 60).map((a) => s(a, 200)).filter(Boolean);
  const common = {
    text, layout, totalMarksTarget, avoid,
    title: s(req.body?.title, 120), level: s(req.body?.level, 20),
  };

  if (layout === 'sections-a-e') {
    const started = Date.now();
    try {
      const exam = await generateExam({
        ...common,
        moduleCode: s(req.body?.moduleCode, 24),
        trade: s(req.body?.trade, 120),
        school: s(req.body?.school, 120),
        duration: s(req.body?.duration, 40),
        sectionPlan: Array.isArray(req.body?.sectionPlan) ? req.body.sectionPlan : undefined,
      });
      if (DEMO) { exam.warnings = validateExam(exam, totalMarksTarget); exam.totalMarks = totalMarks(exam); }
      if (req.user) { try { admin.recordAISuccess(Date.now() - started); } catch {} try { await admin.recordUsage({ userId: req.user.id, taskType: 'exam', estimatedTokens: Math.ceil(text.length / 4), success: true }); } catch {} }
      return res.json(exam);
    } catch (e) { try { if (req.user) admin.recordAIFailure(e); } catch {} throw e; }
  }

  // The old flat paper still takes a list of question types.
  const types = (Array.isArray(req.body?.types) ? req.body.types : []).filter((t) => t in QUESTION_TYPES);
  if (!types.length) throw httpError(400, 'Choose at least one question type.');
  const essayCount = types.includes('essay') ? int(req.body?.essayCount, 2, 1, 4) : 0;
  const started2 = Date.now();
  try {
    const exam = await generateExam({ ...common, types, essayCount });
    if (DEMO) { exam.warnings = validateExam(exam, null); exam.totalMarks = totalMarks(exam); }
    if (req.user) { try { admin.recordAISuccess(Date.now() - started2); } catch {} try { await admin.recordUsage({ userId: req.user.id, taskType: 'exam', estimatedTokens: Math.ceil(text.length / 4), success: true }); } catch {} }
    res.json(exam);
  } catch (e) { try { if (req.user) admin.recordAIFailure(e); } catch {} throw e; }
}));

// ---------------------------------------------------------------- export
app.post('/api/export/exam-docx', optionalAuthenticateUser, wrap(async (req, res) => {
  if (req.user) await admin.checkFeature(req.user.id, 'export-word');
  const exam = examFrom(req.body);
  send(res, await examDocx(exam, metaFrom(req.body)), `${examFileName(exam, 'Exam')}.docx`, DOCX);
}));
app.post('/api/export/key-docx', optionalAuthenticateUser, wrap(async (req, res) => {
  if (req.user) await admin.checkFeature(req.user.id, 'export-word');
  const exam = examFrom(req.body);
  send(res, await keyDocx(exam, metaFrom(req.body)), `${examFileName(exam, 'Exam_Marking_Scheme')}.docx`, DOCX);
}));
// The PDFs are the same paper as the Word files: the sectioned layout is a real two-column flow.
app.post('/api/export/exam-pdf', optionalAuthenticateUser, wrap(async (req, res) => {
  if (req.user) await admin.checkFeature(req.user.id, 'export-pdf');
  const exam = examFrom(req.body);
  send(res, await examPdf(exam, metaFrom(req.body)), `${examFileName(exam, 'Exam')}.pdf`, PDF);
}));
app.post('/api/export/key-pdf', optionalAuthenticateUser, wrap(async (req, res) => {
  if (req.user) await admin.checkFeature(req.user.id, 'export-pdf');
  const exam = examFrom(req.body);
  send(res, await keyPdf(exam, metaFrom(req.body)), `${examFileName(exam, 'Exam_Marking_Scheme')}.pdf`, PDF);
}));
app.post('/api/export/exam-csv', wrap(async (req, res) => {
  send(res, examCsv(examFrom(req.body)), 'Exam_Questions.csv', 'text/csv; charset=utf-8');
}));
app.post('/api/export/key-csv', wrap(async (req, res) => {
  send(res, keyCsv(examFrom(req.body)), 'Exam_Answer_Key.csv', 'text/csv; charset=utf-8');
}));
app.post('/api/export/google-sheets', wrap(async (req, res) => {
  const exam = examFrom(req.body);
  const src = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!src) throw httpError(400, 'Google Sheets is not configured. Set GOOGLE_SERVICE_ACCOUNT_JSON in server/.env to a service-account key file path or its JSON, and (optionally) GOOGLE_SHEETS_TITLE.');
  let credentials;
  try {
    if (fs.existsSync(src)) credentials = JSON.parse(fs.readFileSync(src, 'utf8'));
    else credentials = JSON.parse(src);
  } catch {
    throw httpError(400, 'The Google service account JSON could not be read. Check GOOGLE_SERVICE_ACCOUNT_JSON.');
  }
  let google;
  try { google = (await import('googleapis')).google; }
  catch { throw httpError(500, 'The googleapis package is not installed.'); }

  const auth = new google.auth.GoogleAuth({ credentials, scopes: ['https://www.googleapis.com/auth/spreadsheets', 'https://www.googleapis.com/auth/drive'] });
  const client = await auth.getClient();
  const sheets = google.sheets({ version: 'v4', auth: client });
  const drive = google.drive({ version: 'v3', auth: client });

  const rows = [['Section', 'Q', 'Type', 'Marks', 'Question / instructions', 'Answer / points']];
  if (isSectionsExam(exam)) {
    for (const entry of numberedItems(exam)) {
      const item = entry.item;
      const type = String(entry.kind || '').replace(/_/g, ' ');
      const marks = itemMarks(item, entry.section);
      const question = String(item.text || item.title || '');
      const answer = item.answer
        ? String(item.answer)
        : (item.modelAnswer || (Array.isArray(item.markingPoints) ? item.markingPoints.map((p) => p.point).join('; ') : ''));
      rows.push([`Section ${entry.section?.id || ''}`, entry.number, type, marks, question, answer]);
    }
  } else {
    (exam.questions || []).forEach((q, i) => {
      rows.push(['-', i + 1, QUESTION_TYPES[q.type] || q.type, q.marks, String(q.prompt || ''), String(answerText(q) || '')]);
    });
  }

  const title = process.env.GOOGLE_SHEETS_TITLE || exam.title || 'Exam';
  const created = await sheets.spreadsheets.create({ requestBody: { properties: { title } } });
  const spreadsheetId = created.data.spreadsheetId;
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: 'Sheet1!A1',
    valueInputOption: 'RAW',
    requestBody: { values: rows },
  });
  // Make the result readable by anyone with the link.
  await drive.permissions.create({ fileId: spreadsheetId, requestBody: { type: 'anyone', role: 'reader' } }).catch(() => {});

  res.json({ spreadsheetId, url: `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit` });
}));
app.post('/api/export/notes-docx', optionalAuthenticateUser, wrap(async (req, res) => {
  if (req.user) await admin.checkFeature(req.user.id, 'export-word');
  const notes = req.body?.notes;
  if (!notes || !Array.isArray(notes.sections) || !notes.sections.length) throw httpError(400, 'No notes to export.');
  send(res, await notesDocx(notes), `${safeName(notes.title, 'Study_Notes')}.docx`, DOCX);
}));

// ---------------------------------------------------------------- study handouts
// A handout makes 20 to 120 sequential AI calls and can run for many minutes, so the client is
// told how far it has got. The steps live in memory under an id the client chose: this is
// throwaway state for one request, dropped as soon as the build finishes.
const handoutJobs = new Map();
const JOB_TTL_MS = 60 * 60 * 1000;
function rememberHandoutStep(jobId, userId, step) {
  if (!jobId) return;
  const job = handoutJobs.get(jobId) || { userId, steps: [], startedAt: Date.now(), done: false, cancelled: false };
  job.steps.push(step);
  handoutJobs.set(jobId, job);
  for (const [id, other] of handoutJobs) {
    if (Date.now() - other.startedAt > JOB_TTL_MS) handoutJobs.delete(id);
  }
}

app.post('/api/handouts/generate', generateLimit, optionalAuthenticateUser, withUserAI, wrap(async (req, res) => {
  const jobId = s(req.body?.jobId, 60);
  const units = (Array.isArray(req.body?.units) ? req.body.units : []).map((unit) => s(unit, 10)).filter(Boolean);
  const handoutText = notesFrom(req.body);
  if (req.user && !req.userAI?.apiKey) { await admin.enforceLimits(req.user.id, 'handout', handoutText); }
  const job = jobId ? { userId: req.userId, steps: [], startedAt: Date.now(), done: false } : null;
  if (job) handoutJobs.set(jobId, job);
  try {
    const started = Date.now();
    const handout = await generateHandout({
      text: handoutText,
      title: s(req.body?.title, 120),
      level: s(req.body?.level, 20),
      units,
      includeRevision: req.body?.includeRevision !== false,
      includePractical: req.body?.includePractical !== false,
      onProgress: (step) => rememberHandoutStep(jobId, req.userId, step),
      shouldCancel: () => Boolean(handoutJobs.get(jobId)?.cancelled),
    });
    if (req.user) { try { admin.recordAISuccess(Date.now() - started); } catch {} try { await admin.recordUsage({ userId: req.user.id, taskType: 'handout', estimatedTokens: Math.ceil(handoutText.length / 4), success: true }); } catch {} }
    res.json(handout);
  } catch (e) { try { if (req.user) admin.recordAIFailure(e); } catch {} throw e; }
  finally {
    const finished = jobId && handoutJobs.get(jobId);
    if (finished) finished.done = true;
  }
}));

app.post('/api/handouts/cancel/:id', wrap(async (req, res) => {
  const job = handoutJobs.get(req.params.id);
  if (!job || job.userId !== req.userId) throw httpError(404, 'Unknown handout job.');
  job.cancelled = true;
  res.json({ ok: true });
}));

app.get('/api/handouts/progress/:id', wrap(async (req, res) => {
  const job = handoutJobs.get(req.params.id);
  // Never report another account's build, and never fail the poll: an unknown id is simply empty.
  if (!job || job.userId !== req.userId) return res.json({ steps: [], done: true });
  res.json({ steps: job.steps, done: job.done });
}));

app.post('/api/export/handout-docx', optionalAuthenticateUser, wrap(async (req, res) => {
  if (req.user) await admin.checkFeature(req.user.id, 'export-word');
  const handout = req.body?.handout;
  if (!handout || !Array.isArray(handout.units) || !handout.units.length) throw httpError(400, 'No handout to export.');
  send(res, await handoutDocx(handout), `${safeName(handout.title, 'Study_Handout')}.docx`, DOCX);
}));

app.post('/api/export/handout-pdf', optionalAuthenticateUser, wrap(async (req, res) => {
  if (req.user) await admin.checkFeature(req.user.id, 'export-pdf');
  const handout = req.body?.handout;
  if (!handout || !Array.isArray(handout.units) || !handout.units.length) throw httpError(400, 'No handout to export.');
  send(res, await handoutPdf(handout), `${safeName(handout.title, 'Study_Handout')}.pdf`, 'application/pdf');
}));

// ---------------------------------------------------------------- library (per user)
app.get('/api/library', wrap(async (req, res) => {
  res.json(await listItems(req.userId));
}));
app.get('/api/library/:id', wrap(async (req, res) => {
  const item = await getItem(req.params.id, req.userId);
  if (!item) throw httpError(404, 'That saved item was not found.');
  res.json(item);
}));
app.post('/api/library', wrap(async (req, res) => {
  const kind = s(req.body?.kind, 20);
  if (!['notes', 'exam', 'flashcards', 'handout'].includes(kind)) throw httpError(400, 'Unknown kind.');
  if (!req.body?.data || typeof req.body.data !== 'object' || Array.isArray(req.body.data)) throw httpError(400, 'Nothing to save.');
  const item = await saveItem({
    kind,
    title: s(req.body.title || req.body.data.title, 120) || 'Untitled',
    data: req.body.data,
    userId: req.userId,
  });
  res.status(201).json(item);
}));
app.delete('/api/library/:id', wrap(async (req, res) => {
  if (!(await deleteItem(req.params.id, req.userId))) throw httpError(404, 'That saved item was not found.');
  res.status(204).end();
}));

async function markAttemptAI(attemptId) {
  const attempt = await ExamAttempt.findById(attemptId);
  if (!attempt || attempt.status !== 'submitted') return;
  const item = await getItem(attempt.examId, attempt.ownerId);
  if (!item) { attempt.status = 'marking_failed'; await attempt.save(); return; }
  const questions = questionList(item.data);
  const needs = (attempt.score?.perQuestion || []).filter((p) => p.needsReview);
  if (!needs.length) { attempt.status = 'marked'; await attempt.save(); return; }
  try {
    await admin.enforceLimits(attempt.ownerId, 'exam', '');
  } catch {
    attempt.status = 'marking_failed';
    attempt.feedback = [...(attempt.feedback || []), { needsReview: true, message: 'AI marking limit reached. Objective questions are marked; the owner can review and mark written answers.' }];
    await attempt.save();
    return;
  }
  const answers = attempt.answers || {};
  const byId = new Map(questions.map((q) => [String(q.id), q]));
  const results = new Map(attempt.score.perQuestion.map((p) => [String(p.questionId), p]));
  let next = 0;
  const work = async () => {
    while (true) {
      const index = next++;
      if (index >= needs.length) return;
      const entry = needs[index];
      const q = byId.get(String(entry.questionId));
      if (!q) continue;
      try {
        const marked = await aiMarkAnswer(q, answers[entry.questionId]);
        const current = results.get(String(entry.questionId));
        results.set(String(entry.questionId), { ...current, ...marked, needsReview: false });
        attempt.feedback = [...(attempt.feedback || []).filter((f) => f.questionId !== entry.questionId), { questionId: entry.questionId, ...marked }];
        attempt.score = { ...attempt.score, perQuestion: [...results.values()], total: [...results.values()].reduce((s, p) => s + p.awarded, 0) };
        attempt.markingProgress = { done: Array.from(results.values()).filter((p) => !p.needsReview).length, total: attempt.score.perQuestion.length };
        await attempt.save();
      } catch {
        attempt.feedback = [...(attempt.feedback || []), { questionId: entry.questionId, needsReview: true, message: 'This answer needs the owner to review and mark it.' }];
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(3, needs.length) }, work));
  attempt.score = { ...attempt.score, perQuestion: [...results.values()], total: [...results.values()].reduce((s, p) => s + p.awarded, 0) };
  const still = attempt.score.perQuestion.some((p) => p.needsReview);
  attempt.status = still ? 'marking_failed' : 'marked';
  await attempt.save();
  try { await admin.recordUsage({ userId: attempt.ownerId, taskType: 'exam', estimatedTokens: 200, success: true }); } catch {}
}

async function finalizeAttempt(attempt) {
  if (!attempt || attempt.status !== 'in_progress') return attempt;
  const item = await getItem(attempt.examId, attempt.ownerId);
  const questions = item ? questionList(item.data) : [];
  const score = markObjective(questions, attempt.answers || {});
  attempt.status = 'submitted';
  attempt.submittedAt = new Date();
  attempt.score = score;
  attempt.feedback = score.perQuestion.filter((p) => p.needsReview).map((p) => ({ questionId: p.questionId, needsReview: true }));
  attempt.markingProgress = { done: score.perQuestion.filter((p) => !p.needsReview).length, total: score.perQuestion.length };
  await attempt.save();
  setImmediate(() => markAttemptAI(attempt._id).catch(() => {}));
  return attempt;
}

// Deadline auto-submit: a closed tab must not leave an exam open forever.
setInterval(async () => {
  try {
    const due = await ExamAttempt.find({ status: 'in_progress', deadlineAt: { $lt: new Date(Date.now() - ATTEMPT_GRACE_MS) } }).limit(20);
    for (const attempt of due) await finalizeAttempt(attempt);
  } catch { /* a background sweep must never crash the server */ }
}, 60_000).unref();
// ---------------------------------------------------------------- online exams
// One grace period for the whole attempt lifecycle: autosave, the deadline sweep and final submit all
// use it, so a student can never be allowed to submit later than they could save.
const ATTEMPT_GRACE_MS = 10_000;

// A withdrawn exam stops serving outstanding attempt tokens. A publication that has merely passed
// its closesAt is still active: the scheduled closing time is a result-visibility policy, not a
// revocation, so the two must never be treated the same way.
async function requireActivePublication(attempt) {
  const pub = await ExamPublication.findById(attempt.publicationId).lean();
  if (!pub || pub.active === false) throw httpError(403, 'This exam has been withdrawn by its owner.');
  return pub;
}

const takeLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: Number(process.env.TAKE_LIMIT_PER_HOUR) || 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many exam requests. Try again later.' },
});

const publicOrigin = () => (process.env.FRONTEND_URL || 'https://exams-studio.vercel.app').split(',')[0].trim();
const takeLink = (code) => `${publicOrigin()}/take/${code}`;
const hashIp = (ip) => crypto.createHash('sha256').update(`${process.env.EXAM_ATTEMPT_SECRET || process.env.JWT_SECRET || 'exam'}:${ip || 'unknown'}`).digest('hex');
const takeLinkView = (pub) => ({
  shareCode: pub.shareCode, url: takeLink(pub.shareCode), title: pub.title, instructions: pub.instructions,
  durationMinutes: pub.durationMinutes, active: pub.active, opensAt: pub.opensAt, closesAt: pub.closesAt,
  maxAttempts: pub.maxAttempts, requireName: pub.requireName, showResultsMode: pub.showResultsMode,
  shuffleQuestions: pub.shuffleQuestions, shuffleOptions: pub.shuffleOptions, maxAttemptsPerDay: pub.maxAttemptsPerDay,
});

async function ownedExam(id, userId) {
  const item = await getItem(id, userId);
  if (!item || item.kind !== 'exam') throw httpError(404, 'That exam was not found.');
  return item;
}

app.post('/api/exams/:id/publish', wrap(async (req, res) => {
  const item = await ownedExam(req.params.id, req.user.id);
  const body = req.body || {};
  const existing = await ExamPublication.findOne({ examId: item.id, ownerId: req.user.id });
  const data = {
    examId: item.id, ownerId: req.user.id,
    shareCode: existing?.shareCode || crypto.randomBytes(9).toString('base64url'),
    title: s(body.title, 160) || s(item.title, 160) || 'Online exam',
    instructions: s(body.instructions, 2000),
    durationMinutes: int(body.durationMinutes, Number(item.data?.duration) || 60, 1, 600),
    opensAt: body.opensAt ? new Date(body.opensAt) : null,
    closesAt: body.closesAt ? new Date(body.closesAt) : null,
    maxAttempts: int(body.maxAttempts, 1, 0, 100),
    maxAttemptsPerDay: int(body.maxAttemptsPerDay, 200, 0, 10000),
    requireName: body.requireName !== false,
    showResultsMode: ['immediately', 'after_close', 'never'].includes(body.showResultsMode) ? body.showResultsMode : 'immediately',
    shuffleQuestions: Boolean(body.shuffleQuestions),
    shuffleOptions: Boolean(body.shuffleOptions),
    active: body.active !== false,
  };
  const pub = existing ? await ExamPublication.findOneAndUpdate({ _id: existing._id }, { $set: data }, { new: true }) : await ExamPublication.create(data);
  await admin.recordAudit({ actorId: req.user.id, actorEmail: req.user.email, action: existing ? 'exam.publish.update' : 'exam.publish', targetType: 'exam', targetId: item.id });
  res.status(existing ? 200 : 201).json({ publication: takeLinkView(pub) });
}));

app.get('/api/exams/:id/publication', wrap(async (req, res) => {
  await ownedExam(req.params.id, req.user.id);
  const pub = await ExamPublication.findOne({ examId: req.params.id, ownerId: req.user.id });
  if (!pub) throw httpError(404, 'This exam is not published.');
  res.json({ publication: takeLinkView(pub) });
}));

app.patch('/api/exams/:id/publication', wrap(async (req, res) => {
  await ownedExam(req.params.id, req.user.id);
  const pub = await ExamPublication.findOne({ examId: req.params.id, ownerId: req.user.id });
  if (!pub) throw httpError(404, 'This exam is not published.');
  const body = req.body || {};
  for (const key of ['title', 'instructions']) if (body[key] !== undefined) pub[key] = s(body[key], key === 'instructions' ? 2000 : 160);
  if (body.durationMinutes !== undefined) pub.durationMinutes = int(body.durationMinutes, pub.durationMinutes, 1, 600);
  if (body.maxAttempts !== undefined) pub.maxAttempts = int(body.maxAttempts, pub.maxAttempts, 0, 100);
  if (body.maxAttemptsPerDay !== undefined) pub.maxAttemptsPerDay = int(body.maxAttemptsPerDay, pub.maxAttemptsPerDay, 0, 10000);
  for (const key of ['requireName', 'shuffleQuestions', 'shuffleOptions', 'active']) if (body[key] !== undefined) pub[key] = Boolean(body[key]);
  if (body.showResultsMode !== undefined && ['immediately', 'after_close', 'never'].includes(body.showResultsMode)) pub.showResultsMode = body.showResultsMode;
  if (body.opensAt !== undefined) pub.opensAt = body.opensAt ? new Date(body.opensAt) : null;
  if (body.closesAt !== undefined) pub.closesAt = body.closesAt ? new Date(body.closesAt) : null;
  await pub.save();
  res.json({ publication: takeLinkView(pub) });
}));

app.post('/api/exams/:id/unpublish', wrap(async (req, res) => {
  await ownedExam(req.params.id, req.user.id);
  await ExamPublication.updateOne({ examId: req.params.id, ownerId: req.user.id }, { $set: { active: false } });
  res.json({ ok: true });
}));

app.delete('/api/exams/:id/publication', wrap(async (req, res) => {
  await ownedExam(req.params.id, req.user.id);
  await ExamPublication.deleteOne({ examId: req.params.id, ownerId: req.user.id });
  res.json({ ok: true });
}));

app.get('/api/take/:shareCode', takeLimit, wrap(async (req, res) => {
  const pub = await ExamPublication.findOne({ shareCode: req.params.shareCode, active: true });
  if (!pub) throw httpError(404, 'This exam link is not active.');
  const item = await getItem(pub.examId, pub.ownerId);
  if (!item) throw httpError(404, 'This exam is not available.');
  res.json({ exam: { title: pub.title, instructions: pub.instructions, durationMinutes: pub.durationMinutes, maxAttempts: pub.maxAttempts, requireName: pub.requireName, showResultsMode: pub.showResultsMode, opensAt: pub.opensAt, closesAt: pub.closesAt }, questionCount: questionList(item.data).length, totalMarks: examTotalMarks(item.data) });
}));

app.post('/api/take/:shareCode/start', takeLimit, wrap(async (req, res) => {
  const pub = await ExamPublication.findOne({ shareCode: req.params.shareCode, active: true });
  if (!pub) throw httpError(404, 'This exam link is not active.');
  const now = new Date();
  if (pub.opensAt && now < pub.opensAt) throw httpError(403, 'This exam has not opened yet.');
  if (pub.closesAt && now > pub.closesAt) throw httpError(403, 'This exam has closed.');
  const item = await getItem(pub.examId, pub.ownerId);
  if (!item) throw httpError(404, 'This exam is not available.');
  const ipHash = hashIp(req.ip || req.socket?.remoteAddress);
  const name = s(req.body?.participantName, 120);
  if (pub.requireName && !name) throw httpError(400, 'Enter your name before starting.');
  const attempts = await ExamAttempt.countDocuments({ publicationId: pub._id, ipHash, ...(name ? { participantName: name } : {}) });
  if (pub.maxAttempts > 0 && attempts >= pub.maxAttempts) throw httpError(429, 'You have used all attempts for this exam.');
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const daily = await ExamAttempt.countDocuments({ publicationId: pub._id, createdAt: { $gte: dayAgo } });
  if (pub.maxAttemptsPerDay > 0 && daily >= pub.maxAttemptsPerDay) throw httpError(429, 'This exam has reached its daily attempt limit.');
  const startedAt = new Date();
  const deadlineAt = new Date(startedAt.getTime() + pub.durationMinutes * 60 * 1000);
  const attempt = await ExamAttempt.create({ publicationId: pub._id, examId: pub.examId, ownerId: pub.ownerId, ownerType: pub.ownerType || 'personal', institutionId: pub.institutionId || null, participantName: name, ipHash, seed: crypto.randomBytes(6).toString('hex'), startedAt, deadlineAt });
  const token = signAttemptToken({ attemptId: String(attempt._id), publicationId: String(pub._id) });
  const questions = questionList(item.data).map((q) => studentQuestion(q));
  res.status(201).json({ attemptId: String(attempt._id), attemptToken: token, deadlineAt, startedAt, exam: { title: pub.title, instructions: pub.instructions, durationMinutes: pub.durationMinutes, showResultsMode: pub.showResultsMode }, questions });
}));

app.put('/api/take/attempts/:id/answers', takeLimit, wrap(async (req, res) => {
  const data = verifyAttemptToken(req.body?.attemptToken);
  if (!data || data.attemptId !== req.params.id) throw httpError(401, 'Your exam session is invalid. Reopen the exam link.');
  const attempt = await ExamAttempt.findById(req.params.id);
  if (!attempt) throw httpError(404, 'Attempt not found.');
  await requireActivePublication(attempt);
  if (attempt.status !== 'in_progress') throw httpError(409, 'This attempt is already submitted.');
  if (Date.now() > attempt.deadlineAt.getTime() + ATTEMPT_GRACE_MS) throw httpError(410, 'The deadline has passed.');
  const answers = req.body?.answers;
  if (!answers || typeof answers !== 'object' || Array.isArray(answers)) throw httpError(400, 'Answers must be an object.');
  const merged = { ...(attempt.answers || {}) };
  for (const [key, value] of Object.entries(answers)) {
    if (String(value).length > 20_000) throw httpError(413, 'One of your answers is too long.');
    merged[key] = value;
  }
  attempt.answers = merged;
  attempt.autosavedAt = new Date();
  await attempt.save();
  res.json({ ok: true, autosavedAt: attempt.autosavedAt, deadlineAt: attempt.deadlineAt });
}));

app.post('/api/take/attempts/:id/submit', takeLimit, wrap(async (req, res) => {
  const data = verifyAttemptToken(req.body?.attemptToken);
  if (!data || data.attemptId !== req.params.id) throw httpError(401, 'Your exam session is invalid. Reopen the exam link.');
  const attempt = await ExamAttempt.findById(req.params.id);
  if (!attempt) throw httpError(404, 'Attempt not found.');
  await requireActivePublication(attempt);
  // The deadline is decided from the server clock and the attempt record only; the request body
  // carries nothing that can move it. An attempt already finalized keeps the existing idempotent
  // reply below, so this check applies only while it is still open.
  if (attempt.status === 'in_progress' && Date.now() > attempt.deadlineAt.getTime() + ATTEMPT_GRACE_MS) {
    throw httpError(410, 'The deadline has passed. Answers saved before the deadline are submitted automatically.');
  }
  const finalized = await finalizeAttempt(attempt);
  res.json({ ok: true, status: finalized.status, score: finalized.score });
}));

app.get('/api/take/attempts/:id/result', takeLimit, wrap(async (req, res) => {
  const data = verifyAttemptToken(req.query?.attemptToken || req.headers['x-attempt-token']);
  if (!data || data.attemptId !== req.params.id) throw httpError(401, 'Your exam session is invalid. Reopen the exam link.');
  const attempt = await ExamAttempt.findById(req.params.id).lean();
  if (!attempt) throw httpError(404, 'Attempt not found.');
  const pub = await requireActivePublication(attempt);
  const visible = pub.showResultsMode === 'immediately' || (pub.showResultsMode === 'after_close' && pub.closesAt && new Date() > pub.closesAt);
  // A student receives the mark and the comment, never the marking scheme itself: pointsHit and
  // pointsMissed name the marking points and stay with the owner.
  const studentFeedback = visible
    ? (attempt.feedback || []).map(({ questionId, awarded, max, feedback, needsReview }) => ({ questionId, awarded, max, feedback, needsReview }))
    : [];
  // overrideComment is the teacher's own note on a manually adjusted mark. It stays on the teacher
  // routes and never travels in a student response.
  const studentScore = visible && attempt.score
    ? {
        total: attempt.score.total,
        max: attempt.score.max,
        perQuestion: (attempt.score.perQuestion || []).map(({ questionId, awarded, max, needsReview }) => ({ questionId, awarded, max, needsReview })),
      }
    : null;
  res.json({ status: attempt.status, submittedAt: attempt.submittedAt, score: studentScore, feedback: studentFeedback, markingProgress: attempt.markingProgress || null, resultsVisible: visible });
}));

app.get('/api/exams/:id/attempts', wrap(async (req, res) => {
  await ownedExam(req.params.id, req.user.id);
  const attempts = await ExamAttempt.find({ examId: req.params.id, ownerId: req.user.id }).sort({ createdAt: -1 }).select('participantName startedAt submittedAt status score createdAt').lean();
  res.json({ attempts });
}));

app.get('/api/exams/:id/attempts/stats', wrap(async (req, res) => {
  await ownedExam(req.params.id, req.user.id);
  const attempts = await ExamAttempt.find({ examId: req.params.id, ownerId: req.user.id }).lean();
  const submitted = attempts.filter((a) => a.submittedAt);
  const scores = submitted.map((a) => Number(a.score?.total) || 0);
  const questions = {};
  for (const a of submitted) for (const p of a.score?.perQuestion || []) {
    const row = questions[p.questionId] || { questionId: p.questionId, attempts: 0, awarded: 0, max: p.max || 0 };
    row.attempts++; row.awarded += Number(p.awarded) || 0; row.max = Math.max(row.max, Number(p.max) || 0); questions[p.questionId] = row;
  }
  res.json({ attempts: attempts.length, submitted: submitted.length, average: scores.length ? scores.reduce((s, n) => s + n, 0) / scores.length : 0, highest: scores.length ? Math.max(...scores) : 0, lowest: scores.length ? Math.min(...scores) : 0, questions: Object.values(questions) });
}));

app.get('/api/exams/:id/attempts/:attemptId', wrap(async (req, res) => {
  await ownedExam(req.params.id, req.user.id);
  const attempt = await ExamAttempt.findOne({ _id: req.params.attemptId, examId: req.params.id, ownerId: req.user.id }).lean();
  if (!attempt) throw httpError(404, 'Attempt not found.');
  res.json({ attempt });
}));

app.patch('/api/exams/:id/attempts/:attemptId/score', wrap(async (req, res) => {
  await ownedExam(req.params.id, req.user.id);
  const attempt = await ExamAttempt.findOne({ _id: req.params.attemptId, examId: req.params.id, ownerId: req.user.id });
  if (!attempt) throw httpError(404, 'Attempt not found.');
  const item = await getItem(req.params.id, req.user.id);
  const questions = questionList(item.data);
  const incoming = Array.isArray(req.body?.perQuestion) ? req.body.perQuestion : [];
  const map = new Map(incoming.map((p) => [String(p.questionId), p]));
  attempt.score.perQuestion = (attempt.score?.perQuestion || []).map((p) => {
    const override = map.get(String(p.questionId));
    if (!override) return p;
    const awarded = Math.min(Number(p.max) || 0, Math.max(0, Math.round(Number(override.awarded) * 2) / 2));
    return { ...p, awarded, needsReview: false, overrideComment: s(override.comment, 500) || p.overrideComment || '' };
  });
  attempt.score.total = attempt.score.perQuestion.reduce((sum, p) => sum + (Number(p.awarded) || 0), 0);
  attempt.score.max = questions.reduce((sum, q) => sum + (Number(q.marks) || 0), 0);
  attempt.status = attempt.score.perQuestion.some((p) => p.needsReview) ? 'marking_failed' : 'marked';
  attempt.markedByOwnerAt = new Date();
  await attempt.save();
  await admin.recordAudit({ actorId: req.user.id, actorEmail: req.user.email, action: 'attempt.score.override', targetType: 'examAttempt', targetId: String(attempt._id) });
  res.json({ attempt });
}));

// Retention: remove old attempts on the same background cadence as auto-submit.
setInterval(async () => {
  const days = Number(process.env.ATTEMPT_RETENTION_DAYS) || 180;
  const cutoff = new Date(Date.now() - days * 86400000);
  try { await ExamAttempt.deleteMany({ createdAt: { $lt: cutoff } }); } catch {}
}, 24 * 60 * 60 * 1000).unref();
app.get('/api/exams/:id/attempts.csv', wrap(async (req, res) => {
  await ownedExam(req.params.id, req.user.id);
  const attempts = await ExamAttempt.find({ examId: req.params.id, ownerId: req.user.id }).sort({ createdAt: 1 }).lean();
  const rows = [['name', 'startedAt', 'submittedAt', 'status', 'score', 'max']];
  for (const a of attempts) rows.push([a.participantName, a.startedAt, a.submittedAt || '', a.status, a.score?.total ?? '', a.score?.max ?? '']);
  const csv = rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
  res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="attempts.csv"' }).send(csv);
}));

// ---------------------------------------------------------------- AI settings
// "Test connection" and "List models" each make a real call to the provider on the user's
// account, so they get their own limit.
const providerLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: Number(process.env.PROVIDER_LIMIT_PER_15_MIN) || 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many provider checks. Wait a few minutes and try again.' },
});

app.get('/api/settings', wrap(async (req, res) => res.json(settingsPayload(req))));

// Per-user "bring your own provider" settings. The key is encrypted at rest and never returned.
const userPresets = () => Object.entries(PROVIDERS)
  .filter(([id, p]) => id !== 'nvidia' && p.protocol !== 'cli')
  .map(([id, p]) => ({ id, label: p.label, protocol: p.protocol, needsKey: p.needsKey, baseURL: p.baseURL || '', model: p.model || '', help: p.help }));

function cleanUserAI(body = {}) {
  const provider = s(body.provider, 40) || 'custom';
  if (!PROVIDERS[provider] || provider === 'nvidia') throw httpError(400, 'Choose your own provider from the list.');
  if (PROVIDERS[provider].protocol === 'cli') throw httpError(400, 'Terminal providers cannot be used from the hosted app.');
  const out = { provider };
  if (body.model !== undefined) out.model = s(body.model, 160);
  if (body.baseURL !== undefined) out.baseURL = s(body.baseURL, 300);
  if (body.apiKey !== undefined) out.apiKey = s(body.apiKey, 500);
  if (body.maxOutput !== undefined) out.maxOutput = numberOrBlank(body.maxOutput, 256, 200_000, 'Max output');
  if (body.chunkChars !== undefined) out.chunkChars = numberOrBlank(body.chunkChars, 1500, 200_000, 'Notes per request');
  if (body.timeoutMs !== undefined) out.timeoutMs = int(body.timeoutMs, 60000, 1000, 300000);
  return out;
}

function userError(res, error) {
  const code = error?.code || 'unreachable';
  const status = code === 'invalid_key' ? 401 : code === 'provider_rate_limited' ? 429 : code === 'timeout' ? 504 : 400;
  return res.status(status).json({ error: code, message: error.message || 'The provider could not be reached.' });
}

app.get('/api/settings/user', wrap(async (req, res) => {
  res.json({ settings: await getPublicUserAISettings(req.user.id), presets: userPresets() });
}));

app.put('/api/settings/user', wrap(async (req, res) => {
  const patch = cleanUserAI(req.body || {});
  if (patch.baseURL) await assertSafeBaseURL(patch.baseURL).catch((e) => { throw httpError(400, e.message); });
  const saved = await saveUserAISettings(req.user.id, patch);
  res.json({ settings: saved });
}));

app.delete('/api/settings/user', wrap(async (req, res) => {
  await deleteUserAISettings(req.user.id);
  res.json({ ok: true });
}));

app.post('/api/settings/user/test', providerLimit, wrap(async (req, res) => {
  const saved = await getUserAISettings(req.user.id) || {};
  const patch = cleanUserAI({ ...saved, ...req.body, apiKey: req.body?.apiKey || saved.apiKey || '' });
  const candidate = { ...saved, ...patch };
  try {
    const result = await runWithUserAI(candidate, async () => testProviderConnection(resolveProvider(candidate.provider)));
    res.json({ ok: true, ...result });
  } catch (error) { return userError(res, error); }
}));

app.get('/api/settings/user/models', providerLimit, wrap(async (req, res) => {
  const saved = await getUserAISettings(req.user.id) || {};
  const patch = cleanUserAI({ ...saved, ...req.query, apiKey: req.query?.apiKey || saved.apiKey || '' });
  const candidate = { ...saved, ...patch };
  try {
    const models = await runWithUserAI(candidate, async () => listProviderModelIds(resolveProvider(candidate.provider)));
    res.json({ models });
  } catch (error) { return userError(res, error); }
}));

app.put('/api/settings', wrap(async (req, res) => {
  if (!canConfigure(req)) throw httpError(403, 'Only an administrator can change the server default AI settings.');

  const provider = s(req.body?.provider, 40);
  if (provider && !PROVIDERS[provider]) throw httpError(400, 'That AI provider is not known.');

  const rawProfile = req.body?.profile;
  if (rawProfile !== undefined && (rawProfile === null || typeof rawProfile !== 'object' || Array.isArray(rawProfile))) {
    // Without this, an empty list or a stray string silently blanks the saved profile.
    throw httpError(400, 'The settings profile must be an object.');
  }
  const profile = rawProfile || {};
  const clean = {};
  if ('model' in profile) clean.model = s(profile.model, 120);
  if ('baseURL' in profile) {
    const url = s(profile.baseURL, 300);
    if (url && !/^https?:\/\//i.test(url)) throw httpError(400, 'The address must start with http:// or https://.');
    clean.baseURL = url;
  }
  if ('apiKey' in profile) clean.apiKey = s(profile.apiKey, 400);
  if ('maxOutput' in profile) clean.maxOutput = numberOrBlank(profile.maxOutput, 256, 200_000, 'Max output');
  if ('chunkChars' in profile) clean.chunkChars = numberOrBlank(profile.chunkChars, 1500, 200_000, 'Notes per request');

  // Where to look for a newer version. A packaged desktop app has no .env, so this is editable
  // from the Settings screen and stored beside the AI settings.
  let updatePatch;
  const rawUpdate = req.body?.update;
  if (rawUpdate !== undefined) {
    if (rawUpdate === null || typeof rawUpdate !== 'object' || Array.isArray(rawUpdate)) throw httpError(400, 'The update settings must be an object.');
    updatePatch = {};
    if ('repo' in rawUpdate) {
      const repo = s(rawUpdate.repo, 120).replace(/^https?:\/\/github\.com\//i, '').replace(/\.git$/i, '').replace(/^\/+|\/+$/g, '');
      if (repo && !/^[\w.-]+\/[\w.-]+$/.test(repo)) throw httpError(400, 'The repository must look like owner/name, for example your-name/exam-studio.');
      updatePatch.repo = repo;
    }
    if ('feedUrl' in rawUpdate) {
      const url = s(rawUpdate.feedUrl, 300);
      if (url && !/^https?:\/\//i.test(url)) throw httpError(400, 'The update feed address must start with http:// or https://.');
      updatePatch.feedUrl = url;
    }
  }

  if (!provider && !updatePatch) throw httpError(400, 'Nothing to save.');
  updateSettings({ provider: provider || undefined, profile: provider ? clean : undefined, update: updatePatch });
  res.json(settingsPayload(req));
}));

app.post('/api/settings/test', providerLimit, wrap(async (_req, res) => {
  const started = Date.now();
  const result = await pingProvider();
  res.json({ provider: result.provider, model: result.model, ms: Date.now() - started, text: result.text });
}));

app.get('/api/settings/models', providerLimit, wrap(async (req, res) => {
  const local = requestIsLocal(req);
  const models = await listProviderModels(undefined, { requestIsLocal: local });
  res.json({ models });
}));

// ---------------------------------------------------------------- update check
// Is there a newer version? The answer is cached for 24 hours, so this is a read of the cache
// rather than a network call; the check itself runs in the background at start-up.
let updateInFlight = false;

// Forcing a check reaches out to the update server, so it gets its own limit.
const updateLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: Number(process.env.UPDATE_LIMIT_PER_HOUR) || 12,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many update checks. Try again later.' },
});

const updateStatus = () => {
  const source = updateSource();
  const cached = cachedUpdateStatus();
  const checkedAt = cached?.checkedAt || null;
  return {
    configured: Boolean(source),
    source: source?.kind || null,
    checking: updateInFlight,
    current: cached?.current || VERSION,
    latest: cached?.latest || '',
    updateAvailable: Boolean(cached?.updateAvailable),
    checkedAt,
    nextCheckAt: checkedAt ? new Date(Date.parse(checkedAt) + CHECK_INTERVAL_MS).toISOString() : null,
    notes: cached?.notes || '',
    url: cached?.url || '',
    error: cached?.error || null,
    message: source ? '' : 'Update checks are off. Set UPDATE_REPO (owner/repo) or UPDATE_FEED_URL in server/.env to turn them on.',
  };
};

app.get('/api/update', wrap(async (_req, res) => res.json(updateStatus())));

app.post('/api/update/check', updateLimit, wrap(async (req, res) => {
  if (!canConfigure(req)) throw httpError(403, 'Update checks can only be run from the computer running the server.');
  const result = await checkForUpdate({ force: true });
  res.json({ ...result, configured: true, checking: false, message: result.error || '' });
}));

// ---------------------------------------------------------------- agent setup
app.get('/api/agents/info', wrap(async (req, res) => {
  if (!requestIsLocal(req)) throw httpError(403, 'Open this screen on the computer running the server: the command it shows starts a program on that machine.');
  const info = launchInfo();
  res.json({ ...info, snippets: snippets(info) });
}));

// ---------------------------------------------------------------- admin API
const adminGuard = [authenticateUser, requireAdmin, (_req, res, next) => {
  res.set('Cache-Control', 'private, no-store');
  next();
}];

app.get('/api/admin/me', ...adminGuard, wrap(async (req, res) => { res.json({ user: publicUser(req.user) }); }));

// Users
app.get('/api/admin/users', ...adminGuard, wrap(async (req, res) => {
  const page = int(req.query.page, 1, 1, 10000);
  const limit = int(req.query.limit, 20, 1, 100);
  const status = ['active', 'disabled'].includes(req.query.status) ? req.query.status : '';
  const data = await admin.listUsers({ search: s(req.query.search || '', 100), role: s(req.query.role || '', 20), status, page, limit });
  res.json(data);
}));
app.post('/api/admin/users', ...adminGuard, wrap(async (req, res) => {
  const email = s(req.body?.email, 254);
  const name = s(req.body?.name, 80);
  const password = String(req.body?.password || '');
  const role = s(req.body?.role, 20) || 'student';
  if (!email || !name || !password) throw httpError(400, 'Email, name and password are required.');
  const pwErr = validatePassword(password);
  if (pwErr) throw httpError(400, pwErr);
  const created = await createUser({ email, name, passwordHash: await hashPassword(password), role, planId: req.body?.planId || null, active: req.body?.active !== false, mustChangePassword: Boolean(req.body?.mustChangePassword) });
  await admin.recordAudit({ actorId: req.user.id, actorEmail: req.user.email, action: 'user.create', targetType: 'user', targetId: created.id, after: { email, name, role } });
  res.status(201).json(created);
}));
app.get('/api/admin/users/:id', ...adminGuard, wrap(async (req, res) => {
  const u = await admin.getUserById(req.params.id);
  if (!u) throw httpError(404, 'User not found.');
  res.json(u);
}));
app.put('/api/admin/users/:id', ...adminGuard, protectSuperadminAccount, wrap(async (req, res) => {
  const patch = {};
  if (req.body?.name !== undefined) patch.name = s(req.body.name, 80);
  if (req.body?.role !== undefined) patch.role = s(req.body.role, 20);
  if (req.body?.planId !== undefined) patch.planId = req.body.planId || null;
  if (req.body?.active !== undefined) patch.active = Boolean(req.body.active);
  if (req.body?.overrides !== undefined) patch.overrides = req.body.overrides;
  const updated = await admin.updateUser(req.params.id, patch);
  if (!updated) throw httpError(404, 'User not found.');
  await admin.recordAudit({ actorId: req.user.id, actorEmail: req.user.email, action: 'user.update', targetType: 'user', targetId: req.params.id, after: patch });
  res.json(updated);
}));
app.delete('/api/admin/users/:id', ...adminGuard, protectSuperadminAccount, wrap(async (req, res) => {
  const ok = await admin.deleteUser(req.params.id);
  if (!ok) throw httpError(404, 'User not found.');
  await admin.recordAudit({ actorId: req.user.id, actorEmail: req.user.email, action: 'user.delete', targetType: 'user', targetId: req.params.id });
  res.json({ ok: true });
}));
app.post('/api/admin/users/:id/reset-password', ...adminGuard, protectSuperadminAccount, wrap(async (req, res) => {
  const password = String(req.body?.password || '');
  const pwErr = validatePassword(password);
  if (pwErr) throw httpError(400, pwErr);
  const updated = await admin.resetUserPassword(req.params.id, await hashPassword(password));
  if (!updated) throw httpError(404, 'User not found.');
  await admin.recordAudit({ actorId: req.user.id, actorEmail: req.user.email, action: 'user.resetPassword', targetType: 'user', targetId: req.params.id });
  res.json({ ok: true });
}));
app.post('/api/admin/users/:id/signout', ...adminGuard, protectSuperadminAccount, wrap(async (req, res) => {
  await admin.updateUser(req.params.id, { forceSignOut: true });
  await admin.recordAudit({ actorId: req.user.id, actorEmail: req.user.email, action: 'user.signout', targetType: 'user', targetId: req.params.id });
  res.json({ ok: true });
}));

// Plans
app.get('/api/admin/plans', ...adminGuard, wrap(async (_req, res) => { res.json({ items: await admin.listPlans() }); }));
app.post('/api/admin/plans', ...adminGuard, wrap(async (req, res) => {
  const plan = await admin.createPlan(req.body || {});
  await admin.recordAudit({ actorId: req.user.id, actorEmail: req.user.email, action: 'plan.create', targetType: 'plan', targetId: plan.id, after: req.body });
  res.status(201).json(plan);
}));
app.put('/api/admin/plans/:id', ...adminGuard, wrap(async (req, res) => {
  const before = await admin.getPlanById ? null : null;
  const plan = await admin.updatePlan(req.params.id, req.body || {});
  if (!plan) throw httpError(404, 'Plan not found.');
  await admin.recordAudit({ actorId: req.user.id, actorEmail: req.user.email, action: 'plan.update', targetType: 'plan', targetId: req.params.id, before: {}, after: req.body });
  res.json(plan);
}));
app.delete('/api/admin/plans/:id', ...adminGuard, wrap(async (req, res) => {
  const movePlanId = s(req.body?.movePlanId || req.query?.movePlanId || '', 64) || undefined;
  const ok = await admin.deletePlan(req.params.id, movePlanId);
  if (!ok) throw httpError(404, 'Plan not found.');
  await admin.recordAudit({ actorId: req.user.id, actorEmail: req.user.email, action: 'plan.delete', targetType: 'plan', targetId: req.params.id, after: { movePlanId } });
  res.json({ ok: true });
}));
app.post('/api/admin/plans/:id/duplicate', ...adminGuard, wrap(async (req, res) => {
  const plan = await admin.duplicatePlan(req.params.id);
  if (!plan) throw httpError(404, 'Plan not found.');
  await admin.recordAudit({ actorId: req.user.id, actorEmail: req.user.email, action: 'plan.duplicate', targetType: 'plan', targetId: plan.id });
  res.status(201).json(plan);
}));
app.post('/api/admin/plans/:id/default', ...adminGuard, wrap(async (req, res) => {
  const plan = await admin.setDefaultPlan(req.params.id);
  await admin.recordAudit({ actorId: req.user.id, actorEmail: req.user.email, action: 'plan.default', targetType: 'plan', targetId: req.params.id });
  res.json(plan);
}));

// AI config
app.get('/api/admin/ai-config', ...adminGuard, wrap(async (_req, res) => { res.json(await admin.getAIConfig()); }));
app.put('/api/admin/ai-config', ...adminGuard, wrap(async (req, res) => {
  const cfg = await admin.updateAIConfig(req.body || {});
  await admin.recordAudit({
    actorId: req.user.id, actorEmail: req.user.email, action: 'aiConfig.update', targetType: 'aiConfig',
    after: { fields: Object.keys(req.body || {}), hasKey: cfg.hasKey },
  });
  res.json(cfg);
}));
app.post('/api/admin/ai-config/test', ...adminGuard, wrap(async (req, res) => {
  const result = await pingProvider();
  res.json({ provider: result.provider, model: result.model, ms: 0, text: result.text });
}));
app.get('/api/admin/ai-config/models', ...adminGuard, wrap(async (_req, res) => {
  res.json({ models: await listProviderModels(undefined, { requestIsLocal: true }) });
}));

// Usage
app.get('/api/admin/usage', ...adminGuard, wrap(async (req, res) => {
  const outcome = ['success', 'failure'].includes(req.query.outcome) ? req.query.outcome : undefined;
  const data = await admin.listUsage({ userId: s(req.query.userId || '', 64) || undefined, taskType: s(req.query.taskType || '', 20) || undefined, outcome, page: int(req.query.page, 1, 1, 10000), limit: int(req.query.limit, 50, 1, 200) });
  res.json(data);
}));
app.get('/api/admin/usage/summary', ...adminGuard, wrap(async (_req, res) => { res.json(await admin.usageSummary()); }));

// Content
app.get('/api/admin/content', ...adminGuard, wrap(async (req, res) => {
  const data = await admin.listLibraryItemsAdmin({ kind: s(req.query.kind || '', 20) || undefined, search: s(req.query.search || '', 100), page: int(req.query.page, 1, 1, 10000), limit: int(req.query.limit, 20, 1, 100) });
  res.json(data);
}));
app.delete('/api/admin/content/:id', ...adminGuard, wrap(async (req, res) => {
  const ok = await admin.deleteLibraryItemAdmin(req.params.id);
  if (!ok) throw httpError(404, 'Not found.');
  await admin.recordAudit({ actorId: req.user.id, actorEmail: req.user.email, action: 'content.delete', targetType: 'libraryItem', targetId: req.params.id });
  res.json({ ok: true });
}));

// Announcements
app.get('/api/admin/announcements', ...adminGuard, wrap(async (_req, res) => { res.json({ items: await admin.listAnnouncements() }); }));
app.post('/api/admin/announcements', ...adminGuard, wrap(async (req, res) => {
  const a = await admin.createAnnouncement(req.body || {});
  await admin.recordAudit({ actorId: req.user.id, actorEmail: req.user.email, action: 'announcement.create', targetType: 'announcement', targetId: a.id });
  res.status(201).json(a);
}));
app.put('/api/admin/announcements/:id', ...adminGuard, wrap(async (req, res) => {
  const a = await admin.updateAnnouncement(req.params.id, req.body || {});
  if (!a) throw httpError(404, 'Not found.');
  await admin.recordAudit({ actorId: req.user.id, actorEmail: req.user.email, action: 'announcement.update', targetType: 'announcement', targetId: req.params.id });
  res.json(a);
}));
app.delete('/api/admin/announcements/:id', ...adminGuard, wrap(async (req, res) => {
  const ok = await admin.deleteAnnouncement(req.params.id);
  if (!ok) throw httpError(404, 'Not found.');
  await admin.recordAudit({ actorId: req.user.id, actorEmail: req.user.email, action: 'announcement.delete', targetType: 'announcement', targetId: req.params.id });
  res.json({ ok: true });
}));

// Audit
app.get('/api/admin/audit', ...adminGuard, wrap(async (req, res) => {
  const data = await admin.listAudit({ action: s(req.query.action || '', 100), page: int(req.query.page, 1, 1, 10000), limit: int(req.query.limit, 50, 1, 200) });
  res.json(data);
}));

// System settings
app.get('/api/admin/settings', ...adminGuard, wrap(async (_req, res) => { res.json(await admin.allSystemSettings()); }));
app.put('/api/admin/settings', ...adminGuard, wrap(async (req, res) => {
  const body = req.body || {};
  for (const [k, v] of Object.entries(body)) {
    await admin.setSystemSetting(k, v, req.user.id);
  }
  await admin.recordAudit({ actorId: req.user.id, actorEmail: req.user.email, action: 'settings.update', targetType: 'settings', after: body });
  res.json(await admin.allSystemSettings());
}));

// Two-factor auth for admins
app.post('/api/admin/2fa/setup', ...adminGuard, wrap(async (req, res) => {
  const secret = totp.newSecret();
  await admin.updateUser(req.user.id, { totpSecret: secret, totpEnabled: false });
  const url = totp.otpauthUrl(secret, req.user.email);
  res.json({ secret, otpauthUrl: url });
}));
app.post('/api/admin/2fa/verify', ...adminGuard, wrap(async (req, res) => {
  const user = await findUserByEmail(req.user.email);
  const code = String(req.body?.code || '');
  if (!user?.totpSecret || !totp.verifyTotp(user.totpSecret, code)) throw httpError(400, 'Invalid code.');
  await admin.updateUser(req.user.id, { totpEnabled: true });
  await admin.recordAudit({ actorId: req.user.id, actorEmail: req.user.email, action: '2fa.enable', targetType: 'user', targetId: req.user.id });
  res.json({ ok: true });
}));
app.post('/api/admin/2fa/disable', ...adminGuard, wrap(async (req, res) => {
  await admin.updateUser(req.user.id, { totpSecret: null, totpEnabled: false });
  await admin.recordAudit({ actorId: req.user.id, actorEmail: req.user.email, action: '2fa.disable', targetType: 'user', targetId: req.user.id });
  res.json({ ok: true });
}));

// Active announcements for users
app.get('/api/announcements/active', optionalAuthenticateUser, wrap(async (_req, res) => {
  res.json({ items: await admin.activeAnnouncements() });
}));

// System health
app.get('/api/admin/health', ...adminGuard, wrap(async (_req, res) => {
  res.json({ ok: true, storage: storageStatus(), version: VERSION, uptime: process.uptime(), memory: process.memoryUsage() });
}));
app.get('/api/admin/system', ...adminGuard, wrap(async (_req, res) => {
  const activeJobs = [...handoutJobs.values()].filter((job) => !job.done && !job.cancelled && Date.now() - job.startedAt <= JOB_TTL_MS).length;
  res.json(await admin.systemInfo({ activeJobs }));
}));
app.get('/api/admin/ai-health', ...adminGuard, wrap(async (_req, res) => {
  const { lastSuccessAt, lastLatency, lastErrorAt } = admin.getAIHealth();
  res.json({ lastSuccessAt, lastLatency, lastErrorAt });
}));
app.post('/api/admin/diagnostics', ...adminGuard, wrap(async (req, res) => {
  const id = s(req.body?.id, 40);
  const result = await admin.runDiagnostic(id);
  await admin.recordAudit({ actorId: req.user.id, actorEmail: req.user.email, action: 'diagnostic.run', targetType: 'diagnostic', targetId: id, after: result });
  res.json(result);
}));

// Public AI health check - fails quietly for visitors (no provider internals exposed).
app.get('/health/ai', wrap(async (_req, res) => {
  let ok = false, latency = null, error = null;
  const started = Date.now();
  try {
    await pingProvider();
    ok = true;
    latency = Date.now() - started;
    try { admin.recordAISuccess(latency); } catch {}
  } catch (e) {
    try { admin.recordAIFailure(e); } catch {}
    error = e.status >= 500 ? 'unavailable' : 'error';
  }
  res.json({ ok, latency, ...(error ? { error } : {}) });
}));

// User quota meter
app.get('/api/me/quota', authenticateUser, wrap(async (req, res) => {
  const plan = await admin.getUserPlan(req.user.id);
  const now = new Date();
  const startOfDay = new Date(now); startOfDay.setHours(0, 0, 0, 0);
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  res.json({
    plan: plan ? { name: plan.name, requestsPerDay: plan.requestsPerDay, requestsPerMonth: plan.requestsPerMonth, tokensPerDay: plan.tokensPerDay, tokensPerMonth: plan.tokensPerMonth } : null,
    used: {
      requestsToday: await admin.usageCount(req.user.id, startOfDay),
      requestsMonth: await admin.usageCount(req.user.id, startOfMonth),
      tokensToday: await admin.tokenCount(req.user.id, startOfDay),
      tokensMonth: await admin.tokenCount(req.user.id, startOfMonth),
    },
  });
}));

// ---------------------------------------------------------------- downloads and client + errors
const downloadsDir = path.resolve(__dirname, '../downloads');
const VERCEL_ORIGIN = 'https://exams-studio.vercel.app';
if (fs.existsSync(downloadsDir)) {
  // Custom download handler: CORS for the landing origin on JSON only, attachment disposition on zips.
  app.use('/downloads', (req, res, next) => {
    const file = path.join(downloadsDir, req.path.slice('/downloads'.length));
    fs.stat(file, (err, st) => {
      if (err || !st.isFile()) return next();
      res.set('Cache-Control', 'public, max-age=86400');
      const isJson = file.endsWith('.json');
      const isZip = file.endsWith('.zip');
      if (isJson) res.set('Access-Control-Allow-Origin', VERCEL_ORIGIN);
      if (isZip) res.set('Content-Disposition', `attachment; filename="${path.basename(file)}"`);
      res.sendFile(file);
    });
  });
}
app.use('/downloads', (_req, _res, next) => next(httpError(404, 'Not found.')));
app.use('/api', (_req, _res, next) => next(httpError(404, 'Not found.')));
app.use('/oauth', (_req, _res, next) => next(httpError(404, 'Not found.')));
app.use('/mcp', (_req, _res, next) => next(httpError(404, 'Not found.')));

// Unknown paths that look like API endpoints should return JSON 404, never SPA index.html
app.use((req, res, next) => {
  if (req.path.startsWith('/.well-known/')) {
    return res.status(404).type('application/json; charset=utf-8').json({ error: 'Not found.' });
  }
  next();
});

const dist = path.resolve(__dirname, '../client/dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^\/(?!api\/|downloads\/|mcp\/).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}

// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'That file is over 15 MB.' : 'Upload failed.' });
  }
  if (err?.type === 'entity.too.large') return res.status(413).json({ error: 'That request is too large.' });
  if (err?.type === 'entity.parse.failed') return res.status(400).json({ error: 'Bad request.' });
  if (err?.name === 'ValidationError') return res.status(400).json({ error: Object.values(err.errors || {})[0]?.message || 'That data is not valid.' });
  if (err?.name === 'CastError') return res.status(400).json({ error: 'That identifier is not valid.' });
  if (err?.code === 11000) return res.status(409).json({ error: 'That record already exists.' });

  const status = err.status || 500;
  if (status >= 500) console.error(err);
  res.status(status).type('application/json; charset=utf-8').json(err.details && typeof err.details === 'object' ? err.details : { error: status >= 500 && !err.status ? 'Something went wrong on the server.' : err.message });
});

export { app };

/**
 * Prepare storage and start listening. Returns the http.Server.
 * The desktop shell (electron/main.js) calls this with port 0 for a free port.
 */
export async function start(port = PORT, host = process.env.HOST) {
  await initStorage();
  await admin.getAIConfig().catch(() => {}); // populate cache

  // First-admin bootstrap from environment (never a default password).
  try {
    const adminEmail = String(process.env.EXAM_STUDIO_ADMIN_EMAIL || '').trim();
    const adminPassword = String(process.env.EXAM_STUDIO_ADMIN_PASSWORD || '').trim();
    if (adminEmail && adminPassword) {
      const existing = await findUserByEmail(adminEmail);
      if (!existing) {
        const err = validatePassword(adminPassword);
        if (!err) {
          await createUser({ email: adminEmail, name: 'Administrator', passwordHash: await hashPassword(adminPassword), role: 'admin', mustChangePassword: true });
          console.log(`Created first admin account: ${adminEmail} (password change required on first sign-in).`);
        } else {
          console.warn(`Admin bootstrap skipped: ${err}`);
        }
      }
    }
  } catch (e) { console.warn('Admin bootstrap failed:', e.message); }

  // Look for a newer version in the background, so nobody waits on the network. checkForUpdate
  // only goes out when the cached answer is older than 24 hours.
  if (updateSource()) {
    updateInFlight = true;
    checkForUpdate()
      .then((result) => {
        if (result.updateAvailable) console.warn(`A newer version of Exam Studio is available: ${result.latest} (this is ${result.current}).`);
        else if (result.error) console.warn(`Update check failed: ${result.error}`);
      })
      .catch(() => { /* an update check must never stop the app from starting */ })
      .finally(() => { updateInFlight = false; });
  }

  const server = await new Promise((resolve, reject) => {
    const srv = app.listen(port, host, () => resolve(srv));
    srv.on('error', (error) => {
      if (error.code === 'EADDRINUSE') reject(new Error(`Port ${port} is already in use. Close the other copy, or set PORT to a different number.`));
      else reject(error);
    });
  });
  const address = server.address();
  const shown = typeof address === 'object' && address ? `${address.address}:${address.port}` : String(address);
  const info = activeInfo();
  const aiLabel = info.id === 'nvidia' ? 'Exam Studio AI' : `${info.provider} / ${info.model}`;
  console.log(`Exam Studio API on http://localhost:${typeof address === 'object' && address ? address.port : port}  AI: ${aiLabel}${info.demo ? '  (DEMO MODE: sample output, no API calls)' : ''}`);
  console.log(`Storage: ${storageStatus().backend === 'mongodb' ? 'MongoDB' : `file (${storageStatus().file})`}  listening on ${shown}`);

  const shutdown = () => { server.close(() => process.exit(0)); setTimeout(() => process.exit(0), 2000).unref(); };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);

  return server;
}

// Only listen when this file is the program that was started. The desktop shell imports it
// and calls start() itself.
const entry = process.argv[1] ? path.resolve(process.argv[1]).toLowerCase() : '';
const isEntry = entry !== '' && entry === fileURLToPath(import.meta.url).toLowerCase();
if (isEntry && process.env.EXAM_STUDIO_NO_LISTEN !== '1') {
  start(PORT).catch((error) => {
    console.error(`Exam Studio could not start: ${error.message}`);
    process.exitCode = 1;
  });
}

export default app;
