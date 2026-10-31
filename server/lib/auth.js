// Authentication: password hashing, JWT issuing/verification and the Express middlewares.
//
// The JWT secret is never silently replaced by a hard-coded value: it comes from JWT_SECRET,
// or (outside production) from a random secret generated once and stored next to the data
// files, so tokens survive a restart without shipping a public default that anyone could forge.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { httpError } from './errors.js';
import * as repo from './repository.js';

const here = path.dirname(fileURLToPath(import.meta.url));

const PLACEHOLDERS = new Set([
  'your-fallback-secret-key-change-in-production',
  'your-super-secret-jwt-key-change-in-production',
  'secret', 'changeme', 'change-me', 'test',
]);

const secretDir = () => {
  if (process.env.SETTINGS_FILE) return path.dirname(path.resolve(process.env.SETTINGS_FILE));
  if (process.env.DATA_FILE) return path.dirname(path.resolve(process.env.DATA_FILE));
  return path.resolve(here, '../data');
};

function resolveSecret() {
  const fromEnv = String(process.env.JWT_SECRET || '').trim();
  const production = process.env.NODE_ENV === 'production';

  if (fromEnv && !PLACEHOLDERS.has(fromEnv.toLowerCase())) {
    if (fromEnv.length < 32) {
      const message = 'JWT_SECRET is shorter than 32 characters. Use a long random value, e.g. `node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'hex\'))"`.';
      if (production) throw new Error(message);
      console.warn(`Warning: ${message}`);
    }
    return fromEnv;
  }

  if (fromEnv) {
    const message = 'JWT_SECRET is still the example value from .env.example. Set a real random secret.';
    if (production) throw new Error(message);
    console.warn(`Warning: ${message}`);
  }

  if (production) {
    throw new Error('JWT_SECRET must be set when NODE_ENV=production. Generate one with `node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'hex\'))"`.');
  }

  // Development: keep one random secret per data folder so logins survive a restart.
  const file = path.join(secretDir(), 'jwt-secret');
  try {
    const existing = fs.readFileSync(file, 'utf8').trim();
    if (existing.length >= 32) return existing;
  } catch { /* first run */ }
  const generated = crypto.randomBytes(48).toString('hex');
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, `${generated}\n`, { mode: 0o600 });
    console.warn(`Warning: JWT_SECRET is not set. Generated one at ${file}. Set JWT_SECRET before exposing this server to anyone.`);
  } catch (error) {
    console.warn(`Warning: JWT_SECRET is not set and ${file} could not be written (${error.message}). Sessions will end when the server restarts.`);
  }
  return generated;
}

export const JWT_SECRET = resolveSecret();
export const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

// ---------------------------------------------------------------- passwords
export const PASSWORD_RULES = [
  { test: (p) => p.length >= 8, message: 'at least 8 characters' },
  { test: (p) => /[a-z]/.test(p), message: 'a lowercase letter' },
  { test: (p) => /[A-Z]/.test(p), message: 'an uppercase letter' },
  { test: (p) => /[0-9]/.test(p), message: 'a digit' },
];

// Returns a message describing the first broken rule, or null when the password is fine.
export function validatePassword(password) {
  if (typeof password !== 'string') return 'Password must be text.';
  if (password.length > 72) return 'Password must be 72 characters or fewer.'; // bcrypt ignores anything past 72 bytes
  const missing = PASSWORD_RULES.filter((rule) => !rule.test(password)).map((rule) => rule.message);
  if (missing.length) return `Password needs ${missing.join(', ')}.`;
  return null;
}

// Cost 12 is a good default for a desktop/server app. Tests and constrained machines can
// lower it with BCRYPT_ROUNDS (4 is the minimum bcrypt allows).
const BCRYPT_ROUNDS = Math.min(15, Math.max(4, Number(process.env.BCRYPT_ROUNDS) || 12));

export const hashPassword = (password) => bcrypt.hash(String(password), BCRYPT_ROUNDS);
export const verifyPassword = (password, hash) => bcrypt.compare(String(password), String(hash));

// Compared against when the address is unknown, so a missing account and a wrong
// password take about the same time (and both answer the same way).
const DUMMY_HASH = bcrypt.hashSync('exam-studio-dummy-password', 10);
export const dummyCompare = (password) => bcrypt.compare(String(password), DUMMY_HASH);

// ---------------------------------------------------------------- tokens
export function generateToken(user) {
  const id = String(user.id || user._id);
  return jwt.sign(
    { sub: id, userId: id, email: user.email, role: user.role || 'student', tv: user.tokenVersion || 0 },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN, issuer: 'exam-studio' },
  );
}

export function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET, { issuer: 'exam-studio' });
  } catch (error) {
    if (error.name === 'TokenExpiredError') throw httpError(401, 'Your session has expired. Please sign in again.');
    throw httpError(401, 'Your session is not valid. Please sign in again.');
  }
}

const tokenFrom = (req) => {
  const header = req.headers?.authorization || '';
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  if (match) return match[1].trim();
  // Several tools send the raw token; accept that too.
  return header.trim() || '';
};

export const publicUser = (user) => ({ id: String(user.id || user._id), email: user.email, name: user.name, role: user.role || 'student', mustChangePassword: Boolean(user.mustChangePassword) });

async function userFromRequest(req) {
  const token = tokenFrom(req);
  if (!token) throw httpError(401, 'Please sign in to continue.');
  const decoded = verifyToken(token);
  const id = decoded.sub || decoded.userId;
  if (!id) throw httpError(401, 'Your session is not valid. Please sign in again.');
  const user = await repo.findUserById(id);
  if (!user) throw httpError(401, 'That account no longer exists.');
  if (user.active === false) throw httpError(403, 'This account is disabled. Contact your administrator.');
  const decodedTv = decoded.tv ?? 0;
  if ((user.tokenVersion || 0) !== decodedTv) throw httpError(401, 'Your session is no longer valid. Please sign in again.');
  return user;
}

// Required authentication. Storage failures answer 503 instead of being reported as a bad login.
export async function authenticateUser(req, _res, next) {
  try {
    const user = await userFromRequest(req);
    req.user = user;
    req.userId = user.id;
    next();
  } catch (error) {
    if (error.status) return next(error);
    next(httpError(503, `Sign-in could not be checked: ${error.message}`));
  }
}

// Optional authentication: sets req.user when a valid token is present, never fails.
export async function optionalAuthenticateUser(req, _res, next) {
  try {
    const user = await userFromRequest(req);
    req.user = user;
    req.userId = user.id;
  } catch { /* anonymous request */ }
  next();
}

export function requireAdmin(req, _res, next) {
  if (!req.user) return next(httpError(401, 'Please sign in to continue.'));
  if ((req.user.role || 'student') !== 'admin') return next(httpError(403, 'Administrator access required.'));
  next();
}
export function requireRole(...roles) {
  return (req, _res, next) => {
    if (!req.user) return next(httpError(401, 'Please sign in to continue.'));
    if (!roles.includes(req.user.role || 'student')) return next(httpError(403, 'You do not have permission for this action.'));
    next();
  };
}
export default {
  generateToken, verifyToken, authenticateUser, optionalAuthenticateUser,
  validatePassword, hashPassword, verifyPassword, publicUser, JWT_EXPIRES_IN,
  requireAdmin, requireRole,
};
