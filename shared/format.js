// Shared by the server (exports) and the client (preview and live checks).

export const L = 'ABCDEFGH'.split('');

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

// ---------------------------------------------------------------- exam layouts
// A paper can be in the flat "classic" shape (questions[] of typed questions) or the sectioned
// shape that the RTB end-of-module papers use (sections A-E). Old saved exams stay in the classic
// shape forever; new ones default to the sectioned layout.

export const LAYOUT_CLASSIC = 'classic';
export const LAYOUT_SECTIONS = 'sections-a-e';
export const LAYOUTS = [LAYOUT_SECTIONS, LAYOUT_CLASSIC];

export const SECTION_KINDS = {
  mcq: 'Multiple choice',
  true_false: 'True / false',
  fill_blank: 'Fill in the blanks',
  short_answer: 'Short answer',
  structured: 'Structured / practical',
};

// The default 100-mark paper: 64 numbered questions, which is what the RTB papers come to.
// A: 30 x 1, B: 10 x 1, C: 10 x 1, D: 10 x 2, E: 4 structured questions (8+8+7+7).
export const DEFAULT_SECTION_PLAN = [
  { id: 'A', kind: 'mcq', title: 'MULTIPLE CHOICE', marks: 30, marksPerItem: 1 },
  { id: 'B', kind: 'true_false', title: 'TRUE / FALSE', marks: 10, marksPerItem: 1 },
  { id: 'C', kind: 'fill_blank', title: 'FILL IN THE BLANKS', marks: 10, marksPerItem: 1 },
  { id: 'D', kind: 'short_answer', title: 'SHORT ANSWER QUESTIONS', marks: 20, marksPerItem: 2 },
  { id: 'E', kind: 'structured', title: 'STRUCTURED / PRACTICAL QUESTIONS', marks: 30, marksPerItem: 0 },
];

export const isSectionsExam = (exam) => Array.isArray(exam?.sections) && exam.sections.length > 0;

/** Which layout an exam is in. Anything with sections is sectioned; everything else is classic. */
export function layoutOf(exam) {
  if (isSectionsExam(exam)) return LAYOUT_SECTIONS;
  return exam?.layout === LAYOUT_SECTIONS ? LAYOUT_SECTIONS : LAYOUT_CLASSIC;
}

/**
 * Turn a plan into the section sizes for a paper of `total` marks. The default plan is written for
 * 100 marks; a different total is scaled in proportion, and the rounding remainder is put on the
 * last section so the sections always add up to exactly the paper total.
 */
export function buildSectionPlan(total = 100, plan = DEFAULT_SECTION_PLAN) {
  const target = Math.max(1, Math.round(Number(total) || 100));
  const base = plan.reduce((sum, section) => sum + section.marks, 0) || 1;
  const scaled = plan.map((section) => ({ ...section }));
  let assigned = 0;
  scaled.forEach((section, i) => {
    if (i === scaled.length - 1) {
      section.marks = Math.max(1, target - assigned);
    } else {
      section.marks = Math.max(1, Math.round((section.marks * target) / base));
      assigned += section.marks;
    }
  });
  return scaled;
}

/** Structured questions are worth about 8 marks each, split as evenly as the total allows. */
export function structuredItemMarks(total) {
  const marks = Math.max(1, Math.round(Number(total) || 0));
  const count = Math.max(1, Math.round(marks / 8));
  const base = Math.floor(marks / count);
  const extra = marks - base * count;
  return Array.from({ length: count }, (_, i) => base + (i < extra ? 1 : 0));
}

/** How many numbered questions a section holds. */
export function sectionItemCount(section) {
  if (section?.kind === 'structured') return structuredItemMarks(section.marks).length;
  const per = Number(section?.marksPerItem) || 1;
  return Math.max(1, Math.round((Number(section?.marks) || 0) / per));
}

/** How many numbered questions the whole paper holds. */
export function planQuestionCount(plan = DEFAULT_SECTION_PLAN) {
  return plan.reduce((sum, section) => sum + sectionItemCount(section), 0);
}

