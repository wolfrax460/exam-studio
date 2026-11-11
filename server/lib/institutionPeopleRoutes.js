import { Router } from 'express';
import { z } from 'zod';
import { readAcademicStructure } from './academicRepository.js';
import { httpError } from './errors.js';
import { pageOptions, pageResult, parse } from './institutionHttp.js';
import { teacherEnrollmentScope } from './institutionPeoplePolicy.js';
import {
  countActiveStudentsByClass, findStudent, listStaffProfiles, listStudents, saveStaffProfile, saveStudent,
} from './institutionPeopleRepository.js';
import { staffClassifications, studentStatuses } from './models/InstitutionPeople.js';
import { findInstitutionMembership, listInstitutionDirectory } from './workspaceRepository.js';

const membershipId = z.string().regex(/^(?:[a-f0-9]{24}|[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12})$/i).toLowerCase();
const status = z.enum(studentStatuses);
const version = z.number().int().nonnegative();
const search = z.string().trim().max(100).default('');
const student = z.strictObject({
  name: z.string().trim().min(1).max(160),
  studentNumber: z.string().trim().min(1).max(40).regex(/^[a-z0-9][a-z0-9._/-]*$/i).toUpperCase(),
  membershipId: membershipId.nullable().default(null),
  classId: z.uuid().nullable().default(null),
  sectionId: z.uuid().nullable().default(null),
  status: status.default('active'),
  guardianName: z.string().trim().max(160).default(''),
  guardianEmail: z.string().trim().max(254).pipe(z.union([z.literal(''), z.email()])).default(''),
  guardianTelephone: z.string().trim().max(40).regex(/^[0-9+(). /-]*$/).default(''),
});
const studentFilters = z.strictObject({ search, classId: z.uuid().optional(), status: status.optional(), page: z.string().optional() });
const staffProfile = z.strictObject({
  version, classification: z.enum(staffClassifications), title: z.string().trim().max(100).default(''),
});
const wrap = (fn) => (req, res, next) => fn(req, res).catch(next);

function requireStaff(req, _res, next) {
  if (req.workspace.membership.role === 'member') return next(httpError(403, 'Institution staff access required.'));
  return next();
}

function enrollmentOptions(academic, scope) {
  const years = new Map(academic.years.map((year) => [year.id, year]));
  const classes = academic.classes.filter(({ id }) => !scope || scope.some(({ classId }) => classId === id))
    .map(({ id, name, yearId }) => ({ id, name, year: years.get(yearId)?.name, archived: Boolean(years.get(yearId)?.archived) }));
  const sections = academic.sections.filter(({ id, classId }) => !scope || scope.some((grant) =>
    grant.classId === classId && (!grant.sectionId || grant.sectionId === id)));
  return { classes, sections };
}

const studentScope = (academic, membership) => membership.role === 'teacher' ? teacherEnrollmentScope(academic, membership.id) : null;

export async function workspaceDashboard(institutionId, membership, academic) {
  const scope = studentScope(academic, membership);
  const counts = await countActiveStudentsByClass(institutionId, scope);
  const { classes } = enrollmentOptions(academic, scope);
  const openClasses = classes.filter(({ archived }) => !archived);
  const subjects = scope ? new Set(academic.assignments.filter(({ teacherId, classId }) =>
    teacherId === membership.id && openClasses.some(({ id }) => classId === id)).map(({ subjectId }) => subjectId)).size
    : academic.subjects.length;
  return {
    students: [...counts.values()].reduce((total, count) => total + count, 0),
    classes: openClasses.length,
    subjects,
    enrollment: openClasses.map(({ id, name, year }) => ({ id, name, year, students: counts.get(id) ?? 0 })),
  };
}

async function validateStudent(institutionId, record, previous) {
  if (record.membershipId && record.membershipId !== previous?.membershipId) {
    const linked = await findInstitutionMembership(institutionId, record.membershipId);
    if (linked?.role !== 'member' || linked.status !== 'active') throw httpError(400, 'Select an active member of this institution.');
  }
  if (previous && record.classId === previous.classId && record.sectionId === previous.sectionId &&
    (record.status !== 'active' || previous.status === 'active')) return;
  if (record.classId) {
    const academic = await readAcademicStructure(institutionId);
    const selected = academic.classes.find(({ id }) => id === record.classId);
    if (!selected || !academic.years.some(({ id, archived }) => id === selected.yearId && !archived)) {
      throw httpError(400, 'Select a class in an available academic year.');
    }
    if (!record.sectionId || academic.sections.some(({ id, classId }) => id === record.sectionId && classId === record.classId)) return;
  }
  if (record.sectionId) throw httpError(400, 'Select a section in this class.');
}

function searchMembers(rows, query) {
  const key = query.toLowerCase();
  return rows.filter(({ name, email }) => !key || name.toLowerCase().includes(key) || email?.toLowerCase().includes(key));
}

