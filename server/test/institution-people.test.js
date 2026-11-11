import assert from 'node:assert/strict';
import { after, before, it } from 'node:test';
import { bootApi, makeUser } from './helpers.js';
import { canReadEnrollment, teacherEnrollmentScope } from '../lib/institutionPeoplePolicy.js';

let api;
let admin;
let otherAdmin;
let teacher;
let member;
let institution;
let otherInstitution;
let teacherMembership;
let memberMembership;
let foreignMembership;
let classId;
let sectionId;
let otherSectionId;

const userId = (account) => account.response.body.user.id;

async function request(suffix, { actor = admin, tenant = institution, method = 'GET', body } = {}) {
  const response = await fetch(`${api.base}/api/institutions/${suffix}`, {
    method,
    headers: {
      ...(actor && { Authorization: `Bearer ${actor.token}` }),
      ...(tenant && { 'X-Institution-Id': tenant.id }),
      ...(body && { 'Content-Type': 'application/json' }),
    },
    body: body && JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
}

before(async () => {
  api = await bootApi({
    EXAM_STUDIO_INSTITUTIONS_ENABLED: 'true',
    ...(process.env.TASK023_TEST_FILE_MODE === '1' && { MONGODB_URI: 'mongodb://127.0.0.1:59999' }),
  });
  const repo = await import('../lib/workspaceRepository.js');
  [admin, otherAdmin, teacher, member] = await Promise.all(
    ['School owner', 'Other owner', 'Algebra teacher', 'Student account'].map((name) => makeUser(api.base, { name })),
  );
  const create = (owner, name, slug) => repo.createInstitution({ name, slug, type: 'school', status: 'active', createdBy: userId(owner) });
  institution = await create(admin, 'People Academy', 'people-academy');
  otherInstitution = await create(otherAdmin, 'Other Academy', 'other-academy');
  const enroll = (actor, tenant, role) => repo.createMembership({ userId: userId(actor), institutionId: tenant.id, role, status: 'active' });
  await enroll(admin, institution, 'admin');
  await enroll(otherAdmin, otherInstitution, 'admin');
  teacherMembership = await enroll(teacher, institution, 'teacher');
  memberMembership = await enroll(member, institution, 'member');
  foreignMembership = await enroll(member, otherInstitution, 'member');
  let version = 0;
  async function academic(kind, record) {
    const result = await request(`academics/${kind}`, { method: 'POST', body: { version, record } });
    assert.equal(result.status, 201);
    version = result.body.version;
    return result.body.record.id;
  }
  const yearId = await academic('years', { name: '2026–2027', startsOn: '2026-09-01', endsOn: '2027-07-31' });
  classId = await academic('classes', { name: 'Year One', yearId });
  sectionId = await academic('sections', { name: 'A', classId });
  otherSectionId = await academic('sections', { name: 'B', classId });
  const subjectId = await academic('subjects', { name: 'Algebra', code: 'ALG' });
  await academic('assignments', { classId, sectionId, subjectId, teacherId: teacherMembership.id });
});

after(async () => api?.close());

it('derives teacher roster access from class and section assignments in available years', () => {
  const academic = {
    years: [{ id: 'year' }, { id: 'old', archived: true }],
    classes: [{ id: 'c1', yearId: 'year' }, { id: 'c2', yearId: 'year', teacherId: 't1' }, { id: 'c3', yearId: 'old', teacherId: 't1' }],
    assignments: [{ classId: 'c1', sectionId: 's1', teacherId: 't1' }, { classId: 'c1', sectionId: 's2', teacherId: 't2' }],
  };
  const scope = teacherEnrollmentScope(academic, 't1');
  assert.deepEqual(scope, [{ classId: 'c2' }, { classId: 'c1', sectionId: 's1' }]);
  assert.equal(canReadEnrollment({ classId: 'c1', sectionId: 's2', status: 'active' }, scope), false);
  assert.equal(canReadEnrollment({ classId: 'c2', status: 'withdrawn' }, scope), false);
  assert.equal(canReadEnrollment({ classId: 'c2', status: 'active' }, scope), true);
});

it('validates enrollment, scopes student access, and records academic history with concurrent edits', async () => {
  const data = {
    name: 'Jane (Example)', studentNumber: 'ac-101', membershipId: memberMembership.id, classId, sectionId,
    guardianName: 'Example Guardian', guardianEmail: 'guardian@example.com', guardianTelephone: '+250 000 000',
  };
  const create = (body, options) => request('people/students', { ...options, method: 'POST', body });
  assert.equal((await create(data, { actor: null })).status, 401);
  assert.equal((await create(data, { actor: teacher })).status, 403);
  assert.equal((await create({ ...data, institutionId: otherInstitution.id })).status, 400);
  assert.equal((await create({ ...data, membershipId: foreignMembership.id })).status, 400);
  assert.equal((await create({ ...data, classId: null })).status, 400);
  const added = await create(data);
  assert.equal(added.status, 201, JSON.stringify(added.body));
  const student = added.body;
  assert.equal(student.studentNumber, 'AC-101');
  assert.equal(student.version, 1);
  assert.equal(student.history.length, 1);
  assert.equal((await create({ ...data, membershipId: null })).status, 409);
  assert.equal((await create({ ...data, studentNumber: 'AC-102' })).status, 409);
  const elsewhere = await create({ ...data, studentNumber: 'AC-103', name: 'Other section', membershipId: null, sectionId: otherSectionId });
  assert.equal(elsewhere.status, 201);
  const roster = await request('people/students?search=%28Example%29', { actor: teacher });
  assert.deepEqual(roster.body.items.map(({ id }) => id), [student.id]);
  assert.equal(roster.body.sections.some(({ id }) => id === otherSectionId), false);
  const allowed = await request(`people/students/${student.id}`, { actor: teacher });
  assert.equal(allowed.status, 200);
  assert.equal('guardianEmail' in allowed.body, false);
  assert.equal('membershipId' in allowed.body, false);
  assert.equal('history' in allowed.body, false);
  assert.equal((await request(`people/students/${elsewhere.body.id}`, { actor: teacher })).status, 404);
  assert.equal((await request(`people/students/${student.id}`, { actor: member })).status, 403);
  assert.equal((await request(`people/students/${student.id}`, { actor: otherAdmin })).status, 404);
  assert.equal((await request(`people/students/${student.id}`, { actor: otherAdmin, tenant: otherInstitution })).status, 404);
  assert.deepEqual((await request('people/students', { actor: otherAdmin, tenant: otherInstitution })).body.items, []);
  const adminDashboard = await request('workspace/overview');
  assert.equal(adminDashboard.body.dashboard.students, 2);
  assert.equal(adminDashboard.body.dashboard.enrollment[0].students, 2);
  assert.equal((await request('workspace/overview', { actor: teacher })).body.dashboard.students, 1);
  assert.equal((await request('workspace/overview', { actor: member })).body.dashboard, null);
  const change = () => request(`people/students/${student.id}`, {
    method: 'PUT', body: { version: 1, record: { ...data, sectionId: otherSectionId } },
  });
  const revisions = await Promise.all([change(), change()]);
  assert.deepEqual(revisions.map(({ status }) => status).sort(), [200, 409]);
  const changed = revisions.find(({ status }) => status === 200).body;
  assert.equal(changed.guardianEmail, 'guardian@example.com');
  assert.deepEqual(changed.history.map((entry) => entry.sectionId), [sectionId, otherSectionId]);
  assert.equal((await request(`people/students/${student.id}`, { actor: teacher })).status, 404);
});

it('maintains staff profiles on existing memberships without expanding permissions', async () => {
  const staffPath = `people/staff/${teacherMembership.id}`;
  const payload = { version: 0, classification: 'teaching', title: 'Algebra instructor' };
  const write = (options) => request(staffPath, { method: 'PUT', body: payload, ...options });
  assert.equal((await write({ actor: teacher })).status, 403);
  assert.equal((await write({ actor: otherAdmin, tenant: otherInstitution })).status, 404);
  assert.equal((await write({ body: { ...payload, role: 'admin' } })).status, 400);
  assert.equal((await write()).status, 200);
  assert.equal((await write()).status, 409);
  const teachers = await request('people/staff?kind=teachers', { actor: teacher });
  assert.equal(teachers.body.items[0].title, 'Algebra instructor');
  assert.deepEqual(teachers.body.items[0].classes, ['Year One']);
  assert.deepEqual(teachers.body.items[0].subjects, ['Algebra']);
  assert.equal('email' in teachers.body.items[0], false);
  assert.equal((await request('people/staff?kind=staff', { actor: teacher })).status, 403);
  const profile = await request(`people/staff/${memberMembership.id}`, {
    method: 'PUT', body: { version: 0, classification: 'support', title: 'Library assistant' },
  });
  assert.equal(profile.status, 200);
  const staff = await request('people/staff?kind=staff');
  const assistant = staff.body.items.find(({ id }) => id === memberMembership.id);
  assert.equal(assistant.role, 'member');
  assert.equal(assistant.status, 'active');
  assert.equal(assistant.title, 'Library assistant');
  assert.equal((await request('people/students', { actor: member })).status, 403);
  const options = await request('people/student-accounts?search=student');
  assert.deepEqual(options.body.items.map(({ id }) => id), [memberMembership.id]);
  assert.equal((await request('people/student-accounts?search=student', { actor: teacher })).status, 403);
});
