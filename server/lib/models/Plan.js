import mongoose from 'mongoose';

const planSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    unique: true,
  },
  description: {
    type: String,
  },
  // Daily and monthly limits
  requestsPerDay: {
    type: Number,
    default: null, // null = unlimited
  },
  requestsPerMonth: {
    type: Number,
    default: null,
  },
  tokensPerDay: {
    type: Number,
    default: null,
  },
  tokensPerMonth: {
    type: Number,
    default: null,
  },
  // Feature access
  allowedFeatures: {
    type: [String],
    enum: ['study-notes', 'handout', 'exam', 'flashcards', 'export-pdf', 'export-word', 'api-access'],
    default: ['study-notes', 'handout', 'exam', 'flashcards'],
  },
  // Size limits
  maxSourceSize: {
    type: Number,
    default: 40000, // tokens
  },
  maxExamMarks: {
    type: Number,
    default: 100,
  },
  maxHandoutPages: {
    type: Number,
    default: 50,
  },
  maxFlashcardCount: {
    type: Number,
    default: 100,
  },
  // Whether user can add their own AI key
  allowOwnKey: {
    type: Boolean,
    default: false,
  },
  // Temporary boost overrides
  boostExpiry: {
    type: Date,
  },
  // Metadata
  createdAt: {
    type: Date,
    default: Date.now,
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
});

const Plan = mongoose.model('Plan', planSchema);
export default Plan;