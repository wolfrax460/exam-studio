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
import { generateNotes, generateCards, generateExam, generateHandout, activeInfo, DEMO, MAX_NOTES_CHARS, detectStructure } from './lib/ai.js';
import { examDocx, keyDocx, notesDocx, handoutDocx } from './lib/docx.js';
import { handoutPdf, examPdf, keyPdf } from './lib/pdf.js';
import { examCsv, keyCsv } from './lib/csv.js';
import { listItems, getItem, saveItem, deleteItem, initStorage, storageStatus } from './lib/store.js';
import { normalizeEmail, findUserByEmail, createUser, countUsers } from './lib/repository.js';
import {
  authenticateUser, optionalAuthenticateUser, validatePassword, hashPassword, verifyPassword,
  generateToken, verifyToken, publicUser, dummyCompare, JWT_EXPIRES_IN,
} from './lib/auth.js';
import { updateSettings, getSettings } from './lib/settings.js';
import { PROVIDERS, activeProviderId, providerCatalog } from './lib/providers.js';
import * as admin from './lib/adminStore.js';
import { verifyPatToken } from './lib/adminStore.js';
import * as mailer from './lib/mailer.js';
import { requireAdmin } from './lib/auth.js';
import * as totp from './lib/totp.js';
import { pingProvider, listProviderModels } from './lib/engine.js';
import { launchInfo, snippets } from './lib/agents.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { checkForUpdate, cachedUpdateStatus, currentVersion, updateSource, CHECK_INTERVAL_MS } from './lib/version.js';
import { QUESTION_TYPES, validateExam, totalMarks, isSectionsExam, numberedItems, itemMarks, answerText } from '../shared/format.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3001;
const VERSION = currentVersion();

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
app.use(helmet());
if (process.env.CORS_ORIGIN) app.use(cors({ origin: process.env.CORS_ORIGIN.split(',').map((s) => s.trim()) }));
// A handout is planned from a whole trainee's manual, which runs to about 600,000 characters
// before JSON escaping.
app.use(express.json({ limit: '4mb' }));

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

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
const canConfigure = (req) => requestIsLocal(req) || process.env.EXAM_STUDIO_ALLOW_REMOTE_SETTINGS === '1';