/** Accept a caller's section plan, keeping only the parts that make a sane paper. */
export function sanitizeSectionPlan(plan) {
  if (!Array.isArray(plan)) return null;
  const out = [];
  for (const entry of plan.slice(0, 8)) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
    const kind = String(entry.kind || '').toLowerCase();
    if (!SECTION_KINDS[kind]) continue;
    const marks = Math.round(Number(entry.marks));
    if (!(marks > 0) || marks > 200) continue;
    const marksPerItem = kind === 'structured' ? 0 : Math.max(1, Math.round(Number(entry.marksPerItem) || 1));
    if (kind !== 'structured' && marksPerItem > marks) continue;
    const letter = String(entry.id || L[out.length] || 'A').replace(/[^A-Za-z]/g, '').slice(0, 2).toUpperCase();
    out.push({
      id: letter || L[out.length],
      kind,
      title: String(entry.title || SECTION_KINDS[kind]).slice(0, 60).toUpperCase(),
      marks,
      marksPerItem,
    });
  }
  return out.length >= 2 ? out : null;
}

/** Every item of the paper, numbered continuously across the sections, in paper order. */
export function numberedItems(exam) {  const out = [];
  let number = 0;
  for (const section of exam?.sections || []) {
    for (const item of section.items || []) {
      number += 1;
      out.push({ number, section, kind: section.kind, item });
    }
  }
  return out;
}

/** The marks one item is worth. Structured questions carry their own total. */
export function itemMarks(item, section) {
  if (section?.kind === 'structured') return Number(item?.totalMarks) || 0;
  return Number(item?.marks) || Number(section?.marksPerItem) || 1;
}

export function sectionMarks(section) {
  // Uses itemMarks, so a structured question counts its totalMarks and the other kinds count
  // their own marks (falling back to the section's marks-per-item).
  return (section?.items || []).reduce((sum, item) => sum + itemMarks(item, section), 0);
}

/** The paper total. Sectioned papers count their items; classic papers count their questions. */
export function totalMarks(exam) {
  if (isSectionsExam(exam)) {
    return (exam.sections || []).reduce((sum, section) => sum + sectionMarks(section), 0);
  }
  return (exam?.questions || []).reduce((s, q) => s + (Number(q.marks) || 0), 0);
}

/** `[1 mark]` / `[2 marks]`. Non-breaking, so a mark value never splits across two lines. */
export function marksLabel(marks) {
  const n = Number(marks) || 0;
  return n === 1 ? '1\u00A0mark' : `${n}\u00A0marks`;
}

export function questionLines(q) {
  const out = [];
  switch (q.type) {
    case 'mcq':
      (q.items || []).forEach((it, i) => {
        out.push(`(${i + 1}) ${it.text}`);
        (it.options || []).forEach((o, j) => out.push(`${L[j]}. ${o}`));
      });
      break;
    case 'true_false':
      (q.items || []).forEach((it, i) => out.push(`${L[i]}. ${it.text}`));
      break;
    case 'short_answer':
      (q.items || []).forEach((it, i) => out.push(`${i + 1}. ${it.text}`));
      break;
    case 'select_all':
      (q.options || []).forEach((o, j) => out.push(`${L[j]}. ${o}`));
      break;
    case 'matching':
      out.push('Column A');
      (q.columnA || []).forEach((a, i) => out.push(`${i + 1}. ${a}`));
      out.push('Column B');
      (q.columnB || []).forEach((b, j) => out.push(`${L[j]}. ${b}`));
      break;
    case 'sequencing':
      (q.steps || []).forEach((s, i) => out.push(`${i + 1}. ${s}`));
      break;
    case 'essay':
      (q.parts || []).forEach((p) => out.push(`${p.label} ${p.text} (${p.marks} marks)`));
      break;
    default:
  }
  return out;
}

