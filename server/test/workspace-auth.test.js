// Workspace resolution and resource ownership guards, against the disposable Task 013 database.
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { dropTestDatabase } from './helpers.js';
import * as workspaceRepo from '../lib/workspaceRepository.js';
import { closeDatabaseConnections } from '../lib/database.js';
import {
  canAccessResource,
  requireWorkspaceResource,
  resolveWorkspace,
} from '../lib/workspaceAuth.js';

const id = () => new mongoose.Types.ObjectId().toString();
const userId = id();
const otherUserId = id();
let institutionA;
let institutionB;
let institutionWithoutMember;
let activeMembership;
let invitedMembership;

function makeRequest({ user = { id: userId }, headers = {}, body = {}, query = {} } = {}) {
  const normalizedHeaders = Object.fromEntries(
    Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]),
  );
  return {
    user,
    userId: user?.id,
    headers: normalizedHeaders,
    body,
    query,
    get(name) {
      return normalizedHeaders[String(name).toLowerCase()];
    },
  };
}

function run(middleware, req) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const done = (error) => {
      if (settled) return;
      settled = true;
      resolve(error);
    };
    try {
      const result = middleware(req, {}, done);
      if (result && typeof result.then === 'function') result.catch(reject);
    } catch (error) {
      reject(error);
    }
  });
}

before(async () => {
  await dropTestDatabase();
  await workspaceRepo.initStorage();
  assert.equal(workspaceRepo.storageMode(), 'mongo');

  institutionA = await workspaceRepo.createInstitution({
    name: 'Alpha School',
    slug: 'alpha-school',
    type: 'school',
    status: 'active',
    createdBy: userId,
  });
  institutionB = await workspaceRepo.createInstitution({
    name: 'Beta School',
    slug: 'beta-school',
    type: 'school',
    status: 'active',
    createdBy: otherUserId,
  });
  institutionWithoutMember = await workspaceRepo.createInstitution({
    name: 'Gamma School',
    slug: 'gamma-school',
    type: 'school',
    status: 'active',
    createdBy: userId,
  });

  activeMembership = await workspaceRepo.createMembership({
    userId,
    institutionId: institutionA.id,
    role: 'teacher',
    status: 'active',
    acceptedAt: new Date(),
  });
  invitedMembership = await workspaceRepo.createMembership({
    userId: otherUserId,
    institutionId: institutionA.id,
    role: 'member',
    status: 'invited',
  });
});

after(async () => {
  await closeDatabaseConnections();
  await dropTestDatabase();
});

describe('resolveWorkspace', () => {
  it('defaults to the signed-in user personal workspace', async () => {
    const req = makeRequest();
    const error = await run(resolveWorkspace, req);
    assert.equal(error, undefined);
    assert.deepEqual(req.workspace, {
      type: 'personal',
      ownerType: 'personal',
      userId,
      institutionId: null,
      membership: null,
    });
  });

  it('resolves an active institution membership', async () => {
    const req = makeRequest({
      headers: {
        'X-Workspace-Type': 'Institution',
        'X-Institution-Id': institutionA.id,
      },
    });
    const error = await run(resolveWorkspace, req);
    assert.equal(error, undefined);
    assert.equal(req.workspace.type, 'institution');
    assert.equal(req.workspace.ownerType, 'institution');
    assert.equal(req.workspace.institutionId, institutionA.id);
    assert.equal(req.workspace.membership.id, activeMembership.id);
    assert.equal(req.workspace.membership.status, 'active');
    assert.equal(req.workspace.membership.role, 'teacher');
  });

  it('infers an institution workspace when only an institution id is supplied', async () => {
    const req = makeRequest({ headers: { 'x-institution-id': institutionA.id } });
    const error = await run(resolveWorkspace, req);
    assert.equal(error, undefined);
    assert.equal(req.workspace.type, 'institution');
    assert.equal(req.workspace.institutionId, institutionA.id);
  });

  it('requires authentication', async () => {
    const req = makeRequest({ user: null });
    const error = await run(resolveWorkspace, req);
    assert.equal(error.status, 401);
  });

  it('rejects malformed workspace selections', async () => {
    const cases = [
      { headers: { 'x-workspace-type': 'nonsense' } },
      { headers: { 'x-workspace-type': 'institution' } },
      { headers: { 'x-workspace-type': 'personal', 'x-institution-id': institutionA.id } },
    ];
    for (const options of cases) {
      const error = await run(resolveWorkspace, makeRequest(options));
      assert.equal(error.status, 400, JSON.stringify(options.headers));
    }
  });

  it('does not trust body or query parameters for workspace selection', async () => {
    const req = makeRequest({
      body: { ownerType: 'institution', institutionId: institutionA.id },
      query: { workspaceType: 'institution', institutionId: institutionA.id },
    });
    const error = await run(resolveWorkspace, req);
    assert.equal(error, undefined);
    assert.equal(req.workspace.type, 'personal');
  });

  it('hides missing institutions and inactive memberships behind 404', async () => {
    const missingInstitution = await run(resolveWorkspace, makeRequest({
      headers: { 'x-institution-id': id() },
    }));
    assert.equal(missingInstitution.status, 404);
    assert.match(missingInstitution.message, /workspace not found/i);

    const noMembership = await run(resolveWorkspace, makeRequest({
      headers: { 'x-institution-id': institutionWithoutMember.id },
    }));
    assert.equal(noMembership.status, 404);
    assert.match(noMembership.message, /workspace not found/i);

    const invited = await run(resolveWorkspace, makeRequest({
      user: { id: otherUserId },
      headers: { 'x-institution-id': institutionA.id },
    }));
    assert.equal(invited.status, 404);
    assert.match(invited.message, /workspace not found/i);
    assert.equal(invitedMembership.status, 'invited');
  });
});

