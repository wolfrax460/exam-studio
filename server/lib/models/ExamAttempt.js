import mongoose from 'mongoose';
import { ownershipSchemaFields } from '../ownership.js';

const schema = new mongoose.Schema({
  publicationId: { type: mongoose.Schema.Types.ObjectId, ref: 'ExamPublication', required: true, index: true },
  examId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  ownerId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  ...ownershipSchemaFields,
  userId: { type: mongoose.Schema.Types.ObjectId, default: null, index: true },
  participantName: { type: String, default: '', maxlength: 120 },
  ipHash: { type: String, default: '', index: false },
  seed: { type: String, default: '' },
  startedAt: { type: Date, required: true },
  deadlineAt: { type: Date, required: true },
  answers: { type: Object, default: {} },
  autosavedAt: { type: Date, default: null },
  submittedAt: { type: Date, default: null },
  status: { type: String, enum: ['in_progress', 'submitted', 'marked', 'marking_failed'], default: 'in_progress', index: true },
  score: { type: Object, default: {} },
  feedback: { type: Array, default: [] },
  focusLostCount: { type: Number, default: 0 },
}, { timestamps: true });

schema.index({ publicationId: 1, createdAt: -1 });
schema.index({ ownerType: 1, institutionId: 1, publicationId: 1 });
export default mongoose.models.ExamAttempt || mongoose.model('ExamAttempt', schema);
