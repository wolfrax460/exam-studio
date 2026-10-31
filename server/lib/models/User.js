import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

// A bcrypt hash, so a value that is already hashed is never hashed twice.
const BCRYPT = /^\$2[aby]?\$\d{2}\$[./A-Za-z0-9]{53}$/;

const userSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    trim: true,
    lowercase: true,
    maxlength: 254,
  },
  // Holds the bcrypt hash, never the password itself. The pre-save hook below is a safety
  // net for callers that hand over a plain password; lib/auth.js hashes explicitly.
  // select:false keeps the hash out of ordinary queries (use .select('+passwordHash')).
  passwordHash: {
    type: String,
    required: true,
    select: false,
  },
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 80,
  },
  role: {
    type: String,
    enum: ['admin', 'teacher', 'student'],
    default: 'student',
  },
  planId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Plan',
  },
  active: {
    type: Boolean,
    default: true,
  },
  mustChangePassword: {
    type: Boolean,
    default: false,
  },
  tokenVersion: {
    type: Number,
    default: 0,
  },
  overrides: {
    extraDailyRequests: { type: Number, default: 0 },
    extraDailyTokens: { type: Number, default: 0 },
    boostExpiry: { type: Date },
  },
  totpSecret: { type: String },
  totpEnabled: { type: Boolean, default: false },
  lastSignInAt: {
    type: Date,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

// One account per address.
userSchema.index({ email: 1 }, { unique: true });

// Compare a plain password with the stored hash.
userSchema.methods.comparePassword = function (candidatePassword) {
  return bcrypt.compare(String(candidatePassword), this.passwordHash);
};

// Hash a plain password on the way in. An already-hashed value is left alone so writing a
// hash explicitly never produces a double hash.
userSchema.pre('save', async function (next) {
  if (!this.isModified('passwordHash')) return next();
  if (BCRYPT.test(this.passwordHash || '')) return next();
  try {
    this.passwordHash = await bcrypt.hash(String(this.passwordHash), 12);
    next();
  } catch (error) {
    next(error);
  }
});

const User = mongoose.model('User', userSchema);
export default User;
