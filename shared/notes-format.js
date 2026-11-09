// Exam Studio study-notes document format.
//
// A notes document is a versioned, block-based outline rather than prose: every
// section holds typed blocks, so the same JSON renders to a reading page, a
// handout or a Word file without re-parsing text. `validateNotes` is the single
// gate every producer and consumer goes through.

export const NOTES_FORMAT = 'exam-studio/study-notes';
export const NOTES_VERSION = 1;

export const BLOCK_TYPES = [
  'paragraph',
  'list',
  'definition',
  'table',
  'callout',
  'example',
  'compare',
  'check',
  'trap',
  'code'
];

const CALLOUT_TONES = ['tip', 'warning', 'exam', 'note'];

const isText = (value) => typeof value === 'string' && value.trim().length > 0;
const isTextArray = (value) => Array.isArray(value) && value.length > 0 && value.every(isText);
const isTextArrayOptional = (value) => value === undefined || isTextArray(value);

function checkBlock(block, path, errors) {
  if (!block || typeof block !== 'object' || Array.isArray(block)) {
    errors.push({ path, message: 'block must be an object' });
    return;
  }
  if (!BLOCK_TYPES.includes(block.type)) {
    errors.push({ path: `${path}.type`, message: `unknown block type "${block.type}"` });
    return;
  }

  const at = (field) => `${path}.${field}`;
  switch (block.type) {
    case 'paragraph':
      if (!isText(block.text)) errors.push({ path: at('text'), message: 'paragraph needs non-empty text' });
      break;
    case 'list':
      if (!isTextArray(block.items)) errors.push({ path: at('items'), message: 'list needs at least one non-empty item' });
      break;
    case 'definition':
      if (!isText(block.term)) errors.push({ path: at('term'), message: 'definition needs a term' });
      if (!isText(block.text)) errors.push({ path: at('text'), message: 'definition needs text' });
      break;
    case 'table':
      if (!isTextArray(block.columns)) errors.push({ path: at('columns'), message: 'table needs column headings' });
      if (!Array.isArray(block.rows) || block.rows.length === 0) {
        errors.push({ path: at('rows'), message: 'table needs at least one row' });
      } else {
        const width = Array.isArray(block.columns) ? block.columns.length : 0;
        block.rows.forEach((row, index) => {
          if (!Array.isArray(row) || row.length !== width) {
            errors.push({ path: `${path}.rows[${index}]`, message: `row must have ${width} cells to match the columns` });
          }
        });
      }
      break;
    case 'callout':
      if (!isText(block.text)) errors.push({ path: at('text'), message: 'callout needs text' });
      if (block.tone !== undefined && !CALLOUT_TONES.includes(block.tone)) {
        errors.push({ path: at('tone'), message: `tone must be one of ${CALLOUT_TONES.join(', ')}` });
      }
      break;
    case 'example':
      if (!isTextArray(block.steps)) errors.push({ path: at('steps'), message: 'example needs at least one step' });
      if (!isText(block.answer)) errors.push({ path: at('answer'), message: 'example needs an answer' });
      break;
    case 'compare':
      for (const side of ['left', 'right']) {
        const half = block[side];
        if (!half || !isText(half.title) || !isTextArray(half.items)) {
          errors.push({ path: at(side), message: `compare.${side} needs a title and at least one item` });
        }
      }
      break;
    case 'check':
      if (!isText(block.question)) errors.push({ path: at('question'), message: 'check needs a question' });
      if (!isText(block.answer)) errors.push({ path: at('answer'), message: 'check needs an answer' });
      break;
    case 'trap':
      if (!isText(block.wrong)) errors.push({ path: at('wrong'), message: 'trap needs the common mistake' });
      if (!isText(block.right)) errors.push({ path: at('right'), message: 'trap needs the correct answer' });
      if (!isText(block.why)) errors.push({ path: at('why'), message: 'trap needs a reason' });
      break;
    case 'code':
      if (!isText(block.code)) errors.push({ path: at('code'), message: 'code needs the source text' });
      if (block.language !== undefined && !isText(block.language)) errors.push({ path: at('language'), message: 'language must be a non-empty string when present' });
      break;
    default:
      break;
  }
}

