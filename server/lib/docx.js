import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType,
  BorderStyle, ShadingType, AlignmentType, Footer, Header, HeadingLevel, PageNumber,
  SectionType, TableLayoutType, LevelFormat, TabStopType,
} from 'docx';
import {
  L, totalMarks, answerText, markingNote, QUESTION_TYPES,
  isSectionsExam, numberedItems, sectionMarks, marksLabel, examInstructions, SECTION_KINDS,
} from '../../shared/format.js';

const FONT = 'Arial';
const t = (text, o = {}) => new TextRun({ text: String(text ?? ''), font: FONT, size: o.size || 20, bold: o.bold, italics: o.italics });
const para = (children, o = {}) => new Paragraph({
  children,
  spacing: { before: o.before || 0, after: o.after === undefined ? 40 : o.after },
  alignment: o.align,
  indent: o.indent,
  keepNext: o.keepNext,
  keepLines: true,
  tabStops: o.tabStops,
  border: o.border,
  numbering: o.numbering,
});

const TAB = 680;
const hang = { indent: { left: TAB, hanging: 340 }, tabStops: [{ type: TabStopType.LEFT, position: TAB }] };
const stem = (n, text, marks) =>
  para([t(`${n}. `, { bold: true }), t(text), t(` (${marks} marks)`, { bold: true })], { before: 150, keepNext: true });
const line = (label, text, keep, extra = '') =>
  para([t(`${label}\t${text}${extra}`)], { ...hang, keepNext: keep, after: 20 });

// ---------------------------------------------------------------- exam body
function renderQuestion(q, n) {
  const out = [stem(n, q.prompt, q.marks)];
  switch (q.type) {
    case 'mcq':
      (q.items || []).forEach((it, i, arr) => {
        out.push(para([t(`(${i + 1}) ${it.text}`)], { keepNext: true, before: 50, after: 30 }));
        (it.options || []).forEach((o, j, os) => out.push(line(`${L[j]}.`, o, !(i === arr.length - 1 && j === os.length - 1))));
      });
      break;
    case 'true_false':
      (q.items || []).forEach((it, i, arr) => out.push(line(`${L[i]}.`, it.text, i < arr.length - 1, '   ____')));
      break;
    case 'short_answer':
      (q.items || []).forEach((it, i, arr) => out.push(line(`${i + 1}.`, it.text, i < arr.length - 1, '   ____________')));
      break;
    case 'select_all':
      (q.options || []).forEach((o, j, arr) => out.push(line(`${L[j]}.`, o, j < arr.length - 1)));
      break;
    case 'matching':
      out.push(para([t('Column A', { bold: true })], { keepNext: true, before: 40 }));
      (q.columnA || []).forEach((a, i) => out.push(line(`${i + 1}.`, a, true, '   ______')));
      out.push(para([t('Column B', { bold: true })], { keepNext: true, before: 60 }));
      (q.columnB || []).forEach((b, j, arr) => out.push(line(`${L[j]}.`, b, j < arr.length - 1)));
      break;
    case 'sequencing':
      (q.steps || []).forEach((s, i) => out.push(line(`${i + 1}.`, s, true)));
      out.push(para([t(`Sequence: ${(q.steps || []).map(() => '__').join(', ')}`, { bold: true })], { before: 60 }));
      break;
    case 'essay':
      (q.parts || []).forEach((p) =>
        out.push(para([t(`${p.label}\t${p.text} `), t(`(${p.marks} marks)`, { bold: true })], {
          indent: { left: TAB, hanging: 400 }, tabStops: [{ type: TabStopType.LEFT, position: TAB }], after: 40,
        })));
      break;
    default:
  }
  return out;
}

const footer = (label) => new Footer({
  children: [new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [
      new TextRun({ text: `${label}  |  Page `, font: FONT, size: 16 }),
      new TextRun({ children: [PageNumber.CURRENT], font: FONT, size: 16 }),
      new TextRun({ text: ' of ', font: FONT, size: 16 }),
      new TextRun({ children: [PageNumber.TOTAL_PAGES], font: FONT, size: 16 }),
    ],
  })],
});

const bd = { style: BorderStyle.SINGLE, size: 4, color: '808080' };
const borders = { top: bd, bottom: bd, left: bd, right: bd };
const shade = (fill) => ({ fill, type: ShadingType.CLEAR, color: 'auto' });

// A cell that carries its own width: Word redistributes columns unless the width is on the
// table *and* on every cell. The exam keeps a local copy of this; this one is shared.
const cell = (w, children, fill, bd2, margins) => new TableCell({
  width: { size: w, type: WidthType.DXA },
  borders: bd2 || borders,
  margins: margins || { top: 90, bottom: 90, left: 140, right: 140 },
  shading: fill ? shade(fill) : undefined,
  children,
});

/** Split body text on `**` so bold markers become runs instead of printing as asterisks. */
const rich = (text, o = {}) => String(text ?? '').split('**')
  .map((chunk, i) => (chunk === '' ? null : new TextRun({
    text: chunk,
    font: o.font || FONT,
    size: o.size || 20,
    bold: o.bold || i % 2 === 1,
    italics: o.italics,
    color: o.color,
  })))
  .filter(Boolean);

const numbering = {
  config: [{
    reference: 'instr',
    levels: [{ level: 0, format: LevelFormat.DECIMAL, text: '%1.', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 360, hanging: 360 } } } }],
  }],
};

