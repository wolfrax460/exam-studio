import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { after, before, it } from 'node:test';
import { bootApi, makeUser } from './helpers.js';

let api;
let alpha;
let beta;
let admin;
let teacher;
let outsider;
let repo;

const userId = (user) => user.response.body.user.id;
async function call(path, user, { institution, method = 'GET', body } = {}) {
  const response = await fetch(`${api.base}/api/institutions${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${user.token}`,
      ...(institution && { 'X-Institution-Id': institution.id }),
      ...(body && { 'Content-Type': 'application/json' }),
    },
    ...(body && { body: JSON.stringify(body) }),
  });
  return { status: response.status, body: await response.json() };
}

before(async () => {
  api = await bootApi({
    EXAM_STUDIO_INSTITUTIONS_ENABLED: 'true',
    ...(process.env.TASK023_TEST_FILE_MODE === '1' ? { MONGODB_URI: 'mongodb://127.0.0.1:59999' } : {}),
  });
  repo = await import('../lib/workspaceRepository.js');
  admin = await makeUser(api.base, { name: 'Alice' });
  teacher = await makeUser(api.base, { name: 'Terry' });
  outsider = await makeUser(api.base, { name: 'Oscar' });
  for (const user of [admin, teacher, outsider]) assert.equal(user.response.status, 201);
  alpha = await repo.createInstitution({ name: 'Alpha School', slug: 'alpha', type: 'school', status: 'active', createdBy: userId(admin) });
  beta = await repo.createInstitution({ name: 'Beta College', slug: 'beta', type: 'college', status: 'active', createdBy: userId(outsider) });
  await repo.createMembership({ userId: userId(admin), institutionId: alpha.id, role: 'admin', status: 'active' });
  await repo.createMembership({ userId: userId(outsider), institutionId: beta.id, role: 'admin', status: 'active' });
});
after(async () => api?.close());

it('lists authorized workspaces and hides another tenant’s dashboard and members', async () => {
  const list = await call('/workspaces', admin);
  assert.equal(list.status, 200);
  assert.deepEqual(list.body.items.map(({ id, role }) => [id, role]), [[alpha.id, 'admin']]);
  assert.equal((await call('/workspace/overview', admin, { institution: beta })).status, 404);
  assert.equal((await call('/members', admin, { institution: beta })).status, 404);
  assert.equal((await call('/workspace/overview', admin, { institution: alpha })).body.counts.admin, 1);
});

it('binds a one-time invitation to the invited account and protects institution admins', async () => {
  const invite = await call('/members/invitations', admin, {
    institution: alpha, method: 'POST', body: { email: teacher.email, role: 'teacher' },
  });
  assert.equal(invite.status, 201);
  const { code } = invite.body;
  assert.equal(typeof code, 'string');
  assert.deepEqual((await call('/workspaces', teacher)).body.items, []);
  assert.equal((await call('/workspace/overview', teacher, { institution: alpha })).status, 404);
  const accept = (user) => call('/invitations/accept', user, { method: 'POST', body: { code } });
  assert.equal((await accept(outsider)).status, 404);
  const results = await Promise.all([accept(teacher), accept(teacher)]);
  assert.deepEqual(results.map(({ status }) => status).sort(), [200, 404]);
  assert.equal((await call('/workspaces', teacher)).body.items[0].role, 'teacher');
  const directory = await call('/members', teacher, { institution: alpha });
  assert.equal(directory.body.items.length, 2);
  assert.equal(directory.body.items.some(({ email }) => Boolean(email)), false);
  assert.equal((await call('/members/invitations', teacher, {
    institution: alpha, method: 'POST', body: { email: outsider.email, role: 'admin' },
  })).status, 403);
  const adminDirectory = await call('/members', admin, { institution: alpha });
  const owner = adminDirectory.body.items.find(({ role }) => role === 'admin');
  const joined = adminDirectory.body.items.find(({ role }) => role === 'teacher');
  const suspend = (id) => call(`/members/${id}`, admin, {
    institution: alpha, method: 'PUT', body: { status: 'suspended' },
  });
  assert.equal((await suspend(owner.id)).status, 404);
  assert.equal((await suspend(joined.id)).status, 200);
  assert.equal((await call('/workspace/overview', teacher, { institution: alpha })).status, 404);
});

it('can reissue an expired invitation and preserves the member’s other institution', async () => {
  const code = randomBytes(32).toString('base64url');
  await repo.inviteWorkspaceMember({
    userId: userId(outsider), institutionId: alpha.id, email: outsider.email, role: 'member', invitedBy: userId(admin),
    inviteHash: createHash('sha256').update(code).digest('hex'), inviteExpiresAt: new Date(Date.now() - 60_000),
  });
  const accept = (inviteCode) => call('/invitations/accept', outsider, { method: 'POST', body: { code: inviteCode } });
  assert.equal((await accept(code)).status, 404);
  const renewed = await call('/members/invitations', admin, {
    institution: alpha, method: 'POST', body: { email: outsider.email, role: 'member' },
  });
  assert.equal(renewed.status, 201);
  assert.equal((await accept(renewed.body.code)).status, 200);
  const { body } = await call('/workspaces', outsider);
  assert.deepEqual(body.items.map(({ id, role }) => [id, role]), [[alpha.id, 'member'], [beta.id, 'admin']]);
});
