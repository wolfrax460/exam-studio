#!/usr/bin/env node
// Safe, additive ownership migration for Task 017.
//
// Examples:
//   node server/scripts/migrate-ownership.mjs                 # dry run
//   node server/scripts/migrate-ownership.mjs --verify        # read-only verification
//   node server/scripts/migrate-ownership.mjs --apply         # backup, then add safe defaults
//   node server/scripts/migrate-ownership.mjs --apply --backup-dir /secure/backups
//
// The command never deletes records or invents institution ownership. Ambiguous rows are
// reported for manual review and left untouched.
import { runOwnershipMigration } from '../lib/ownershipMigration.js';

const args = process.argv.slice(2);
const mode = args.includes('--apply') ? 'apply' : args.includes('--verify') ? 'verify' : 'dry-run';
const backupIndex = args.indexOf('--backup-dir');
const backupDir = backupIndex >= 0 ? args[backupIndex + 1] : undefined;

if (backupIndex >= 0 && !backupDir) {
  console.error('--backup-dir needs a directory path');
  process.exit(2);
}

try {
  const report = await runOwnershipMigration({ mode, backupDir });
  console.log(JSON.stringify(report, null, 2));
  if (mode === 'verify' && !report.verification?.clean) process.exitCode = 1;
} catch (error) {
  console.error(`Ownership migration failed: ${error.message}`);
  process.exitCode = 1;
}
