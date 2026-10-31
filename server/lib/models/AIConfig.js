import mongoose from 'mongoose';

const aiConfigSchema = new mongoose.Schema({
  provider: {
    type: String,
    required: true,
    enum: ['anthropic', 'deepseek', 'nvidia', 'ollama', 'ollama-cloud', 'custom', 'cli-claude', 'cli-codex', 'cli-opencode', 'cli-gemini'],
    default: 'nvidia',
  },
  model: {
    type: String,
    required: true,
    default: 'nvidia/nemotron-3.5-super-v1-120b-a12b',
  },
  baseUrl: {
    type: String,
    required: true,
    default: 'https://integrate.api.nvidia.com/v1',
  },
  // Fallback model when primary is unavailable
  fallbackModel: {
    type: String,
  },
  // Per-task settings
  temperature: {
    type: Number,
    default: 0.7,
  },
  maxTokens: {
    type: Map,
    of: Number,
    default: {},
  }, // e.g. { notes: 8000, cards: 6000, exam: 32000 }
  // Timeouts per task type (ms)
  timeouts: {
    type: Map,
    of: Number,
    default: {}, // e.g. { notes: 30000, cards: 18000, exam: 120000 }
  },
  // On/off switch
  enabled: {
    type: Boolean,
    default: true,
  },
  // API key stored encrypted at rest (write-only).
  apiKeyEncrypted: {
    type: String,
  },
  // Usage tracking
  dailyUsage: {
    type: Number,
    default: 0,
  },
  monthlyUsage: {
    type: Number,
    default: 0,
  },
  // Audit
  lastUsed: {
    type: Date,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
}, { timestamps: true });

const AIConfig = mongoose.model('AIConfig', aiConfigSchema);
export default AIConfig;