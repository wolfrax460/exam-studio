import assert from 'node:assert/strict';
import { test } from 'node:test';

import { validateNotes } from '../../shared/notes-format.js';
import { demoNotes } from '../lib/demo.js';
import { notesDocumentFromNotes } from '../lib/notesDocument.js';
import { notesDocx } from '../lib/docx.js';

test('legacy generated notes become a valid rich document without losing old fields', () => {
  const source = demoNotes();
  const doc = notesDocumentFromNotes(source, { title: 'Database Development', level: 'L4', sourceChars: 4800 });

  assert.equal(doc.format, 'exam-studio/study-notes');
  assert.equal(doc.version, 1);
  assert.equal(doc.title, source.title);
  assert.equal(doc.meta.title, source.title);
  assert.equal(doc.meta.unit, 'Database Development');
  assert.equal(doc.meta.level, 'L4');
  assert.ok(doc.summary.length > 0);
  assert.ok(doc.objectives.length > 0);
  assert.equal(doc.sections.length, source.sections.length);
  assert.deepEqual(validateNotes(doc), { ok: true, errors: [] });

  for (const section of doc.sections) {
    assert.ok(section.id);
    assert.ok(section.blocks.length > 0);
    assert.equal(section.topic, section.title, 'legacy topic is retained');
    assert.ok(Array.isArray(section.keyPoints));
  }
});

test('rich blocks including tables and code are preserved', () => {
  const source = {
    title: 'SQL joins',
    sections: [{
      topic: 'Joining tables',
      blocks: [
        { type: 'paragraph', text: 'A join combines rows from two tables.' },
        { type: 'table', columns: ['Join', 'What it keeps'], rows: [['INNER', 'Matching rows only']] },
        { type: 'code', language: 'sql', code: 'SELECT * FROM students JOIN results ON students.id = results.student_id;' },
      ],
    }],
  };
  const doc = notesDocumentFromNotes(source);
  assert.equal(doc.sections[0].blocks[0].type, 'paragraph');
  assert.equal(doc.sections[0].blocks[1].type, 'table');
  assert.equal(doc.sections[0].blocks[2].type, 'code');
  assert.match(doc.sections[0].blocks[2].code, /JOIN results/);
  assert.equal(validateNotes(doc).ok, true);
});

test('empty generated notes fail clearly instead of producing a blank document', () => {
  assert.throws(
    () => notesDocumentFromNotes({ title: 'Empty', sections: [] }),
    /no usable notes/i,
  );
});

test('a rich notes document exports to a Word file', async () => {
  const doc = notesDocumentFromNotes(demoNotes(), { title: 'Database', sourceChars: 1200 });
  const buffer = await notesDocx(doc);
  assert.equal(buffer.subarray(0, 2).toString(), 'PK', 'docx is a zip container');
  assert.ok(buffer.length > 1000);
});