export function answerText(q) {
  switch (q.type) {
    case 'mcq':
      return (q.items || []).map((it, i) => `(${i + 1}) ${it.answer}`).join('   ');
    case 'true_false':
      return (q.items || []).map((it, i) => `${L[i]} ${it.answer}`).join(', ');
    case 'short_answer':
      return (q.items || []).map((it, i) => `${i + 1}. ${it.answer}`).join('; ');
    case 'select_all':
      return (q.correct || []).join(', ');
    case 'matching':
      return (q.matchAnswers || []).map((a, i) => `${i + 1}-${a}`).join(', ');
    case 'sequencing':
      return (q.sequenceAnswer || []).join(', ');
    case 'essay':
      return (q.markingPoints || []).map((m) => `${m.text} (${m.marks})`).join('\n');
    default:
      return '';
  }
}

export function markingNote(q) {
  const bits = [];
  if (q.type === 'mcq' || q.type === 'true_false' || q.type === 'short_answer') {
    const n = (q.items || []).length;
    if (n) bits.push(`${q.marks / n} mark${q.marks / n === 1 ? '' : 's'} each.`);
  } else if (q.type === 'matching') bits.push('1 mark each.');
  else if (q.type === 'sequencing') bits.push('Mark each step in the correct position.');
  else if (q.type === 'select_all') bits.push('1 mark for each option decided correctly.');
  if (q.notes) bits.push(q.notes);
  return bits.join(' ');
}

