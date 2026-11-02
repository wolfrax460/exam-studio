import mongoose from 'mongoose';

// Per-user 5-hour usage window for authenticated MCP (/mcp, /mcp/<token>) generations.
// Counters survive restarts via MongoDB and expire on their own (TTL) so old windows
// are cleaned up automatically.
const mcpQuotaSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  windowStart: { type: Date, required: true, index: true }, // start of the current 5h window
  count: { type: Number, default: 0 },                      // generations in the current window
}, { timestamps: true, expires: 7 * 24 * 60 * 60 });

mcpQuotaSchema.index({ userId: 1, windowStart: 1 }, { unique: true });

const McpQuota = mongoose.model('McpQuota', mcpQuotaSchema);
export default McpQuota;
