import mongoose from 'mongoose';

const { Schema } = mongoose;
const lesson = new Schema({
  id: { type: String, required: true },
  title: { type: String, required: true },
  description: String,
  objectives: [String],
  content: String,
  resources: [String],
  published: Boolean,
  createdBy: { type: String, required: true },
}, { _id: false });
const schema = new Schema({
  id: { type: String, required: true },
  institutionId: { type: Schema.Types.ObjectId, ref: 'Institution', required: true },
  version: { type: Number, required: true },
  title: { type: String, required: true },
  description: String,
  objectives: [String],
  resources: [String],
  yearId: { type: String, required: true },
  subjectId: { type: String, required: true },
  classId: { type: String, required: true },
  sectionId: { type: String, default: null },
  teacherId: { type: String, default: null },
  status: { type: String, enum: ['draft', 'published', 'archived'], required: true },
  lessons: [lesson],
}, { versionKey: false, id: false });
schema.index({ institutionId: 1, id: 1 }, { unique: true });
schema.index({ institutionId: 1, status: 1, classId: 1, sectionId: 1, title: 1 });
schema.index({ institutionId: 1, teacherId: 1, title: 1 });

export default mongoose.models.InstitutionCourse || mongoose.model('InstitutionCourse', schema);