export async function examDocx(exam, meta = {}) {
  // Saved papers keep the layout they were written in; new ones use sections A-E.
  if (isSectionsExam(exam)) return sectionsExamDocx(exam, meta);
  const W = 10206;
  const qs = exam.questions || [];
  const total = totalMarks(exam);
  const hasEssay = qs.some((q) => q.type === 'essay');
  const essayNums = qs.map((q, i) => (q.type === 'essay' ? i + 1 : null)).filter(Boolean);

  const cell = (w, children, fill) => new TableCell({
    width: { size: w, type: WidthType.DXA }, borders,
    margins: { top: 90, bottom: 90, left: 140, right: 140 },
    shading: fill ? shade(fill) : undefined,
    children,
  });
  const field = (label, value) => para([t(label, { bold: true }), t(value ? ` ${value}` : '')], { after: 160 });

  const instructions = [
    'Read and understand all instructions before answering.',
    `This paper has ${qs.length} questions. Attempt ALL questions. The total is ${total} marks.`,
    'For multiple-choice questions, choose only one correct answer and clearly circle its letter.',
    ...(hasEssay ? [`Write your answers to Question${essayNums.length > 1 ? 's' : ''} ${essayNums.join(' and ')} in the answer booklet provided.`] : []),
    'Erasing or altering answers is strictly prohibited and will lead to zero marks for the affected question.',
    'Use only blue or black ink pens (no pencils or coloured pens).',
  ];

  const head = [
    para([t('MOCK EXAMINATION – QUESTION PAPER', { bold: true, size: 30 })], { align: AlignmentType.CENTER, after: 40 }),
    ...(meta.trade ? [para([t(`TRADE: ${meta.trade.toUpperCase()}`, { bold: true, size: 22 })], { align: AlignmentType.CENTER, after: 20 })] : []),
    para([t(`MODULE: ${(meta.module || exam.title || '').toUpperCase()}${meta.level ? `   |   LEVEL: ${meta.level}` : ''}`, { bold: true })], { align: AlignmentType.CENTER, after: 120 }),
    new Table({
      width: { size: W, type: WidthType.DXA }, columnWidths: [W / 2, W / 2],
      rows: [
        new TableRow({ children: [cell(W / 2, [field('CANDIDATE NAMES:')]), cell(W / 2, [field('INDEX NUMBER:')])] }),
        new TableRow({ children: [cell(W / 2, [field('SCHOOL:', meta.school)]), cell(W / 2, [field('DATE:')])] }),
        new TableRow({ children: [
          cell(W / 2, [para([t(`DURATION: ${meta.duration || '3 HOURS'}`, { bold: true })], { after: 0 })]),
          cell(W / 2, [para([t(`TOTAL MARKS: ${total}`, { bold: true })], { after: 0 })]),
        ] }),
      ],
    }),
    para([t('')], { after: 80 }),
    new Table({
      width: { size: W, type: WidthType.DXA }, columnWidths: [W],
      rows: [new TableRow({
        children: [cell(W, [
          para([t('INSTRUCTIONS TO CANDIDATES', { bold: true })], { after: 60 }),
          ...instructions.map((s) => para([t(s)], { numbering: { reference: 'instr', level: 0 }, after: 30 })),
        ], 'F2F2F2')],
      })],
    }),
    para([t('ATTEMPT ALL QUESTIONS', { bold: true, size: 22 })], {
      align: AlignmentType.CENTER, before: 160, after: 80,
      border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: '000000', space: 4 } },
    }),
  ];

  const body = [];
  qs.forEach((q, i) => body.push(...renderQuestion(q, i + 1)));
  body.push(para([t('END OF PAPER', { bold: true })], { align: AlignmentType.CENTER, before: 200 }));

  const PAGE = { size: { width: 11906, height: 16838 }, margin: { top: 720, bottom: 720, left: 850, right: 850 } };
  const label = `${meta.module || exam.title || 'Exam'}${meta.level ? ` ${meta.level}` : ''} – Mock Exam`;
  const doc = new Document({
    styles: { default: { document: { run: { font: FONT, size: 20 } } } },
    numbering,
    sections: [
      { properties: { page: PAGE }, footers: { default: footer(label) }, children: head },
      { properties: { type: SectionType.CONTINUOUS, page: PAGE, column: { count: 2, space: 454, separate: true } }, footers: { default: footer(label) }, children: body },
    ],
  });
  return Packer.toBuffer(doc);
}

// ---------------------------------------------------------------- marking scheme
export async function keyDocx(exam, meta = {}) {
  if (isSectionsExam(exam)) return sectionsKeyDocx(exam, meta);
  const KW = 9638;
  const qs = exam.questions || [];
  const total = totalMarks(exam);
  const objective = qs.map((q, i) => ({ q, n: i + 1 })).filter((x) => x.q.type !== 'essay');
  const essays = qs.map((q, i) => ({ q, n: i + 1 })).filter((x) => x.q.type === 'essay');
  const objMarks = objective.reduce((s, x) => s + Number(x.q.marks), 0);
  const essayMarks = essays.reduce((s, x) => s + Number(x.q.marks), 0);

  const kcell = (w, text, o = {}) => new TableCell({
    width: { size: w, type: WidthType.DXA }, borders, columnSpan: o.span,
    margins: { top: 70, bottom: 70, left: 120, right: 120 },
    shading: o.fill ? shade(o.fill) : undefined,
    children: String(text ?? '').split('\n').map((ln) => para([t(ln, { bold: o.bold, size: 19 })], { after: 0, align: o.align })),
  });
  const HEAD = 'D9E2F3';

  const children = [
    para([t('MARKING SCHEME', { bold: true, size: 30 })], { align: AlignmentType.CENTER, after: 40 }),
    para([t(`${meta.module || exam.title || ''}${meta.level ? ` (${meta.level})` : ''} – Mock Examination`, { bold: true, size: 22 })], { align: AlignmentType.CENTER, after: 40 }),
    para([t(`Total: ${total} marks   |   For teacher use only`, { italics: true })], { align: AlignmentType.CENTER, after: 160 }),
  ];

  if (objective.length) {
    children.push(para([t(`Section A – ${objective.length} objective and short-answer questions (${objMarks} marks)`, { bold: true, size: 22 })], { after: 80, keepNext: true }));
    const rows = [new TableRow({
      tableHeader: true,
      children: [kcell(700, 'Q', { bold: true, fill: HEAD }), kcell(1500, 'Type', { bold: true, fill: HEAD }), kcell(5238, 'Answer and marking notes', { bold: true, fill: HEAD }), kcell(1000, 'Marks', { bold: true, fill: HEAD, align: AlignmentType.CENTER })],
    })];
    for (const { q, n } of objective) {
      const note = markingNote(q);
      rows.push(new TableRow({ cantSplit: true, children: [
        kcell(700, n, { bold: true }),
        kcell(1500, QUESTION_TYPES[q.type] || q.type),
        kcell(5238, `${answerText(q)}${note ? `\n${note}` : ''}`),
        kcell(1000, q.marks, { align: AlignmentType.CENTER }),
      ] }));
    }
    children.push(new Table({ width: { size: KW, type: WidthType.DXA }, columnWidths: [700, 1500, 5238, 1000], rows }));
  }

  if (essays.length) {
    children.push(para([t(`Section B – ${essays.length} long-answer question${essays.length > 1 ? 's' : ''} (${essayMarks} marks)`, { bold: true, size: 22 })], { before: 280, after: 60, keepNext: true }));
    children.push(para([t('Accept any correct, relevant answer that is clearly explained. Award marks for both the action and the reason where the scheme asks for it.', { bold: true })], { after: 100 }));
    for (const { q, n } of essays) {
      children.push(para([t(`Question ${n} (${q.marks} marks)`, { bold: true, size: 21 })], { before: 160, after: 60, keepNext: true }));
      const rows = [new TableRow({ tableHeader: true, children: [kcell(8238, 'Expected points', { bold: true, fill: HEAD }), kcell(1400, 'Marks', { bold: true, fill: HEAD, align: AlignmentType.CENTER })] })];
      for (const m of q.markingPoints || []) rows.push(new TableRow({ cantSplit: true, children: [kcell(8238, m.text), kcell(1400, m.marks, { align: AlignmentType.CENTER })] }));
      rows.push(new TableRow({ children: [kcell(8238, 'Total', { bold: true, align: AlignmentType.RIGHT }), kcell(1400, q.marks, { bold: true, align: AlignmentType.CENTER })] }));
      children.push(new Table({ width: { size: KW, type: WidthType.DXA }, columnWidths: [8238, 1400], rows }));
    }
  }

  const doc = new Document({
    styles: { default: { document: { run: { font: FONT, size: 20 } } } },
    sections: [{
      properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1000, bottom: 1000, left: 1134, right: 1134 } } },
      footers: { default: footer('Marking Scheme') },
      children,
    }],
  });
  return Packer.toBuffer(doc);
}

