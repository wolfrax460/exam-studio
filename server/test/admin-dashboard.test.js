import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { bootApi, call, makeUser } from './helpers.js';
import User from '../lib/models/User.js';
import UsageEvent from '../lib/models/UsageEvent.js';
import AuditLog from '../lib/models/AuditLog.js';
import LibraryItem from '../lib/models/LibraryItem.js';
import { createInstitution, createMembership } from '../lib/workspaceRepository.js';

const administrator = { email: 'admin-dashboard@example.com', password: 'AdminTest42' };
let api, adminToken, member, disabledAccount, institution;

before(async () => {
  api = await bootApi({ EXAM_STUDIO_ADMIN_EMAIL: administrator.email, EXAM_STUDIO_ADMIN_PASSWORD: administrator.password });
  const auth = await call(api.base, '/api/auth/login', { method: 'POST', body: administrator });
  assert.equal(auth.status, 200);
  adminToken = auth.body.token;
  member = await makeUser(api.base, { name: 'Institution administrator' });
  assert.equal(member.response.status, 201);
  disabledAccount = await makeUser(api.base, { name: 'Case [Study]' });
  assert.equal(disabledAccount.response.status, 201);
  await User.updateOne({ _id: disabledAccount.response.body.user.id }, {
    active: false, totpSecret: 'fixture-private-key', passwordResetTokenHash: 'fixture-reset',
    emailVerificationTokenHash: 'fixture-verify', tokenVersion: 3,
  });
  const userId = member.response.body.user.id;
  institution = await createInstitution({ name: 'Test Institute', slug: 'test-institute', type: 'school', status: 'active', createdBy: userId });
  await createMembership({ userId, institutionId: institution.id, role: 'admin', status: 'active' });
});

after(async () => { await api?.close(); });

describe('platform administration dashboard', () => {
  it('rejects unsigned visitors and institution administrators on every section', async () => {
    for (const section of ['me', 'usage/summary', 'users', 'plans', 'ai-config', 'usage', 'content', 'announcements', 'system', 'audit', 'settings']) {
      assert.equal((await call(api.base, `/api/admin/${section}`)).status, 401, section);
      assert.equal((await call(api.base, `/api/admin/${section}`, {
        token: member.token, headers: { 'x-workspace-type': 'institution', 'x-institution-id': institution.id },
      })).status, 403, section);
    }
    assert.equal((await call(api.base, '/api/admin/settings', { method: 'PUT', token: member.token, body: { registrationOpen: false } })).status, 403);
  });

  it('searches literal user text, filters status and excludes credential fields', async () => {
    const id = disabledAccount.response.body.user.id;
    const query = new URLSearchParams({ search: '[Study]', role: 'student', status: 'disabled', limit: '1' });
    const { status, body } = await call(api.base, `/api/admin/users?${query}`, { token: adminToken });
    assert.equal(status, 200);
    assert.equal(body.total, 1);
    assert.equal(body.items[0].id, id);
    assert.equal(body.items[0].active, false);
    const detail = await call(api.base, `/api/admin/users/${id}`, { token: adminToken });
    for (const user of [body.items[0], detail.body]) {
      for (const key of ['passwordHash', 'totpSecret', 'passwordResetTokenHash', 'emailVerificationTokenHash', 'tokenVersion']) {
        assert.equal(Object.hasOwn(user, key), false, key);
      }
    }
    const disabled = await call(api.base, '/api/auth/login', { method: 'POST', body: { email: disabledAccount.email, password: disabledAccount.password } });
    assert.equal(disabled.status, 403);
  });

  it('aggregates real activity, accounts, outcomes and provider-reported tokens', async () => {
    const userId = member.response.body.user.id;
    await UsageEvent.insertMany([
      { userId, taskType: 'notes', success: true, actualTokens: 120 },
      { userId, taskType: 'exam', success: false, estimatedTokens: 200 },
      { userId, taskType: 'cards', success: true, createdAt: new Date(Date.now() - 40 * 86400000) },
    ]);
    const { status, body } = await call(api.base, '/api/admin/usage/summary', { token: adminToken });
    assert.equal(status, 200);
    assert.equal(body.usersTotal, 3);
    assert.equal(body.usersActive, 2);
    assert.equal(body.requestsMonth, 2);
    assert.equal(body.successesMonth, 1);
    assert.equal(body.failuresMonth, 1);
    assert.equal(body.reportedTokens, 120);
    assert.equal(body.daily.length, 14);
    assert.equal(body.daily.reduce((sum, row) => sum + row.requests, 0), 2);
    assert.equal(body.userGrowth.reduce((sum, row) => sum + row.registrations, 0), 3);
    const events = await call(api.base, '/api/admin/usage?outcome=failure&limit=1', { token: adminToken });
    assert.equal(events.body.total, 1);
    assert.equal(events.body.items[0].success, false);
  });

  it('returns only moderation and audit metadata', async () => {
    await LibraryItem.create({ userId: member.response.body.user.id, kind: 'notes', title: 'Lesson [example]', data: { private: 'fixture' } });
    await AuditLog.create({ action: 'aiConfig.update', targetType: 'aiConfig', after: { apiKey: 'fixture-private-key' } });
    const content = await call(api.base, '/api/admin/content?kind=notes&search=%5Bexample%5D', { token: adminToken });
    assert.equal(content.body.total, 1);
    assert.equal(content.body.items[0].title, 'Lesson [example]');
    assert.equal(Object.hasOwn(content.body.items[0], 'data'), false);
    const audit = await call(api.base, '/api/admin/audit?action=aiConfig.update', { token: adminToken });
    assert.equal(audit.body.total, 1);
    assert.equal(Object.hasOwn(audit.body.items[0], 'after'), false);
  });
});
