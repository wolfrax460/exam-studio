import mongoose from 'mongoose';

// Anonymous usage counters for the public, no-auth MCP endpoint. IPs are stored as a
// SHA-256 hash (with a server secret) so raw addresses never touch the database. Counters
// carry a TTL so they expire on their own and survive service restarts when MongoDB is used.
const publicQuotaSchema = new mongoose.Schema({
  key: { type: String, required: true, index: true }, // 'ip:<sha256>' or 'global:day'
  day: { type: String, required: true, index: true }, // Africa/Kigali date, counters reset at midnight
  generations: { type: Number, default: 0 },          // generations performed today
  burst: { type: Number, default: 0 },                // generations in the current burst window
  burstWindow: { type: Date },                        // start of the current 20s burst window
  requests: { type: Number, default: 0 },             // non-generation requests this minute
  requestsWindow: { type: Date },                     // start of the current 1-minute window
  sessions: { type: Number, default: 0 },             // currently open sessions (decremented on close)
  sessionsWindow: { type: Date },                     // start of the current session window
}, { timestamps: true, expires: 7 * 24 * 60 * 60 });

publicQuotaSchema.index({ key: 1, day: 1 }, { unique: true });

const PublicQuota = mongoose.model('PublicQuota', publicQuotaSchema);
export default PublicQuota;