// ---------------------------------------------------------------- study notes
// ---------------------------------------------------------------- sectioned exam (sections A-E)
// The RTB end-of-module layout: a centred single-column header on page 1, then the whole paper in
// two columns with a separator line. Calibri 10.5pt, A4, 0.6 inch margins, as in the real papers.

const SFONT = 'Calibri';
const SEC = { navy: '1F3864', banner: 'D9E2F3', label: 'D9D9D9', grey: '595959', rule: '7F7F7F' };
const SEC_CONTENT = 10178; // A4 (11906 twips) minus the 0.6 inch margins
const SEC_GAP = 454;
const SEC_COLUMN = (SEC_CONTENT - SEC_GAP) / 2;
const SZ = { body: 21, small: 16, banner: 24, heading: 26, module: 25, trade: 22, school: 28, rtb: 20 };

const sRun = (text, o = {}) => new TextRun({
  text: String(text ?? ''),
  font: SFONT,
  size: o.size ?? SZ.body,
  bold: o.bold,
  italics: o.italics,
  color: o.color,
  underline: o.underline ? { type: 'single' } : undefined,
});

const sPara = (children, o = {}) => new Paragraph({
  children,
  spacing: { before: o.before ?? 0, after: o.after ?? 50, line: o.line ?? 262 },
  alignment: o.align,
  indent: o.indent,
  keepNext: o.keepNext,
  keepLines: true,
  shading: o.fill ? { type: ShadingType.CLEAR, fill: o.fill } : undefined,
  border: o.border,
  tabStops: o.tabStops,
  pageBreakBefore: o.pageBreakBefore,
});

/** A ruled line for handwriting: a paragraph whose bottom border is the dotted line itself. */
const answerLines = (count = 1, after = 0) => Array.from({ length: Math.max(1, count) }, () => new Paragraph({
  children: [sRun(' ', { size: SZ.body })],
  spacing: { before: 60, after, line: 360 },
  border: { bottom: { style: BorderStyle.DOTTED, size: 6, color: SEC.rule, space: 1 } },
  keepLines: true,
}));

/** The level number out of "RQF LEVEL 3", "Level 4" or "L4". */
function levelNumber(exam) {
  const match = /(\d)/.exec(String(exam?.level || '')) || /(\d)/.exec(String(exam?.title || ''));
  return match ? match[1] : '4';
}

const sectionAction = (section) => {
  switch (section.kind) {
    case 'mcq': return 'Circle the letter of the correct answer.';
    case 'true_false': return 'Write TRUE or FALSE after each statement.';
    case 'fill_blank': return 'Write the missing word or words on the line.';
    case 'short_answer': return 'Answer in the space provided.';
    case 'structured': return 'Answer ALL parts in the space provided.';
    default: return '';
  }
};

const sectionInstructionLine = (section) => {
  const per = Number(section.marksPerItem) || 0;
  const each = per ? `${per} mark${per === 1 ? '' : 's'} each. ` : '';
  const total = sectionMarks(section);
  return `${total} mark${total === 1 ? '' : 's'}${per ? ` \u2013 ${each.trim()}` : ''}. ${sectionAction(section)}`.trim();
};

