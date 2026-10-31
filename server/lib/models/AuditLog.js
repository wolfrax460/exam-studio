import mongoose from 'mongoose';

const auditLogSchema = new mongoose.Schema({
  actorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  actorEmail: { type: String },
  action: { type: String, required: true },
  targetType: { type: String },
  targetId: { type: String },
  before: { type: mongoose.Schema.Types.Mixed },
  after: { type: mongoose.Schema.Types.Mixed },
  ip: { type: String },
  createdAt: { type: Date, default: Date.now, index: true },
});

const AuditLog = mongoose.model('AuditLog', auditLogSchema);
export default AuditLog;
