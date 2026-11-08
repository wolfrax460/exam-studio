import mongoose from 'mongoose';
import {
  INSTITUTION_TYPES,
  INSTITUTION_STATUSES,
} from '../workspaceValidation.js';

const institutionSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 160,
  },
  slug: {
    type: String,
    required: true,
    trim: true,
    lowercase: true,
    maxlength: 120,
    unique: true,
  },
  type: {
    type: String,
    required: true,
    enum: INSTITUTION_TYPES,
  },
  status: {
    type: String,
    enum: INSTITUTION_STATUSES,
    default: 'pending',
    index: true,
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  aiDailyLimit: {
    type: Number,
    default: null,
    validate: {
      validator: (value) => value === null || value === undefined || (Number.isInteger(value) && value >= 0),
      message: 'aiDailyLimit must be a non-negative integer or null',
    },
  },
  createdAt: {
    type: Date,
    default: Date.now,
    index: true,
  },
});

institutionSchema.index({ status: 1, type: 1 });

const Institution = mongoose.models.Institution || mongoose.model('Institution', institutionSchema);
export default Institution;
