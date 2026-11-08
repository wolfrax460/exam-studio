import mongoose from 'mongoose';
import { GROUP_MEMBER_ROLES } from '../workspaceValidation.js';

const groupMemberSchema = new mongoose.Schema({
  groupId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Group',
    required: true,
  },
  institutionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Institution',
    required: true,
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  role: {
    type: String,
    required: true,
    enum: GROUP_MEMBER_ROLES,
  },
});

// A user can appear in a group only once.
groupMemberSchema.index({ groupId: 1, userId: 1 }, { unique: true });
groupMemberSchema.index({ institutionId: 1, userId: 1 });
groupMemberSchema.index({ groupId: 1 });

const GroupMember = mongoose.models.GroupMember || mongoose.model('GroupMember', groupMemberSchema);
export default GroupMember;
