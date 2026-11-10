import mongoose from 'mongoose';
import {
  MEMBERSHIP_ROLES,
  MEMBERSHIP_STATUSES,
} from '../workspaceValidation.js';

const membershipSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  institutionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Institution',
    required: true,
  },
  role: {
    type: String,
    required: true,
    enum: MEMBERSHIP_ROLES,
  },
  status: {
    type: String,
    enum: MEMBERSHIP_STATUSES,
    default: 'invited',
  },
  invitedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
  },
  invitedEmail: {
    type: String,
    trim: true,
    lowercase: true,
    maxlength: 254,
    default: '',
    validate: {
      validator: (value) => !value || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value),
      message: 'invitedEmail must be a valid email address',
    },
  },
  createdAt: {
    type: Date,
    default: Date.now,
    index: true,
  },
  acceptedAt: {
    type: Date,
    default: null,
  },
  inviteHash: { type: String, select: false },
  inviteExpiresAt: Date,
});

// One membership per person per institution. A removed member can be reactivated on this row.
membershipSchema.index({ userId: 1, institutionId: 1 }, { unique: true });
membershipSchema.index({ userId: 1, status: 1 });
membershipSchema.index({ institutionId: 1, role: 1, status: 1 });

const Membership = mongoose.models.Membership || mongoose.model('Membership', membershipSchema);
export default Membership;
