import mongoose from 'mongoose';
import { validateAssignmentShape } from '../workspaceValidation.js';

const assignmentSchema = new mongoose.Schema({
  institutionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Institution',
    required: true,
  },
  publicationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ExamPublication',
    required: true,
  },
  groupId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Group',
    default: null,
  },
  userIds: {
    type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    default: [],
  },
  opensAt: {
    type: Date,
    required: true,
  },
  dueAt: {
    type: Date,
    required: true,
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
});

assignmentSchema.index({ institutionId: 1, dueAt: 1 });
assignmentSchema.index({ groupId: 1 });
assignmentSchema.index({ userIds: 1 });
assignmentSchema.index({ publicationId: 1 });

// Enforce "a group OR a non-empty list of users" and a sensible date window before
// Mongoose runs its normal field validators.
assignmentSchema.pre('validate', function validateTarget(next) {
  try {
    validateAssignmentShape({
      groupId: this.groupId,
      userIds: this.userIds,
      opensAt: this.opensAt,
      dueAt: this.dueAt,
    });
    next();
  } catch (error) {
    next(error);
  }
});

const Assignment = mongoose.models.Assignment || mongoose.model('Assignment', assignmentSchema);
export default Assignment;
