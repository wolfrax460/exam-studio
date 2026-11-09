import { blockText, validateNotes } from '../../shared/notes-format.js';

export const RICH_NOTES_FORMAT = 'exam-studio/study-notes';

/** A rich notes document, regardless of whether every field is valid. */
export function isNotesDocument(doc) {
  return Boolean(doc && typeof doc === 'object' && doc.format === RICH_NOTES_FORMAT);
}

/** A rich notes document that is safe for NotesReader to render. */
export function isValidNotesDocument(doc) {
  return isNotesDocument(doc) && validateNotes(doc).ok;
}

export function notesDocumentErrors(doc) {
  return isNotesDocument(doc) ? validateNotes(doc).errors : [];
}

const text = (value) => (typeof value === 'string' ? value.trim() : '');
const list = (value) => (Array.isArray(value) ? value.map(text).filter(Boolean) : []);

/** The title to store beside a generated resource in the Library. */
export function outputTitle(kind, data) {
  const title = kind === 'notes'
    ? text(data?.meta?.title) || text(data?.title)
    : text(data?.title) || text(data?.meta?.title) || text(data?.moduleName);
  return title || (kind === 'handout' ? 'Study handout' : kind === 'notes' ? 'Study notes' : 'Untitled');
}

/** A readable copy of a rich notes document, including tables and code. */
export function notesPlainText(doc) {
  if (!isNotesDocument(doc)) return legacyNotesText(doc);
  const lines = [];
  const meta = doc.meta || {};
  if (meta.unit) lines.push(meta.unit);
  if (meta.title) lines.push(meta.title);
  const chips = [meta.course, meta.level, meta.estimatedMinutes ? `${meta.estimatedMinutes} min read` : ''].filter(Boolean);
  if (chips.length) lines.push(chips.join(' · '));
  if (doc.summary) lines.push('', doc.summary);
  if (list(doc.objectives).length) {
    lines.push('', 'By the end you should be able to');
    for (const item of doc.objectives) lines.push(`- ${item}`);
  }
  if (Array.isArray(doc.keyTerms) && doc.keyTerms.length) {
    lines.push('', 'Key terms');
    for (const entry of doc.keyTerms) {
      if (entry?.term) lines.push(`${entry.term}: ${entry.definition || ''}`.trim());
    }
  }
  for (const [index, section] of (Array.isArray(doc.sections) ? doc.sections : []).entries()) {
    lines.push('', `${index + 1}. ${section.title || 'Section'}`);
    for (const block of section.blocks || []) {
      const value = blockText(block);
      if (value) lines.push(value);
    }
  }
  if (list(doc.examFocus).length) {
    lines.push('', 'What the exam asks for');
    for (const item of doc.examFocus) lines.push(`- ${item}`);
  }
  if (list(doc.checklist).length) {
    lines.push('', 'Before you close the book');
    for (const item of doc.checklist) lines.push(`- [ ] ${item}`);
  }
  return lines.join('\n').trim();
}

/** A readable copy of the older bullet-only notes shape. */
export function legacyNotesText(notes) {
  const lines = [];
  if (text(notes?.title)) lines.push(notes.title);
  for (const section of Array.isArray(notes?.sections) ? notes.sections : []) {
    if (text(section?.topic)) lines.push('', section.topic);
    for (const point of Array.isArray(section?.keyPoints) ? section.keyPoints : []) {
      if (text(point)) lines.push(`- ${point}`);
    }
    if (text(section?.example)) lines.push(`Remember: ${section.example}`);
  }
  return lines.join('\n').trim();
}

export function studyNotesText(notes) {
  return isNotesDocument(notes) ? notesPlainText(notes) : legacyNotesText(notes);
}

/** A readable copy of a handout, preserving lessons, tables, examples and revision material. */
export function handoutPlainText(handout) {
  const lines = [];
  const push = (value) => { if (text(value)) lines.push(String(value).trim()); };
  push(handout?.title);
  push(handout?.moduleName);
  push([handout?.level, handout?.trade].filter(Boolean).join(' · '));

  for (const unit of Array.isArray(handout?.units) ? handout.units : []) {
    lines.push('', `Unit ${unit.number || ''}: ${unit.title || ''}`.trim());
    push(unit.learningOutcome);
    for (const lesson of Array.isArray(unit.lessons) ? unit.lessons : []) {
      lines.push('', `${lesson.number || ''} ${lesson.title || ''}`.trim());
      for (const term of Array.isArray(lesson.keyTerms) ? lesson.keyTerms : []) {
        if (term?.term) lines.push(`${term.term}: ${term.meaning || ''}`.trim());
      }
      for (const block of Array.isArray(lesson.blocks) ? lesson.blocks : []) {
        if (text(block?.heading)) lines.push(block.heading);
        if (text(block?.text)) lines.push(block.text);
        for (const item of Array.isArray(block?.items) ? block.items : []) push(item);
        for (const row of Array.isArray(block?.rows) ? block.rows : []) {
          if (Array.isArray(row)) lines.push(row.map((cell) => String(cell ?? '')).join(' | '));
        }
        if (text(block?.code)) lines.push(block.code);
      }
      for (const callout of Array.isArray(lesson.callouts) ? lesson.callouts : []) {
        if (callout?.text) lines.push(`${callout.label || 'Note'}: ${callout.text}`);
      }
      const example = lesson.workedExample;
      if (example) {
        lines.push('', `Worked example: ${example.title || ''}`.trim());
        push(example.task);
        push(example.thinking);
        for (const step of Array.isArray(example.steps) ? example.steps : []) push(step);
        push(example.code);
        push(example.expected);
        push(example.why);
      }
    }
    for (const diagram of Array.isArray(unit.diagrams) ? unit.diagrams : []) {
      lines.push('', diagram.title || 'Diagram');
      push(diagram.ascii);
      for (const step of Array.isArray(diagram.readSteps) ? diagram.readSteps : []) push(step);
    }
    for (const row of Array.isArray(unit.memorySheet) ? unit.memorySheet : []) {
      lines.push(`${row.remember || ''}: ${row.answer || ''}`.trim());
    }
    for (const tip of Array.isArray(unit.studyTips) ? unit.studyTips : []) push(tip);
  }
  return lines.join('\n').trim();
}

/** Local storage key used to restore the last saved generated document for this user. */
export function lastOutputKey(userId, kind) {
  return `examStudio:lastOutput:${kind}:${userId || 'anonymous'}`;
}
