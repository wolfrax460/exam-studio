import mongoose from 'mongoose';

const groupSchema = new mongoose.Schema({
  institutionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Institution',
    required: true,
  },
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 120,
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  archived: {
    type: Boolean,
    default: false,
  },
});

groupSchema.index({ institutionId: 1, archived: 1, name: 1 });

const Group = mongoose.models.Group || mongoose.model('Group', groupSchema);
export default Group;
