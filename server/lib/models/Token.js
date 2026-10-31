import mongoose from 'mongoose';

const tokenSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  name: { type: String, required: true },
  tokenHash: { type: String, required: true, unique: true },
  scopes: { type: [String], default: ['read'] },
  expiresAt: { type: Date },
  revoked: { type: Boolean, default: false },
  lastUsedAt: { type: Date },
  createdAt: { type: Date, default: Date.now },
});

const Token = mongoose.model('Token', tokenSchema);
export default Token;
