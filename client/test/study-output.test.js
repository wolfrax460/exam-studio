import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import {
  handoutPlainText,
  isNotesDocument,
  isValidNotesDocument,
  lastOutputKey,
  legacyNotesText,
  notesPlainText,
  outputTitle,
  studyNotesText,
} from '../src/study-output.js';

const demo = JSON.parse(readFileSync(new URL('../../shared/notes-demo.json', import.meta.url), 'utf8'));
const clone = () => JSON.parse(JSON.stringify(demo));

test('rich notes are detected and validate', () => {
  assert.equal(isNotesDocument(demo), true);
  assert.equal(isValidNotesDocument(demo), true);
  assert.equal(isNotesDocument({ title: 'legacy', sections: [] }), false);
});

test('rich notes copy preserves headings, lists, tables and code', () => {
  const doc = clone();
  doc.sections[0].blocks.push({ type: 'code', language: 'sql', code: 'SELECT 1;' });
  const text = notesPlainText(doc);
  assert.match(text, /Cell membrane transport/);
  assert.match(text, /Why the membrane is selective/);
  assert.match(text, /O₂, CO₂/);
  assert.match(text, /SELECT 1;/);
});

test('legacy notes still copy cleanly', () => {
  const text = studyNotesText({ title: 'Legacy', sections: [{ topic: 'Topic', keyPoints: ['Point one'], example: 'Example one' }] });
  assert.match(text, /Legacy/);
  assert.match(text, /Point one/);
  assert.match(text, /Remember: Example one/);
  assert.equal(legacyNotesText({ title: 'Legacy', sections: [] }), 'Legacy');
});

test('handout copy includes lessons, tables and worked examples', () => {
  const handout = {
    title: 'Study handout',
    moduleName: 'Database Development',
    units: [{
      number: '1', title: 'Design', learningOutcome: 'Design a database.',
      lessons: [{
        number: '1.1', title: 'Entities',
        keyTerms: [{ term: 'Entity', meaning: 'A thing stored as a table.' }],
        blocks: [{ kind: 'table', rows: [['Primary key', 'Unique row id']] }],
        workedExample: { title: 'Customer table', steps: ['Choose a key'], answer: 'CustomerID' },
      }],
    }],
  };
  const text = handoutPlainText(handout);
  assert.match(text, /Study handout/);
  assert.match(text, /Entity: A thing stored as a table/);
  assert.match(text, /Primary key \| Unique row id/);
  assert.match(text, /Customer table/);
});

test('long documents are not truncated', () => {
  const doc = clone();
  doc.sections = Array.from({ length: 120 }, (_, index) => ({
    id: `section-${index}`,
    title: `Section ${index}`,
    blocks: [{ type: 'paragraph', text: `Paragraph ${index}` }],
  }));
  const text = notesPlainText(doc);
  assert.match(text, /Section 119/);
  assert.match(text, /Paragraph 119/);
  assert.ok(text.length > 3000);
});

test('library titles work for rich and legacy outputs', () => {
  assert.equal(outputTitle('notes', demo), 'Cell membrane transport');
  assert.equal(outputTitle('notes', { title: 'Old notes' }), 'Old notes');
  assert.equal(outputTitle('handout', { title: 'Handout title' }), 'Handout title');
  assert.equal(outputTitle('notes', {}), 'Study notes');
});

test('last-output keys are scoped to user and kind', () => {
  assert.notEqual(lastOutputKey('user-a', 'notes'), lastOutputKey('user-b', 'notes'));
  assert.notEqual(lastOutputKey('user-a', 'notes'), lastOutputKey('user-a', 'handout'));
  assert.match(lastOutputKey(null, 'notes'), /anonymous/);
});
