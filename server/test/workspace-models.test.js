// Model-level validation for the Phase B1 records. These tests do not need a database:
// Mongoose validates the shape before any write.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import Institution from '../lib/models/Institution.js';
import Membership from '../lib/models/Membership.js';
import Group from '../lib/models/Group.js';
import GroupMember from '../lib/models/GroupMember.js';
import Assignment from '../lib/models/Assignment.js';

const id = () => new mongoose.Types.ObjectId();
const dates = () => ({
  opensAt: new Date('2027-01-10T09:00:00.000Z'),
  dueAt: new Date('2027-01-17T17:00:00.000Z'),
});

describe('Institution model', () => {
  it('accepts the approved fields and defaults to pending', () => {
    const institution = new Institution({
      name: 'North Campus',
      slug: 'North-Campus',
      type: 'college',
      createdBy: id(),
    });
    assert.equal(institution.validateSync(), undefined);
    assert.equal(institution.status, 'pending');
    assert.equal(institution.slug, 'north-campus');
    assert.equal(institution.aiDailyLimit, null);
  });

  it('rejects unknown types, unknown statuses and negative AI limits', () => {
    const base = { name: 'Campus', slug: 'campus', type: 'college', createdBy: id() };
    assert.match(new Institution({ ...base, type: 'university' }).validateSync().message, /type/);
    assert.match(new Institution({ ...base, status: 'archived' }).validateSync().message, /status/);
    assert.match(new Institution({ ...base, aiDailyLimit: -1 }).validateSync().message, /aiDailyLimit/);
    assert.match(new Institution({ ...base, aiDailyLimit: 1.5 }).validateSync().message, /aiDailyLimit/);
  });

  it('requires name, slug and creator', () => {
    const missing = new Institution({}).validateSync();
    assert.ok(missing.errors.name);
    assert.ok(missing.errors.slug);
    assert.ok(missing.errors.type);
    assert.ok(missing.errors.createdBy);
  });

  it('has a unique slug index', () => {
    const slugIndex = Institution.schema.indexes().find(([fields]) => fields.slug === 1);
    assert.ok(slugIndex);
    assert.equal(slugIndex[1].unique, true);
  });
});

describe('Membership model', () => {
  it('defaults to invited and validates the role/status enums', () => {
    const membership = new Membership({ userId: id(), institutionId: id(), role: 'teacher' });
    assert.equal(membership.validateSync(), undefined);
    assert.equal(membership.status, 'invited');
    assert.equal(membership.invitedEmail, '');
    assert.equal(membership.acceptedAt, null);
  });

  it('rejects invalid roles and statuses', () => {
    const base = { userId: id(), institutionId: id(), role: 'admin' };
    assert.match(new Membership({ ...base, role: 'student' }).validateSync().message, /role/);
    assert.match(new Membership({ ...base, status: 'pending' }).validateSync().message, /status/);
  });

  it('requires both user and institution', () => {
    const missing = new Membership({ role: 'member' }).validateSync();
    assert.ok(missing.errors.userId);
    assert.ok(missing.errors.institutionId);
  });

  it('has the unique user/institution compound index', () => {
    const compound = Membership.schema.indexes().find(([fields]) => fields.userId === 1 && fields.institutionId === 1);
    assert.ok(compound);
    assert.equal(compound[1].unique, true);
  });
});

describe('Group and GroupMember models', () => {
  it('accepts a group with the expected defaults', () => {
    const group = new Group({ institutionId: id(), name: 'Year 1', createdBy: id() });
    assert.equal(group.validateSync(), undefined);
    assert.equal(group.archived, false);
  });

  it('rejects an invalid group member role', () => {
    const member = new GroupMember({ groupId: id(), institutionId: id(), userId: id(), role: 'admin' });
    assert.match(member.validateSync().message, /role/);
  });

  it('has the unique group/user index', () => {
    const compound = GroupMember.schema.indexes().find(([fields]) => fields.groupId === 1 && fields.userId === 1);
    assert.ok(compound);
    assert.equal(compound[1].unique, true);
  });
});

describe('Assignment model', () => {
  const base = () => ({
    institutionId: id(),
    publicationId: id(),
    createdBy: id(),
    ...dates(),
  });

  it('accepts a group target', async () => {
    const assignment = new Assignment({ ...base(), groupId: id() });
    await assignment.validate();
    assert.ok(assignment.groupId);
    assert.deepEqual(assignment.userIds, []);
  });

  it('accepts a non-empty user list target', async () => {
    const assignment = new Assignment({ ...base(), userIds: [id(), id()] });
    await assignment.validate();
    assert.equal(assignment.groupId, null);
    assert.equal(assignment.userIds.length, 2);
  });

  it('rejects an assignment with no target or both target modes', async () => {
    await assert.rejects(new Assignment(base()).validate(), /target a group or at least one user/i);
    await assert.rejects(
      new Assignment({ ...base(), groupId: id(), userIds: [id()] }).validate(),
      /not both/i,
    );
  });

  it('rejects duplicate users and an invalid date window', async () => {
    const userId = id();
    await assert.rejects(
      new Assignment({ ...base(), userIds: [userId, userId] }).validate(),
      /duplicates/i,
    );
    await assert.rejects(
      new Assignment({ ...base(), userIds: [id()], dueAt: new Date('2027-01-01T00:00:00.000Z') }).validate(),
      /after opensAt/i,
    );
  });

  it('requires institution, publication and creator', async () => {
    const missing = new Assignment({ ...dates(), groupId: id() });
    await assert.rejects(missing.validate(), (error) => {
      assert.ok(error.errors.institutionId);
      assert.ok(error.errors.publicationId);
      assert.ok(error.errors.createdBy);
      return true;
    });
  });
});
