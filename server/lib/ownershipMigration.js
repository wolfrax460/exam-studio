// Additive ownership migration for the resources that existed before Phase B2.
//
// This module is intentionally separate from application startup. The CLI in
// server/scripts/migrate-ownership.mjs defaults to a dry run; only --apply writes.
//
// Legacy records without ownership fields are classified as personal only when an existing
// userId/ownerId field proves a personal owner. A legacy institutionId with no ownerType, an
// unknown ownerType, or a missing owner is reported for manual review and left untouched.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import LibraryItem from './models/LibraryItem.js';
import ExamPublication from './models/ExamPublication.js';
import ExamAttempt from './models/ExamAttempt.js';
import { initStorage, storageMode, getFileStore, saveFileStore, dataFilePath } from './repository.js';
import { classifyOwnership } from './ownership.js';

const here = path.dirname(fileURLToPath(import.meta.url));

const MONGO_RESOURCES = [
  { key: 'libraryItems', label: 'LibraryItem', model: LibraryItem, evidence: 'userId' },
  { key: 'examPublications', label: 'ExamPublication', model: ExamPublication, evidence: 'ownerId' },
  { key: 'examAttempts', label: 'ExamAttempt', model: ExamAttempt, evidence: 'ownerId' },
];

const FILE_RESOURCES = [
  { key: 'libraryItems', label: 'LibraryItem', fileKey: 'items', evidence: 'userId' },
];

const timestamp = () => new Date().toISOString().replace(/[:.]/g, '-');
const idOf = (record) => String(record._id ?? record.id ?? '(no id)');

function blankTotals() {
  return {
    examined: 0,
    needingOwnershipDefaults: 0,
    alreadyCompliant: 0,
    ambiguous: 0,
    applied: 0,
    skippedAmbiguous: 0,
  };
}

function addTotals(target, source) {
  for (const key of Object.keys(target)) target[key] += Number(source[key]) || 0;
}

function analyzeRecords(records, resource) {
  const counts = blankTotals();
  const needs = [];
  const review = [];
  counts.examined = records.length;

  for (const record of records) {
    const classification = classifyOwnership(record, resource.evidence);
    if (classification.status === 'needs-default') {
      counts.needingOwnershipDefaults += 1;
      needs.push(record);
      continue;
    }
    if (classification.status === 'compliant') {
      counts.alreadyCompliant += 1;
      continue;
    }
    counts.ambiguous += 1;
    counts.skippedAmbiguous += 1;
    review.push({
      resource: resource.label,
      id: idOf(record),
      reason: classification.reason || 'cannot be safely classified',
    });
  }

  return { counts, needs, review };
}

async function analyzeMongo() {
  const resources = {};
  const totals = blankTotals();
  const review = [];
  const needsByResource = new Map();

  for (const resource of MONGO_RESOURCES) {
    const records = await resource.model.find({}).lean();
    const analysis = analyzeRecords(records, resource);
    resources[resource.key] = analysis.counts;
    needsByResource.set(resource.key, analysis.needs);
    addTotals(totals, analysis.counts);
    review.push(...analysis.review);
  }

  return { resources, totals, review, needsByResource };
}

async function analyzeFile() {
  const store = getFileStore();
  const resources = {};
  const totals = blankTotals();
  const review = [];
  const needsByResource = new Map();

  for (const resource of FILE_RESOURCES) {
    const records = Array.isArray(store[resource.fileKey]) ? store[resource.fileKey] : [];
    const analysis = analyzeRecords(records, resource);
    resources[resource.key] = analysis.counts;
    needsByResource.set(resource.key, analysis.needs);
    addTotals(totals, analysis.counts);
    review.push(...analysis.review);
  }

  return { resources, totals, review, needsByResource };
}

async function analyze() {
  await initStorage();
  const backend = storageMode();
  const analysis = backend === 'mongo' ? await analyzeMongo() : await analyzeFile();
  return { backend, ...analysis };
}

