// Adapt the existing study-notes generator result to the versioned, block-based notes
// document used by NotesReader and the Word exporter. The legacy `topic`, `keyPoints` and
// `example` fields are retained on every section so older clients and MCP tools keep working.
import { NOTES_FORMAT, NOTES_VERSION, validateNotes } from '../../shared/notes-format.js';
import { httpError } from './errors.js';

const text = (value) => (typeof value === 'string' ? value.trim() : '');
const strings = (value) => (Array.isArray(value) ? value.map(text).filter(Boolean) : []);

function slug(value, used, index) {
  const base = text(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 42);
  let id = base || `section-${index + 1}`;
  let suffix = 2;
  while (used.has(id)) id = `${base || `section-${index + 1}`}-${suffix++}`;
  used.add(id);
  return id;
}

function normalizeBlock(block) {
  if (!block || typeof block !== 'object' || Array.isArray(block)) return null;
  switch (block.type) {
    case 'paragraph': {
      const value = text(block.text);
      return value ? { type: 'paragraph', text: value } : null;
    }
    case 'list': {
      const items = strings(block.items);
      if (!items.length) return null;
      return { type: 'list', ...(block.ordered ? { ordered: true } : {}), items };
    }
    case 'definition': {
      const term = text(block.term);
      const value = text(block.text);
      return term && value ? { type: 'definition', term, text: value } : null;
    }
    case 'table': {
      const columns = strings(block.columns);
      const rows = Array.isArray(block.rows)
        ? block.rows.map((row) => (Array.isArray(row) ? row.map((cell) => String(cell ?? '')) : []))
          .filter((row) => row.length === columns.length)
        : [];
      return columns.length && rows.length ? { type: 'table', columns, rows } : null;
    }
    case 'callout': {
      const value = text(block.text);
      if (!value) return null;
      return {
        type: 'callout',
        text: value,
        ...(text(block.title) ? { title: text(block.title) } : {}),
        ...(['tip', 'warning', 'exam', 'note'].includes(block.tone) ? { tone: block.tone } : {}),
      };
    }
    case 'example': {
      const steps = strings(block.steps);
      const answer = text(block.answer);
      if (!steps.length || !answer) return null;
      return { type: 'example', steps, answer, ...(text(block.title) ? { title: text(block.title) } : {}) };
    }
    case 'compare': {
      const half = (side) => {
        const title = text(side?.title);
        const items = strings(side?.items);
        return title && items.length ? { title, items } : null;
      };
      const left = half(block.left);
      const right = half(block.right);
      return left && right ? { type: 'compare', left, right } : null;
    }
    case 'check': {
      const question = text(block.question);
      const answer = text(block.answer);
      return question && answer ? { type: 'check', question, answer } : null;
    }
    case 'trap': {
      const wrong = text(block.wrong);
      const right = text(block.right);
      const why = text(block.why);
      return wrong && right && why ? { type: 'trap', wrong, right, why } : null;
    }
    case 'code': {
      const code = text(block.code);
      return code ? { type: 'code', code, ...(text(block.language) ? { language: text(block.language) } : {}) } : null;
    }
    default:
      return null;
  }
}

function legacyBlocks(keyPoints, example) {
  const blocks = [];
  if (keyPoints.length) blocks.push({ type: 'list', items: keyPoints });
  if (example) {
    const fenced = example.match(/^```[\w-]*\n([\s\S]*?)\n```$/);
    if (fenced) blocks.push({ type: 'code', code: fenced[1].trim() });
    else blocks.push({ type: 'callout', tone: 'note', title: 'Example', text: example });
  }
  if (!blocks.length) blocks.push({ type: 'paragraph', text: 'Review this section in the source notes.' });
  return blocks;
}

function normalizeSection(section, index, used) {
  const title = text(section?.title) || text(section?.topic) || `Section ${index + 1}`;
  const keyPoints = strings(section?.keyPoints);
  const example = text(section?.example);
  const supplied = Array.isArray(section?.blocks) ? section.blocks.map(normalizeBlock).filter(Boolean) : [];
  const blocks = supplied.length ? supplied : legacyBlocks(keyPoints, example);
  return {
    id: slug(title, used, index),
    title,
    blocks,
    // Compatibility fields for MCP and older consumers.
    topic: title,
    keyPoints,
    example,
  };
}

/**
 * Build a valid rich notes document from a legacy generator result.
 * `level` and `sourceChars` come from the web request; the rest is derived from the result.
 */
export function notesDocumentFromNotes(notes, { title = '', level = '', sourceChars = 0 } = {}) {
  const used = new Set();
  const sections = (Array.isArray(notes?.sections) ? notes.sections : [])
    .map((section, index) => normalizeSection(section, index, used));

  if (!sections.length) throw httpError(502, 'The AI returned no usable notes. Try again.');

  const docTitle = text(notes?.title) || text(title) || 'Study notes';
  const firstPoint = sections.flatMap((section) => section.keyPoints).find(Boolean);
  const summary = text(notes?.summary) || firstPoint || `Revision notes for ${docTitle}.`;
  const objectives = strings(notes?.objectives);
  const keyTerms = (Array.isArray(notes?.keyTerms) ? notes.keyTerms : [])
    .map((entry) => ({ term: text(entry?.term), definition: text(entry?.definition) }))
    .filter((entry) => entry.term && entry.definition);

  const doc = {
    format: NOTES_FORMAT,
    version: NOTES_VERSION,
    title: docTitle,
    meta: {
      title: docTitle,
      unit: text(title) || docTitle,
      language: 'en',
      estimatedMinutes: Math.max(1, Math.round(Number(sourceChars) / 900) || 1),
      ...(level ? { level } : {}),
      ...(sourceChars ? { source: { chars: Number(sourceChars), files: 0 } } : {}),
    },
    summary,
    objectives: objectives.length ? objectives : sections.map((section) => `Explain ${section.title}`),
    ...(keyTerms.length ? { keyTerms } : {}),
    sections,
  };

  const check = validateNotes(doc);
  if (!check.ok) {
    throw httpError(502, `The AI returned notes that could not be displayed: ${check.errors[0]?.message || 'invalid document'}. Try again.`);
  }
  return doc;
}
