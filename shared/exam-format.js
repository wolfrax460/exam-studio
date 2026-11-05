// Exam Studio exam document format.
// Versioned block-based format for exams with difficulty levels.
export const EXAM_FORMAT = 'exam-studio/exam';
export const EXAM_VERSION = 1;

export const DIFFICULTY_LEVELS = ['Easy', 'Medium', 'Hard'];

export const QUESTION_TYPES = {
  mcq: 'Multiple choice',
  true_false: 'True / False',
  fill_blank: 'Fill in the blanks',
  select_all: 'Select all that apply',
  matching: 'Matching',
  sequencing: 'Sequencing',
  short_answer: 'Short answer',
  essay: 'Essay / practical',
};

export const SECTION_KINDS = {
  mcq: 'Multiple choice',
  true_false: 'True / false',
  fill_blank: 'Fill in the blanks',
  short_answer: 'Short answer',
  structured: 'Structured / practical',
};

export const LAYOUT_CLASSIC = 'classic';
export const LAYOUT_SECTIONS = 'sections-a-e';

const L = 'ABCDEFGH'.split('');

const isText = (v) => typeof v === 'string' && v.trim().length > 0;
const isTextArray = (v) => Array.isArray(v) && v.length > 0 && v.every(isText);

function checkMcqItem(item, path, errors) {
  if (!item || typeof item !== 'object') { errors.push({ path, message: 'item must be an object' }); return; }
  const options = item.options || [];
  if (options.length !== 4) errors.push({ path: `${path}.options`, message: 'mcq needs exactly 4 options' });
  if (options.some((o) => /all of the above|none of the above/i.test(String(o)))) errors.push({ path, message: 'uses an "all/none of the above" option' });
  const answer = String(item.answer || '').trim().toUpperCase();
  const idx = L.indexOf(answer);
  if (answer.length !== 1 || idx < 0 || idx >= options.length) errors.push({ path: `${path}.answer`, message: `answer "${item.answer}" is not one of the options` });
  if (options.some((o) => !isText(o))) errors.push({ path, message: 'has an empty option' });
  if (!isText(item.text)) errors.push({ path: `${path}.text`, message: 'mcq needs question text' });
}

function checkTrueFalseItem(item, path, errors) {
  if (!['True', 'False'].includes(String(item?.answer || '').trim())) errors.push({ path: `${path}.answer`, message: 'answer must be True or False' });
  if (!isText(item.text)) errors.push({ path: `${path}.text`, message: 'statement needs text' });
}

function checkFillBlankItem(item, path, errors) {
  if (!String(item?.text || '').includes('________')) errors.push({ path: `${path}.text`, message: 'has no blank to fill (use ________)' });
  if (!isText(item.answer)) errors.push({ path: `${path}.answer`, message: 'has no answer' });
}

function checkShortAnswerItem(item, path, errors) {
  if (!(Number(item.marks) > 0)) errors.push({ path: `${path}.marks`, message: 'needs marks' });
  if (!isText(item.answer) && !(item.markingPoints || []).length) errors.push({ path, message: 'has no expected answer' });
  if (!isText(item.text)) errors.push({ path: `${path}.text`, message: 'needs question text' });
}

function checkStructuredItem(item, path, errors) {
  const marks = Number(item.totalMarks) || 0;
  if (!(marks > 0)) errors.push({ path: `${path}.totalMarks`, message: 'needs totalMarks' });
  const parts = item.parts || [];
  if (!parts.length) errors.push({ path: `${path}.parts`, message: 'has no lettered parts' });
  const partSum = parts.reduce((sum, p) => sum + (Number(p?.marks) || 0), 0);
  if (parts.length && partSum !== marks) errors.push({ path: `${path}.parts`, message: `part marks add up to ${partSum}, not ${marks}` });
  const points = item.markingPoints || [];
  const pointSum = points.reduce((sum, p) => sum + (Number(p?.marks) || 0), 0);
  if (points.length && pointSum !== marks) errors.push({ path: `${path}.markingPoints`, message: `marking points add up to ${pointSum}, not ${marks}` });
  if (!points.length && !isText(item.modelAnswer)) errors.push({ path, message: 'has neither marking points nor a model answer' });
}