// Returns a list of problems. An empty list means the handout is internally consistent.
// The handout is a different shape from an exam: units hold lessons, and each unit also carries
// the end-of-unit extras (diagrams, memory sheet, revision questions, practical task, tips).
export function validateHandout(handout) {
  const w = [];
  const units = handout?.units || [];
  if (!units.length) return ['The handout has no units.'];

  units.forEach((unit, ui) => {
    const unitName = `Unit ${unit?.number || ui + 1}`;
    const bad = (msg) => w.push(`${unitName}: ${msg}`);
    const lessons = Array.isArray(unit?.lessons) ? unit.lessons : [];

    if (!lessons.length) bad('has no lessons.');
    lessons.forEach((lesson, li) => {
      const lessonName = `${unitName} lesson ${lesson?.number || li + 1}`;
      const lbad = (msg) => w.push(`${lessonName}: ${msg}`);

      if (!(lesson?.keyTerms || []).length) lbad('has no key terms.');
      const blocks = Array.isArray(lesson?.blocks) ? lesson.blocks : [];
      if (!blocks.length) lbad('has no content blocks.');
      if (!lesson?.workedExample) lbad('has no worked example.');
      else if (!(lesson.workedExample.steps || []).length) lbad('has a worked example with no steps.');

      blocks.forEach((block, bi) => {
        const b = `${lessonName} block ${bi + 1}`;
        const kind = block?.kind;
        const headers = Array.isArray(block?.headers) ? block.headers : null;
        if (kind === 'table' || kind === 'compare') {
          if (!headers || !headers.length) w.push(`${b} (${kind}): has no headers.`);
          if (kind === 'compare' && headers && headers.length < 3) w.push(`${b} (compare): needs at least 3 columns so there is something to compare.`);
          const width = headers ? headers.length : 0;
          (block?.rows || []).forEach((row, ri) => {
            if (!Array.isArray(row) || row.length !== width) {
              w.push(`${b} (${kind}): row ${ri + 1} has ${Array.isArray(row) ? row.length : 0} cells, expected ${width}.`);
            }
          });
        }
        if (kind === 'steps' && (block?.items || []).length < 2) w.push(`${b} (steps): needs at least 2 steps.`);
        if (kind === 'prose' && !String(block?.text || '').trim() && !String(block?.code || '').trim()) w.push(`${b} (prose): is empty.`);
        if (kind === 'bullets' && !(block?.items || []).length) w.push(`${b} (bullets): has no items.`);
      });
    });

    const diagrams = Array.isArray(unit?.diagrams) ? unit.diagrams : [];
    if (diagrams.length < 3) bad(`has ${diagrams.length} diagram(s); at least 3 are expected.`);
    diagrams.forEach((d, di) => {
      if (!String(d?.ascii || '').trim()) w.push(`${unitName} diagram ${di + 1}: has no drawing.`);
      if (!(d?.readSteps || []).length) w.push(`${unitName} diagram ${di + 1}: has no steps on how to read it.`);
      if (!String(d?.redraw || '').trim()) w.push(`${unitName} diagram ${di + 1}: says nothing about redrawing it.`);
    });

    const memory = Array.isArray(unit?.memorySheet) ? unit.memorySheet : [];
    if (memory.length < 15) bad(`memory sheet has ${memory.length} row(s); at least 15 are expected.`);

    const revision = unit?.revision || {};
    const mcq = Array.isArray(revision.mcq) ? revision.mcq : [];
    const trueFalse = Array.isArray(revision.trueFalse) ? revision.trueFalse : [];
    const scenario = Array.isArray(revision.scenario) ? revision.scenario : [];
    if (mcq.length !== 5) bad(`has ${mcq.length} multiple-choice questions; 5 are expected.`);
    if (trueFalse.length !== 5) bad(`has ${trueFalse.length} true/false questions; 5 are expected.`);
    if (scenario.length !== 5) bad(`has ${scenario.length} scenario questions; 5 are expected.`);

    mcq.forEach((item, i) => {
      const choices = Array.isArray(item?.choices) ? item.choices : [];
      if (choices.length !== 4) w.push(`${unitName} multiple-choice ${i + 1}: has ${choices.length} choices; exactly 4 are needed.`);
      const answer = String(item?.answer || '').trim().toUpperCase();
      const index = 'ABCDEFGH'.indexOf(answer);
      if (answer.length !== 1 || index < 0 || index >= choices.length) {
        w.push(`${unitName} multiple-choice ${i + 1}: answer "${item?.answer}" is not one of the choices.`);
      }
    });
    trueFalse.forEach((item, i) => {
      if (!['True', 'False'].includes(String(item?.answer || '').trim())) {
        w.push(`${unitName} true/false ${i + 1}: answer must be True or False.`);
      }
    });

    const practical = unit?.practical || {};
    if (!(practical.steps || []).length) bad('practical task has no steps.');
    if (!(practical.assessor || []).length) bad('practical task has no assessor checklist.');

    const tips = Array.isArray(unit?.studyTips) ? unit.studyTips : [];
    if (tips.length < 12 || tips.length > 15) bad(`has ${tips.length} study tips; 12 to 15 are expected.`);
    const last = String(tips[tips.length - 1] || '');
    if (tips.length && !(/practical/i.test(last) && /why|explain|reason/i.test(last))) {
      bad('the last study tip must be the one about explaining why in practical work.');
    }
  });

  return w;
}

// Counts for the banner in the app, the way an exam shows its total marks.
export function handoutStats(handout) {
  const stats = { units: 0, lessons: 0, keyTerms: 0, workedExamples: 0, callouts: 0, diagrams: 0, questions: 0, memoryRows: 0, studyTips: 0 };
  for (const unit of handout?.units || []) {
    stats.units += 1;
    stats.diagrams += (unit?.diagrams || []).length;
    stats.memoryRows += (unit?.memorySheet || []).length;
    stats.studyTips += (unit?.studyTips || []).length;
    const revision = unit?.revision || {};
    stats.questions += (revision.mcq || []).length + (revision.trueFalse || []).length + (revision.scenario || []).length;
    for (const lesson of unit?.lessons || []) {
      stats.lessons += 1;
      stats.keyTerms += (lesson?.keyTerms || []).length;
      stats.callouts += (lesson?.callouts || []).length;
      if (lesson?.workedExample) stats.workedExamples += 1;
    }
  }
  return stats;
}

