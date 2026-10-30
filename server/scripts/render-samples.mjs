// Render the built-in samples so they can be opened and looked at.
//
//   npm --prefix server run render-samples            # writes to ./samples
//   npm --prefix server run render-samples D:\tmp\out
//
// Tests can prove a file has the right bytes; only looking at it proves the layout is right.
// Convert the .docx to PDF and render pages with the LibreOffice kit, then open the images.
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { examDocx, keyDocx, notesDocx, handoutDocx } from '../lib/docx.js';
import { handoutPdf } from '../lib/pdf.js';
import { demoExam, demoNotes, demoHandout } from '../lib/demo.js';

const dir = path.resolve(process.argv[2] || 'samples');
mkdirSync(dir, { recursive: true });

const meta = { module: 'Database Development', level: 'L4', trade: 'Software Development', duration: '3 HOURS' };
const files = [
  ['Demo_Exam.docx', await examDocx(demoExam(), meta)],
  ['Demo_Marking_Scheme.docx', await keyDocx(demoExam(), meta)],
  ['Demo_Study_Notes.docx', await notesDocx(demoNotes())],
  ['Demo_Study_Handout.docx', await handoutDocx(demoHandout())],
  ['Demo_Study_Handout.pdf', await handoutPdf(demoHandout())],
];

for (const [name, buffer] of files) {
  writeFileSync(path.join(dir, name), buffer);
  console.log(`${name}  ${buffer.length} bytes`);
}
console.log(`written to ${dir}`);
