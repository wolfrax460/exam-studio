import { after, before, it } from 'node:test';
import assert from 'node:assert/strict';
import { bootApi, call, makeUser } from './helpers.js';

const form = { name: 'Nyota University', type: 'university', country: 'Rwanda', contactEmail: 'office@example.com' };
let api;
let applicant;
let reviewer;
let globalAdmin;
let repo;
const request = (path, options) => call(api.base, path, options);
const requests = '/api/institutions/requests';
const reviews = '/api/admin/institutions';
const apply = (token, body = form) => request(requests, { method: 'POST', token, body });
const review = (id, token, status, version) => request(`${reviews}/${id}/status`, {
  method: 'PUT', token, body: { status, version, reason: 'Reviewed application' },
});

before(async () => {
  api = await bootApi({
    EXAM_STUDIO_INSTITUTIONS_ENABLED: 'true',
    EXAM_STUDIO_SUPERADMIN_IDS: '',
    ...(process.env.TASK023_TEST_FILE_MODE === '1' ? { MONGODB_URI: 'mongodb://127.0.0.1:59999' } : {}),
  });
  const { updateUser } = await import('../lib/adminStore.js');
  repo = await import('../lib/workspaceRepository.js');
  applicant = await makeUser(api.base);
  reviewer = await makeUser(api.base);
  globalAdmin = await makeUser(api.base);
  for (const user of [applicant, reviewer, globalAdmin]) assert.equal(user.response.status, 201);
  await updateUser(globalAdmin.response.body.user.id, { role: 'admin' });
  process.env.EXAM_STUDIO_SUPERADMIN_IDS = reviewer.response.body.user.id;
});

after(async () => api?.close());

it('keeps onboarding off by default and enforces authenticated, strict registration', async () => {
  process.env.EXAM_STUDIO_INSTITUTIONS_ENABLED = '';
  try {
    const health = await request('/api/health');
    assert.equal(health.body.institutions.enabled, false);
    assert.equal((await apply(applicant.token)).status, 404);
  } finally {
    process.env.EXAM_STUDIO_INSTITUTIONS_ENABLED = 'true';
  }
  assert.equal((await apply()).status, 401);
  assert.equal((await apply(applicant.token, { ...form, contactEmail: 'invalid' })).status, 400);
  assert.equal((await apply(applicant.token, { ...form, status: 'active', role: 'admin' })).status, 400);
});

it('approves a pending request once, isolates authority and denies suspended workspace access', async () => {
  const registration = await apply(applicant.token);
  assert.equal(registration.status, 201);
  const { id, status } = registration.body;
  const ownerId = applicant.response.body.user.id;
  const reviewerId = reviewer.response.body.user.id;
  assert.equal(status, 'pending');
  assert.equal(await repo.findMembership(ownerId, id), null);
  assert.equal((await request(requests, { token: applicant.token })).body.items[0].id, id);
  assert.deepEqual((await request(requests, { token: globalAdmin.token })).body.items, []);
  assert.equal((await request(reviews, { token: globalAdmin.token })).status, 403);
  assert.equal((await request('/api/admin/me', { token: reviewer.token })).status, 403);
  assert.equal((await request(`/api/admin/users/${reviewerId}/reset-password`, {
    method: 'POST', token: globalAdmin.token, body: { password: 'DifferentPass123' },
  })).status, 403);
  assert.equal((await review(id, applicant.token, 'active', 0)).status, 403);
  const queue = await request(`${reviews}?status=pending`, { token: reviewer.token });
  assert.equal(queue.body.items[0].contactEmail, form.contactEmail);
  assert.equal(queue.body.items[0].version, 0);
  const workspace = async (token, institutionId = id) => fetch(`${api.base}/api/institutions/workspace`, {
    headers: { authorization: `Bearer ${token}`, 'X-Institution-Id': institutionId },
  });
  assert.equal((await workspace(applicant.token)).status, 404);

  const approval = await Promise.all([review(id, reviewer.token, 'active', 0), review(id, reviewer.token, 'active', 0)]);
  assert.deepEqual(approval.map((response) => response.status).sort(), [200, 409]);
  const members = await repo.listMembershipsForInstitution(id);
  assert.equal(members.length, 1);
  assert.equal(members[0].userId, ownerId);
  assert.equal(members[0].role, 'admin');
  assert.equal(members[0].status, 'active');
  assert.equal((await request('/api/auth/me', { token: applicant.token })).body.user.role, 'student');
  const allowed = await workspace(applicant.token);
  assert.equal(allowed.status, 200);
  assert.equal((await allowed.json()).institutionId, id);
  assert.equal((await workspace(reviewer.token)).status, 404);
  assert.equal((await review(id, applicant.token, 'suspended', 1)).status, 403);

  const suspension = await review(id, reviewer.token, 'suspended', 1);
  assert.equal(suspension.status, 200);
  assert.deepEqual(suspension.body.history.map(({ status, by }) => [status, by]), [
    ['active', reviewerId], ['suspended', reviewerId],
  ]);
  assert.equal((await workspace(applicant.token)).status, 404);
  assert.equal((await request(requests, { token: applicant.token })).body.items[0].history, undefined);
  assert.equal((await request('/api/library', { token: applicant.token })).status, 200);
  assert.equal((await review(id, reviewer.token, 'active', 1)).status, 409);
  assert.equal((await review(id, reviewer.token, 'active', 2)).status, 200);
  assert.equal((await workspace(applicant.token)).status, 200);
  assert.equal((await repo.findInstitutionById(id)).history.length, 3);
  assert.equal((await repo.listMembershipsForInstitution(id))[0].id, members[0].id);
});