// A rough page count, so the app can warn before a very long document is built. Counts the
// characters that will be rendered and allows space for tables and diagrams, which take more
// room than their text suggests.
export function estimateHandoutPages(handout) {
  const stats = handoutStats(handout);
  let chars = 0;
  const add = (v) => { if (typeof v === 'string') chars += v.length; };
  const addAll = (list) => (list || []).forEach(add);

  for (const unit of handout?.units || []) {
    addAll([unit?.title, unit?.learningOutcome, unit?.duration]);
    addAll(unit?.indicativeContents);
    addAll(unit?.objectives);
    for (const lesson of unit?.lessons || []) {
      addAll([lesson?.title]);
      for (const term of lesson?.keyTerms || []) addAll([term?.term, term?.meaning]);
      for (const block of lesson?.blocks || []) {
        addAll([block?.heading, block?.text, block?.code]);
        addAll(block?.items);
        addAll(block?.headers);
        (block?.rows || []).forEach(addAll);
      }
      for (const callout of lesson?.callouts || []) addAll([callout?.label, callout?.text]);
      const ex = lesson?.workedExample;
      if (ex) { addAll([ex.title, ex.task, ex.thinking, ex.code, ex.expected, ex.why]); addAll(ex.steps); addAll(ex.mistakes); }
    }
    for (const d of unit?.diagrams || []) { addAll([d?.title, d?.ascii, d?.redraw]); addAll(d?.readSteps); }
    for (const row of unit?.memorySheet || []) addAll([row?.remember, row?.answer]);
    const revision = unit?.revision || {};
    for (const item of revision.mcq || []) { addAll([item?.q, item?.reason]); addAll(item?.choices); }
    for (const item of revision.trueFalse || []) addAll([item?.statement, item?.answer, item?.reason]);
    for (const item of revision.scenario || []) addAll([item?.q, item?.answer, item?.reason]);
    for (const item of revision.extraPractice || []) addAll([item?.reference, item?.answer, item?.reason]);
    const practical = unit?.practical || {};
    addAll([practical.scenario]); addAll(practical.steps); addAll(practical.assessor); addAll(practical.report);
    addAll(unit?.studyTips);
  }

  // ~3,000 characters of 10.5pt body text fit on an A4 page once headings and spacing are allowed
  // for; tables and diagrams each push roughly half a page more than their text alone.
  const textPages = chars / 3000;
  const blockPages = stats.diagrams * 0.5 + stats.lessons * 1.6;
  return Math.max(1, Math.round(textPages + blockPages));
}

// Returns a list of problems. An empty list means the exam is internally consistent.
export function validateExam(exam, target) {
  return isSectionsExam(exam) ? validateSectionsExam(exam, target) : validateClassicExam(exam, target);
}

// ---------------------------------------------------------------- sectioned paper (sections A-E)
const isBlank = (v) => !String(v ?? '').trim();