/** The centred header block plus the candidate-details table and the instructions. */
function sectionsHeader(exam, heading) {
  const out = [];
  const moduleLine = `${exam.moduleCode ? `${exam.moduleCode}: ` : ''}${exam.moduleName || exam.title || ''} \u2013 ${heading}`;
  out.push(sPara([sRun(`RWANDA TVET BOARD (RTB) \u2013 RQF LEVEL ${levelNumber(exam)}`, { size: SZ.rtb })], { align: AlignmentType.CENTER, after: 40 }));
  if (exam.trade) out.push(sPara([sRun(exam.trade, { size: SZ.trade, bold: true })], { align: AlignmentType.CENTER, after: 40 }));
  if (exam.school) out.push(sPara([sRun(exam.school, { size: SZ.school, bold: true, underline: true })], { align: AlignmentType.CENTER, after: 80 }));
  out.push(sPara([sRun(moduleLine, { size: SZ.module, bold: true, color: SEC.navy })], { align: AlignmentType.CENTER, after: 140 }));

  const labelCell = (text) => cell(SEC_LABEL_WIDTH, [sPara([sRun(text, { bold: true, size: 19 })], { after: 0 })], SEC.label, secBorders, { top: 60, bottom: 60, left: 100, right: 100 });
  const blankCell = () => cell(SEC_VALUE_WIDTH, [sPara([sRun(' ', { size: 19 })], { after: 0 })], null, secBorders, { top: 60, bottom: 60, left: 100, right: 100 });
  const valueCell = (text) => cell(SEC_VALUE_WIDTH, [sPara([sRun(text, { size: 19 })], { after: 0 })], null, secBorders, { top: 60, bottom: 60, left: 100, right: 100 });

  const paired = (a, b) => new TableRow({
    children: [
      labelCell(a.label), a.value === undefined ? blankCell() : valueCell(a.value),
      labelCell(b.label), b.value === undefined ? blankCell() : valueCell(b.value),
    ],
  });
  const rows = [
    paired({ label: 'Student Name' }, { label: 'Reg. No / Class' }),
    paired({ label: 'Date' }, { label: 'Duration', value: exam.duration || '3 hours' }),
    paired({ label: 'Trainer' }, { label: 'Total Marks', value: `______ / ${exam.targetMarks || totalMarks(exam)}` }),
  ];

  out.push(new Table({
    width: { size: SEC_CONTENT, type: WidthType.DXA },
    columnWidths: [SEC_LABEL_WIDTH, SEC_VALUE_WIDTH, SEC_LABEL_WIDTH, SEC_VALUE_WIDTH],
    layout: TableLayoutType.FIXED,
    rows,
  }));

  if (heading === 'END OF MODULE EXAMINATION') {
    out.push(sPara([sRun('INSTRUCTIONS TO CANDIDATES', { size: SZ.banner, bold: true, color: SEC.navy })], { before: 220, after: 70, keepNext: true }));
    examInstructions(exam).forEach((line, i) => out.push(sPara(
      [sRun(`${i + 1}.  `, { bold: true }), sRun(line)],
      { indent: { left: 340, hanging: 340 }, after: 24 },
    )));
  }
  return out;
}

const SEC_LABEL_WIDTH = 2400;
const SEC_VALUE_WIDTH = 2689;
const secBd = { style: BorderStyle.SINGLE, size: 6, color: '404040' };
const secBorders = { top: secBd, bottom: secBd, left: secBd, right: secBd };

const secFooter = (exam) => new Footer({
  children: [new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [
      new TextRun({ text: `${exam.moduleCode ? `${exam.moduleCode} ` : ''}${exam.moduleName || exam.title || ''} \u2013 End of Module Exam  |  Page `, font: SFONT, size: SZ.small, color: SEC.grey }),
      new TextRun({ children: [PageNumber.CURRENT], font: SFONT, size: SZ.small, color: SEC.grey }),
      new TextRun({ text: ' of ', font: SFONT, size: SZ.small, color: SEC.grey }),
      new TextRun({ children: [PageNumber.TOTAL_PAGES], font: SFONT, size: SZ.small, color: SEC.grey }),
    ],
  })],
});

function sectionBanner(section) {
  return new Paragraph({
    children: [sRun(`SECTION ${section.id}: ${section.title || String(SECTION_KINDS[section.kind] || '').toUpperCase()}`, { bold: true, color: SEC.navy, size: SZ.banner })],
    spacing: { before: 260, after: 0, line: 300 },
    shading: { type: ShadingType.CLEAR, fill: SEC.banner },
    border: { bottom: { style: BorderStyle.SINGLE, size: 14, color: SEC.navy, space: 2 } },
    keepNext: true,
    keepLines: true,
  });
}

const marksRun = (marks) => sRun(`\u00A0[${marksLabel(marks)}]`, { bold: true });

/** The question paragraph: bold number, the text, then the bold [n marks]. */
const questionStem = (number, text, marks, o = {}) => sPara(
  [sRun(`${number}.  `, { bold: true }), sRun(text), ...(marks ? [marksRun(marks)] : [])],
  { before: o.before ?? 110, after: 30, keepNext: true, indent: o.indent },
);

const optionLine = (letter, text, keep) => sPara([sRun(`${letter}.  `), sRun(text)], {
  indent: { left: 340, hanging: 340 }, after: 16, keepNext: keep,
});

/** Whether a part is asking for code, which needs more room than its marks suggest. */
const wantsCode = (text) => /write .*code|code for|function|method|template|script|program|query|syntax/i.test(String(text || ''));

function sectionBody(exam) {
  const out = [];
  for (const section of exam.sections || []) {
    out.push(sectionBanner(section));
    out.push(sPara([sRun(sectionInstructionLine(section), { italics: true, size: 19, color: SEC.grey })], { after: 90, keepNext: true }));

    const entries = numberedItems(exam).filter((entry) => entry.section === section);
    entries.forEach(({ number, item }) => {
      if (section.kind === 'mcq') {
        out.push(questionStem(number, item.text, section.marksPerItem));
        const options = item.options || [];
        options.forEach((option, i) => out.push(optionLine(L[i], option, i < options.length - 1)));
      } else if (section.kind === 'true_false') {
        out.push(sPara([sRun(`${number}.  `, { bold: true }), sRun(item.text), sRun('   ______')], { before: 110, after: 40, keepNext: false }));
      } else if (section.kind === 'fill_blank') {
        out.push(sPara([sRun(`${number}.  `, { bold: true }), sRun(item.text), marksRun(section.marksPerItem)], { before: 110, after: 40 }));
      } else if (section.kind === 'short_answer') {
        out.push(questionStem(number, item.text, item.marks ?? section.marksPerItem));
        out.push(...answerLines(item.answerLines || 3, 30));
      } else if (section.kind === 'structured') {
        out.push(sPara(
          [sRun(`${number}.  `, { bold: true }), sRun(item.title || 'Structured question', { bold: true }), ...(item.totalMarks ? [marksRun(item.totalMarks)] : [])],
          { before: 160, after: 40, keepNext: true },
        ));
        (item.parts || []).forEach((part) => {
          out.push(sPara(
            [sRun(`(${part.letter})  `, { bold: true }), sRun(part.text), ...(part.marks ? [marksRun(part.marks)] : [])],
            { indent: { left: 300, hanging: 300 }, after: 30, keepNext: true },
          ));
          const lines = Number(part.answerLines) || Math.max(1, Number(part.marks) || 1) + (wantsCode(part.text) ? 2 : 0);
          out.push(...answerLines(lines, 20));
        });
      }
    });
  }
  return out;
}

