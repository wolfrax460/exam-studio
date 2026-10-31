import mongoose from 'mongoose';
import DailyUsage from './models/DailyUsage.js';

function envNumber(name, fallback) {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

export function dailyGenerationLimit() {
  return envNumber('DAILY_GENERATION_LIMIT', 10);
}

export function anonymousGenerationLimit() {
  return envNumber('DAILY_GENERATION_LIMIT_ANON', 3);
}

function kigaliDay() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Kigali', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()).replace(/\//g, '-');
}

export function resetsAtIso() {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Kigali', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()).split('/');
  const base = parts.length === 3 ? `${parts[2]}-${parts[1]}-${parts[0]}` : parts[0];
  const [y, m, d] = base.split('-').map(Number);
  const midnight = new Date(Date.UTC(y, m - 1, d + 1, -2, 0, 0)); // Africa/Kigali midnight is UTC+2
  return midnight.toISOString();
}

function ownModel(body) {
  return Boolean(body?.useOwnModel || (typeof body?.apiKey === 'string' && body.apiKey.trim()));
}

export function generationRateLimit(req, res, next) {
  if (mongoose.connection.readyState !== 1) return next();
  if (!/(^|\/)generate(\/|$)/.test(req.path) && !/(^|\/)generate(\/|$)/.test(req.originalUrl || '')) return next();
  if (ownModel(req.body)) return next();
  const ip = req.ip || req.socket?.remoteAddress || 'unknown';
  const userId = req.user?.id || req.user?._id;
  const key = userId ? `user:${userId}` : `ip:${ip}`;
  const limit = userId ? dailyGenerationLimit() : anonymousGenerationLimit();
  if (limit <= 0) return res.status(403).json({ error: 'anonymous_disabled', message: 'Please sign in to generate.' });
  const day = kigaliDay();
  DailyUsage.findOne({ key, day }).lean().then(async (doc) => {
    const used = doc?.count || 0;
    if (used >= limit) {
      const resetsAt = resetsAtIso();
      const retryAfter = Math.max(1, Math.ceil((new Date(resetsAt).getTime() - Date.now()) / 1000));
      res.set('Retry-After', String(retryAfter));
      return res.status(429).json({ error: 'daily_limit_reached', limit, used, resetsAt });
    }
    const originalJson = res.json.bind(res);
    res.json = (body) => {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        DailyUsage.updateOne({ key, day }, { $setOnInsert: { createdAt: new Date() }, $inc: { count: 1 } }, { upsert: true }).catch(() => {});
      }
      return originalJson(body);
    };
    return next();
  }).catch(() => next());
}