export function validateSectionsExam(exam, target) {
  const w = [];
  const sections = exam?.sections || [];
  if (!sections.length) return ['The exam has no sections.'];
  const expected = target === undefined || target === null || target === '' ? null : Number(target);
  const total = totalMarks(exam);

  const kinds = new Set(Object.keys(SECTION_KINDS));
  sections.forEach((section, si) => {
    const name = section?.id ? `Section ${section.id}` : `Section ${si + 1}`;
    const bad = (msg) => w.push(`${name}: ${msg}`);
    if (!kinds.has(section?.kind)) bad(`unknown type "${section?.kind}".`);
    const items = Array.isArray(section?.items) ? section.items : [];
    if (!items.length) bad('has no questions.');

    items.forEach((item, i) => {
      const where = `${name} question ${item?.number || i + 1}`;
      const ibad = (msg) => w.push(`${where}: ${msg}`);
      if (!item || typeof item !== 'object' || Array.isArray(item)) { w.push(`${where}: is not a question.`); return; }
      if (isBlank(item.text) && isBlank(item.title)) ibad('has no question text.');

      switch (section.kind) {
        case 'mcq': {
          const options = Array.isArray(item.options) ? item.options : [];
          if (options.length !== 4) ibad(`has ${options.length} options; exactly 4 are needed.`);
          if (options.some((o) => /all of the above|none of the above/i.test(String(o)))) ibad('uses an "all/none of the above" option.');
          const answer = String(item.answer || '').trim().toUpperCase();
          const index = L.indexOf(answer);
          if (answer.length !== 1 || index < 0 || index >= options.length) ibad(`answer "${item.answer}" is not one of the options.`);
          if (options.some((o) => isBlank(o))) ibad('has an empty option.');
          break;
        }
        case 'true_false':
          if (!['True', 'False'].includes(String(item.answer || '').trim())) ibad('answer must be True or False.');
          break;
        case 'fill_blank':
          if (!String(item.text || '').includes('_')) ibad('has no blank to fill (use ________ in the text).');
          if (isBlank(item.answer)) ibad('has no answer.');
          break;
        case 'short_answer':
          if (!(Number(item.marks) > 0)) ibad('needs marks.');
          if (isBlank(item.answer) && !(item.markingPoints || []).length) ibad('has no expected answer.');
          break;
        case 'structured': {
          const marks = Number(item.totalMarks) || 0;
          if (!(marks > 0)) ibad('needs totalMarks.');
          const parts = Array.isArray(item.parts) ? item.parts : [];
          if (!parts.length) ibad('has no lettered parts.');
          const partSum = parts.reduce((sum, part) => sum + (Number(part?.marks) || 0), 0);
          if (parts.length && partSum !== marks) ibad(`part marks add up to ${partSum}, not ${marks}.`);
          const points = Array.isArray(item.markingPoints) ? item.markingPoints : [];
          const pointSum = points.reduce((sum, point) => sum + (Number(point?.marks) || 0), 0);
          if (points.length && pointSum !== marks) ibad(`marking points add up to ${pointSum}, not ${marks}.`);
          if (!points.length && isBlank(item.modelAnswer)) ibad('has neither marking points nor a model answer.');
          break;
        }
        default:
      }
    });
  });

  // Question numbers must run 1..N across the whole paper. The renderer numbers automatically, so
  // this only catches a stored number that disagrees with the position.
  const flat = numberedItems(exam);
  flat.forEach(({ number, item }) => {
    if (item?.number !== undefined && Number(item.number) !== number) {
      w.push(`Question ${number}: is stored as number ${item.number}; numbering must run 1 to ${flat.length} continuously.`);
    }
  });

  if (expected !== null && total !== expected) w.push(`Section marks add up to ${total}, not ${expected}.`);

  // Correct letters spread evenly: no letter may carry more than 40% of the multiple choice.
  const mcq = flat.filter((entry) => entry.kind === 'mcq' && L.includes(String(entry.item?.answer || '').toUpperCase()));
  if (mcq.length >= 10) {
    const counts = {};
    for (const { item } of mcq) counts[item.answer.toUpperCase()] = (counts[item.answer.toUpperCase()] || 0) + 1;
    const worst = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
    if (worst && worst[1] / mcq.length > 0.4) {
      w.push(`The correct answers are not spread evenly: letter ${worst[0]} is the answer ${Math.round((worst[1] / mcq.length) * 100)}% of the time (${worst[1]} of ${mcq.length}).`);
    }
  }

  return w;
}

