import {
  L, questionLines, answerText, markingNote, QUESTION_TYPES,
  isSectionsExam, numberedItems, itemMarks, marksLabel, SECTION_KINDS,
} from '../../shared/format.js';

// Spreadsheet programs run text that starts with = + - @ as a formula. Prefix those cells.
function cell(v) {
  let s = String(v ?? '');
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}
const row = (cols) => cols.map(cell).join(',');

export function examCsv(exam) {
  const lines = [row(['Q', 'Type', 'Marks', 'Question / instructions', 'Items / options'])];
  if (isSectionsExam(exam)) {
    for (const { number, section, kind, item } of numberedItems(exam)) {
      let details = [];
      if (kind === 'mcq' && Array.isArray(item.options)) {
        details = item.options.map((option, index) => `${L[index] || index + 1}. ${option}`);
      } else if (kind === 'structured' && Array.isArray(item.parts)) {
        details = item.parts.map((part, index) =>
          `(${part.letter || index + 1}) ${part.text || ''} [${marksLabel(part.marks)}]`);
      }
      lines.push(row([number, SECTION_KINDS[kind] || kind, itemMarks(item, section), item.text || item.title, details.join('\n')]));
    }
    return '\uFEFF' + lines.join('\r\n');
  }
  (exam.questions || []).forEach((q, i) => {
    lines.push(row([i + 1, QUESTION_TYPES[q.type] || q.type, q.marks, q.prompt, questionLines(q).join('\n')]));
  });
  return '﻿' + lines.join('\r\n');
}

export function keyCsv(exam) {
  const lines = [row(['Q', 'Type', 'Marks', 'Answer', 'Marking notes'])];
  if (isSectionsExam(exam)) {
    for (const { number, section, kind, item } of numberedItems(exam)) {
      const points = Array.isArray(item.markingPoints)
        ? item.markingPoints.map((point) => `${point.point} [${marksLabel(point.marks)}]`) : [];
      const notes = [item.notes, ...points, item.code].filter(Boolean).join('\n');
      lines.push(row([number, SECTION_KINDS[kind] || kind, itemMarks(item, section), item.answer ?? item.modelAnswer, notes]));
    }
    return '\uFEFF' + lines.join('\r\n');
  }
  (exam.questions || []).forEach((q, i) => {
    lines.push(row([i + 1, QUESTION_TYPES[q.type] || q.type, q.marks, answerText(q), q.type === 'essay' ? (q.notes || '') : markingNote(q)]));
  });
  return '﻿' + lines.join('\r\n');
}