export function institutionPeopleRoutes(workspaceGuard, adminGuard) {
  const routes = Router();
  const staffGuard = [...workspaceGuard, requireStaff];

  routes.get('/students', ...staffGuard, wrap(async (req, res) => {
    const { institutionId, membership } = req.workspace;
    const query = parse(studentFilters, req.query);
    const academic = await readAcademicStructure(institutionId);
    const scope = studentScope(academic, membership);
    const rows = await listStudents(institutionId, { ...query, ...pageOptions(query) }, scope);
    res.json({ ...pageResult(rows), ...enrollmentOptions(academic, scope) });
  }));

  routes.get('/students/:id', ...staffGuard, wrap(async (req, res) => {
    const { institutionId, membership } = req.workspace;
    const scope = membership.role === 'teacher' ? studentScope(await readAcademicStructure(institutionId), membership) : null;
    const record = await findStudent(institutionId, req.params.id, scope);
    if (!record) throw httpError(404, 'Student not found.');
    res.json(record);
  }));

  routes.post('/students', ...adminGuard, wrap(async (req, res) => {
    const { institutionId } = req.workspace;
    const record = parse(student, req.body);
    await validateStudent(institutionId, record);
    res.status(201).json(await saveStudent(institutionId, record));
  }));

  routes.put('/students/:id', ...adminGuard, wrap(async (req, res) => {
    const { institutionId } = req.workspace;
    const { version: expected, record } = parse(z.strictObject({ version, record: student }), req.body);
    const previous = await findStudent(institutionId, req.params.id, null);
    if (!previous) throw httpError(404, 'Student not found.');
    if (previous.version !== expected) throw httpError(409, 'This record changed. Refresh it and try again.');
    await validateStudent(institutionId, record, previous);
    res.json(await saveStudent(institutionId, record, previous));
  }));

  routes.get('/student-accounts', ...adminGuard, wrap(async (req, res) => {
    const query = parse(z.strictObject({ search: search.pipe(z.string().min(2)) }), req.query);
    const directory = await listInstitutionDirectory(req.workspace.institutionId, { statuses: ['active'] }, true);
    const rows = searchMembers(directory.filter(({ role }) => role === 'member'), query.search);
    res.json(pageResult(rows, ({ id, name, email }) => ({ id, name, email })));
  }));

  routes.get('/staff', ...staffGuard, wrap(async (req, res) => {
    const { institutionId, membership } = req.workspace;
    const query = parse(z.strictObject({ kind: z.enum(['teachers', 'staff']), search, page: z.string().optional() }), req.query);
    const isAdmin = membership.role === 'admin';
    if (query.kind === 'staff' && !isAdmin) throw httpError(403, 'Institution administrator access required.');
    const [directory, profiles, academic] = await Promise.all([
      listInstitutionDirectory(institutionId, { statuses: isAdmin ? ['active', 'suspended'] : ['active'] }, isAdmin),
      listStaffProfiles(institutionId),
      readAcademicStructure(institutionId),
    ]);
    const byMembership = new Map(profiles.map((profile) => [profile.membershipId, profile]));
    const eligible = directory.filter(({ id, role }) => query.kind === 'teachers'
      ? role === 'teacher' : role === 'admin' || (role === 'member' && byMembership.has(id)));
    const { offset, limit } = pageOptions(query);
    const rows = searchMembers(eligible, query.search).sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
    const classes = new Map(academic.classes.map(({ id, name }) => [id, name]));
    const subjects = new Map(academic.subjects.map(({ id, name }) => [id, name]));
    res.json(pageResult(rows.slice(offset, offset + limit), ({ id, name, email, role, status: membershipStatus }) => {
      const profile = byMembership.get(id);
      const teaching = academic.assignments.filter(({ teacherId }) => teacherId === id);
      const assignedClasses = new Set(academic.classes.filter(({ teacherId }) => teacherId === id).map(({ id: classId }) => classId));
      for (const { classId } of teaching) assignedClasses.add(classId);
      return {
        id, name, email, role, status: membershipStatus,
        classification: profile?.classification ?? null, title: profile?.title ?? '',
        ...(isAdmin && { version: profile?.version ?? 0 }),
        classes: [...assignedClasses].map((classId) => classes.get(classId)).filter(Boolean),
        subjects: [...new Set(teaching.map(({ subjectId }) => subjects.get(subjectId)).filter(Boolean))],
      };
    }));
  }));

  routes.get('/staff/:id', ...adminGuard, wrap(async (req, res) => {
    const { institutionId } = req.workspace;
    const member = await findInstitutionMembership(institutionId, req.params.id);
    if (!member || !['active', 'suspended'].includes(member.status)) throw httpError(404, 'Staff membership not found.');
    const profile = (await listStaffProfiles(institutionId)).find((item) => item.membershipId === member.id);
    res.json(profile ?? { membershipId: member.id, version: 0, classification: member.role === 'teacher' ? 'teaching' : 'administration', title: '' });
  }));

  routes.put('/staff/:id', ...adminGuard, wrap(async (req, res) => {
    const { institutionId } = req.workspace;
    const member = await findInstitutionMembership(institutionId, req.params.id);
    if (!member || !['active', 'suspended'].includes(member.status)) throw httpError(404, 'Staff membership not found.');
    res.json(await saveStaffProfile(institutionId, member.id, parse(staffProfile, req.body)));
  }));

  return routes;
}
