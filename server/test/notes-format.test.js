import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { blockText, notesWordCount, NOTES_FORMAT, validateNotes } from '../../shared/notes-format.js';

const demo = JSON.parse(readFileSync(new URL('../../shared/notes-demo.json', import.meta.url), 'utf8'));
const clone = () => JSON.parse(JSON.stringify(demo));

test('the demo document is valid', () => {
  const result = validateNotes(demo);
  assert.deepEqual(result.errors, []);
  assert.equal(result.ok, true);
});

test('the demo uses every block type the format defines', () => {
  const used = new Set(demo.sections.flatMap((section) => section.blocks.map((block) => block.type)));
  for (const type of ['paragraph', 'list', 'definition', 'table', 'callout', 'example', 'compare', 'check', 'trap']) {
    assert.ok(used.has(type), `demo never exercises the ${type} block`);
  }
});

test('a wrong format tag or version is rejected', () => {
  const doc = clone();
  doc.format = 'something/else';
  doc.version = 2;
  const result = validateNotes(doc);
  assert.equal(result.ok, false);
  assert.deepEqual(result.errors.map((error) => error.path), ['format', 'version']);
});

test('missing meta.title reports the exact path', () => {
  const doc = clone();
  delete doc.meta.title;
  const result = validateNotes(doc);
  assert.equal(result.ok, false);
  assert.equal(result.errors[0].path, 'meta.title');
});

test('an unknown block type is reported with its index', () => {
  const doc = clone();
  doc.sections[0].blocks[0] = { type: 'mindmap', nodes: [] };
  const result = validateNotes(doc);
  assert.equal(result.ok, false);
  assert.deepEqual(result.errors, [{ path: 'sections[0].blocks[0].type', message: 'unknown block type "mindmap"' }]);
});

test('a table row must match the column count', () => {
  const doc = clone();
  doc.sections[0].blocks[1].rows[0] = ['only one cell'];
  const result = validateNotes(doc);
  assert.equal(result.ok, false);
  assert.equal(result.errors[0].path, 'sections[0].blocks[1].rows[0]');
});

test('duplicate section ids are rejected', () => {
  const doc = clone();
  doc.sections[1].id = doc.sections[0].id;
  const result = validateNotes(doc);
  assert.equal(result.ok, false);
  assert.match(result.errors[0].message, /duplicate section id/);
});

test('an empty document fails instead of passing silently', () => {
  const result = validateNotes({});
  assert.equal(result.ok, false);
  assert.ok(result.errors.length > 3);
  assert.equal(result.errors[0].path, 'format');
});

test('block text covers every type and the word count is positive', () => {
  for (const section of demo.sections) {
    for (const block of section.blocks) {
      assert.ok(blockText(block).trim().length > 0, `${block.type} contributed no text`);
    }
  }
  assert.ok(notesWordCount(demo) > 400, `word count too low: ${notesWordCount(demo)}`);
});

test('the format tag is stable', () => {
  assert.equal(NOTES_FORMAT, 'exam-studio/study-notes');
});