const settingsPayload = (req) => {
  const source = updateSource();
  const saved = getSettings().update || {};
  return {
    active: activeProviderId(),
    canChange: canConfigure(req),
    providers: providerCatalog({ requestIsLocal: requestIsLocal(req) }),
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
  const info = activeInfo();
  const storage = storageStatus();
  const isDefaultAI = info.id === 'nvidia';
  res.json({
    ok: true,
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

  if (user.totpEnabled) {
    const code = String(req.body?.totpCode || '').trim();
    if (!code || !totp.verifyTotp(user.totpSecret, code)) {
      throw httpError(401, 'Invalid or missing two-factor code.');
    }
  }

  res.json({ token: generateToken(user), user: publicUser(user) });
}));

// Registered before the required-auth middleware, so it simply reports "signed out".
app.get('/api/auth/me', optionalAuthenticateUser, wrap(async (req, res) => {
  res.json({ user: req.user ? publicUser(req.user) : null });
}));

app.get('/api/auth/verify-email', wrap(async (req, res) => {
  const token = String(req.query?.token || '');
  if (!token) throw httpError(400, 'Verification token is required.');
  User = User;
  const hashed = crypto.createHash('sha256').update(token).digest('hex');
  const user = await User.findOne({ emailVerificationTokenHash: hashed, emailVerificationExpires: { $gt: new Date() } });
  if (!user) throw httpError(400, 'Verification link is invalid or expired.');
  user.emailVerified = true;
  user.emailVerificationTokenHash = undefined;
  user.emailVerificationExpires = undefined;
  await user.save();
  res.json({ message: 'Email verified. You can now sign in.', user: publicUser(user) });
}));

app.post('/api/auth/forgot-password', wrap(async (req, res) => {
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

app.post('/api/auth/reset-password', wrap(async (req, res) => {
  const token = String(req.body?.token || '');
  const password = req.body?.password;
  if (!token) throw httpError(400, 'Reset token is required.');
  if (typeof password !== 'string' || !password) throw httpError(400, 'A new password is required.');
  const passwordProblem = validatePassword(password);
  if (passwordProblem) throw httpError(400, passwordProblem);
  const hashed = crypto.createHash('sha256').update(token).digest('hex');
  const user = await User.findOne({ passwordResetTokenHash: hashed, passwordResetExpires: { $gt: new Date() } });
  if (!user) throw httpError(400, 'Reset link is invalid or expired.');
  user.passwordHash = password;
  user.passwordResetTokenHash = undefined;
  user.passwordResetExpires = undefined;
  await user.save();
  res.json({ message: 'Password reset successfully. You can now sign in.' });
}));
const OPENAPI_SPEC = { openapi: '3.1.0', info: { title: 'Exam Studio API', version: '0.2.1' }, paths: { '/api/v1/public/plans': { get: { summary: 'List public plans' } } } };

// ---------------------------------------------------------------- public API v1 (PAT or session)
app.get('/api/v1/public/plans', wrap(async (_req, res) => {
  const items = await admin.listPlans();
  res.json({ items: items.map(p => ({ name: p.name, description: p.description, requestsPerDay: p.requestsPerDay, requestsPerMonth: p.requestsPerMonth, tokensPerMonth: p.tokensPerMonth, allowedFeatures: p.allowedFeatures, allowOwnKey: p.allowOwnKey })) });
}));
app.get('/api/v1/openapi.json', wrap(async (_req, res) => {
  res.json(OPENAPI_SPEC);
}));
app.use('/api/v1', authenticateAny);
app.get('/api/v1/me/quota', wrap(async (req, res) => { res.json(await admin.getUserPlan(req.user.id) ? { plan: await admin.getUserPlan(req.user.id) } : {}); }));
app.get('/api/v1/library', wrap(async (req, res) => { const items = await listItems(req.user.id); res.json({ items }); }));
app.get('/api/v1/notes/structure', wrap(async (req, res) => { const text = String(req.query.text || ''); const structure = detectStructure(text, req.query.title); res.json({ structure }); }));

// Remote MCP (streamable HTTP) - minimal stateless endpoint
app.post('/mcp', wrap(async (req, res) => {
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  const server = new McpServer({ name: 'exam-studio', version: '0.2.1' });
  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
}));

app.post('/api/v1/generate/notes', wrap(async (req, res) => {
  const text = notesFrom(req.body);
  await admin.enforceLimits(req.user.id, 'notes', text);
  const notes = await generateNotes({ text, title: s(req.body?.title, 120), focus: s(req.body?.focus, 300) });
  await admin.recordUsage({ userId: req.user.id, taskType: 'notes', estimatedTokens: Math.ceil(text.length / 4), success: true });
  res.json(notes);
}));
app.post('/api/v1/generate/flashcards', wrap(async (req, res) => {
  const text = notesFrom(req.body);
  await admin.enforceLimits(req.user.id, 'flashcards', text);
  const cards = await generateCards({ text, title: s(req.body?.title, 120), count: int(req.body?.count, 30, 5, 80) });
  await admin.recordUsage({ userId: req.user.id, taskType: 'flashcards', estimatedTokens: Math.ceil(text.length / 4), success: true });
  res.json(cards);
}));
app.post('/api/v1/generate/exam', wrap(async (req, res) => {
  const text = notesFrom(req.body);
  await admin.enforceLimits(req.user.id, 'exam', text);
  const exam = await generateExam({ text, title: s(req.body?.title, 120), level: s(req.body?.level, 20), types: Array.isArray(req.body?.types) ? req.body.types : ['mcq'], totalMarksTarget: int(req.body?.totalMarks, 100, 10, 200) });
  await admin.recordUsage({ userId: req.user.id, taskType: 'exam', estimatedTokens: Math.ceil(text.length / 4), success: true });
  res.json(exam);
}));
app.post('/api/v1/generate/handout', wrap(async (req, res) => {
  const text = notesFrom(req.body);
  await admin.enforceLimits(req.user.id, 'handout', text);
  const handout = await generateHandout({ text, title: s(req.body?.title, 120), level: s(req.body?.level, 20), includeRevision: req.body?.includeRevision !== false, includePractical: req.body?.includePractical !== false });
  await admin.recordUsage({ userId: req.user.id, taskType: 'handout', estimatedTokens: Math.ceil(text.length / 4), success: true });
  res.json(handout);
}));

// ---------------------------------------------------------------- protected routes
app.use('/api', authenticateUser);

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
// ---------------------------------------------------------------- generate
app.post('/api/notes/generate', generateLimit, optionalAuthenticateUser, wrap(async (req, res) => {
  const text = notesFrom(req.body);
  if (req.user) { await admin.enforceLimits(req.user.id, 'notes', text); }
  const notes = await generateNotes({ text, title: s(req.body?.title, 120), focus: s(req.body?.focus, 300) });
  if (req.user) { await admin.recordUsage({ userId: req.user.id, taskType: 'notes', estimatedTokens: Math.ceil(text.length / 4), success: true }); }
  res.json(notes);
}));

app.post('/api/flashcards/generate', generateLimit, optionalAuthenticateUser, wrap(async (req, res) => {
  const text = notesFrom(req.body);
  if (req.user) { await admin.enforceLimits(req.user.id, 'flashcards', text); }
  const cards = await generateCards({ text, title: s(req.body?.title, 120), count: int(req.body?.count, 30, 5, 80) });
  if (req.user) { await admin.recordUsage({ userId: req.user.id, taskType: 'flashcards', estimatedTokens: Math.ceil(text.length / 4), success: true }); }
  res.json(cards);
}));

app.post('/api/exams/generate', generateLimit, optionalAuthenticateUser, wrap(async (req, res) => {
  const text = notesFrom(req.body);
  if (req.user) { await admin.enforceLimits(req.user.id, 'exam', text); }
  const layout = req.body?.layout === 'classic' ? 'classic' : 'sections-a-e';
  const totalMarksTarget = int(req.body?.totalMarks, 100, 10, 200);
  const avoid = (Array.isArray(req.body?.avoid) ? req.body.avoid : []).slice(0, 60).map((a) => s(a, 200)).filter(Boolean);
  const common = {
    text, layout, totalMarksTarget, avoid,
    title: s(req.body?.title, 120), level: s(req.body?.level, 20),
  };

  if (layout === 'sections-a-e') {
    const exam = await generateExam({
      ...common,
      moduleCode: s(req.body?.moduleCode, 24),
      trade: s(req.body?.trade, 120),
      school: s(req.body?.school, 120),
      duration: s(req.body?.duration, 40),
      sectionPlan: Array.isArray(req.body?.sectionPlan) ? req.body.sectionPlan : undefined,
    });
    if (DEMO) { exam.warnings = validateExam(exam, totalMarksTarget); exam.totalMarks = totalMarks(exam); }
    if (req.user) { await admin.recordUsage({ userId: req.user.id, taskType: 'exam', estimatedTokens: Math.ceil(text.length / 4), success: true }); }
    return res.json(exam);
  }

  // The old flat paper still takes a list of question types.
  const types = (Array.isArray(req.body?.types) ? req.body.types : []).filter((t) => t in QUESTION_TYPES);
  if (!types.length) throw httpError(400, 'Choose at least one question type.');
  const essayCount = types.includes('essay') ? int(req.body?.essayCount, 2, 1, 4) : 0;
  const exam = await generateExam({ ...common, types, essayCount });
  if (DEMO) { exam.warnings = validateExam(exam, null); exam.totalMarks = totalMarks(exam); }
  if (req.user) { await admin.recordUsage({ userId: req.user.id, taskType: 'exam', estimatedTokens: Math.ceil(text.length / 4), success: true }); }
  res.json(exam);
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

app.post('/api/handouts/generate', generateLimit, optionalAuthenticateUser, wrap(async (req, res) => {
  const jobId = s(req.body?.jobId, 60);
  const units = (Array.isArray(req.body?.units) ? req.body.units : []).map((unit) => s(unit, 10)).filter(Boolean);
  const handoutText = notesFrom(req.body);
  if (req.user) { await admin.enforceLimits(req.user.id, 'handout', handoutText); }
  const job = jobId ? { userId: req.userId, steps: [], startedAt: Date.now(), done: false } : null;
  if (job) handoutJobs.set(jobId, job);
  try {
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
    if (req.user) { await admin.recordUsage({ userId: req.user.id, taskType: 'handout', estimatedTokens: Math.ceil(handoutText.length / 4), success: true }); }
    res.json(handout);
  } finally {
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

app.put('/api/settings', wrap(async (req, res) => {
  if (!canConfigure(req)) throw httpError(403, 'AI settings can only be changed on the computer running the server.');

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
const adminGuard = [authenticateUser, requireAdmin];

app.get('/api/admin/me', ...adminGuard, wrap(async (req, res) => { res.json({ user: publicUser(req.user) }); }));

// Users
app.get('/api/admin/users', ...adminGuard, wrap(async (req, res) => {
  const page = int(req.query.page, 1, 1, 10000);
  const limit = int(req.query.limit, 20, 1, 100);
  const data = await admin.listUsers({ search: s(req.query.search || '', 100), role: s(req.query.role || '', 20), page, limit });
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
app.put('/api/admin/users/:id', ...adminGuard, wrap(async (req, res) => {
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
app.delete('/api/admin/users/:id', ...adminGuard, wrap(async (req, res) => {
  const ok = await admin.deleteUser(req.params.id);
  if (!ok) throw httpError(404, 'User not found.');
  await admin.recordAudit({ actorId: req.user.id, actorEmail: req.user.email, action: 'user.delete', targetType: 'user', targetId: req.params.id });
  res.json({ ok: true });
}));
app.post('/api/admin/users/:id/reset-password', ...adminGuard, wrap(async (req, res) => {
  const password = String(req.body?.password || '');
  const pwErr = validatePassword(password);
  if (pwErr) throw httpError(400, pwErr);
  const updated = await admin.resetUserPassword(req.params.id, await hashPassword(password));
  if (!updated) throw httpError(404, 'User not found.');
  await admin.recordAudit({ actorId: req.user.id, actorEmail: req.user.email, action: 'user.resetPassword', targetType: 'user', targetId: req.params.id });
  res.json({ ok: true });
}));
app.post('/api/admin/users/:id/signout', ...adminGuard, wrap(async (req, res) => {
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
  await admin.recordAudit({ actorId: req.user.id, actorEmail: req.user.email, action: 'aiConfig.update', targetType: 'aiConfig', after: req.body });
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
  const data = await admin.listUsage({ userId: s(req.query.userId || '', 64) || undefined, taskType: s(req.query.taskType || '', 20) || undefined, page: int(req.query.page, 1, 1, 10000), limit: int(req.query.limit, 50, 1, 200) });
  res.json(data);
}));
app.get('/api/admin/usage/summary', ...adminGuard, wrap(async (_req, res) => { res.json(await admin.usageSummary()); }));

// Content
app.get('/api/admin/content', ...adminGuard, wrap(async (req, res) => {
  const data = await admin.listLibraryItemsAdmin({ kind: s(req.query.kind || '', 20) || undefined, page: int(req.query.page, 1, 1, 10000), limit: int(req.query.limit, 20, 1, 100) });
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
  const data = await admin.listAudit({ page: int(req.query.page, 1, 1, 10000), limit: int(req.query.limit, 50, 1, 200) });
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
  res.json(await admin.systemInfo());
}));
app.post('/api/admin/diagnostics', ...adminGuard, wrap(async (req, res) => {
  const id = s(req.body?.id, 40);
  const result = await admin.runDiagnostic(id);
  await admin.recordAudit({ actorId: req.user.id, actorEmail: req.user.email, action: 'diagnostic.run', targetType: 'diagnostic', targetId: id, after: result });
  res.json(result);
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
if (fs.existsSync(downloadsDir)) app.use('/downloads', express.static(downloadsDir, { fallthrough: true }));

const dist = path.resolve(__dirname, '../client/dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^\/(?!api\/).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}

app.use('/api', (_req, _res, next) => next(httpError(404, 'Not found.')));

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
  res.status(status).json({ error: status >= 500 && !err.status ? 'Something went wrong on the server.' : err.message });
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
