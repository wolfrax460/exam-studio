import mongoose from 'mongoose';

const requiredString = { type: String, required: true };
const dateRange = { startsOn: requiredString, endsOn: requiredString };
const namedRecord = { name: requiredString };
const record = (fields) => new mongoose.Schema({ id: requiredString, ...fields }, { _id: false, id: false });

const schema = new mongoose.Schema({
  institutionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Institution', required: true, unique: true },
  version: { type: Number, required: true },
  activeYearId: { type: String, default: null },
  activeTermId: { type: String, default: null },
  years: [record({ ...namedRecord, ...dateRange, archived: Boolean })],
  terms: [record({ ...namedRecord, ...dateRange, yearId: requiredString })],
  classes: [record({ ...namedRecord, yearId: requiredString, teacherId: String })],
  sections: [record({ ...namedRecord, classId: requiredString })],
  subjects: [record({ ...namedRecord, code: requiredString })],
  assignments: [record({ classId: requiredString, sectionId: String, subjectId: requiredString, teacherId: requiredString })],
}, { versionKey: false });

export default mongoose.models.AcademicStructure || mongoose.model('AcademicStructure', schema);
