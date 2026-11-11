import mongoose from 'mongoose';

export const studentStatuses = ['active', 'withdrawn', 'graduated'];
export const staffClassifications = ['teaching', 'administration', 'operations', 'support'];

const { ObjectId } = mongoose.Schema.Types;
const institutionId = { type: ObjectId, ref: 'Institution', required: true };
const membershipId = { type: ObjectId, ref: 'Membership' };
const version = { type: Number, required: true, min: 1 };
const enrollment = {
  classId: { type: String, default: null },
  sectionId: { type: String, default: null },
  status: { type: String, enum: studentStatuses, required: true },
};
const historyEntry = new mongoose.Schema({ ...enrollment, at: { type: Date, required: true } }, { _id: false });
const studentSchema = new mongoose.Schema({
  institutionId,
  version,
  name: { type: String, required: true, maxlength: 160 },
  studentNumber: { type: String, required: true, maxlength: 40 },
  membershipId,
  ...enrollment,
  guardianName: { type: String, maxlength: 160 },
  guardianEmail: { type: String, maxlength: 254 },
  guardianTelephone: { type: String, maxlength: 40 },
  history: [historyEntry],
}, { versionKey: false });
studentSchema.index({ institutionId: 1, studentNumber: 1 }, { unique: true });
studentSchema.index({ institutionId: 1, membershipId: 1 }, {
  unique: true, partialFilterExpression: { membershipId: { $type: 'objectId' } },
});
studentSchema.index({ institutionId: 1, status: 1, classId: 1, sectionId: 1 });
studentSchema.index({ institutionId: 1, name: 1, _id: 1 });

const staffSchema = new mongoose.Schema({
  institutionId,
  membershipId: { ...membershipId, required: true },
  version,
  classification: { type: String, enum: staffClassifications, required: true },
  title: { type: String, maxlength: 100 },
}, { versionKey: false });
staffSchema.index({ institutionId: 1, membershipId: 1 }, { unique: true });

export const InstitutionStudent = mongoose.models.InstitutionStudent || mongoose.model('InstitutionStudent', studentSchema);
export const InstitutionStaff = mongoose.models.InstitutionStaff || mongoose.model('InstitutionStaff', staffSchema);
