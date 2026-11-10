import assert from 'node:assert/strict';
import { after, before, it } from 'node:test';
import { bootApi, makeUser } from './helpers.js';

let api;
let admin;
let teacher;
let otherAdmin;
let institution;
let otherInstitution;
let teacherMembership;

const userId = (user) => user.response.body.user.id;
const academicYear = { name: '2026–2027', startsOn: '2026-09-01', endsOn: '2027-07-31' };

async function request(suffix = '', { actor = admin, tenant = institution, method = 'GET', body } = {}) {
  const response = await fetch(`${api.base}/api/institutions/academics${suffix}`, {
    method,
    headers: {
      Authorization: `Bearer ${actor.token}`,
      'X-Institution-Id': tenant.id,
      ...(body && { 'Content-Type': 'application/json' }),
    },
    ...(body && { body: JSON.stringify(body) }),
  });
  return { status: response.status, body: await response.json() };
}

const save = (kind, version, record, options = {}) => request(`/${kind}`, {
  ...options, method: 'POST', body: { version, record },
});
const activate = (kind, id, version) => request(`/active/${kind}/${id}`, { method: 'PUT', body: { version } });

before(async () => {
  api = await bootApi({
    EXAM_STUDIO_INSTITUTIONS_ENABLED: 'true',
    ...(process.env.TASK023_TEST_FILE_MODE === '1' ? { MONGODB_URI: 'mongodb://127.0.0.1:59999' } : {}),
  });
  const repo = await import('../lib/workspaceRepository.js');
  admin = await makeUser(api.base);
  teacher = await makeUser(api.base);
  otherAdmin = await makeUser(api.base);
  institution = await repo.createInstitution({ name: 'Academy A', slug: 'academy-a', type: 'school', status: 'active', createdBy: userId(admin) });
  otherInstitution = await repo.createInstitution({ name: 'Academy B', slug: 'academy-b', type: 'school', status: 'active', createdBy: userId(otherAdmin) });
  await repo.createMembership({ userId: userId(admin), institutionId: institution.id, role: 'admin', status: 'active' });
  await repo.createMembership({ userId: userId(otherAdmin), institutionId: otherInstitution.id, role: 'admin', status: 'active' });
  teacherMembership = await repo.createMembership({ userId: userId(teacher), institutionId: institution.id, role: 'teacher', status: 'active' });
});
after(async () => api?.close());

it('creates and activates related academic records within a single institution', async () => {
  assert.equal((await request()).body.version, 0);
  assert.equal((await save('years', 0, academicYear, { actor: teacher })).status, 403);
  const writes = await Promise.all([save('years', 0, academicYear), save('years', 0, academicYear)]);
  assert.deepEqual(writes.map(({ status }) => status).sort(), [201, 409]);
  const year = writes.find(({ status }) => status === 201).body.record;
  assert.equal((await save('terms', 1, {
    name: 'Outside year', yearId: year.id, startsOn: '2026-08-01', endsOn: '2026-12-12',
  })).status, 400);
  const term = await save('terms', 1, { name: 'Term 1', yearId: year.id, startsOn: '2026-09-01', endsOn: '2026-12-12' });
  assert.equal(term.status, 201);
  assert.equal((await activate('terms', term.body.record.id, 2)).status, 409);
  assert.equal((await activate('years', year.id, 2)).status, 200);
  assert.equal((await activate('terms', term.body.record.id, 3)).status, 200);
  const schoolClass = await save('classes', 4, { name: 'Year 1', yearId: year.id, teacherId: teacherMembership.id });
  assert.equal(schoolClass.status, 201);
  const section = await save('sections', 5, { name: 'Section A', classId: schoolClass.body.record.id });
  assert.equal(section.status, 201);
  const subject = await save('subjects', 6, { name: 'Mathematics', code: 'MATH' });
  assert.equal(subject.status, 201);
  const assignment = await save('assignments', 7, {
    classId: schoolClass.body.record.id, sectionId: section.body.record.id, subjectId: subject.body.record.id, teacherId: teacherMembership.id,
  });
  assert.equal(assignment.status, 201);
  const view = await request('', { actor: teacher });
  assert.equal(view.body.activeYearId, year.id);
  assert.equal(view.body.activeTermId, term.body.record.id);
  assert.equal(view.body.assignments.length, 1);
  assert.equal((await request('', { actor: otherAdmin })).status, 404);
  assert.deepEqual((await request('', { actor: otherAdmin, tenant: otherInstitution })).body.classes, []);
  assert.equal((await save('terms', 0, {
    name: 'Foreign', yearId: year.id, startsOn: '2026-09-01', endsOn: '2026-12-12',
  }, { actor: otherAdmin, tenant: otherInstitution })).status, 400);
  const archived = await request(`/years/${year.id}`, {
    method: 'PUT', body: { version: 8, record: { ...academicYear, archived: true } },
  });
  assert.equal(archived.status, 200);
  const history = await request();
  assert.equal(history.body.activeYearId, null);
  assert.equal(history.body.activeTermId, null);
  assert.equal(history.body.years[0].archived, true);
});
