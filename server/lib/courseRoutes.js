import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { readAcademicStructure } from './academicRepository.js';
import { findActiveStudentEnrollment } from './institutionPeopleRepository.js';
import { findInstitutionMembership, listInstitutionDirectory } from './workspaceRepository.js';
import { pageOptions, pageResult, parse } from './institutionHttp.js';
import { listCourses, readCourse, saveCourse } from './courseRepository.js';
import { httpError } from './errors.js';

const id = z.uuid();
const memberId = z.string().regex(/^(?:[a-f0-9]{24}|[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12})$/i);
const version = z.number().int().positive();
const status = z.enum(['draft', 'published', 'archived']);
const resources = z.array(z.string().trim().max(1000).url().refine((value) => {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password;
  } catch { return false; }
})).max(8).default([]);
const fields = {
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().max(3000).default(''),
  objectives: z.array(z.string().trim().min(1).max(250)).max(20).default([]),
  resources,
};
const courseFields = z.strictObject({
  ...fields, yearId: id, classId: id, subjectId: id, sectionId: id.nullable().default(null),
  teacherId: memberId.nullable().default(null), status: status.default('draft'),
});
const lessonFields = z.strictObject({
  ...fields, content: z.string().trim().min(1).max(24000), published: z.boolean().default(false),
});
const wrap = (fn) => (req, res, next) => fn(req, res).catch(next);
const notFound = () => httpError(404, 'Course not found.');
const find = (rows, id_) => rows.find((row) => row.id === id_);

function teachingGrants(academic, membershipId) {
  return [
    ...academic.classes.filter(({ teacherId }) => teacherId === membershipId).map(({ id: classId }) => ({ classId })),
    ...academic.assignments.filter(({ teacherId }) => teacherId === membershipId).map(({ classId, sectionId, subjectId }) => ({
      classId, subjectId, ...(sectionId && { sectionId }),
    })),
  ];
}

async function scopeFor(req) {
  const { institutionId, membership } = req.workspace;
  const academic = await readAcademicStructure(institutionId);
  const availableYears = academic.years.filter(({ archived }) => !archived).map(({ id: yearId }) => yearId);
  const admin = membership.role === 'admin';
  const teacher = membership.role === 'teacher';
  const grants = teacher ? teachingGrants(academic, membership.id) : [];
  const enrollment = membership.role === 'member' ? await findActiveStudentEnrollment(institutionId, membership.id) : null;
  const scope = { institutionId, membership, academic, availableYears, grants, admin, teacher };
  if (admin) return { ...scope, mongo: {}, allows: () => true };
  if (teacher) return {
    ...scope, mongo: { teacherId: membership.id, yearId: { $in: availableYears }, $or: grants },
    allows: (record) => record.teacherId === membership.id && availableYears.includes(record.yearId) &&
      grants.some((grant) => Object.entries(grant).every(([key, value]) => record[key] === value)),
  };
  const sections = [null, ...(enrollment?.sectionId ? [enrollment.sectionId] : [])];
  return {
    ...scope, mongo: { status: 'published', yearId: { $in: availableYears }, classId: enrollment?.classId, sectionId: { $in: sections } },
    empty: !enrollment?.classId,
    allows: (record) => Boolean(enrollment?.classId) && record.status === 'published' && availableYears.includes(record.yearId)
      && record.classId === enrollment.classId && sections.includes(record.sectionId ?? null),
  };
}

function view(record, scope, detail, teachers) {
  const { academic, admin, teacher } = scope;
  const lessons = admin || teacher ? record.lessons : record.lessons.filter(({ published }) => published);
  const { id: courseId, title, description, objectives, resources: links, yearId, classId, sectionId, subjectId, teacherId, status: state } = record;
  return {
    id: courseId, title, description, yearId, classId, sectionId, subjectId, teacherId, status: state,
    year: find(academic.years, yearId)?.name, classroom: find(academic.classes, classId)?.name,
    section: find(academic.sections, sectionId)?.name, subject: find(academic.subjects, subjectId)?.name,
    teacher: teachers.get(teacherId), lessonCount: lessons.length,
    ...(detail && { objectives, resources: links, lessons: lessons.map(({ createdBy, ...lesson }) =>
      admin || teacher ? { ...lesson, createdBy } : lesson) }),
    ...((admin || teacher) && { version: record.version }),
  };
}

async function teacherDirectory(institutionId) {
  const members = await listInstitutionDirectory(institutionId, { statuses: ['active'] }, false);
  return new Map(members.filter(({ role }) => role === 'teacher').map(({ id: teacherId, name }) => [teacherId, name]));
}

async function editable(req, expected) {
  const scope = await scopeFor(req);
  const record = await readCourse(scope.institutionId, req.params.id);
  if (!record || !scope.allows(record)) throw notFound();
  if (record.version !== expected) throw httpError(409, 'This course changed. Reopen it and try again.');
  return { scope, record };
}

