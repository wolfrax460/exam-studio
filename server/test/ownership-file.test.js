// Ownership behavior and migration in the JSON file backend. This file points at a dead
// MongoDB port and uses a temporary store, so it never touches real local data.
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'exam-studio-ownership-file-'));
const dataFile = path.join(tempDir, 'store.json');
const backupRoot = path.join(tempDir, 'backups');
process.env.MONGODB_URI = 'mongodb://127.0.0.1:59999/none';
process.env.MONGODB_TIMEOUT_MS = '250';
process.env.DATA_FILE = dataFile;

const seed = {
  version: 2,
  users: [{ id: 'user-1', email: 'owner@example.com', name: 'Owner', role: 'teacher' }],
  items: [
    {
      id: 'personal-seed', userId: 'user-1', kind: 'notes', title: 'Seed personal',
      data: { title: 'Seed personal' }, createdAt: '2026-01-01T00:00:00.000Z',
      ownerType: 'personal', institutionId: null,
    },
    {
      id: 'institution-seed', userId: 'user-1', kind: 'exam', title: 'Seed institution',
      data: { title: 'Seed institution' }, createdAt: '2026-01-02T00:00:00.000Z',
      ownerType: 'institution', institutionId: 'institution-1',
    },
    {
      id: 'legacy-seed', userId: 'user-1', kind: 'handout', title: 'Legacy seed',
      data: { title: 'Legacy seed' }, createdAt: '2026-01-03T00:00:00.000Z',
    },
    {
      id: 'ambiguous-seed', userId: 'user-1', kind: 'notes', title: 'Ambiguous seed',
      data: { title: 'Ambiguous seed' }, createdAt: '2026-01-04T00:00:00.000Z',
      institutionId: 'institution-1',
    },
  ],
  institutions: [{ id: 'institution-1', name: 'Institution', slug: 'institution', type: 'school', status: 'active', createdBy: 'user-1', aiDailyLimit: null, createdAt: '2026-01-01T00:00:00.000Z' }],
  memberships: [], groups: [], groupMembers: [], assignments: [], plans: [], usageEvents: [],
  announcements: [], auditLog: [], settings: [], aiConfig: null, tokens: [],
};
fs.writeFileSync(dataFile, JSON.stringify(seed, null, 2));

let repo;
let database;
let migration;

before(async () => {
  database = await import('../lib/database.js');
  repo = await import('../lib/repository.js');
  migration = await import('../lib/ownershipMigration.js');
  await repo.initStorage();
  assert.equal(repo.storageMode(), 'file');
  assert.equal(database.isMongoReady(), false);
});

after(async () => {
  await database?.closeDatabaseConnections();
  fs.rmSync(tempDir, { recursive: true, force: true });
});

describe('JSON file ownership', () => {
  it('reads legacy records as personal and excludes them from institution queries', async () => {
    const legacy = await repo.getItem('legacy-seed', 'user-1');
    assert.equal(legacy.ownerType, 'personal');
    assert.equal(legacy.institutionId, null);

    const personal = await repo.listItems('user-1');
    assert.deepEqual(personal.map((entry) => entry.id), ['legacy-seed', 'personal-seed']);
    const institutional = await repo.listItemsForInstitution('institution-1');
    assert.deepEqual(institutional.map((entry) => entry.id), ['institution-seed']);
    assert.equal(await repo.getItemForInstitution('institution-seed', 'institution-1').then((item) => item.ownerType), 'institution');
  });

  it('gives new personal resources defaults and preserves institution ownership', async () => {
    const personal = await repo.saveItem({ kind: 'flashcards', title: 'New personal', data: {}, userId: 'user-1' });
    assert.equal(personal.ownerType, 'personal');
    assert.equal(personal.institutionId, null);

    const institutional = await repo.saveItem({
      kind: 'exam', title: 'New institution', data: {}, userId: 'user-1',
      ownerType: 'institution', institutionId: 'institution-1',
    });
    assert.equal(institutional.ownerType, 'institution');
    assert.equal(institutional.institutionId, 'institution-1');
    assert.equal(await repo.getItemForInstitution(institutional.id, 'institution-1').then((item) => item.id), institutional.id);
  });

  it('dry-run does not modify the store', async () => {
    const before = fs.readFileSync(dataFile, 'utf8');
    const report = await migration.runOwnershipMigration({ mode: 'dry-run' });
    const after = fs.readFileSync(dataFile, 'utf8');
    assert.equal(report.backend, 'file');
    assert.equal(report.totals.examined, 6);
    assert.equal(report.totals.needingOwnershipDefaults, 1);
    assert.equal(report.totals.alreadyCompliant, 4);
    assert.equal(report.totals.ambiguous, 1);
    assert.equal(report.totals.applied, 0);
    assert.equal(before, after);
  });

  it('apply backs up, adds only safe defaults and verifies', async () => {
    const report = await migration.runOwnershipMigration({ mode: 'apply', backupDir: backupRoot });
    assert.equal(report.totals.applied, 1);
    assert.ok(fs.existsSync(path.join(report.backupDir, 'store.json')));
    assert.equal(report.verification.totals.needingOwnershipDefaults, 0);
    assert.equal(report.verification.totals.ambiguous, 1);

    const store = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
    const legacy = store.items.find((item) => item.id === 'legacy-seed');
    const ambiguous = store.items.find((item) => item.id === 'ambiguous-seed');
    assert.equal(legacy.ownerType, 'personal');
    assert.equal(legacy.institutionId, null);
    assert.equal(ambiguous.ownerType, undefined);
    assert.equal(ambiguous.institutionId, 'institution-1');
    assert.equal(store.items.length, 6);
  });

  it('is idempotent and keeps existing operations working', async () => {
    const report = await migration.runOwnershipMigration({ mode: 'apply', backupDir: backupRoot });
    assert.equal(report.totals.applied, 0);
    assert.equal(await repo.listItems('user-1').then((items) => items.length), 3);
    assert.equal(await repo.listItemsForInstitution('institution-1').then((items) => items.length), 2);
    assert.equal((await repo.getItem('legacy-seed', 'user-1')).data.title, 'Legacy seed');
  });
});