export async function sectionsExamDocx(exam, meta = {}) {
  const merged = {
    moduleCode: meta.moduleCode || exam.moduleCode,
    moduleName: meta.moduleName || exam.moduleName || meta.module || exam.title,
    level: meta.level || exam.level,
    trade: meta.trade || exam.trade,
    school: meta.school || exam.school,
    duration: meta.duration && meta.duration !== '3 HOURS' ? meta.duration : (exam.duration || meta.duration),
    targetMarks: exam.targetMarks,
    sections: exam.sections,
  };
  const page = { size: { width: 11906, height: 16838 }, margin: { top: 864, bottom: 864, left: 864, right: 864 } };
  const doc = new Document({
    styles: { default: { document: { run: { font: SFONT, size: SZ.body } } } },
    sections: [
      {
        // Page 1: the header block, single column.
        properties: { page },
        footers: { default: secFooter(merged) },
        children: sectionsHeader(merged, 'END OF MODULE EXAMINATION'),
      },
      {
        // The paper itself: two columns with a separator line, starting where the header ended.
        properties: { page, type: SectionType.CONTINUOUS, column: { count: 2, space: SEC_GAP, separate: true } },
        footers: { default: secFooter(merged) },
        children: sectionBody(merged),
      },
    ],
  });
  return Packer.toBuffer(doc);
}

/** The marking scheme: same header, then a key for each section and the mark record. */
export async function sectionsKeyDocx(exam, meta = {}) {
  const merged = {
    ...exam,
    moduleCode: meta.moduleCode || exam.moduleCode,
    moduleName: meta.moduleName || exam.moduleName || meta.module || exam.title,
    level: meta.level || exam.level,
    trade: meta.trade || exam.trade,
    school: meta.school || exam.school,
  };
  const total = totalMarks(exam);
  const flat = numberedItems(exam);
  const children = sectionsHeader({ ...merged, targetMarks: total }, `MARKING SCHEME (Examiners only, ${total} marks)`);

  // Mark summary.
  children.push(sPara([sRun('MARK SUMMARY', { bold: true, color: SEC.navy, size: SZ.banner })], { before: 220, after: 60, keepNext: true }));
  const summary = (exam.sections || []).map((section) => {
    const entries = flat.filter((entry) => entry.section === section);
    const first = entries[0]?.number;
    const last = entries[entries.length - 1]?.number;
    return [section.id, `${section.title || ''}`.trim(), first === last ? `${first}` : `${first} \u2013 ${last}`, `${sectionMarks(section)}`];
  });
  summary.push(['', 'TOTAL', `${flat.length} questions`, `${total}`]);
  children.push(plainTable(['Section', 'Title', 'Questions', 'Marks'], summary, [1100, 5078, 2200, 1800], { header: true }));

  children.push(sPara([sRun('GENERAL MARKING RULES', { bold: true, color: SEC.navy, size: SZ.banner })], { before: 220, after: 60, keepNext: true }));
  [
    'Mark positively: award marks for what the candidate knows, and do not deduct for what is missing unless the question says so.',
    'Accept any answer that is correct in substance, even if it is worded differently from this scheme.',
    'A candidate may use a different but valid method; award the marks for a correct approach even if the final answer has a small slip.',
    'Half marks are not awarded. Do not round a total up.',
    'Where a question asks for a reason as well as an action, award the reason mark only when the reason is correct.',
    'Record every mark in the candidate mark record at the end and add the sections up carefully.',
  ].forEach((line, i) => children.push(sPara([sRun(`${i + 1}.  `, { bold: true }), sRun(line)], { indent: { left: 340, hanging: 340 }, after: 24 })));

  for (const section of exam.sections || []) {
    const entries = flat.filter((entry) => entry.section === section);
    if (!entries.length) continue;
    children.push(sPara([sRun(`SECTION ${section.id}: ${section.title || ''} \u2013 ${sectionMarks(section)} marks`, { bold: true, color: SEC.navy, size: SZ.banner })], { before: 220, after: 60, keepNext: true }));

    if (section.kind === 'mcq') {
      // Compact two pairs per row, the way real schemes print a multiple-choice key.
      const pairs = entries.map(({ number, item }) => [`${number}`, String(item.answer || '')]);
      for (let i = 0; i < pairs.length; i += 4) {
        const row = [];
        for (let j = 0; j < 4; j += 2) {
          row.push(pairs[i + j]?.[0] ?? '', pairs[i + j]?.[1] ?? '');
        }
        children.push(plainTable(['Q', 'Ans', 'Q', 'Ans'], [row], [1600, 1200, 1600, 1200], { header: i === 0 }));
      }
    } else if (section.kind === 'true_false') {
      children.push(plainTable(['Q', 'Answer', 'Why'], entries.map(({ number, item }) => [`${number}`, String(item.answer || ''), item.notes || '']), [900, 1300, 7978], { header: true }));
    } else if (section.kind === 'fill_blank') {
      children.push(plainTable(['Q', 'Answer'], entries.map(({ number, item }) => [`${number}`, String(item.answer || '')]), [900, 9278], { header: true }));
    } else if (section.kind === 'short_answer') {
      children.push(plainTable(
        ['Q', 'Expected answer', 'Marks'],
        entries.map(({ number, item }) => [`${number}`, String(item.answer || item.modelAnswer || ''), `${item.marks ?? section.marksPerItem}`]),
        [900, 8078, 1200],
        { header: true },
      ));
    } else {
      for (const { number, item } of entries) {
        children.push(sPara(
          [sRun(`${number}.  `, { bold: true }), sRun(item.title || '', { bold: true }), sRun(`  (${item.totalMarks || 0} marks)`, { bold: true })],
          { before: 160, after: 40, keepNext: true },
        ));
        const points = (item.markingPoints || []).map((point) => [point.point, `${point.marks}`]);
        if (points.length) children.push(plainTable(['Marking point', 'Marks'], points, [8978, 1200], { header: true }));
        if (item.modelAnswer) children.push(sPara([sRun('Model answer: ', { bold: true }), sRun(item.modelAnswer)], { after: 40 }));
        if (item.code) children.push(codeParagraph(item.code));
      }
    }
  }

  // Candidate mark record.
  children.push(new Paragraph({ children: [], pageBreakBefore: true }));
  children.push(sPara([sRun('CANDIDATE MARK RECORD', { bold: true, color: SEC.navy, size: SZ.banner })], { after: 70, keepNext: true }));
  const record = (exam.sections || []).map((section) => [section.id, String(section.title || ''), `${sectionMarks(section)}`, '']);
  record.push(['', 'TOTAL', `${total}`, '']);
  children.push(plainTable(['Section', 'Title', 'Maximum', 'Score'], record, [1100, 5878, 1600, 1600], { header: true }));
  children.push(sPara([sRun('Examiner: ______________________    Signature: ______________________    Date: ______________', { size: 19 })], { before: 260 }));

  const doc = new Document({
    styles: { default: { document: { run: { font: SFONT, size: SZ.body } } } },
    sections: [{ properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 864, bottom: 864, left: 864, right: 864 } } }, footers: { default: secFooter(merged) }, children }],
  });
  return Packer.toBuffer(doc);
}

