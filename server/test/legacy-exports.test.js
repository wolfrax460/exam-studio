import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { examCsv, keyCsv } from '../lib/csv.js';
import { keyDocx } from '../lib/docx.js';
import { keyPdf } from '../lib/pdf.js';
import { readZip } from './zip.js';

const choices = ['A', 'B', 'C', 'D', 'B', 'C', 'A'];
const exam = {
  title: 'Évaluation de programmation',
  sections: [
    {
      id: 'A', title: 'Multiple choice', kind: 'mcq', marksPerItem: 1,
      items: choices.map((answer, i) => ({
        text: `Choose option for question ${i + 1}`,
        options: ['Alpha', 'Beta', 'Gamma', 'Delta'],
        answer,
      })),
    },
    {
      id: 'E', title: 'Programming', kind: 'structured',
      items: [{
        title: 'Explain the café system', totalMarks: 2,
        parts: [{ letter: 'a', text: 'Describe the query', marks: 2 }],
        modelAnswer: 'Private model answer',
        markingPoints: [{ point: 'Explains the filter', marks: 2 }],
        code: 'SELECT id FROM menu;',
      }],
    },
  ],
};

test('the Word marking scheme includes every multiple-choice answer', async () => {
  const zip = readZip(await keyDocx(exam));
  const xml = zip.get('word/document.xml').toString('utf8');
  const wordCells = [...xml.matchAll(/<w:t(?: [^>]*)?>([^<]*)<\/w:t>/g)].map((match) => match[1]);
  for (const [index, answer] of choices.entries()) {
    const number = String(index + 1);
    assert.ok(wordCells.some((cell, i) => cell === number && wordCells[i + 1] === answer), `Word answer ${number}`);
  }
});

test('the PDF marking scheme includes every multiple-choice answer', async () => {
  const standardFontDataUrl = fileURLToPath(new URL('./standard_fonts/', import.meta.resolve('pdfjs-dist/package.json'))).replaceAll('\\', '/');
  const task = getDocument({ data: new Uint8Array(await keyPdf(exam)), standardFontDataUrl });
  try {
    const document = await task.promise;
    const text = [];
    for (let page = 1; page <= document.numPages; page += 1) {
      const contents = await (await document.getPage(page)).getTextContent();
      text.push(contents.items.map(({ str }) => str).join(' '));
    }
    const key = text.join(' ').split('SECTION A: Multiple choice').at(-1).split('SECTION E: Programming')[0];
    for (const [index, answer] of choices.entries()) {
      assert.match(key, new RegExp(`\\b${index + 1}\\s+${answer}\\b`));
    }
  } finally {
    await task.destroy();
  }
});

test('sectioned CSVs keep continuous numbering, marks, options, subparts and the separate marking scheme', () => {
  const questions = examCsv(exam);
  assert.match(questions, /"1","Multiple choice","1","Choose option for question 1","A\. Alpha/);
  assert.match(questions, /"8","Structured \/ practical","2","Explain the café system","\(a\) Describe the query \[2\smarks\]"/);
  assert.doesNotMatch(questions, /Private model answer|Explains the filter|SELECT/);
  const key = keyCsv(exam);
  assert.match(key, /"7","Multiple choice","1","A",""/);
  assert.match(key, /"8","Structured \/ practical","2","Private model answer","Explains the filter \[2\smarks\]\nSELECT id FROM menu;"/);
});

test('classic CSVs retain their columns and question content', () => {
  const classic = { questions: [{ type: 'short_answer', marks: 2, prompt: 'Décrivez le rôle.', answer: 'A response.' }] };
  assert.match(examCsv(classic), /^\uFEFF"Q","Type","Marks","Question \/ instructions","Items \/ options"\r\n"1","[^"]+","2","Décrivez le rôle\.",""$/);
  assert.match(keyCsv(classic), /^\uFEFF"Q","Type","Marks","Answer","Marking notes"/);
});