export function validateNotes(doc) {
  const errors = [];

  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) {
    return { ok: false, errors: [{ path: '', message: 'notes document must be an object' }] };
  }
  if (doc.format !== NOTES_FORMAT) {
    errors.push({ path: 'format', message: `format must be "${NOTES_FORMAT}"` });
  }
  if (doc.version !== NOTES_VERSION) {
    errors.push({ path: 'version', message: `version must be ${NOTES_VERSION}` });
  }

  const meta = doc.meta;
  if (!meta || typeof meta !== 'object') {
    errors.push({ path: 'meta', message: 'meta is required' });
  } else {
    if (!isText(meta.title)) errors.push({ path: 'meta.title', message: 'meta.title is required' });
    if (!isText(meta.unit)) errors.push({ path: 'meta.unit', message: 'meta.unit is required' });
    if (!isText(meta.language)) errors.push({ path: 'meta.language', message: 'meta.language is required' });
    if (meta.estimatedMinutes !== undefined && (!Number.isInteger(meta.estimatedMinutes) || meta.estimatedMinutes < 1)) {
      errors.push({ path: 'meta.estimatedMinutes', message: 'meta.estimatedMinutes must be a positive integer' });
    }
  }

  if (!isText(doc.summary)) errors.push({ path: 'summary', message: 'summary is required' });
  if (!isTextArray(doc.objectives)) errors.push({ path: 'objectives', message: 'objectives need at least one non-empty entry' });

  if (doc.keyTerms !== undefined) {
    if (!Array.isArray(doc.keyTerms)) {
      errors.push({ path: 'keyTerms', message: 'keyTerms must be an array' });
    } else {
      doc.keyTerms.forEach((entry, index) => {
        if (!entry || !isText(entry.term) || !isText(entry.definition)) {
          errors.push({ path: `keyTerms[${index}]`, message: 'each key term needs a term and a definition' });
        }
      });
    }
  }

  if (!Array.isArray(doc.sections) || doc.sections.length === 0) {
    errors.push({ path: 'sections', message: 'sections need at least one entry' });
  } else {
    const seen = new Set();
    doc.sections.forEach((section, index) => {
      const path = `sections[${index}]`;
      if (!section || typeof section !== 'object') {
        errors.push({ path, message: 'section must be an object' });
        return;
      }
      if (!isText(section.id)) {
        errors.push({ path: `${path}.id`, message: 'section needs an id' });
      } else if (seen.has(section.id)) {
        errors.push({ path: `${path}.id`, message: `duplicate section id "${section.id}"` });
      } else {
        seen.add(section.id);
      }
      if (!isText(section.title)) errors.push({ path: `${path}.title`, message: 'section needs a title' });
      if (!Array.isArray(section.blocks) || section.blocks.length === 0) {
        errors.push({ path: `${path}.blocks`, message: 'section needs at least one block' });
        return;
      }
      section.blocks.forEach((block, blockIndex) => checkBlock(block, `${path}.blocks[${blockIndex}]`, errors));
    });
  }

  if (!isTextArrayOptional(doc.examFocus)) errors.push({ path: 'examFocus', message: 'examFocus must be a non-empty array of strings when present' });
  if (!isTextArrayOptional(doc.checklist)) errors.push({ path: 'checklist', message: 'checklist must be a non-empty array of strings when present' });

  if (doc.furtherReading !== undefined) {
    if (!Array.isArray(doc.furtherReading)) {
      errors.push({ path: 'furtherReading', message: 'furtherReading must be an array' });
    } else {
      doc.furtherReading.forEach((entry, index) => {
        if (!entry || !isText(entry.label)) {
          errors.push({ path: `furtherReading[${index}]`, message: 'each reference needs a label' });
        }
      });
    }
  }

  return { ok: errors.length === 0, errors };
}

// Reads any block into the plain text it contributes, so counters and exports
// do not have to know every block type.
export function blockText(block) {
  switch (block.type) {
    case 'paragraph':
      return block.text;
    case 'list':
      return block.items.join(' ');
    case 'definition':
      return `${block.term}: ${block.text}`;
    case 'table':
      return [block.columns.join(' '), ...block.rows.map((row) => row.join(' '))].join(' ');
    case 'callout':
      return [block.title, block.text].filter(Boolean).join(' ');
    case 'example':
      return [...block.steps, block.answer].join(' ');
    case 'compare':
      return [block.left.title, ...block.left.items, block.right.title, ...block.right.items].join(' ');
    case 'check':
      return `${block.question} ${block.answer}`;
    case 'trap':
      return `${block.wrong} ${block.right} ${block.why}`;
    case 'code':
      return block.code;
    default:
      return '';
  }
}

export function notesWordCount(doc) {
  const blocks = (doc.sections || []).flatMap((section) => section.blocks || []);
  const words = [doc.summary, ...(doc.objectives || []), ...blocks.map(blockText)].join(' ').trim();
  return words ? words.split(/\s+/).length : 0;
}