/** A simple bordered table with a shaded header row, used by the marking scheme. */
function plainTable(headers, rows, widths, { header = true } = {}) {
  const head = new TableRow({
    tableHeader: true,
    children: headers.map((text, i) => cell(widths[i], [sPara([sRun(text, { bold: true, size: 19, color: 'FFFFFF' })], { after: 0 })], SEC.navy, secBorders, { top: 50, bottom: 50, left: 90, right: 90 })),
  });
  const body = rows.map((row) => new TableRow({
    cantSplit: true,
    children: row.map((value, i) => cell(widths[i], [sPara([sRun(value)], { after: 0 })], null, secBorders, { top: 50, bottom: 50, left: 90, right: 90 })),
  }));
  return new Table({
    width: { size: widths.reduce((a, b) => a + b, 0), type: WidthType.DXA },
    columnWidths: widths,
    layout: TableLayoutType.FIXED,
    rows: header ? [head, ...body] : body,
  });
}

/** Model code: monospaced on a grey background, kept together. */
function codeParagraph(code) {
  return new Paragraph({
    children: String(code).split('\n').map((line, i) => new TextRun({
      text: line || ' ',
      font: 'Courier New',
      size: 17,
      break: i === 0 ? undefined : 1,
    })),
    spacing: { before: 60, after: 100, line: 240 },
    shading: { type: ShadingType.CLEAR, fill: 'F2F2F2' },
    keepLines: true,
  });
}

export async function notesDocx(notes) {
  const topics = (notes.sections || []).map((s) => s.topic).filter(Boolean);
  const children = [
    para([t(notes.title || 'Study notes', { bold: true, size: 32 })], { after: 160 }),
    ...(topics.length ? [
      para([t('Contents', { bold: true, size: 24 })], { before: 80, after: 60, keepNext: true }),
      ...topics.map((topic, i) => para([t(`${i + 1}.  ${topic}`)], { indent: { left: 540, hanging: 340 }, after: 30 })),
      para([t('')], { after: 80 }),
    ] : []),
  ];
  for (const s of notes.sections || []) {
    children.push(para([t(s.topic, { bold: true, size: 24 })], { before: 220, after: 80, keepNext: true }));
    for (const k of s.keyPoints || []) children.push(para([t(k)], { numbering: { reference: 'bullets', level: 0 }, after: 40 }));
    if (s.example) children.push(para([t('Remember: ', { bold: true, italics: true }), t(s.example, { italics: true })], { before: 60, after: 60 }));
  }
  const doc = new Document({
    styles: { default: { document: { run: { font: FONT, size: 22 } } } },
    numbering: {
      config: [{
        reference: 'bullets',
        levels: [{ level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 540, hanging: 270 } } } }],
      }],
    },
    sections: [{
      properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1134, bottom: 1134, left: 1134, right: 1134 } } },
      footers: { default: footer(notes.title || 'Study notes') },
      children,
    }],
  });
  return Packer.toBuffer(doc);
}

// ---------------------------------------------------------------- study handout
// Mirrors study_handout_style_engine.py: A4 portrait, one Word SECTION per unit (Word
// repaginates a single 200-page section very badly), navy headings, shaded header rows,
// single-cell callouts, and monospaced code/ASCII that must never be reflowed.

const NAVY = '1F4E79';
const MONO = 'Courier New';
const HW = 9752; // A4 width minus the handout margins below (11906 - 1134 - 1020 twips)
const PAGE_A4 = { size: { width: 11906, height: 16838 }, margin: { top: 1134, bottom: 1020, left: 1134, right: 1020 } };
const HB = { style: BorderStyle.SINGLE, size: 4, color: '8EA9DB' };
const hBorders = { top: HB, bottom: HB, left: HB, right: HB };
const TB = { style: BorderStyle.SINGLE, size: 6, color: 'BF9000' };
const tBorders = { top: TB, bottom: TB, left: TB, right: TB };
const HFILL = { head: '1F4E79', tip: 'FFF2CC', remember: 'DEEAF6', trap: 'FCE4D6', example: 'EDEDED', code: 'F5F5F5' };
const HANG = { left: 360, hanging: 360 };

// Consecutive tables merge in Word unless a paragraph separates them, and a heading needs
// keepNext to stay with the table or box it introduces.
const gap = (after = 80) => para([t('')], { after });
const h1 = (text) => new Paragraph({
  heading: HeadingLevel.HEADING_1, keepNext: true, keepLines: true,
  spacing: { before: 300, after: 120 },
  children: rich(text, { size: 30, bold: true, color: NAVY }),
});
const h2 = (text) => new Paragraph({
  heading: HeadingLevel.HEADING_2, keepNext: true, keepLines: true,
  spacing: { before: 240, after: 100 },
  children: rich(text, { size: 26, bold: true, color: NAVY }),
});
const h3 = (text) => new Paragraph({
  heading: HeadingLevel.HEADING_3, keepNext: true, keepLines: true,
  spacing: { before: 180, after: 70 },
  children: rich(text, { size: 22, bold: true, color: NAVY }),
});