function backupDirectory(backupDir) {
  const base = backupDir
    ? path.resolve(backupDir)
    : path.resolve(process.env.OWNERSHIP_BACKUP_DIR || path.join(here, '../data/backups'));
  return path.join(base, `ownership-${timestamp()}`);
}

async function createBackup(backend, analysis, backupDir) {
  const target = backupDirectory(backupDir);
  fs.mkdirSync(target, { recursive: true });

  const source = dataFilePath();
  if (backend === 'file') {
    if (fs.existsSync(source)) fs.copyFileSync(source, path.join(target, 'store.json'));
    return target;
  }

  for (const resource of MONGO_RESOURCES) {
    const records = await resource.model.find({}).lean();
    fs.writeFileSync(path.join(target, `${resource.key}.json`), JSON.stringify(records, null, 2));
  }
  return target;
}

async function applyMongo(analysis) {
  let applied = 0;
  for (const resource of MONGO_RESOURCES) {
    const needs = analysis.needsByResource.get(resource.key) || [];
    for (const record of needs) {
      // Guard the update against a concurrent ownership change: only a record that still has
      // missing/personal ownership may receive the safe personal defaults.
      const result = await resource.model.collection.updateOne(
        {
          _id: record._id,
          $and: [
            { $or: [{ ownerType: { $exists: false } }, { ownerType: null }, { ownerType: '' }, { ownerType: 'personal' }] },
            { $or: [{ institutionId: { $exists: false } }, { institutionId: null }, { institutionId: '' }] },
          ],
        },
        { $set: { ownerType: 'personal', institutionId: null } },
      );
      applied += result.modifiedCount;
    }
  }
  return applied;
}

async function applyFile(analysis) {
  const store = getFileStore();
  let applied = 0;
  for (const resource of FILE_RESOURCES) {
    const records = Array.isArray(store[resource.fileKey]) ? store[resource.fileKey] : [];
    const needs = new Set((analysis.needsByResource.get(resource.key) || []).map(idOf));
    for (const record of records) {
      if (!needs.has(idOf(record))) continue;
      record.ownerType = 'personal';
      record.institutionId = null;
      applied += 1;
    }
  }
  if (applied > 0) saveFileStore();
  return applied;
}

/**
 * Run the additive ownership migration.
 *
 * @param {object} options
 * @param {'dry-run'|'apply'|'verify'} [options.mode]
 * @param {string} [options.backupDir] base directory for the apply backup
 * @returns {Promise<object>} counts, per-resource counts, review rows and verification
 */
export async function runOwnershipMigration({ mode = 'dry-run', backupDir } = {}) {
  if (!['dry-run', 'apply', 'verify'].includes(mode)) {
    throw new Error('mode must be dry-run, apply or verify');
  }

  const analysis = await analyze();
  const report = {
    mode,
    backend: analysis.backend,
    resources: analysis.resources,
    totals: { ...analysis.totals },
    review: analysis.review,
    backupDir: null,
    verification: null,
  };
  if (mode === 'apply') {
    report.backupDir = await createBackup(analysis.backend, analysis, backupDir);
  }
  if (mode === 'apply') {
    report.totals.applied = analysis.backend === 'mongo'
      ? await applyMongo(analysis)
      : await applyFile(analysis);
    const verification = await analyze();
    report.verification = {
      backend: verification.backend,
      resources: verification.resources,
      totals: { ...verification.totals },
      review: verification.review,
      clean: verification.totals.needingOwnershipDefaults === 0 && verification.totals.ambiguous === 0,
    };
  } else if (mode === 'verify') {
    report.verification = {
      backend: analysis.backend,
      resources: analysis.resources,
      totals: { ...analysis.totals },
      review: analysis.review,
      clean: analysis.totals.needingOwnershipDefaults === 0 && analysis.totals.ambiguous === 0,
    };
  }
  return report;
}

export const _internals = { analyze, backupDirectory, MONGO_RESOURCES, FILE_RESOURCES };
