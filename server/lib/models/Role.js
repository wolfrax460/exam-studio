import mongoose from 'mongoose';

const roleSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    unique: true,
    enum: ['admin', 'teacher', 'student'],
    default: 'student',
  },
  permissions: {
    type: Map,
    of: Boolean,
    default: {},
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

const Role = mongoose.model('Role', roleSchema);
export default Role;