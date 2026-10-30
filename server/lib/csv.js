import { questionLines, answerText, markingNote, QUESTION_TYPES } from '../../shared/format.js';

// Spreadsheet programs run text that starts with = + - @ as a formula. Prefix those cells.
function cell(v) {
  let s = String(v ?? '');
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}
const row = (cols) => cols.map(cell).join(',');

export function examCsv(exam) {
  const lines = [row(['Q', 'Type', 'Marks', 'Question / instructions', 'Items / options'])];
  (exam.questions || []).forEach((q, i) => {
    lines.push(row([i + 1, QUESTION_TYPES[q.type] || q.type, q.marks, q.prompt, questionLines(q).join('\n')]));
  });
  return '﻿' + lines.join('\r\n');
}

export function keyCsv(exam) {
  const lines = [row(['Q', 'Type', 'Marks', 'Answer', 'Marking notes'])];
  (exam.questions || []).forEach((q, i) => {
    lines.push(row([i + 1, QUESTION_TYPES[q.type] || q.type, q.marks, answerText(q), q.type === 'essay' ? (q.notes || '') : markingNote(q)]));
  });
  return '﻿' + lines.join('\r\n');
}
