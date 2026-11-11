import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import { InstitutionStaff, InstitutionStudent } from './models/InstitutionPeople.js';
import { canReadEnrollment } from './institutionPeoplePolicy.js';
import { getFileStore, initStorage, saveFileStore, storageMode } from './repository.js';
import { httpError } from './errors.js';

const students = () => getFileStore().institutionStudents;
const staff = () => getFileStore().institutionStaff;
const isMongo = () => storageMode() === 'mongo';
const directoryFields = 'name studentNumber classId sectionId status';
const mongoEnrollmentScope = (scope) => scope && { status: 'active', $or: scope };
const duplicateStudent = () => httpError(409, 'This student number or linked account is already in use.');
const changedRecord = () => httpError(409, 'This record changed. Refresh it and try again.');

function studentView(record, privateFields) {
  const { name, studentNumber, classId, sectionId, status } = record;
  return {
    id: String(record._id ?? record.id), name, studentNumber, classId, sectionId, status,
    ...(privateFields && {
      membershipId: record.membershipId ? String(record.membershipId) : null,
      guardianName: record.guardianName,
      guardianEmail: record.guardianEmail,
      guardianTelephone: record.guardianTelephone,
      history: record.history,
      version: record.version,
    }),
  };
}

export async function findActiveStudentEnrollment(institutionId, membershipId) {
  await initStorage();
  const match = { institutionId, membershipId, status: 'active' };
  return isMongo()
    ? InstitutionStudent.findOne(match).select('classId sectionId -_id').lean()
    : students().find((record) => record.institutionId === institutionId && record.membershipId === membershipId && record.status === 'active');
}

export async function listStudents(institutionId, { search, classId, status, offset, limit }, scope) {
  await initStorage();
  if (scope?.length === 0 || (scope && status && status !== 'active')) return [];
  const query = new RegExp(search.replace(/[.*+?^$\x7b\x7d()|[\]\\]/g, '\\$&'), 'i');
  if (isMongo()) {
    const filter = { institutionId, ...(classId && { classId }), ...(status && { status }), ...mongoEnrollmentScope(scope) };
    if (search) filter.$and = [{ $or: [{ name: query }, { studentNumber: query }] }];
    const rows = await InstitutionStudent.find(filter).select(directoryFields).sort({ name: 1, _id: 1 }).skip(offset).limit(limit).lean();
    return rows.map((row) => studentView(row, false));
  }
  return students().filter((row) => row.institutionId === institutionId && canReadEnrollment(row, scope) &&
    (!classId || row.classId === classId) && (!status || row.status === status) &&
    (!search || query.test(row.name) || query.test(row.studentNumber)))
    .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id))
    .slice(offset, offset + limit).map((row) => studentView(row, false));
}

export async function findStudent(institutionId, id, scope) {
  await initStorage();
  if (scope?.length === 0) return null;
  const record = isMongo()
    ? mongoose.isValidObjectId(id) && await InstitutionStudent.findOne({ institutionId, _id: id, ...mongoEnrollmentScope(scope) })
      .select(scope ? directoryFields : '').lean()
    : students().find((row) => row.institutionId === institutionId && row.id === id && canReadEnrollment(row, scope));
  return record ? studentView(record, !scope) : null;
}

function saveFileRecord(rows, index, record) {
  const previous = rows[index];
  rows[index] = record;
  try {
    saveFileStore();
  } catch (error) {
    if (previous) rows[index] = previous;
    else rows.pop();
    throw error;
  }
  return record;
}

export async function saveStudent(institutionId, fields, previous) {
  await initStorage();
  const { classId, sectionId, status } = fields;
  const enrollment = !previous || classId !== previous.classId || sectionId !== previous.sectionId || status !== previous.status
    ? { classId, sectionId, status, at: new Date().toISOString() } : null;
  const data = { ...fields, version: (previous?.version ?? 0) + 1 };
  if (isMongo()) {
    await InstitutionStudent.init();
    try {
      const record = previous
        ? await InstitutionStudent.findOneAndUpdate(
          { institutionId, _id: previous.id, version: previous.version },
          { $set: data, ...(enrollment && { $push: { history: enrollment } }) },
          { new: true, runValidators: true },
        ).lean()
        : await InstitutionStudent.create({ institutionId, ...data, history: [enrollment] });
      if (!record) throw changedRecord();
      return studentView(record, true);
    } catch (error) {
      if (error.code === 11000) throw duplicateStudent();
      throw error;
    }
  }
  const rows = students();
  const index = previous ? rows.findIndex((row) => row.institutionId === institutionId && row.id === previous.id) : rows.length;
  if (previous && rows[index]?.version !== previous.version) throw changedRecord();
  if (rows.some((row) => row.institutionId === institutionId && row.id !== previous?.id &&
    (row.studentNumber === fields.studentNumber || (fields.membershipId && row.membershipId === fields.membershipId)))) {
    throw duplicateStudent();
  }
  const history = [...(previous?.history || []), ...(enrollment ? [enrollment] : [])];
  return studentView(saveFileRecord(rows, index, { institutionId, id: previous?.id || randomUUID(), ...data, history }), true);
}

export async function countActiveStudentsByClass(institutionId, scope) {
  await initStorage();
  if (scope?.length === 0) return new Map();
  if (isMongo()) {
    const rows = await InstitutionStudent.aggregate([
      { $match: { institutionId: new mongoose.Types.ObjectId(institutionId), status: 'active', ...mongoEnrollmentScope(scope) } },
      { $group: { _id: '$classId', total: { $sum: 1 } } },
    ]);
    return new Map(rows.map(({ _id, total }) => [_id, total]));
  }
  const counts = new Map();
  for (const row of students()) {
    if (row.institutionId === institutionId && row.status === 'active' && canReadEnrollment(row, scope)) {
      counts.set(row.classId, (counts.get(row.classId) || 0) + 1);
    }
  }
  return counts;
}

function staffView({ membershipId, classification, title, version }) {
  return { membershipId: String(membershipId), classification, title, version };
}

export async function listStaffProfiles(institutionId) {
  await initStorage();
  const rows = isMongo()
    ? await InstitutionStaff.find({ institutionId }).lean()
    : staff().filter((record) => record.institutionId === institutionId);
  return rows.map(staffView);
}

export async function saveStaffProfile(institutionId, membershipId, { version, classification, title }) {
  await initStorage();
  const filter = { institutionId, membershipId };
  const record = { ...filter, classification, title, version: version + 1 };
  if (isMongo()) {
    await InstitutionStaff.init();
    try {
      const saved = await InstitutionStaff.findOneAndUpdate({ ...filter, version }, { $set: record },
        { new: true, upsert: version === 0, runValidators: true }).lean();
      if (!saved) throw changedRecord();
      return staffView(saved);
    } catch (error) {
      if (error.code === 11000) throw changedRecord();
      throw error;
    }
  }
  const rows = staff();
  const index = rows.findIndex((row) => row.institutionId === institutionId && row.membershipId === membershipId);
  if ((rows[index]?.version ?? 0) !== version) throw changedRecord();
  return staffView(saveFileRecord(rows, index === -1 ? rows.length : index, record));
}