const spread = (n) => (n <= 1 ? [100] : n === 2 ? [40, 60] : n === 3 ? [28, 36, 36] : Array.from({ length: n }, (_, i) => (i === 0 ? 34 : Math.round(66 / (n - 1)))));

/** A table with a navy white-on-navy header row, fixed columns and blue borders. */
function htable(headers, rows, weights, o = {}) {
  const ws = weights || spread(headers.length);
  const total = ws.reduce((a, b) => a + b, 0);
  const cols = ws.map((w) => Math.round((HW * w) / total));
  const head = new TableRow({
    tableHeader: true,
    children: headers.map((text, i) => cell(cols[i], [para(rich(text, { size: o.size || 19, bold: true, color: 'FFFFFF' }), { after: 0, keepNext: true })], HFILL.head, hBorders)),
  });
  const body = rows.map((row) => new TableRow({
    cantSplit: true,
    children: Array.from({ length: headers.length }, (_, i) => cell(
      cols[i],
      [para(rich(row[i], { size: o.size || 19 }), { after: 0 })],
      null,
      hBorders,
    )),
  }));
  return new Table({ width: { size: HW, type: WidthType.DXA }, columnWidths: cols, layout: TableLayoutType.FIXED, rows: [head, ...body] });
}

/** One-cell shaded box: callouts, code and ASCII diagrams are all this shape. */
const box1 = (children, fill, bd2, margins) =>
  new Table({
    width: { size: HW, type: WidthType.DXA },
    columnWidths: [HW],
    layout: TableLayoutType.FIXED,
    rows: [new TableRow({ children: [cell(HW, children, fill, bd2, margins)] })],
  });

// Monospace runs carry their own font: the document default is Arial, which mangles ASCII art.
const monoLines = (text, align) => String(text ?? '').replace(/\r\n?/g, '\n').replace(/\n+$/, '').split('\n')
  .map((ln) => new Paragraph({
    children: [new TextRun({ text: ln === '' ? ' ' : ln, font: MONO, size: 16 })],
    spacing: { before: 0, after: 0, line: 240 },
    alignment: align,
    keepLines: true,
  }));

const codeBox = (text, align) => box1(monoLines(text, align), HFILL.code, hBorders, { top: 100, bottom: 100, left: 140, right: 140 });

const callout = (kind, label, text, extra = []) => box1(
  [
    para([new TextRun({ text: `${label}  `, font: FONT, size: 21, bold: true, color: NAVY }), ...rich(text, { size: 21 })], { after: 0 }),
    ...extra.map((line) => para(rich(line, { size: 21 }), { after: 0 })),
  ],
  HFILL[kind] || HFILL.remember,
  kind === 'tip' ? tBorders : hBorders,
  { top: 100, bottom: 100, left: 160, right: 160 },
);

const numSteps = (items) => (items || []).map((it, i) => para(
  [t(`${i + 1}. `), ...rich(it)],
  { indent: HANG, after: 50, keepNext: i === (items || []).length - 1 },
));
const bullets = (items) => (items || []).map((it) => para([t('•  '), ...rich(it)], { indent: { left: 340, hanging: 340 }, after: 50 }));
// U+25A1, not U+2610: Arial has no glyph for the ballot box and prints a missing-glyph square.
const checklist = (items) => (items || []).map((it) => para([t('\u25A1  '), ...rich(it)], { indent: { left: 340, hanging: 340 }, after: 50 }));
const lead = (label, text) => para(rich(`**${label}** ${text}`), { after: 60 });

function renderBlock(block) {
  const out = [];
  if (block.heading) out.push(h3(block.heading));
  if (block.kind === 'prose') out.push(para(rich(block.text), { after: 100 }));
  else if (block.kind === 'bullets') out.push(...bullets(block.items));
  else if (block.kind === 'steps') out.push(...numSteps(block.items));
  else if (block.kind === 'table' || block.kind === 'compare') {
    const headers = block.headers || [];
    out.push(htable(headers, block.rows || [], spread(headers.length)));
    out.push(gap());
  }
  if (block.code) { out.push(codeBox(block.code)); out.push(gap()); }
  return out;
}

function workedExample(we) {
  const inner = [para([new TextRun({ text: `WORKED EXAMPLE: ${we.title || ''}`, font: FONT, size: 22, bold: true, color: NAVY })], { after: 70, keepNext: true })];
  if (we.task) inner.push(lead('The task:', we.task));
  if (we.thinking) inner.push(lead('Thinking it through:', we.thinking));
  if (we.steps?.length) inner.push(lead('The solution, step by step:', ''), ...numSteps(we.steps));
  if (we.code) inner.push(...monoLines(we.code));
  if (we.expected) inner.push(lead('What the expected result looks like:', we.expected));
  if (we.why) inner.push(lead('Why each decision is correct:', we.why));
  if (we.mistakes?.length) inner.push(lead('Common mistakes to avoid:', ''), ...bullets(we.mistakes));
  return box1(inner, HFILL.example, hBorders, { top: 120, bottom: 120, left: 170, right: 170 });
}

function titleBlock(handout, unit) {
  const out = [];
  const who = [handout.level, handout.trade].filter(Boolean).join('  |  ');
  if (who) out.push(para(rich(who, { size: 20, bold: true, color: '7F7F7F' }), { align: AlignmentType.CENTER, after: 40 }));
  out.push(para(rich(handout.moduleName || handout.title || 'Study handout', { size: 36, bold: true, color: NAVY }), { align: AlignmentType.CENTER, after: 20 }));
  if (handout.moduleCode) out.push(para(rich(`MODULE CODE: ${handout.moduleCode}`, { size: 22, bold: true }), { align: AlignmentType.CENTER, after: 80 }));
  out.push(para(rich(`UNIT ${unit.number} STUDY HANDOUT`, { size: 26, bold: true, color: NAVY }), { align: AlignmentType.CENTER, after: 40, keepNext: true }));
  out.push(h1(`UNIT ${unit.number}: ${unit.title}`));
  if (unit.learningOutcome) { out.push(callout('remember', 'Learning outcome', unit.learningOutcome)); out.push(gap()); }
  if (unit.duration) out.push(para([t('Duration: ', { bold: true }), ...rich(unit.duration)], { after: 60 }));
  if (unit.indicativeContents?.length) {
    out.push(h3('Indicative contents'));
    out.push(...bullets(unit.indicativeContents));
  }
  if (unit.objectives?.length) {
    out.push(h3('By the end of this unit you should be able to'));
    out.push(...bullets(unit.objectives));
  }
  return out;
}