// Maps an old flat exam into the sectioned layout. Lossy by nature: the old types that have no
// section of their own (select_all, matching, sequencing) become structured questions.
export function convertToSections(exam, { total = null } = {}) {
  if (isSectionsExam(exam)) return exam;
  const questions = exam?.questions || [];
  const plan = buildSectionPlan(total ?? totalMarks(exam) ?? 100);
  const byKind = Object.fromEntries(plan.map((section) => [section.kind, section]));
  const buckets = Object.fromEntries(plan.map((section) => [section.id, []]));

  for (const q of questions) {
    const marks = Number(q.marks) || 0;
    if (q.type === 'mcq') {
      const target = byKind.mcq;
      for (const item of q.items || []) {
        buckets[target.id].push({
          text: String(item.text || ''),
          options: (item.options || []).slice(0, 4).map(String),
          answer: String(item.answer || 'A').toUpperCase().slice(0, 1),
          notes: item.notes ? String(item.notes) : '',
          marks: target.marksPerItem,
        });
      }
    } else if (q.type === 'true_false') {
      const target = byKind.true_false;
      for (const item of q.items || []) {
        buckets[target.id].push({ text: String(item.text || ''), answer: ['True', 'False'].includes(item.answer) ? item.answer : 'True', marks: target.marksPerItem });
      }
    } else if (q.type === 'short_answer') {
      const target = byKind.short_answer;
      for (const item of q.items || []) {
        buckets[target.id].push({
          text: String(item.text || ''),
          marks: target.marksPerItem,
          answer: String(item.answer || ''),
          markingPoints: [],
        });
      }
    } else {
      const target = byKind.structured || plan[plan.length - 1];
      const fromParts = (q.parts || []).map((part, i) => ({
        letter: String(part.label || `${L[i]})`).replace(/[()]/g, '').slice(0, 1) || L[i],
        text: String(part.text || ''),
        marks: Number(part.marks) || 0,
      }));
      const parts = fromParts.length
        ? fromParts
        : [{ letter: 'a', text: String(q.prompt || ''), marks }];
      buckets[target.id].push({
        title: String(q.prompt || `Question ${(buckets[target.id] || []).length + 1}`).slice(0, 160),
        totalMarks: marks || parts.reduce((sum, part) => sum + part.marks, 0),
        parts,
        markingPoints: (q.markingPoints || []).map((point) => ({ point: String(point.text || point.point || ''), marks: Number(point.marks) || 0 })),
        modelAnswer: String(q.modelAnswer || ''),
      });
    }
  }

  const sections = plan.map((section) => ({
    ...section,
    items: buckets[section.id],
    marks: buckets[section.id].reduce((sum, item) => sum + (Number(item.marks ?? item.totalMarks) || 0), 0),
  })).filter((section) => section.items.length);

  return {
    ...exam,
    layout: LAYOUT_SECTIONS,
    sections,
  };
}

/**
 * The numbered instructions printed at the top of a sectioned paper. Built from the paper itself,
 * so the section count, question count and marks are never out of date.
 */
export function examInstructions(exam) {
  const sections = exam?.sections || [];
  if (!sections.length) return [];
  const flat = numberedItems(exam);
  const total = totalMarks(exam);
  const letterFor = (kind) => sections.find((section) => section.kind === kind)?.id;
  const lines = [
    `Answer ALL questions in all ${sections.length} sections. The paper has ${flat.length} questions and ${total} marks in total.`,
    `${sections.map((section) => `Section ${section.id}: ${sectionMarks(section)} marks.`).join(' ')}`,
  ];

  const mcq = letterFor('mcq');
  const tf = letterFor('true_false');
  const fill = letterFor('fill_blank');
  const written = sections.filter((section) => section.kind === 'short_answer' || section.kind === 'structured').map((section) => section.id);

  if (mcq) lines.push(`In Section ${mcq}, circle the letter of the ONE best answer.`);
  if (tf) lines.push(`In Section ${tf}, write TRUE or FALSE after each statement.`);
  if (fill) lines.push(`In Section ${fill}, write the missing word or words on the line.`);
  if (written.length) lines.push(`In Section${written.length > 1 ? 's' : ''} ${written.join(' and ')}, write your answers in the space provided.`);
  lines.push('The marks for each question are shown in square brackets. Allow your time in proportion to the marks.');
  lines.push('No mobile phones, notes or books. Write clearly in blue or black ink.');
  return lines;
}

