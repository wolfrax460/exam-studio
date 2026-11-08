// Repository behavior against the disposable Task 013 MongoDB database.
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { dropTestDatabase } from './helpers.js';
import * as repo from '../lib/workspaceRepository.js';
import { closeDatabaseConnections } from '../lib/database.js';

const id = () => new mongoose.Types.ObjectId().toString();
const type = 'school';
const window = {
  opensAt: '2027-02-01T08:00:00.000Z',
  dueAt: '2027-02-08T17:00:00.000Z',
};

before(async () => {
  await dropTestDatabase();
  await repo.initStorage();
  assert.equal(repo.storageMode(), 'mongo');
});

after(async () => {
  await closeDatabaseConnections();
  await dropTestDatabase();
});

describe('MongoDB workspace repository', () => {
  it('creates and finds an institution with normalized values', async () => {
    const created = await repo.createInstitution({
      name: '  North Campus  ',
      slug: 'North-Campus',
      type,
      createdBy: id(),
      aiDailyLimit: null,
    });
    assert.ok(created.id);
    assert.equal(created.name, 'North Campus');
    assert.equal(created.slug, 'north-campus');
    assert.equal(created.type, 'school');
    assert.equal(created.status, 'pending');
    assert.equal(created.aiDailyLimit, null);
    assert.match(created.createdAt, /^\d{4}-\d{2}-\d{2}T/);

    const found = await repo.findInstitutionById(created.id);
    assert.deepEqual(found, created);
    assert.deepEqual(await repo.findInstitutionBySlug('NORTH-CAMPUS'), created);
    assert.ok((await repo.listInstitutions()).some((entry) => entry.id === created.id));
  });

  it('rejects a duplicate institution slug', async () => {
    const input = { name: 'Duplicate', slug: 'duplicate-slug', type, createdBy: id() };
    await repo.createInstitution(input);
    await assert.rejects(repo.createInstitution({ ...input, name: 'Other' }), (error) => {
      assert.equal(error.code, 11000);
      return true;
    });
  });

  it('enforces one membership per user and institution', async () => {
    const userId = id();
    const institutionId = id();
    const created = await repo.createMembership({ userId, institutionId, role: 'admin' });
    assert.equal(created.status, 'invited');
    assert.equal(created.invitedBy, null);
    assert.equal(created.acceptedAt, null);

    assert.equal((await repo.findMembership(userId, institutionId)).id, created.id);
    assert.equal((await repo.listMembershipsForUser(userId)).length, 1);
    assert.equal((await repo.listMembershipsForInstitution(institutionId)).length, 1);

    await assert.rejects(repo.createMembership({ userId, institutionId, role: 'member' }), (error) => {
      assert.equal(error.code, 11000);
      return true;
    });
  });

  it('enforces one group membership per user', async () => {
    const groupId = id();
    const institutionId = id();
    const userId = id();
    const created = await repo.createGroupMember({ groupId, institutionId, userId, role: 'member' });
    assert.equal(created.role, 'member');
    assert.equal((await repo.findGroupMember(groupId, userId)).id, created.id);
    assert.equal((await repo.listGroupMembers(groupId)).length, 1);

    await assert.rejects(repo.createGroupMember({ groupId, institutionId, userId, role: 'teacher' }), (error) => {
      assert.equal(error.code, 11000);
      return true;
    });
  });

  it('creates group-targeted and user-targeted assignments', async () => {
    const institutionId = id();
    const publicationId = id();
    const createdBy = id();
    const group = await repo.createGroup({ institutionId, name: 'Cohort A', createdBy });

    const groupAssignment = await repo.createAssignment({
      institutionId,
      publicationId,
      groupId: group.id,
      createdBy,
      ...window,
    });
    assert.equal(groupAssignment.groupId, group.id);
    assert.deepEqual(groupAssignment.userIds, []);
    assert.equal(groupAssignment.opensAt, window.opensAt);

    const userAssignment = await repo.createAssignment({
      institutionId,
      publicationId,
      userIds: [id(), id()],
      createdBy,
      ...window,
    });
    assert.equal(userAssignment.groupId, null);
    assert.equal(userAssignment.userIds.length, 2);

    assert.equal((await repo.listAssignmentsForInstitution(institutionId)).length, 2);
    assert.equal((await repo.listAssignmentsForGroup(group.id)).length, 1);
    assert.equal((await repo.findAssignmentById(groupAssignment.id)).id, groupAssignment.id);
  });

  it('rejects invalid assignment targets and date windows', async () => {
    const base = { institutionId: id(), publicationId: id(), createdBy: id(), ...window };
    await assert.rejects(repo.createAssignment(base), /target a group or at least one user/i);
    await assert.rejects(
      repo.createAssignment({ ...base, groupId: id(), userIds: [id()] }),
      /not both/i,
    );
    await assert.rejects(
      repo.createAssignment({ ...base, userIds: [id()], dueAt: '2027-01-01T00:00:00.000Z' }),
      /after opensAt/i,
    );
  });
});