describe('canAccessResource', () => {
  const personalWorkspace = () => ({ type: 'personal', userId, institutionId: null });
  const institutionWorkspace = () => ({
    type: 'institution',
    userId,
    institutionId: institutionA.id,
    membership: { status: 'active' },
  });

  it('allows personal resources owned by the signed-in user', () => {
    assert.equal(canAccessResource(personalWorkspace(), { ownerType: 'personal', institutionId: null, userId }), true);
    assert.equal(canAccessResource(personalWorkspace(), { userId }), true, 'legacy personal records remain readable');
    assert.equal(canAccessResource(personalWorkspace(), { ownerType: 'personal', institutionId: null, userId: otherUserId }), false);
    assert.equal(canAccessResource(personalWorkspace(), {}), false);
  });

  it('uses the requested owner field for publications and attempts', () => {
    assert.equal(canAccessResource(personalWorkspace(), { ownerType: 'personal', institutionId: null, ownerId: userId }, 'ownerId'), true);
    assert.equal(canAccessResource(personalWorkspace(), { ownerType: 'personal', institutionId: null, userId }, 'ownerId'), false);
  });

  it('allows institution resources only in the matching active institution', () => {
    assert.equal(
      canAccessResource(institutionWorkspace(), { ownerType: 'institution', institutionId: institutionA.id }),
      true,
    );
    assert.equal(
      canAccessResource(institutionWorkspace(), { ownerType: 'institution', institutionId: institutionB.id }),
      false,
    );
    assert.equal(
      canAccessResource(institutionWorkspace(), { ownerType: 'personal', institutionId: null, userId }),
      false,
    );
    assert.equal(canAccessResource(institutionWorkspace(), { ownerType: 'institution' }), false);
    assert.equal(
      canAccessResource({ ...institutionWorkspace(), membership: { status: 'invited' } }, {
        ownerType: 'institution',
        institutionId: institutionA.id,
      }),
      false,
    );
  });

  it('rejects personal resources that carry an institution id', () => {
    assert.equal(
      canAccessResource(personalWorkspace(), { ownerType: 'personal', institutionId: institutionA.id, userId }),
      false,
    );
  });
});

describe('requireWorkspaceResource', () => {
  const workspace = () => ({
    type: 'institution',
    userId,
    institutionId: institutionA.id,
    membership: { status: 'active' },
  });

  it('loads and exposes a resource in the selected institution', async () => {
    const req = { workspace: workspace() };
    const item = { ownerType: 'institution', institutionId: institutionA.id, title: 'Shared paper' };
    const error = await run(requireWorkspaceResource(() => item), req);
    assert.equal(error, undefined);
    assert.equal(req.resource, item);
  });

  it('returns the same 404 for a missing resource and a cross-institution resource', async () => {
    const missing = await run(requireWorkspaceResource(() => null), { workspace: workspace() });
    const foreign = await run(requireWorkspaceResource(() => ({
      ownerType: 'institution',
      institutionId: institutionB.id,
    })), { workspace: workspace() });

    assert.equal(missing.status, 404);
    assert.equal(foreign.status, 404);
    assert.equal(missing.message, foreign.message);
  });

  it('does not expose a rejected resource on the request', async () => {
    const req = { workspace: workspace() };
    const error = await run(requireWorkspaceResource(() => ({
      ownerType: 'institution',
      institutionId: institutionB.id,
    })), req);
    assert.equal(error.status, 404);
    assert.equal(req.resource, undefined);
  });

  it('requires a resolved workspace', async () => {
    const error = await run(requireWorkspaceResource(() => ({ ownerType: 'personal', userId })), {});
    assert.equal(error.status, 401);
  });

  it('can guard personal resources with the publication owner field', async () => {
    const personal = { type: 'personal', userId, institutionId: null };
    const publication = { ownerType: 'personal', institutionId: null, ownerId: userId };
    const req = { workspace: personal };
    const error = await run(requireWorkspaceResource(() => publication, { ownerField: 'ownerId' }), req);
    assert.equal(error, undefined);
    assert.equal(req.resource, publication);
  });
});
