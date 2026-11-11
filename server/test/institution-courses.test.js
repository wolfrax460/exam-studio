import assert from 'node:assert/strict';
import { after, before, it } from 'node:test';
import { bootApi, makeUser } from './helpers.js';

let api, owner, teacher, otherTeacher, learner, outsider, institution, otherInstitution, fields;
const userId = (account) => account.response.body.user.id;

async function request(route, { actor = owner, tenant = institution, method = 'GET', body } = {}) {
  const response = await fetch(`${api.base}/api/institutions/${route}`, {
    method, headers: { 'X-Institution-Id': tenant.id, ...(actor && { Authorization: `Bearer ${actor.token}` }),
      'Content-Type': 'application/json' },
    body: body && JSON.stringify(body),
  });
  return { status: response.status, data: await response.json() };
}

before(async () => {
  api = await bootApi({ EXAM_STUDIO_INSTITUTIONS_ENABLED: 'true',
    ...(process.env.TASK023_TEST_FILE_MODE === '1' && { MONGODB_URI: 'mongodb://127.0.0.1:59999' }) });
  const repo = await import('../lib/workspaceRepository.js');
  [owner, teacher, otherTeacher, learner, outsider] = await Promise.all(['Owner', 'Teacher', 'Another teacher', 'Learner', 'Other owner']
    .map((name) => makeUser(api.base, { name })));
  institution = await repo.createInstitution({ name: 'Learning Academy', slug: 'learning-academy', type: 'school', status: 'active', createdBy: userId(owner) });
  otherInstitution = await repo.createInstitution({ name: 'Other Academy', slug: 'other-academy', type: 'school', status: 'active', createdBy: userId(outsider) });
  const add = (account, role, tenant = institution) => repo.createMembership({ userId: userId(account), institutionId: tenant.id, role, status: 'active' });
  await add(owner, 'admin');
  await add(outsider, 'admin', otherInstitution);
  const teacherMembership = await add(teacher, 'teacher');
  await add(otherTeacher, 'teacher');
  const learnerMembership = await add(learner, 'member');
  let version = 0;
  async function academic(kind, record) {
    const result = await request(`academics/${kind}`, { method: 'POST', body: { version, record } });
    assert.equal(result.status, 201);
    version = result.data.version;
    return result.data.record.id;
  }
  const yearId = await academic('years', { name: '2026–2027', startsOn: '2026-09-01', endsOn: '2027-06-30' });
  const classId = await academic('classes', { name: 'Year One', yearId });
  const sectionId = await academic('sections', { name: 'Section A', classId });
  const subjectId = await academic('subjects', { name: 'Science', code: 'SCI' });
  await academic('assignments', { classId, sectionId, subjectId, teacherId: teacherMembership.id });
  assert.equal((await request('people/students', { method: 'POST', body: {
    name: 'Learner', studentNumber: 'GA-1', classId, sectionId, membershipId: learnerMembership.id,
  } })).status, 201);
  fields = { title: 'Science foundations', yearId, classId, sectionId, subjectId, teacherId: teacherMembership.id };
});
after(async () => api?.close());

it('restricts course creation to authorized academic assignments and rejects injected ownership', async () => {
  const create = (body, actor) => request('courses', { method: 'POST', body, actor });
  assert.equal((await create(fields, null)).status, 401);
  assert.equal((await create(fields, learner)).status, 403);
  assert.equal((await create(fields, otherTeacher)).status, 403);
  assert.equal((await create({ ...fields, sectionId: null }, teacher)).status, 403);
  assert.equal((await create({ ...fields, institutionId: otherInstitution.id }, owner)).status, 400);
  assert.equal((await create({ ...fields, resources: ['javascript:alert(1)'] }, owner)).status, 400);
});

it('edits and orders lessons with version checks, and filters learner and tenant visibility', async () => {
  const created = await request('courses', { method: 'POST', actor: teacher, body: fields });
  assert.equal(created.status, 201, JSON.stringify(created.data));
  const path = `courses/${created.data.id}`;
  assert.equal((await request(path, { actor: learner })).status, 404);
  assert.equal((await request(path, { actor: outsider, tenant: otherInstitution })).status, 404);
  assert.equal((await request(path, { actor: otherTeacher })).status, 404);
  const addLesson = (version, lesson) => request(`${path}/lessons`, { method: 'POST', actor: teacher, body: { version, lesson } });
  const draft = await addLesson(1, { title: 'Draft', content: 'Teacher notes' });
  assert.equal(draft.status, 201, JSON.stringify(draft.data));
  const published = await addLesson(2, { title: 'Photosynthesis', content: 'Plants use sunlight to make sugars.', published: true,
    resources: ['https://example.com/science'], objectives: ['Explain how energy is stored.'] });
  assert.equal(published.status, 201, JSON.stringify(published.data));
  const reorder = () => request(`${path}/lesson-order`, { method: 'PUT', body: { version: 3, lessonIds: [published.data.id, draft.data.id] } });
  const concurrent = await Promise.all([reorder(), reorder()]);
  assert.deepEqual(concurrent.map(({ status }) => status).sort(), [200, 409]);
  assert.equal((await request(path, { method: 'PUT', body: { version: 4, course: { ...fields, status: 'published' } } })).status, 200);
  const staffView = (await request(path, { actor: teacher })).data;
  assert.deepEqual(staffView.lessons.map(({ title }) => title), ['Photosynthesis', 'Draft']);
  assert.equal(staffView.lessons[0].createdBy, fields.teacherId);
  const learnerView = (await request(path, { actor: learner })).data;
  assert.equal(learnerView.lessonCount, 1);
  assert.equal(learnerView.lessons[0].createdBy, undefined);
  assert.equal(learnerView.lessons[0].resources[0], 'https://example.com/science');
  assert.equal((await request('courses?search=foundations', { actor: learner })).data.items[0].lessonCount, 1);
  assert.deepEqual((await request('courses?status=draft', { actor: learner })).data.items, []);
  assert.equal((await request(path, { method: 'PUT', body: { version: 5, course: { ...fields, status: 'archived' } } })).status, 200);
  assert.equal((await request(path, { actor: learner })).status, 404);
  const repo = await import('../lib/workspaceRepository.js');
  await repo.changeWorkspaceMembership(institution.id, fields.teacherId, { status: 'suspended' });
  assert.equal((await request(path, { actor: teacher })).status, 404);
});
