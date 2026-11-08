import assert from 'node:assert/strict';
import { test } from 'node:test';
import { suggestOutcomes, MAX_OUTCOMES } from '../../shared/outcomes.js';

test('explicit learning outcome markers are used, in order', () => {
  const text = [
    'Unit 4: Database design',
    'Learning outcome 1: Design a normalised schema',
    'LO2 Back up and restore a database',
    'LO3: Explain referential integrity',
  ].join('\n');
  const out = suggestOutcomes(text);
  assert.deepEqual(out, [
    'Database design',
    'Design a normalised schema',
    'Back up and restore a database',
    'Explain referential integrity',
  ]);
});

test('empty text suggests nothing so the caller can skip the AI call', () => {
  assert.deepEqual(suggestOutcomes(''), []);
  assert.deepEqual(suggestOutcomes('   \n\n  '), []);
  assert.deepEqual(suggestOutcomes(null), []);
});

test('unit and topic headings count, including numbered ones', () => {
  const out = suggestOutcomes('Topic: Indexes and performance\n1.2 Normalisation steps\nCHAPTER 3 Transactions');
  assert.deepEqual(out, ['Indexes and performance', 'Normalisation steps', 'Transactions']);
});

test('prose with no headings falls back to sentence-shaped lines', () => {
  const prose = 'Normalisation removes redundancy from a database.\nFirst normal form requires atomic values.\nOk.';
  const out = suggestOutcomes(prose);
  assert.equal(out.length, 2);
  assert.equal(out[0], 'Normalisation removes redundancy from a database');
  assert.ok(out.some((line) => line.includes('atomic values')));
});

test('duplicates are removed case-insensitively', () => {
  const out = suggestOutcomes('Learning outcome 1: Design a schema\nLO1 design a schema');
  assert.deepEqual(out, ['Design a schema']);
});

test('results are capped and every entry is a usable length', () => {
  const text = Array.from({ length: 30 }, (_, i) => `LO${i + 1} Outcome number ${i + 1} for the module`).join('\n');
  const out = suggestOutcomes(text);
  assert.equal(out.length, MAX_OUTCOMES);
  assert.ok(out.every((line) => line.length >= 8 && line.length <= 160));
});

test('a wall of long prose lines yields nothing rather than a paragraph in the box', () => {
  const long = 'x'.repeat(400);
  assert.deepEqual(suggestOutcomes(`${long}\n${long}`), []);
});