/** Counts for the banner: sections, numbered questions, total marks and how many of each kind. */
export function examStats(exam) {  if (!isSectionsExam(exam)) {
    const questions = exam?.questions || [];
    return { layout: LAYOUT_CLASSIC, sections: 0, questions: questions.length, total: totalMarks(exam), byKind: {} };
  }
  const flat = numberedItems(exam);
  const byKind = {};
  for (const entry of flat) byKind[entry.kind] = (byKind[entry.kind] || 0) + 1;
  return { layout: LAYOUT_SECTIONS, sections: exam.sections.length, questions: flat.length, total: totalMarks(exam), byKind };
}

function validateClassicExam(exam, target) {
  const w = [];
  const qs = exam?.questions || [];
  if (!qs.length) return ['The exam has no questions.'];
  const sum = totalMarks(exam);
  if (target && sum !== Number(target)) w.push(`Marks add up to ${sum}, not ${target}.`);

  qs.forEach((q, idx) => {
    const n = idx + 1;
    const bad = (msg) => w.push(`Q${n}: ${msg}`);
    if (!(Number(q.marks) > 0)) bad('marks must be more than 0.');
    switch (q.type) {
      case 'mcq':
        if (!q.items?.length) bad('no sub-questions.');
        (q.items || []).forEach((it, i) => {
          if ((it.options || []).length < 2) bad(`(${i + 1}) needs at least 2 options.`);
          const ai = L.indexOf(it.answer);
          if (ai < 0 || ai >= (it.options || []).length) bad(`(${i + 1}) answer "${it.answer}" is not one of the options.`);
        });
        break;
      case 'true_false':
        if (!q.items?.length) bad('no statements.');
        (q.items || []).forEach((it, i) => {
          if (!['True', 'False'].includes(it.answer)) bad(`statement ${L[i]} answer must be True or False.`);
        });
        break;
      case 'short_answer':
        if (!q.items?.length) bad('no items.');
        (q.items || []).forEach((it, i) => { if (!String(it.answer || '').trim()) bad(`item ${i + 1} has no answer.`); });
        break;
      case 'select_all': {
        const k = (q.options || []).length;
        if (k < 3) bad('needs at least 3 options.');
        if (!(q.correct || []).length) bad('no correct options given.');
        (q.correct || []).forEach((c) => { if (L.indexOf(c) < 0 || L.indexOf(c) >= k) bad(`correct option "${c}" does not exist.`); });
        break;
      }
      case 'matching': {
        const a = (q.columnA || []).length;
        const b = (q.columnB || []).length;
        if (a < 2) bad('needs at least 2 items in Column A.');
        if (b < a) bad('Column B must have at least as many items as Column A.');
        if ((q.matchAnswers || []).length !== a) bad('needs one answer per Column A item.');
        (q.matchAnswers || []).forEach((m) => { if (L.indexOf(m) < 0 || L.indexOf(m) >= b) bad(`answer "${m}" is not in Column B.`); });
        if (new Set(q.matchAnswers || []).size !== (q.matchAnswers || []).length) bad('two items share the same answer.');
        break;
      }
      case 'sequencing': {
        const s = (q.steps || []).length;
        const ans = q.sequenceAnswer || [];
        const ok = ans.length === s && [...ans].sort((x, y) => x - y).every((v, i) => v === i + 1);
        if (s < 3) bad('needs at least 3 steps.');
        if (!ok) bad('the sequence answer must list every step number exactly once.');
        break;
      }
      case 'essay': {
        const ps = (q.parts || []).reduce((s2, p) => s2 + (Number(p.marks) || 0), 0);
        const ms = (q.markingPoints || []).reduce((s2, p) => s2 + (Number(p.marks) || 0), 0);
        if ((q.parts || []).length && ps !== Number(q.marks)) bad(`part marks add up to ${ps}, not ${q.marks}.`);
        if (ms !== Number(q.marks)) bad(`marking points add up to ${ms}, not ${q.marks}.`);
        break;
      }
      default:
        bad(`unknown type "${q.type}".`);
    }
  });
  return w;
}
