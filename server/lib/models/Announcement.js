import mongoose from 'mongoose';

const announcementSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    maxlength: 200,
  },
  message: {
    type: String,
    required: true,
    maxlength: 2000,
  },
  // Start and end dates for showing the announcement
  startDate: {
    type: Date,
    required: true,
  },
  endDate: {
    type: Date,
    required: true,
  },
  // Active status (admin can disable without deleting)
  active: {
    type: Boolean,
    default: true,
  },
  // Priority (higher = more prominent)
  priority: {
    type: Number,
    default: 0,
  },
  // Target audience
  targetRoles: {
    type: [String],
    enum: ['admin', 'teacher', 'student'],
    default: ['admin', 'teacher', 'student'],
  },
  // Metadata
  createdAt: {
    type: Date,
    default: Date.now,
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
});

// Index for querying active announcements
announcementSchema.index({ active: 1, startDate: 1, endDate: 1 });

const Announcement = mongoose.model('Announcement', announcementSchema);
export default Announcement;