function lessons(unit) {
  const out = [];
  for (const lesson of unit.lessons || []) {
    out.push(h1(`${lesson.number ? `${lesson.number} ` : ''}${lesson.title}`));
    if (lesson.keyTerms?.length) {
      out.push(h3('Key terms'));
      out.push(htable(['Key term', 'Clear meaning'], lesson.keyTerms.map((k) => [k.term, k.meaning]), [34, 66]));
      out.push(gap());
    }
    for (const block of lesson.blocks || []) out.push(...renderBlock(block));
    for (const c of lesson.callouts || []) { out.push(callout(c.kind, c.label, c.text)); out.push(gap()); }
    if (lesson.workedExample) { out.push(workedExample(lesson.workedExample)); out.push(gap()); }
  }
  return out;
}

function diagrams(unit) {
  if (!unit.diagrams?.length) return [];
  const out = [h1('Diagrams explained step by step')];
  for (const d of unit.diagrams) {
    out.push(h2(d.title));
    out.push(codeBox(d.ascii, AlignmentType.CENTER));
    out.push(gap());
    out.push(...numSteps(d.readSteps));
    if (d.redraw) out.push(lead('How to redraw it in the exam:', d.redraw));
  }
  return out;
}

function revision(unit) {
  const rev = unit.revision || {};
  const out = [];
  const mcq = rev.mcq || [];
  const tf = rev.trueFalse || [];
  const scenario = rev.scenario || [];
  if (!mcq.length && !tf.length && !scenario.length && !(rev.extraPractice || []).length) return out;

  out.push(h1('Revision questions'));
  if (mcq.length) {
    out.push(h2('Multiple choice questions'));
    mcq.forEach((m, i) => {
      out.push(para([t(`${i + 1}. `), ...rich(m.q)], { indent: HANG, after: 40, keepNext: true }));
      (m.choices || []).forEach((c, j) => out.push(para([t(`${L[j] || String.fromCharCode(65 + j)}.  `), ...rich(c)], { indent: { left: 700, hanging: 300 }, after: 30 })));
    });
  }
  if (tf.length) {
    out.push(h2('True or false'));
    tf.forEach((s, i) => out.push(para([t(`${i + 1}. `), ...rich(s.statement)], { indent: HANG, after: 40 })));
  }
  if (scenario.length) {
    out.push(h2('Scenario questions'));
    out.push(...numSteps(scenario.map((s) => s.q)));
  }
  const keys = [
    ...mcq.map((m, i) => [`MCQ ${i + 1}`, m.answer, m.reason]),
    ...tf.map((s, i) => [`True/False ${i + 1}`, s.answer, s.reason]),
    ...scenario.map((s, i) => [`Scenario ${i + 1}`, s.answer, s.reason]),
  ];
  if (keys.length) {
    out.push(h2('Answer key'));
    out.push(htable(['Question', 'Answer', 'Reason'], keys, [20, 28, 52]));
    out.push(gap());
  }
  if (rev.extraPractice?.length) {
    out.push(h2('Answers to the extra practice'));
    out.push(htable(['Reference', 'Answer', 'Reason'], rev.extraPractice.map((e) => [e.reference, e.answer, e.reason]), [22, 34, 44]));
    out.push(gap());
  }
  return out;
}

function practical(unit) {
  const p = unit.practical;
  if (!p) return [];
  const out = [h1('Practical assessment task')];
  if (p.scenario) { out.push(callout('remember', 'Scenario', p.scenario)); out.push(gap()); }
  out.push(...numSteps(p.steps));
  if (p.assessor?.length) { out.push(h2('What the Assessor Looks For')); out.push(...checklist(p.assessor)); }
  if (p.report?.length) { out.push(h2('Report Checklist')); out.push(...checklist(p.report)); }
  return out;
}

function unitChildren(handout, unit) {
  const out = [
    ...titleBlock(handout, unit),
    ...lessons(unit),
    ...diagrams(unit),
  ];
  if (unit.memorySheet?.length) {
    out.push(h1('Exam memory sheet'));
    out.push(para(rich('Cover the right-hand column and test yourself. Say the answer out loud before you look.'), { italics: true, after: 80 }));
    out.push(htable(['Remember', 'Quick answer'], unit.memorySheet.map((m) => [m.remember, m.answer]), [45, 55]));
    out.push(gap());
  }
  out.push(...revision(unit));
  out.push(...practical(unit));
  if (unit.studyTips?.length) {
    out.push(h1('Last-minute study tips'));
    out.push(...bullets(unit.studyTips));
  }
  out.push(para(rich(`END OF UNIT ${unit.number} HANDOUT`, { size: 24, bold: true, color: NAVY }), { align: AlignmentType.CENTER, before: 300 }));
  return out;
}

const handoutHeader = (moduleName) => new Header({
  children: [para([new TextRun({ text: String(moduleName || 'Study handout'), font: FONT, size: 16, color: '7F7F7F' })], {
    align: AlignmentType.RIGHT, after: 0,
    border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: 'BFBFBF', space: 2 } },
  })],
});

export async function handoutDocx(handout) {
  const units = handout?.units || [];
  const sections = units.map((unit) => ({
    properties: { page: PAGE_A4 }, // no explicit type: a new section starts on a new page
    headers: { default: handoutHeader(handout.moduleName) },
    footers: { default: footer('Student Study Handout') },
    children: unitChildren(handout, unit),
  }));
  if (!sections.length) {
    sections.push({
      properties: { page: PAGE_A4 },
      headers: { default: handoutHeader(handout?.moduleName) },
      footers: { default: footer('Student Study Handout') },
      children: [para(rich(handout?.title || 'Study handout', { size: 36, bold: true, color: NAVY }), { align: AlignmentType.CENTER })],
    });
  }
  const doc = new Document({
    styles: { default: { document: { run: { font: FONT, size: 20 } } } },
    sections,
  });
  return Packer.toBuffer(doc);
}
