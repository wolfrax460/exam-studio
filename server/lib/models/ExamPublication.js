import mongoose from 'mongoose';
import { ownershipSchemaFields } from '../ownership.js';

const schema = new mongoose.Schema({
  examId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  ownerId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  ...ownershipSchemaFields,
  shareCode: { type: String, required: true, unique: true, index: true },
  title: { type: String, required: true },
  instructions: { type: String, default: '' },
  durationMinutes: { type: Number, default: 60, min: 1 },
  opensAt: { type: Date, default: null },
  closesAt: { type: Date, default: null },
  maxAttempts: { type: Number, default: 1, min: 0 },
  requireName: { type: Boolean, default: true },
  showResultsMode: { type: String, enum: ['immediately', 'after_close', 'never'], default: 'immediately' },
  shuffleQuestions: { type: Boolean, default: false },
  shuffleOptions: { type: Boolean, default: false },
  active: { type: Boolean, default: true },
  maxAttemptsPerDay: { type: Number, default: 200, min: 0 },
}, { timestamps: true });

schema.index({ ownerType: 1, institutionId: 1, active: 1 });

export default mongoose.models.ExamPublication || mongoose.model('ExamPublication', schema);
