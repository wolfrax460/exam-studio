// Ownership metadata and the additive migration, against an isolated MongoDB database.
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import mongoose from 'mongoose';
import { dropTestDatabase } from './helpers.js';
import * as repo from '../lib/repository.js';
import LibraryItem from '../lib/models/LibraryItem.js';
import ExamPublication from '../lib/models/ExamPublication.js';
import ExamAttempt from '../lib/models/ExamAttempt.js';
import { runOwnershipMigration } from '../lib/ownershipMigration.js';
import { classifyOwnership } from '../lib/ownership.js';
import { closeDatabaseConnections } from '../lib/database.js';

const id = () => new mongoose.Types.ObjectId().toString();
const ownerId = id();
const institutionId = id();
const backupRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'exam-studio-ownership-backup-'));
let personalId;
let institutionItemId;
let legacyItemId;
let ambiguousItemId;

before(async () => {
  await dropTestDatabase();
  await repo.initStorage();
  assert.equal(repo.storageMode(), 'mongo');

  const personal = await repo.saveItem({
    kind: 'notes',
    title: 'Personal notes',
    data: { title: 'Personal notes', body: 'owned by one user' },
    userId: ownerId,
  });
  personalId = personal.id;

  const institutional = await repo.saveItem({
    kind: 'exam',
    title: 'Institution exam',
    data: { title: 'Institution exam', questions: [] },
    userId: ownerId,
    ownerType: 'institution',
    institutionId,
  });
  institutionItemId = institutional.id;

  // These are raw inserts on purpose: legacy documents do not have ownership fields.
  const legacy = await LibraryItem.collection.insertOne({
    userId: new mongoose.Types.ObjectId(ownerId),
    kind: 'handout',
    title: 'Legacy handout',
    data: { title: 'Legacy handout' },
    createdAt: new Date(),
  });
  legacyItemId = String(legacy.insertedId);

  const ambiguous = await LibraryItem.collection.insertOne({
    userId: new mongoose.Types.ObjectId(ownerId),
    kind: 'notes',
    title: 'Ambiguous item',
    data: { title: 'Ambiguous item' },
    institutionId: new mongoose.Types.ObjectId(institutionId),
    createdAt: new Date(),
  });
  ambiguousItemId = String(ambiguous.insertedId);

  await ExamPublication.collection.insertOne({
    examId: new mongoose.Types.ObjectId(personalId),
    ownerId: new mongoose.Types.ObjectId(ownerId),
    shareCode: 'legacy-share-code',
    title: 'Legacy publication',
    active: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  await ExamAttempt.collection.insertOne({
    publicationId: new mongoose.Types.ObjectId(),
    examId: new mongoose.Types.ObjectId(personalId),
    ownerId: new mongoose.Types.ObjectId(ownerId),
    startedAt: new Date(),
    deadlineAt: new Date(Date.now() + 60_000),
    createdAt: new Date(),
    updatedAt: new Date(),
  });
});

after(async () => {
  await closeDatabaseConnections();
  await dropTestDatabase();
  fs.rmSync(backupRoot, { recursive: true, force: true });
});

describe('MongoDB ownership', () => {
  it('gives new personal resources personal ownership defaults', async () => {
    const item = await repo.getItem(personalId, ownerId);
    assert.equal(item.ownerType, 'personal');
    assert.equal(item.institutionId, null);
    assert.equal(item.data.body, 'owned by one user');
    const list = await repo.listItems(ownerId);
    assert.ok(list.some((entry) => entry.id === personalId && entry.ownerType === 'personal'));
  });

  it('keeps institution ownership and supports ownership queries', async () => {
    const item = await repo.getItemForInstitution(institutionItemId, institutionId);
    assert.equal(item.ownerType, 'institution');
    assert.equal(item.institutionId, institutionId);
    assert.equal(item.data.title, 'Institution exam');

    const list = await repo.listItemsForInstitution(institutionId);
    assert.deepEqual(list.map((entry) => entry.id), [institutionItemId]);
    assert.ok(!(await repo.listItems(ownerId)).some((entry) => entry.id === institutionItemId));

    const count = await LibraryItem.countDocuments({
      ownerType: 'institution',
      institutionId: new mongoose.Types.ObjectId(institutionId),
    });
    assert.equal(count, 1);
  });

  it('classifies partially owned personal records as needing a safe default', () => {
    assert.equal(classifyOwnership({ ownerType: 'personal', userId: ownerId }).status, 'needs-default');
    assert.equal(classifyOwnership({ ownerType: 'personal', userId: ownerId, institutionId: null }).status, 'compliant');
    assert.equal(classifyOwnership({ ownerType: 'personal', userId: ownerId, institutionId }).status, 'ambiguous');
  });

  it('reads legacy records as personal without assigning them to an institution', async () => {
    const item = await repo.getItem(legacyItemId, ownerId);
    assert.equal(item.ownerType, 'personal');
    assert.equal(item.institutionId, null);
    assert.ok((await repo.listItems(ownerId)).some((entry) => entry.id === legacyItemId));
    assert.ok(!(await repo.listItemsForInstitution(institutionId)).some((entry) => entry.id === legacyItemId));

    const raw = await LibraryItem.collection.findOne({ _id: new mongoose.Types.ObjectId(legacyItemId) });
    assert.equal(raw.ownerType, undefined, 'reading must not write defaults');
    assert.equal(raw.institutionId, undefined);
  });

  it('dry-run reports the exact ownership backlog without modifying data', async () => {
    const report = await runOwnershipMigration({ mode: 'dry-run' });
    assert.equal(report.backend, 'mongo');
    assert.equal(report.totals.examined, 6);
    assert.equal(report.totals.needingOwnershipDefaults, 3);
    assert.equal(report.totals.alreadyCompliant, 2);
    assert.equal(report.totals.ambiguous, 1);
    assert.equal(report.totals.applied, 0);
    assert.equal(report.backupDir, null);
    assert.equal(report.review.length, 1);
    assert.equal(report.review[0].id, ambiguousItemId);

    const raw = await LibraryItem.collection.findOne({ _id: new mongoose.Types.ObjectId(legacyItemId) });
    assert.equal(raw.ownerType, undefined);
  });

  it('apply adds only safe personal defaults, creates a backup and verifies', async () => {
    const report = await runOwnershipMigration({ mode: 'apply', backupDir: backupRoot });
    assert.equal(report.totals.applied, 3);
    assert.ok(report.backupDir);
    assert.ok(fs.existsSync(path.join(report.backupDir, 'libraryItems.json')));
    assert.ok(fs.existsSync(path.join(report.backupDir, 'examPublications.json')));
    assert.ok(fs.existsSync(path.join(report.backupDir, 'examAttempts.json')));
    assert.equal(report.verification.totals.needingOwnershipDefaults, 0);
    assert.equal(report.verification.totals.ambiguous, 1);
    assert.equal(report.verification.clean, false);

    const legacy = await repo.getItem(legacyItemId, ownerId);
    assert.equal(legacy.ownerType, 'personal');
    assert.equal(legacy.institutionId, null);
    const publication = await ExamPublication.findById((await ExamPublication.findOne({ shareCode: 'legacy-share-code' }))._id).lean();
    assert.equal(publication.ownerType, 'personal');
    assert.equal(publication.institutionId, null);
    const attempt = await ExamAttempt.findOne({}).lean();
    assert.equal(attempt.ownerType, 'personal');
    assert.equal(attempt.institutionId, null);

    const ambiguous = await LibraryItem.collection.findOne({ _id: new mongoose.Types.ObjectId(ambiguousItemId) });
    assert.equal(ambiguous.ownerType, undefined);
    assert.ok(ambiguous.institutionId);
  });

  it('is idempotent and preserves all records', async () => {
    const report = await runOwnershipMigration({ mode: 'apply', backupDir: backupRoot });
    assert.equal(report.totals.applied, 0);
    assert.equal(await LibraryItem.countDocuments({}), 4);
    assert.equal(await ExamPublication.countDocuments({}), 1);
    assert.equal(await ExamAttempt.countDocuments({}), 1);
    assert.equal((await repo.listItems(ownerId)).length, 2, 'personal and migrated legacy items remain');
  });

  it('adds a missing personal institutionId without touching ambiguous records', async () => {
    const partial = await LibraryItem.collection.insertOne({
      userId: new mongoose.Types.ObjectId(ownerId),
      kind: 'notes',
      title: 'Partially owned item',
      data: { title: 'Partially owned item' },
      ownerType: 'personal',
      createdAt: new Date(),
    });
    const report = await runOwnershipMigration({ mode: 'apply', backupDir: backupRoot });
    assert.equal(report.totals.needingOwnershipDefaults, 1);
    assert.equal(report.totals.applied, 1);
    assert.equal(report.verification.totals.needingOwnershipDefaults, 0);

    const raw = await LibraryItem.collection.findOne({ _id: partial.insertedId });
    assert.equal(raw.ownerType, 'personal');
    assert.equal(raw.institutionId, null);
    const ambiguous = await LibraryItem.collection.findOne({ _id: new mongoose.Types.ObjectId(ambiguousItemId) });
    assert.equal(ambiguous.ownerType, undefined);
  });
});
