import mongoose from 'mongoose';

const usageEventSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  planId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Plan',
  },
  taskType: {
    type: String,
    enum: ['notes', 'cards', 'exam', 'handout', 'export'],
    required: true,
  },
  // Token estimates from the provider
  estimatedTokens: {
    type: Number,
    default: 0,
  },
  // Actual token usage from the provider (when available)
  actualTokens: {
    type: Number,
  },
  success: {
    type: Boolean,
    default: true,
  },
  errorType: {
    type: String, // e.g. 'daily_limit', 'monthly_limit', 'source_too_large', 'model_unavailable'
  },
  // Timestamp
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

// Index for querying usage by user and time
usageEventSchema.index({ userId: 1, createdAt: -1 });
usageEventSchema.index({ taskType: 1, createdAt: -1 });

const UsageEvent = mongoose.model('UsageEvent', usageEventSchema);
export default UsageEvent;