// Repository behavior in the JSON file backend. This file deliberately points at a dead
// MongoDB port and a temporary DATA_FILE; it must never touch the real store.json.
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'exam-studio-workspace-file-'));
process.env.MONGODB_URI = 'mongodb://127.0.0.1:59999/none';
process.env.MONGODB_TIMEOUT_MS = '250';
process.env.DATA_FILE = path.join(tempDir, 'store.json');

let repo;
let database;

const id = () => crypto.randomUUID();
const window = {
  opensAt: '2027-03-01T08:00:00.000Z',
  dueAt: '2027-03-08T17:00:00.000Z',
};

before(async () => {
  database = await import('../lib/database.js');
  repo = await import('../lib/workspaceRepository.js');
  await repo.initStorage();
  assert.equal(repo.storageMode(), 'file');
  assert.equal(database.isMongoReady(), false);
});

after(async () => {
  await database?.closeDatabaseConnections();
  fs.rmSync(tempDir, { recursive: true, force: true });
});

describe('JSON file workspace repository', () => {
  it('creates and finds institutions without MongoDB', async () => {
    const created = await repo.createInstitution({
      name: '  West Campus  ',
      slug: 'West-Campus',
      type: 'training',
      createdBy: id(),
      aiDailyLimit: 25,
    });
    assert.ok(created.id);
    assert.equal(created.name, 'West Campus');
    assert.equal(created.slug, 'west-campus');
    assert.equal(created.status, 'pending');
    assert.equal(created.aiDailyLimit, 25);
    assert.match(created.createdAt, /^\d{4}-\d{2}-\d{2}T/);

    assert.deepEqual(await repo.findInstitutionById(created.id), created);
    assert.deepEqual(await repo.findInstitutionBySlug('WEST-CAMPUS'), created);
    assert.ok((await repo.listInstitutions()).some((entry) => entry.id === created.id));
  });

  it('rejects a duplicate institution slug', async () => {
    const input = { name: 'Duplicate', slug: 'duplicate-slug', type: 'other', createdBy: id() };
    await repo.createInstitution(input);
    await assert.rejects(repo.createInstitution({ ...input, name: 'Other' }), (error) => {
      assert.equal(error.code, 11000);
      return true;
    });
  });

  it('enforces one membership per user and institution', async () => {
    const userId = id();
    const institutionId = id();
    const created = await repo.createMembership({ userId, institutionId, role: 'teacher' });
    assert.equal(created.status, 'invited');
    assert.equal(created.invitedEmail, '');
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
    const created = await repo.createGroupMember({ groupId, institutionId, userId, role: 'teacher' });
    assert.equal(created.role, 'teacher');
    assert.equal((await repo.findGroupMember(groupId, userId)).id, created.id);
    assert.equal((await repo.listGroupMembers(groupId)).length, 1);

    await assert.rejects(repo.createGroupMember({ groupId, institutionId, userId, role: 'member' }), (error) => {
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
  });

  it('persists the new collections alongside the existing file-store keys', async () => {
    await repo.createInstitution({
      name: 'Persistence Check',
      slug: 'persistence-check',
      type: 'school',
      createdBy: id(),
    });
    const raw = JSON.parse(fs.readFileSync(process.env.DATA_FILE, 'utf8'));
    assert.equal(raw.version, 2);
    assert.ok(Array.isArray(raw.users));
    assert.ok(Array.isArray(raw.items));
    assert.ok(Array.isArray(raw.institutions));
    assert.ok(Array.isArray(raw.memberships));
    assert.ok(raw.institutions.some((entry) => entry.slug === 'persistence-check'));
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

  it('rejects invalid enums and limits in file mode', async () => {
    await assert.rejects(
      repo.createInstitution({ name: 'Bad', slug: 'bad', type: 'unsupported', createdBy: id() }),
      /type/,
    );
    await assert.rejects(
      repo.createInstitution({ name: 'Bad', slug: 'bad-2', type: 'school', createdBy: id(), aiDailyLimit: -1 }),
      /aiDailyLimit/,
    );
    await assert.rejects(
      repo.createMembership({ userId: id(), institutionId: id(), role: 'student' }),
      /role/,
    );
    await assert.rejects(
      repo.createGroupMember({ groupId: id(), institutionId: id(), userId: id(), role: 'admin' }),
      /role/,
    );
  });
});