async function validateCourse(scope, fields, old) {
  const { academic, institutionId, availableYears } = scope;
  const classroom = find(academic.classes, fields.classId);
  const validYear = availableYears.includes(fields.yearId) || (old?.yearId === fields.yearId && fields.status === 'archived');
  if (!classroom || classroom.yearId !== fields.yearId || !validYear ||
      !find(academic.subjects, fields.subjectId) ||
      (fields.sectionId && find(academic.sections, fields.sectionId)?.classId !== fields.classId)) {
    throw httpError(400, 'Select a compatible year, subject, class and section.');
  }
  if (scope.teacher) {
    fields.teacherId = scope.membership.id;
    if (!scope.allows(fields)) throw httpError(403, 'This course is outside your teaching assignments.');
  }
  if (scope.admin && fields.teacherId) {
    const assigned = await findInstitutionMembership(institutionId, fields.teacherId);
    if (assigned?.role !== 'teacher' || assigned.status !== 'active' ||
        !teachingGrants(academic, fields.teacherId).some((grant) => Object.entries(grant).every(([key, value]) => fields[key] === value))) {
      if (fields.status !== 'archived') throw httpError(400, 'Select a teacher assigned to this class and subject.');
    }
  }
}

export function courseRoutes(workspaceGuard) {
  const routes = Router();
  const staff = (req, _res, next) => req.workspace.membership.role === 'member'
    ? next(httpError(403, 'Institution staff access required.')) : next();

  routes.get('/', ...workspaceGuard, wrap(async (req, res) => {
    const query = parse(z.strictObject({ search: z.string().trim().max(100).default(''), status: status.optional(),
      subjectId: id.optional(), page: z.string().optional() }), req.query);
    const scope = await scopeFor(req);
    const page = pageOptions(query);
    const search = new RegExp(query.search.replace(/[.*+?^$\x7b\x7d()|[\]\\]/g, '\\$&'), 'i');
    const filter = { ...scope.mongo, ...(query.subjectId && { subjectId: query.subjectId }), ...(query.search && { title: search }) };
    if (query.status) filter.$and = [{ status: query.status }];
    const rows = scope.empty || (scope.teacher && !scope.grants.length) ? [] :
      await listCourses(scope.institutionId, filter, (row) => scope.allows(row) && search.test(row.title)
        && (!query.status || query.status === row.status) && (!query.subjectId || query.subjectId === row.subjectId), page);
    const teachers = rows.length || scope.admin || scope.teacher ? await teacherDirectory(scope.institutionId) : new Map();
    const { academic, admin, teacher } = scope;
    res.json({
      ...pageResult(rows, (row) => view(row, scope, false, teachers)), canManage: admin || teacher,
      subjects: admin || teacher ? academic.subjects : [],
      ...(admin || teacher ? {
        years: academic.years, classes: academic.classes, sections: academic.sections,
        teachers: [...teachers].map(([id_, name]) => ({ id: id_, name })),
      } : {}),
    });
  }));

  routes.get('/:id', ...workspaceGuard, wrap(async (req, res) => {
    const scope = await scopeFor(req);
    const record = await readCourse(scope.institutionId, req.params.id);
    if (!record || !scope.allows(record)) throw notFound();
    res.json(view(record, scope, true, await teacherDirectory(scope.institutionId)));
  }));
  routes.post('/', ...workspaceGuard, staff, wrap(async (req, res) => {
    const scope = await scopeFor(req);
    const fields = parse(courseFields, req.body);
    await validateCourse(scope, fields);
    res.status(201).json(await saveCourse(scope.institutionId, { ...fields, lessons: [] }));
  }));
  routes.put('/:id', ...workspaceGuard, staff, wrap(async (req, res) => {
    const { version: expected, course } = parse(z.strictObject({ version, course: courseFields }), req.body);
    const { scope, record } = await editable(req, expected);
    await validateCourse(scope, course, record);
    await saveCourse(scope.institutionId, { ...course, lessons: record.lessons }, record);
    res.json({ id: record.id });
  }));

  async function writeLesson(req, res, editing) {
    const { version: expected, lesson } = parse(z.strictObject({ version, lesson: lessonFields }), req.body);
    const { scope, record } = await editable(req, expected);
    if (record.status === 'archived') throw httpError(409, 'Restore this course before changing its lessons.');
    const existing = editing ? find(record.lessons, req.params.lessonId) : null;
    if (editing && !existing) throw httpError(404, 'Lesson not found.');
    if (!editing && record.lessons.length >= 60) throw httpError(409, 'This course has reached its lesson limit.');
    const next = { ...lesson, id: existing?.id || randomUUID(), createdBy: existing?.createdBy || scope.membership.id };
    const lessons = existing ? record.lessons.map((row) => row.id === existing.id ? next : row) : [...record.lessons, next];
    await saveCourse(scope.institutionId, { lessons }, record);
    res.status(editing ? 200 : 201).json({ id: next.id });
  }
  routes.post('/:id/lessons', ...workspaceGuard, staff, wrap((req, res) => writeLesson(req, res, false)));
  routes.put('/:id/lessons/:lessonId', ...workspaceGuard, staff, wrap((req, res) => writeLesson(req, res, true)));
  routes.put('/:id/lesson-order', ...workspaceGuard, staff, wrap(async (req, res) => {
    const { version: expected, lessonIds } = parse(z.strictObject({ version, lessonIds: z.array(id).max(60) }), req.body);
    const { scope, record } = await editable(req, expected);
    if (record.status === 'archived') throw httpError(409, 'Restore this course before changing its lessons.');
    const lessons = new Map(record.lessons.map((lesson) => [lesson.id, lesson]));
    if (lessonIds.length !== lessons.size || new Set(lessonIds).size !== lessons.size || lessonIds.some((key) => !lessons.has(key))) {
      throw httpError(400, 'Include each lesson exactly once.');
    }
    await saveCourse(scope.institutionId, { lessons: lessonIds.map((key) => lessons.get(key)) }, record);
    res.json({ id: record.id });
  }));
  return routes;
}