export function validateExam(doc) {
  const errors = [];

  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) {
    return { ok: false, errors: [{ path: '', message: 'exam document must be an object' }] };
  }

  if (doc.format !== EXAM_FORMAT) errors.push({ path: 'format', message: `format must be "${EXAM_FORMAT}"` });
  if (doc.version !== EXAM_VERSION) errors.push({ path: 'version', message: `version must be ${EXAM_VERSION}` });

  const meta = doc.meta;
  if (!meta || typeof meta !== 'object') errors.push({ path: 'meta', message: 'meta is required' });
  else {
    if (!isText(meta.title)) errors.push({ path: 'meta.title', message: 'meta.title is required' });
    if (!isText(meta.moduleCode)) errors.push({ path: 'meta.moduleCode', message: 'meta.moduleCode is required' });
    if (!isText(meta.moduleName)) errors.push({ path: 'meta.moduleName', message: 'meta.moduleName is required' });
    if (!isText(meta.level)) errors.push({ path: 'meta.level', message: 'meta.level is required' });
    if (!isText(meta.trade)) errors.push({ path: 'meta.trade', message: 'meta.trade is required' });
    if (!isText(meta.school)) errors.push({ path: 'meta.school', message: 'meta.school is required' });
    if (!isText(meta.duration)) errors.push({ path: 'meta.duration', message: 'meta.duration is required' });
    if (meta.difficulty !== undefined && !DIFFICULTY_LEVELS.includes(meta.difficulty)) {
      errors.push({ path: 'meta.difficulty', message: `difficulty must be one of ${DIFFICULTY_LEVELS.join(', ')}` });
    }
    if (meta.targetMarks !== undefined && (!Number.isInteger(meta.targetMarks) || meta.targetMarks < 1)) {
      errors.push({ path: 'meta.targetMarks', message: 'targetMarks must be a positive integer' });
    }
  }

  // Sections (sections-a-e layout) or questions (classic layout)
  if (Array.isArray(doc.sections) && doc.sections.length > 0) {
    const expected = doc.meta?.targetMarks;
    let totalMarks = 0;
    const kinds = new Set(Object.keys(SECTION_KINDS));

    doc.sections.forEach((section, si) => {
      const name = section.id ? `Section ${section.id}` : `Section ${si + 1}`;
      const bad = (msg) => errors.push({ path: `sections[${si}]`, message: `${name}: ${msg}` });

      if (!kinds.has(section.kind)) bad(`unknown kind "${section.kind}"`);
      const items = section.items || [];
      if (!items.length) bad('has no questions');

      items.forEach((item, i) => {
        const where = `sections[${si}].items[${i}]`;
        if (!item || typeof item !== 'object') { errors.push({ path: where, message: 'not a question object' }); return; }
        if (!isText(item.text) && !isText(item.title)) errors.push({ path: `${where}.text`, message: 'has no question text' });

        switch (section.kind) {
          case 'mcq': checkMcqItem(item, where, errors); break;
          case 'true_false': checkTrueFalseItem(item, where, errors); break;
          case 'fill_blank': checkFillBlankItem(item, where, errors); break;
          case 'short_answer': checkShortAnswerItem(item, where, errors); break;
          case 'structured': checkStructuredItem(item, where, errors); break;
          default: errors.push({ path: where, message: `unknown kind "${section.kind}"` });
        }
        totalMarks += Number(item.marks) || Number(section.marksPerItem) || (section.kind === 'structured' ? Number(item.totalMarks) : 0);
      });
    });

    if (expected !== undefined && totalMarks !== expected) {
      errors.push({ path: 'meta.targetMarks', message: `Section marks add up to ${totalMarks}, not ${expected}` });
    }

    // Check MCQ answer spread
    const mcqItems = [];
    doc.sections.forEach((section) => {
      if (section.kind === 'mcq') section.items?.forEach((item) => mcqItems.push(item.answer?.toUpperCase()));
    });
    if (mcqItems.length >= 10) {
      const counts = {};
      mcqItems.forEach((a) => { counts[a] = (counts[a] || 0) + 1; });
      const worst = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
      if (worst && worst[1] / mcqItems.length > 0.4) {
        errors.push({ path: 'sections', message: `MCQ answers not evenly spread: ${worst[0]} is ${Math.round(worst[1] / mcqItems.length * 100)}% (${worst[1]} of ${mcqItems.length})` });
      }
    }
  } else if (Array.isArray(doc.questions) && doc.questions.length > 0) {
    // Classic layout validation
    doc.questions.forEach((q, i) => {
      const where = `questions[${i}]`;
      if (!q || typeof q !== 'object') { errors.push({ path: where, message: 'not a question object' }); return; }
      if (!Number(q.marks) > 0) errors.push({ path: `${where}.marks`, message: 'marks must be > 0' });
    });
  } else {
    errors.push({ path: 'sections/questions', message: 'exam must have sections or questions' });
  }

  return { ok: errors.length === 0, errors };
}

/** Get difficulty badge label for a question/section */
export function difficultyBadge(difficulty) {
  if (!difficulty || !DIFFICULTY_LEVELS.includes(difficulty)) return null;
  return { label: difficulty, color: difficulty === 'Easy' ? '#22c55e' : difficulty === 'Medium' ? '#f59e0b' : '#ef4444' };
}

export function totalMarks(exam) {
  if (Array.isArray(exam.sections)) {
    return exam.sections.reduce((sum, s) => sum + (s.items || []).reduce((s2, i) => s2 + (Number(i.marks) || Number(s.marksPerItem) || (s.kind === 'structured' ? Number(i.totalMarks) : 0)), 0), 0);
  }
  return (exam.questions || []).reduce((s, q) => s + (Number(q.marks) || 0), 0);
}

export function isSectionsExam(exam) {
  return Array.isArray(exam?.sections) && exam.sections.length > 0;
}