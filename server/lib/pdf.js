// PDF versions of the exam, the marking scheme and the study notes (pdfkit, no browser or Word needed).
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import PDFDocument from 'pdfkit';
import { L, totalMarks, answerText, markingNote, QUESTION_TYPES, isSectionsExam, numberedItems, sectionMarks, marksLabel, examInstructions, SECTION_KINDS } from '../../shared/format.js';

const FONTS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../assets/fonts');
const PW = 595.28;
const PH = 841.89;

function newDoc(margins) {
  const doc = new PDFDocument({ size: 'A4', margins, bufferPages: true, autoFirstPage: true, info: { Producer: 'Exam Studio' } });
  doc.registerFont('R', path.join(FONTS, 'LiberationSans-Regular.ttf'));
  doc.registerFont('B', path.join(FONTS, 'LiberationSans-Bold.ttf'));
  doc.registerFont('I', path.join(FONTS, 'LiberationSans-Italic.ttf'));
  doc.registerFont('BI', path.join(FONTS, 'LiberationSans-BoldItalic.ttf'));
  return doc;
}

function finish(doc, label) {
  const { count } = doc.bufferedPageRange();
  for (let i = 0; i < count; i++) {
    doc.switchToPage(i);
    const keep = doc.page.margins.bottom;
    doc.page.margins.bottom = 0; // otherwise writing in the bottom margin starts a new page
    doc.font('R').fontSize(8).fillColor('#000').text(`${label}  |  Page ${i + 1} of ${count}`, 0, PH - 30, { width: PW, align: 'center', lineBreak: false });
    doc.page.margins.bottom = keep;
  }
  return new Promise((resolve, reject) => {
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    doc.end();
  });
}

const GREY = '#808080';
function box(doc, x, y, w, h, fill) {
  if (fill) doc.save().rect(x, y, w, h).fill(fill).restore();
  doc.save().lineWidth(0.5).strokeColor(GREY).rect(x, y, w, h).stroke().restore();
}

// ---------------------------------------------------------------- exam (two columns)
export async function examPdf(exam, meta = {}) {
  if (isSectionsExam(exam)) return sectionsExamPdf(exam, meta);
  const ML = 42.5;
  const MT = 36;
  const MB = 50;
  const CW = PW - 2 * ML;
  const GAP = 22.7;
  const COL = (CW - GAP) / 2;
  const LIMIT = PH - MB - 2;
  const qs = exam.questions || [];
  const total = totalMarks(exam);
  const hasEssay = qs.some((q) => q.type === 'essay');
  const essayNums = qs.map((q, i) => (q.type === 'essay' ? i + 1 : null)).filter(Boolean);
  const doc = newDoc({ top: MT, bottom: MB, left: ML, right: ML });
  const SZ = 10;
  doc.lineGap(1.5);

  // ---- header across the full width
  let y = MT;
  const centre = (text, font, size, after) => {
    doc.font(font).fontSize(size).text(text, ML, y, { width: CW, align: 'center' });
    y = doc.y + after;
  };
  centre('MOCK EXAMINATION – QUESTION PAPER', 'B', 15, 2);
  if (meta.trade) centre(`TRADE: ${meta.trade.toUpperCase()}`, 'B', 11, 1);
  centre(`MODULE: ${(meta.module || exam.title || '').toUpperCase()}${meta.level ? `   |   LEVEL: ${meta.level}` : ''}`, 'B', SZ, 8);

  const half = CW / 2;
  const rows = [
    [['CANDIDATE NAMES:', ''], ['INDEX NUMBER:', '']],
    [['SCHOOL:', meta.school || ''], ['DATE:', '']],
    [[`DURATION: ${meta.duration || '3 HOURS'}`, ''], [`TOTAL MARKS: ${total}`, '']],
  ];
  for (const [a, b] of rows) {
    const h = a[0].startsWith('CANDIDATE') || a[0].startsWith('SCHOOL') ? 30 : 22;
    [a, b].forEach(([label, value], i) => {
      box(doc, ML + i * half, y, half, h);
      doc.font('B').fontSize(SZ).fillColor('#000').text(label, ML + i * half + 7, y + 7, { width: half - 14, continued: Boolean(value), lineBreak: false });
      if (value) doc.font('R').text(` ${value}`, { lineBreak: false });
    });
    y += h;
  }
  y += 8;

  const instructions = [
    'Read and understand all instructions before answering.',
    `This paper has ${qs.length} questions. Attempt ALL questions. The total is ${total} marks.`,
    'For multiple-choice questions, choose only one correct answer and clearly circle its letter.',
    ...(hasEssay ? [`Write your answers to Question${essayNums.length > 1 ? 's' : ''} ${essayNums.join(' and ')} in the answer booklet provided.`] : []),
    'Erasing or altering answers is strictly prohibited and will lead to zero marks for the affected question.',
    'Use only blue or black ink pens (no pencils or coloured pens).',
  ];
  doc.font('R').fontSize(SZ);
  const innerW = CW - 20;
  const listH = instructions.reduce((s, t, i) => s + doc.heightOfString(`${i + 1}. ${t}`, { width: innerW - 18 }) + 2, 0);
  const boxH = 12 + 14 + listH + 6;
  box(doc, ML, y, CW, boxH, '#F2F2F2');
  doc.font('B').fillColor('#000').text('INSTRUCTIONS TO CANDIDATES', ML + 10, y + 8, { width: innerW });
  let iy = y + 8 + 14;
  doc.font('R');
  instructions.forEach((t, i) => {
    doc.text(`${i + 1}.`, ML + 10, iy, { width: 18, lineBreak: false });
    doc.text(t, ML + 28, iy, { width: innerW - 18 });
    iy = doc.y + 2;
  });
  y += boxH + 14;
  centre('ATTEMPT ALL QUESTIONS', 'B', 11, 3);
  doc.save().lineWidth(1).moveTo(ML, y - 1).lineTo(ML + CW, y - 1).stroke().restore();
  y += 6;

  // ---- questions in two columns
  let col = 0;
  let colTop = y;
  const segments = [{ page: 0, top: y }];
  const colX = () => ML + col * (COL + GAP);
  const nextColumn = () => {
    if (col === 0) { col = 1; y = colTop; return; }
    doc.addPage();
    col = 0;
    colTop = MT;
    y = MT;
    segments.push({ page: doc.bufferedPageRange().count - 1, top: MT });
  };
  const ensure = (h) => { if (y + h > LIMIT && y > colTop) nextColumn(); };

  const TEXT = 34;
  const LABEL = 17;
  const h = (text, font, width) => doc.font(font).fontSize(SZ).heightOfString(text, { width });
  const blocks = [];
  const stem = (n, text, marks) => {
    const t1 = `${n}. `;
    const t2 = `${text} `;
    const t3 = `(${marks} marks)`;
    blocks.push({
      before: 7.5, keep: true, h: h(t1 + t2 + t3, 'R', COL - 3),
      draw(x, yy) {
        doc.font('B').fontSize(SZ).text(t1, x, yy, { width: COL, continued: true });
        doc.font('R').text(t2, { continued: true });
        doc.font('B').text(t3);
      },
    });
  };
  const para = (text, { font = 'R', before = 0, keep = false } = {}) => {
    blocks.push({ before, keep, h: h(text, font, COL), draw(x, yy) { doc.font(font).fontSize(SZ).text(text, x, yy, { width: COL }); } });
  };
  const line = (label, text, keep, extra = '', indent = LABEL) => {
    const full = `${text}${extra}`;
    blocks.push({
      before: 1, keep, h: Math.max(h(full, 'R', COL - TEXT), h('A', 'R', 50)),
      draw(x, yy) {
        doc.font('R').fontSize(SZ).text(label, x + indent, yy, { width: TEXT - indent, lineBreak: false });
        doc.text(full, x + TEXT, yy, { width: COL - TEXT });
      },
    });
  };

  qs.forEach((q, qi) => {
    stem(qi + 1, q.prompt, q.marks);
    switch (q.type) {
      case 'mcq':
        (q.items || []).forEach((it, i, arr) => {
          para(`(${i + 1}) ${it.text}`, { before: 2.5, keep: true });
          (it.options || []).forEach((o, j, os) => line(`${L[j]}.`, o, !(i === arr.length - 1 && j === os.length - 1)));
        });
        break;
      case 'true_false':
        (q.items || []).forEach((it, i, arr) => line(`${L[i]}.`, it.text, i < arr.length - 1, '   ____'));
        break;
      case 'short_answer':
        (q.items || []).forEach((it, i, arr) => line(`${i + 1}.`, it.text, i < arr.length - 1, '   ____________'));
        break;
      case 'select_all':
        (q.options || []).forEach((o, j, arr) => line(`${L[j]}.`, o, j < arr.length - 1));
        break;
      case 'matching':
        para('Column A', { font: 'B', before: 2, keep: true });
        (q.columnA || []).forEach((a, i) => line(`${i + 1}.`, a, true, '   ______'));
        para('Column B', { font: 'B', before: 3, keep: true });
        (q.columnB || []).forEach((b, j, arr) => line(`${L[j]}.`, b, j < arr.length - 1));
        break;
      case 'sequencing':
        (q.steps || []).forEach((s, i) => line(`${i + 1}.`, s, true));
        para(`Sequence: ${(q.steps || []).map(() => '__').join(', ')}`, { font: 'B', before: 3 });
        break;
      case 'essay':
        (q.parts || []).forEach((p) => line(p.label, `${p.text} (${p.marks} marks)`, false, '', 0));
        break;
      default:
    }
  });
  blocks.push({ before: 10, keep: false, h: h('END OF PAPER', 'B', COL), draw(x, yy) { doc.font('B').fontSize(SZ).text('END OF PAPER', x, yy, { width: COL, align: 'center' }); } });

  blocks.forEach((b, i) => {
    let need = b.before + b.h;
    for (let j = i; blocks[j].keep && blocks[j + 1] && j < i + 4; j++) need += blocks[j + 1].before + blocks[j + 1].h;
    ensure(need);
    if (y > colTop) y += b.before;
    b.draw(colX(), y);
    y += b.h;
  });

  // thin line between the columns, like the Word version
  const { count } = doc.bufferedPageRange();
  for (const s of segments) {
    if (s.page >= count) continue;
    doc.switchToPage(s.page);
    doc.save().lineWidth(0.5).strokeColor(GREY).moveTo(ML + COL + GAP / 2, s.top).lineTo(ML + COL + GAP / 2, LIMIT).stroke().restore();
  }
  return finish(doc, `${meta.module || exam.title || 'Exam'}${meta.level ? ` ${meta.level}` : ''} – Mock Exam`);
}

// ---------------------------------------------------------------- marking scheme
function drawTable(doc, y, widths, rows, { x0, top, limit, repeat }) {
  const PAD = 5;
  const draw = (row, yy, height) => {
    let x = x0;
    row.forEach((c, i) => {
      box(doc, x, yy, widths[i], height, c.fill);
      doc.font(c.bold ? 'B' : 'R').fontSize(9.5).fillColor(c.color || '#000')
        .text(String(c.text ?? ''), x + PAD, yy + PAD, { width: widths[i] - 2 * PAD, align: c.align || 'left' });
      x += widths[i];
    });
  };
  const height = (row) => Math.max(...row.map((c, i) => doc.font(c.bold ? 'B' : 'R').fontSize(9.5).heightOfString(String(c.text ?? ''), { width: widths[i] - 2 * PAD }))) + 2 * PAD;
  rows.forEach((row, idx) => {
    const rh = height(row);
    if (y + rh > limit && y > top) {
      doc.addPage();
      y = top;
      if (repeat && idx > 0) { const hh = height(rows[0]); draw(rows[0], y, hh); y += hh; }
    }
    draw(row, y, rh);
    y += rh;
  });
  return y;
}

export async function keyPdf(exam, meta = {}) {
  if (isSectionsExam(exam)) return sectionsKeyPdf(exam, meta);
  const M = 56.7;
  const MT = 50;
  const MB = 50;
  const CW = PW - 2 * M;
  const LIMIT = PH - MB - 2;
  const qs = exam.questions || [];
  const total = totalMarks(exam);
  const objective = qs.map((q, i) => ({ q, n: i + 1 })).filter((x) => x.q.type !== 'essay');
  const essays = qs.map((q, i) => ({ q, n: i + 1 })).filter((x) => x.q.type === 'essay');
  const objMarks = objective.reduce((s, x) => s + Number(x.q.marks), 0);
  const essayMarks = essays.reduce((s, x) => s + Number(x.q.marks), 0);
  const doc = newDoc({ top: MT, bottom: MB, left: M, right: M });
  doc.lineGap(1);
  let y = MT;
  const centre = (text, font, size, after) => { doc.font(font).fontSize(size).fillColor('#000').text(text, M, y, { width: CW, align: 'center' }); y = doc.y + after; };
  const need = (hh) => { if (y + hh > LIMIT) { doc.addPage(); y = MT; } };
  const HEAD = '#D9E2F3';

  centre('MARKING SCHEME', 'B', 15, 3);
  centre(`${meta.module || exam.title || ''}${meta.level ? ` (${meta.level})` : ''} – Mock Examination`, 'B', 11, 3);
  centre(`Total: ${total} marks   |   For teacher use only`, 'I', 10, 12);

  if (objective.length) {
    need(60);
    doc.font('B').fontSize(11).text(`Section A – ${objective.length} objective and short-answer questions (${objMarks} marks)`, M, y, { width: CW });
    y = doc.y + 6;
    const widths = [CW * 0.075, CW * 0.155, CW * 0.67, CW * 0.1];
    const rows = [[{ text: 'Q', bold: true, fill: HEAD }, { text: 'Type', bold: true, fill: HEAD }, { text: 'Answer and marking notes', bold: true, fill: HEAD }, { text: 'Marks', bold: true, fill: HEAD, align: 'center' }]];
    for (const { q, n } of objective) {
      const note = markingNote(q);
      rows.push([{ text: n, bold: true }, { text: QUESTION_TYPES[q.type] || q.type }, { text: `${answerText(q)}${note ? `\n${note}` : ''}` }, { text: q.marks, align: 'center' }]);
    }
    y = drawTable(doc, y, widths, rows, { x0: M, top: MT, limit: LIMIT, repeat: true });
  }

  if (essays.length) {
    y += 16;
    need(80);
    doc.font('B').fontSize(11).fillColor('#000').text(`Section B – ${essays.length} long-answer question${essays.length > 1 ? 's' : ''} (${essayMarks} marks)`, M, y, { width: CW });
    y = doc.y + 4;
    doc.font('I').fontSize(10).text('Accept any correct, relevant answer that is clearly explained. Award marks for both the action and the reason where the scheme asks for it.', M, y, { width: CW });
    y = doc.y + 8;
    for (const { q, n } of essays) {
      need(70);
      doc.font('B').fontSize(10.5).text(`Question ${n} (${q.marks} marks)`, M, y, { width: CW });
      y = doc.y + 4;
      const widths = [CW * 0.855, CW * 0.145];
      const rows = [[{ text: 'Expected points', bold: true, fill: HEAD }, { text: 'Marks', bold: true, fill: HEAD, align: 'center' }]];
      for (const m of q.markingPoints || []) rows.push([{ text: m.text }, { text: m.marks, align: 'center' }]);
      rows.push([{ text: 'Total', bold: true, align: 'right' }, { text: q.marks, bold: true, align: 'center' }]);
      y = drawTable(doc, y, widths, rows, { x0: M, top: MT, limit: LIMIT, repeat: true }) + 12;
    }
  }
  return finish(doc, 'Marking Scheme');
}

// ---------------------------------------------------------------- study notes
export async function notesPdf(notes) {
  const M = 56.7;
  const doc = newDoc({ top: 56.7, bottom: 56.7, left: M, right: M });
  const CW = PW - 2 * M;
  doc.lineGap(2);
  doc.font('B').fontSize(17).text(notes.title || 'Study notes', M, 56.7, { width: CW });
  doc.moveDown(0.8);
  for (const s of notes.sections || []) {
    if (doc.y > PH - 56.7 - 90) doc.addPage();
    doc.moveDown(0.6);
    doc.font('B').fontSize(12.5).text(s.topic, { width: CW });
    doc.moveDown(0.3);
    doc.font('R').fontSize(11);
    for (const k of s.keyPoints || []) {
      const hh = doc.heightOfString(k, { width: CW - 18 });
      if (doc.y + hh > PH - 56.7 - 2) doc.addPage();
      const yy = doc.y;
      doc.text('•', M + 4, yy, { width: 10, lineBreak: false });
      doc.text(k, M + 18, yy, { width: CW - 18 });
      doc.moveDown(0.15);
    }
    if (s.example) {
      doc.moveDown(0.2);
      doc.font('BI').text('Remember: ', M, doc.y, { width: CW, continued: true });
      doc.font('I').text(s.example);
    }
  }
  return finish(doc, notes.title || 'Study notes');
}

// ---------------------------------------------------------------- sectioned exam (sections A-E)
// A real two-column flow: page 1 carries a single-column header, then the paper runs down column 1,
// across to column 2, and on to the next page. Every page gets the separator line and the footer.
// This mirrors the Word renderer in docx.js so the two versions of a paper look the same.

const S = {
  navy: '#1F3864', banner: '#D9E2F3', label: '#D9D9D9', grey: '#595959', rule: '#7F7F7F', ink: '#000000',
  margin: 43.2, gap: 22.7, body: 10.5, small: 8, bannerSize: 11.5,
};
const S_CONTENT = PW - 2 * S.margin;
const S_COLUMN = (S_CONTENT - S.gap) / 2;

const levelNumber = (exam) => (/(\d)/.exec(String(exam?.level || '')) || /(\d)/.exec(String(exam?.title || '')) || [null, '4'])[1];

const sectionAction = (section) => ({
  mcq: 'Circle the letter of the correct answer.',
  true_false: 'Write TRUE or FALSE after each statement.',
  fill_blank: 'Write the missing word or words on the line.',
  short_answer: 'Answer in the space provided.',
  structured: 'Answer ALL parts in the space provided.',
}[section.kind] || '');

const sectionInstructionLine = (section) => {
  const per = Number(section.marksPerItem) || 0;
  const total = sectionMarks(section);
  return `${total} mark${total === 1 ? '' : 's'}${per ? ` \u2013 ${per} mark${per === 1 ? '' : 's'} each` : ''}. ${sectionAction(section)}`;
};

const wantsCode = (text) => /write .*code|code for|function|method|template|script|program|query|syntax/i.test(String(text || ''));

/** A cursor that flows down one column and then the next. */
class ColumnFlow {
  constructor(doc, top, bottom) {
    this.doc = doc;
    this.bottom = bottom;
    this.pageTop = top;
    this.column = 0;
    this.y = top;
  }

  get x() { return S.margin + this.column * (S_COLUMN + S.gap); }
  get width() { return S_COLUMN; }

  nextColumn() {
    if (this.column === 0) {
      this.column = 1;
      this.y = this.pageTop;
    } else {
      this.doc.addPage();
      this.column = 0;
      this.pageTop = S.margin;
      this.y = S.margin;
    }
  }

  ensure(height) {
    if (this.y + height > this.bottom) this.nextColumn();
  }

  advance(dy) { this.y += dy; }

  /** One line of styled text. */
  line(text, { font = 'R', size = S.body, color = S.ink, indent = 0, gap = 3 } = {}) {
    const width = this.width - indent;
    const height = this.doc.font(font).fontSize(size).heightOfString(String(text ?? ''), { width });
    this.ensure(height + gap);
    this.doc.font(font).fontSize(size).fillColor(color).text(String(text ?? ''), this.x + indent, this.y, { width });
    // Trust whichever is lower: the estimate or where the cursor really ended.
    this.y = Math.max(this.y + height, this.doc.y - gap) + gap;
  }

  /**
   * Inline runs on one paragraph: a bold number, the question text, the bold marks.
   * The cursor is taken from pdfkit after the chain, because a run whose font or marks wrap adds
   * a line that heightOfString on the joined text does not always predict.
   */
  runs(parts, { size = S.body, indent = 0, gap = 3 } = {}) {
    const width = this.width - indent;
    const asText = parts.map((part) => part.text).join('');
    const height = this.doc.font('R').fontSize(size).heightOfString(asText, { width });
    this.ensure(height + gap);
    parts.forEach((part, i) => {
      this.doc.font(part.font || 'R').fontSize(part.size || size).fillColor(part.color || S.ink);
      const options = { width, continued: i < parts.length - 1 };
      if (i === 0) this.doc.text(part.text, this.x + indent, this.y, options);
      else this.doc.text(part.text, options);
    });
    this.y = Math.max(this.y + height, this.doc.y - gap) + gap;
  }

  /** Ruled lines for handwriting. */
  dotted(count = 1, { gap = 2 } = {}) {
    for (let i = 0; i < Math.max(1, count); i++) {
      this.ensure(14);
      this.doc.save()
        .moveTo(this.x, this.y + 8).lineTo(this.x + this.width, this.y + 8)
        .dash(2, { space: 2 }).lineWidth(0.6).strokeColor(S.rule).stroke().undash().restore();
      this.y += 13;
    }
    this.y += gap;
  }

  /** Measure one styled line without drawing it. */
  measureLine(text, { font = 'R', size = S.body, indent = 0, gap = 3 } = {}) {
    return this.doc.font(font).fontSize(size).heightOfString(String(text ?? ''), { width: this.width - indent }) + gap;
  }

  measureRuns(parts, { size = S.body, indent = 0, gap = 3 } = {}) {
    const asText = parts.map((part) => part.text).join('');
    return this.doc.font('R').fontSize(size).heightOfString(asText, { width: this.width - indent }) + gap;
  }

  /** Draw a block whole: move to the next column first if it would otherwise be split. */
  keep(height, draw) {
    if (height <= this.bottom - this.pageTop) this.ensure(height);
    draw();
  }

  /** The shaded section banner with its thick navy rule. Never left stranded at a column foot. */
  banner(section) {
    const label = `SECTION ${section.id}: ${section.title || String(SECTION_KINDS[section.kind] || '').toUpperCase()}`;
    const height = this.doc.font('B').fontSize(S.bannerSize).heightOfString(label, { width: this.width - 12 }) + 10;
    this.ensure(height + 34);
    this.doc.save().rect(this.x, this.y, this.width, height).fill(S.banner).restore();
    this.doc.font('B').fontSize(S.bannerSize).fillColor(S.navy).text(label, this.x + 6, this.y + 4, { width: this.width - 12 });
    this.doc.save().lineWidth(1.6).strokeColor(S.navy).moveTo(this.x, this.y + height).lineTo(this.x + this.width, this.y + height).stroke().restore();
    this.y += height + 4;
  }
}

/** The centred header block and the candidate-details table, in one column. */
function sectionsHeaderPdf(doc, exam, heading) {
  let y = S.margin;
  // Every position is computed from a measured height, never read back from the cursor: reading
  // doc.y after a text call is one line short when that text wraps, which used to make the paper
  // start on top of the instructions.
  const write = (text, { font = 'R', size = 9.5, color = S.ink, align = 'left', x = S.margin, width = S_CONTENT, gap = 2, draw = true } = {}) => {
    doc.font(font).fontSize(size);
    const height = doc.heightOfString(String(text ?? ''), { width, align });
    if (draw) {
      doc.fillColor(color);
      doc.text(String(text ?? ''), x, y, { width, align });
    }
    y += height + gap;
    return height;
  };
  const centre = (text, font, size, after, color) => write(text, { font, size, color, align: 'center', gap: after });

  centre(`RWANDA TVET BOARD (RTB) \u2013 RQF LEVEL ${levelNumber(exam)}`, 'R', 10, 2);
  if (exam.trade) centre(exam.trade, 'B', 11, 2);
  if (exam.school) {
    centre(exam.school, 'B', 14, 6);
    const width = doc.widthOfString(exam.school);
    const x = S.margin + (S_CONTENT - width) / 2;
    doc.save().lineWidth(0.8).strokeColor(S.ink).moveTo(x, y - 5).lineTo(x + width, y - 5).stroke().restore();
    y += 2;
  }
  const moduleLine = `${exam.moduleCode ? `${exam.moduleCode}: ` : ''}${exam.moduleName || exam.title || ''} \u2013 ${heading}`;
  centre(moduleLine, 'B', 12.5, 14, S.navy);

  // Candidate details: a four-column bordered table with grey label cells.
  const widths = [S_CONTENT * 0.24, S_CONTENT * 0.26, S_CONTENT * 0.22, S_CONTENT * 0.28];
  const rowHeight = 17;
  const rows = [
    ['Student Name', '', 'Reg. No / Class', ''],
    ['Date', '', 'Duration', exam.duration || '3 hours'],
    ['Trainer', '', 'Total Marks', `______ / ${exam.targetMarks || totalMarks(exam)}`],
  ];
  for (const row of rows) {
    let x = S.margin;
    row.forEach((cellText, i) => {
      const w = widths[i];
      if (i % 2 === 0) doc.save().rect(x, y, w, rowHeight).fill(S.label).restore();
      doc.save().lineWidth(0.7).strokeColor('#404040').rect(x, y, w, rowHeight).stroke().restore();
      doc.font(i % 2 === 0 ? 'B' : 'R').fontSize(9).fillColor(S.ink).text(cellText, x + 5, y + 4.5, { width: w - 10, lineBreak: false });
      x += w;
    });
    y += rowHeight;
  }
  y += 14;

  if (heading === 'END OF MODULE EXAMINATION') {
    write('INSTRUCTIONS TO CANDIDATES', { font: 'B', size: 11.5, color: S.navy, gap: 4 });
    examInstructions(exam).forEach((line, i) => {
      const width = S_CONTENT - 26;
      doc.font('R').fontSize(9.5);
      const height = doc.heightOfString(line, { width });
      doc.font('B').fontSize(9.5).fillColor(S.ink).text(`${i + 1}.`, S.margin + 4, y, { width: 16, lineBreak: false });
      doc.font('R').fontSize(9.5).fillColor(S.ink).text(line, S.margin + 22, y, { width });
      y += height + 2;
    });
    y += 6;
  }
  return y;
}

export async function sectionsExamPdf(exam, meta = {}) {
  const merged = {
    ...exam,
    moduleCode: meta.moduleCode || exam.moduleCode,
    moduleName: meta.moduleName || exam.moduleName || meta.module || exam.title,
    level: meta.level || exam.level,
    trade: meta.trade || exam.trade,
    school: meta.school || exam.school,
    duration: exam.duration || meta.duration,
  };
  const doc = newDoc({ top: S.margin, bottom: S.margin, left: S.margin, right: S.margin });
  doc.lineGap(1);
  const bodyTop = sectionsHeaderPdf(doc, { ...merged, targetMarks: exam.targetMarks || totalMarks(exam) }, 'END OF MODULE EXAMINATION');
  const flow = new ColumnFlow(doc, bodyTop, PH - S.margin - 12);

  for (const section of exam.sections || []) {
    flow.banner(section);
    flow.line(sectionInstructionLine(section), { font: 'I', size: 9, color: S.grey, gap: 6 });

    const entries = numberedItems(exam).filter((entry) => entry.section === section);
    for (const { number, item } of entries) {
      if (section.kind === 'mcq') {
        const stem = [
          { text: `${number}.  `, font: 'B' },
          { text: item.text },
          { text: `  [${marksLabel(section.marksPerItem)}]`, font: 'B' },
        ];
        const options = item.options || [];
        const height = flow.measureRuns(stem, { gap: 2 })
          + options.reduce((sum, option, i) => sum + flow.measureLine(`${L[i]}.  ${option}`, { indent: 14, gap: 1.5 }), 0);
        flow.keep(height + 2, () => {
          flow.runs(stem, { gap: 2 });
          options.forEach((option, i) => flow.line(`${L[i]}.  ${option}`, { indent: 14, gap: 1.5 }));
          flow.advance(2);
        });
      } else if (section.kind === 'true_false') {
        flow.runs([{ text: `${number}.  `, font: 'B' }, { text: `${item.text}   ______` }], { gap: 4 });
      } else if (section.kind === 'fill_blank') {
        flow.runs([{ text: `${number}.  `, font: 'B' }, { text: item.text }, { text: `  [${marksLabel(section.marksPerItem)}]`, font: 'B' }], { gap: 4 });
      } else if (section.kind === 'short_answer') {
        const stem = [
          { text: `${number}.  `, font: 'B' },
          { text: item.text },
          { text: `  [${marksLabel(item.marks ?? section.marksPerItem)}]`, font: 'B' },
        ];
        const lines = item.answerLines || 3;
        flow.keep(flow.measureRuns(stem, { gap: 2 }) + lines * 13, () => {
          flow.runs(stem, { gap: 2 });
          flow.dotted(lines);
        });
      } else if (section.kind === 'structured') {
        const title = [
          { text: `${number}.  `, font: 'B' },
          { text: `${item.title || 'Structured question'}`, font: 'B' },
          { text: `  [${marksLabel(item.totalMarks)}]`, font: 'B' },
        ];
        const parts = (item.parts || []).map((part) => ({
          part,
          runs: [
            { text: `(${part.letter})  `, font: 'B' },
            { text: part.text },
            { text: `  [${marksLabel(part.marks)}]`, font: 'B' },
          ],
          lines: Number(part.answerLines) || Math.max(1, Number(part.marks) || 1) + (wantsCode(part.text) ? 2 : 0),
        }));
        const height = flow.measureRuns(title, { gap: 3 })
          + parts.reduce((sum, entry) => sum + flow.measureRuns(entry.runs, { indent: 12, gap: 1.5 }) + entry.lines * 13, 0);
        flow.keep(height, () => {
          flow.runs(title, { gap: 3 });
          for (const entry of parts) {
            flow.runs(entry.runs, { indent: 12, gap: 1.5 });
            flow.dotted(entry.lines);
          }
        });
      }
    }
  }

  return finishSections(doc, `${merged.moduleCode ? `${merged.moduleCode} ` : ''}${merged.moduleName || ''} \u2013 End of Module Exam`);
}

/** Draw the column separator on every page, then the footer, then return the file. */
function finishSections(doc, label) {
  const { count } = doc.bufferedPageRange();
  for (let i = 0; i < count; i++) {
    doc.switchToPage(i);
    const keep = doc.page.margins.bottom;
    doc.page.margins.bottom = 0; // writing in the bottom margin would start a new page
    const bottom = PH - S.margin - 18;
    doc.save()
      .moveTo(S.margin + S_COLUMN + S.gap / 2, S.margin)
      .lineTo(S.margin + S_COLUMN + S.gap / 2, bottom)
      .lineWidth(0.6).strokeColor(S.rule).stroke().restore();
    doc.font('R').fontSize(S.small).fillColor(S.grey)
      .text(`${label}  |  Page ${i + 1} of ${count}`, 0, PH - S.margin + 4, { width: PW, align: 'center', lineBreak: false });
    doc.page.margins.bottom = keep;
  }
  return new Promise((resolve, reject) => {
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    doc.end();
  });
}

/** The marking scheme for a sectioned paper: same header, then a key per section and the record. */
export async function sectionsKeyPdf(exam, meta = {}) {
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
  const doc = newDoc({ top: S.margin, bottom: S.margin, left: S.margin, right: S.margin });
  doc.lineGap(1);
  let y = sectionsHeaderPdf(doc, { ...merged, targetMarks: total }, `MARKING SCHEME (Examiners only, ${total} marks)`);
  const limit = PH - S.margin - 16;
  const heading = (text, after = 6) => {
    if (y + 26 > limit) { doc.addPage(); y = S.margin; }
    doc.font('B').fontSize(11.5).fillColor(S.navy).text(text, S.margin, y, { width: S_CONTENT });
    y = doc.y + after;
  };
  const table = (headers, rows) => {
    const widths = headers.length === 2 ? [S_CONTENT * 0.18, S_CONTENT * 0.82] : headers.map(() => S_CONTENT / headers.length);
    const head = headers.map((text) => ({ text, bold: true, fill: S.navy, color: '#FFFFFF' }));
    const body = rows.map((row) => row.map((text) => ({ text: String(text ?? '') })));
    y = drawTable(doc, y, widths, [head, ...body], { x0: S.margin, top: S.margin, limit, repeat: true });
    y += 8;
  };

  heading('MARK SUMMARY');
  table(['Section', 'Questions and marks'], (exam.sections || []).map((section) => {
    const entries = flat.filter((entry) => entry.section === section);
    const first = entries[0]?.number;
    const last = entries[entries.length - 1]?.number;
    return [`${section.id}  ${section.title || ''}`, `${first === last ? first : `${first} \u2013 ${last}`}: ${sectionMarks(section)} marks`];
  }).concat([['TOTAL', `${flat.length} questions, ${total} marks`]]));

  heading('GENERAL MARKING RULES');
  examRules().forEach((line, i) => {
    doc.font('B').fontSize(9.5).fillColor(S.ink).text(`${i + 1}.`, S.margin + 4, y, { width: 16, lineBreak: false });
    doc.font('R').fontSize(9.5).text(line, S.margin + 22, y, { width: S_CONTENT - 26 });
    y = doc.y + 3;
  });
  y += 8;

  for (const section of exam.sections || []) {
    const entries = flat.filter((entry) => entry.section === section);
    if (!entries.length) continue;
    heading(`SECTION ${section.id}: ${section.title || ''} \u2013 ${sectionMarks(section)} marks`);
    if (section.kind === 'mcq') {
      const pairs = entries.map(({ number, item }) => [number, item.answer]);
      for (let i = 0; i < pairs.length; i += 6) {
        const row = [];
        for (let j = 0; j < 6; j += 2) row.push(pairs[i + j]?.[0] ?? '', pairs[i + j]?.[1] ?? '');
        table(['Q', 'Ans', 'Q', 'Ans', 'Q', 'Ans'], [row]);
      }
    } else if (section.kind === 'true_false') {
      table(['Q', 'Answer', 'Why'], entries.map(({ number, item }) => [number, item.answer, item.notes || '']));
    } else if (section.kind === 'fill_blank') {
      table(['Q', 'Answer'], entries.map(({ number, item }) => [number, item.answer]));
    } else if (section.kind === 'short_answer') {
      table(['Q', 'Expected answer', 'Marks'], entries.map(({ number, item }) => [number, item.answer || item.modelAnswer || '', item.marks ?? section.marksPerItem]));
    } else {
      for (const { number, item } of entries) {
        if (y + 40 > limit) { doc.addPage(); y = S.margin; }
        doc.font('B').fontSize(10).fillColor(S.navy).text(`${number}.  ${item.title || ''}  (${item.totalMarks || 0} marks)`, S.margin, y, { width: S_CONTENT });
        y = doc.y + 4;
        if ((item.markingPoints || []).length) table(['Marking point', 'Marks'], item.markingPoints.map((point) => [point.point, point.marks]));
        if (item.modelAnswer) {
          doc.font('R').fontSize(9.5).fillColor(S.ink).text(`Model answer: ${item.modelAnswer}`, S.margin, y, { width: S_CONTENT });
          y = doc.y + 6;
        }
        if (item.code) {
          const lines = String(item.code).split('\n');
          const height = lines.length * 11 + 10;
          if (y + height > limit) { doc.addPage(); y = S.margin; }
          doc.save().rect(S.margin, y, S_CONTENT, height).fill('#F2F2F2').restore();
          doc.font('Courier').fontSize(8).fillColor(S.ink);
          lines.forEach((line, i) => doc.text(line || ' ', S.margin + 6, y + 5 + i * 11, { width: S_CONTENT - 12, lineBreak: false }));
          y += height + 8;
        }
      }
    }
  }

  doc.addPage();
  y = S.margin;
  heading('CANDIDATE MARK RECORD');
  table(['Section', 'Title', 'Maximum', 'Score'], (exam.sections || []).map((section) => [section.id, section.title || '', sectionMarks(section), '']).concat([['', 'TOTAL', total, '']]));
  doc.font('R').fontSize(9.5).fillColor(S.ink).text('Examiner: ____________________    Signature: ____________________    Date: ______________', S.margin, y + 20, { width: S_CONTENT });

  return finishSections(doc, `${merged.moduleCode ? `${merged.moduleCode} ` : ''}${merged.moduleName || ''} \u2013 Marking Scheme`);
}

const examRules = () => [
  'Mark positively: award marks for what the candidate knows, and do not deduct for what is missing unless the question says so.',
  'Accept any answer that is correct in substance, even if it is worded differently from this scheme.',
  'A candidate may use a different but valid method; award the marks for a correct approach even if the final answer has a small slip.',
  'Half marks are not awarded. Do not round a total up.',
  'Where a question asks for a reason as well as an action, award the reason mark only when the reason is correct.',
  'Record every mark in the candidate mark record at the end and add the sections up carefully.',
];

// ---------------------------------------------------------------- study handout
// The same eight sections as handoutDocx, laid out with a cursor. PDF has no table object, so
// tables are drawn with the existing drawTable() and everything else is boxes and text. Kept in
// step with docx.js by using the same palette and the same section order.

const H_NAVY = '#1F4E79';
const H_FILL = { tip: '#FFF2CC', remember: '#DEEAF6', trap: '#FCE4D6', example: '#EDEDED', code: '#F5F5F5' };

/** Write text that may contain **bold** markers, continuing on the same line. Returns the new y. */
function richAt(doc, x, y, text, { size = 10, width = 400, color = '#000', font = 'R', align } = {}) {
  const parts = String(text ?? '').split('**');
  let first = true;
  for (let i = 0; i < parts.length; i++) {
    const chunk = parts[i];
    if (chunk === '') continue;
    const last = i === parts.length - 1;
    const useFont = font === 'R' && i % 2 === 1 ? 'B' : font;
    doc.font(useFont).fontSize(size).fillColor(color);
    if (first) {
      doc.text(chunk, x, y, { width, continued: !last, align });
      first = false;
    } else {
      doc.text(chunk, { width, continued: !last, align });
    }
  }
  return doc.y;
}

export async function handoutPdf(handout) {
  const M = 56.7;
  const MT = 48;
  const MB = 52;
  const CW = PW - 2 * M;
  const LIMIT = PH - MB - 2;
  const doc = newDoc({ top: MT, bottom: MB, left: M, right: M });
  doc.lineGap(1.4);
  let y = MT;

  const ensure = (needed) => { if (y + needed > LIMIT) { doc.addPage(); y = MT; } };
  const space = (n) => { y += n; };

  const heading = (text, level) => {
    const size = level === 1 ? 15 : level === 2 ? 12 : 10.5;
    ensure(size * 3);
    y += level === 1 ? 12 : 8;
    y = richAt(doc, M, y, text, { size, font: 'B', color: H_NAVY, width: CW });
    space(4);
  };

  const paragraph = (text, opts = {}) => {
    const size = opts.size || 10;
    const height = doc.font(opts.italic ? 'I' : 'R').fontSize(size).heightOfString(String(text ?? ''), { width: CW });
    ensure(height + 4);
    y = richAt(doc, M, y, text, { size, font: opts.italic ? 'I' : 'R', width: CW });
    space(opts.after === undefined ? 5 : opts.after);
  };

  const list = (items, numbered) => {
    (items || []).forEach((item, i) => {
      const label = numbered ? `${i + 1}. ` : '•  ';
      const indent = 16;
      const height = doc.font('R').fontSize(10).heightOfString(`${label}${String(item)}`, { width: CW - indent });
      ensure(height + 3);
      doc.font('R').fontSize(10).fillColor('#000').text(label, M, y, { width: indent, lineBreak: false });
      // Advance by the item's real height: writing at the same cursor position is what makes
      // list items print on top of each other.
      y = richAt(doc, M + indent, y, item, { size: 10, width: CW - indent });
      y += 3;
    });
    space(3);
  };

  const mono = (text, { center = false } = {}) => {
    const lines = String(text ?? '').replace(/\r\n?/g, '\n').replace(/\n+$/, '').split('\n');
    const size = 7.5;
    const lh = size + 2.4;
    const height = lines.length * lh + 14;
    ensure(height + 6);
    const top = y;
    box(doc, M, top, CW, height, H_FILL.code);
    doc.font('Courier').fontSize(size).fillColor('#000');
    // Each line is written on its own so the diagram can never reflow and lose its alignment.
    lines.forEach((line, i) => {
      doc.text(line === '' ? ' ' : line, M + 6, top + 7 + i * lh, { width: CW - 12, lineBreak: false, align: center ? 'center' : 'left' });
    });
    y = top + height;
    space(6);
  };

  const table = (headers, rows, weights) => {
    const total = weights.reduce((a, b) => a + b, 0);
    const widths = weights.map((w) => (CW * w) / total);
    const head = headers.map((h) => ({ text: h, bold: true, fill: H_NAVY, color: '#FFFFFF' }));
    const body = (rows || []).map((row) => headers.map((_, i) => ({ text: row[i] ?? '' })));
    // A table that will not fit on the rest of the page starts a new one.
    const estimated = (body.length + 1) * 16 + 8;
    ensure(Math.min(estimated, LIMIT - MT));
    y = drawTable(doc, y, widths, [head, ...body], { x0: M, top: MT, limit: LIMIT, repeat: true });
    space(6);
  };

  const callout = (kind, label, text) => {
    const size = 10;
    const inner = CW - 20;
    const height = doc.font('R').fontSize(size).heightOfString(`${label}  ${String(text ?? '')}`, { width: inner }) + 18;
    ensure(height + 6);
    box(doc, M, y, CW, height, H_FILL[kind] || H_FILL.remember);
    richAt(doc, M + 10, y + 9, `**${label}**  ${String(text ?? '')}`, { size, width: inner });
    y += height;
    space(6);
  };

  const workedExample = (we) => {
    const inner = CW - 24;
    const size = 10;
    const blocks = [];
    if (we.task) blocks.push(`**The task:** ${we.task}`);
    if (we.thinking) blocks.push(`**Thinking it through:** ${we.thinking}`);
    if (we.expected) blocks.push(`**What the expected result looks like:** ${we.expected}`);
    if (we.why) blocks.push(`**Why each decision is correct:** ${we.why}`);
    const steps = (we.steps || []).map((s, i) => `${i + 1}. ${s}`);
    const mistakes = (we.mistakes || []).map((m) => `•  ${m}`);
    const codeLines = we.code ? String(we.code).split('\n').length : 0;
    const textBits = [...blocks, ...steps, ...mistakes];
    const height = 30 + textBits.reduce((sum, t) => sum + doc.font('R').fontSize(size).heightOfString(t, { width: inner }) + 4, 0)
      + (codeLines ? codeLines * 10 + 10 : 0) + 12;
    ensure(Math.min(height, LIMIT - MT));
    const top = y;
    box(doc, M, top, CW, height, H_FILL.example);
    doc.save().lineWidth(1.4).strokeColor(H_NAVY).rect(M, top, CW, height).stroke().restore();
    let cy = top + 10;
    cy = richAt(doc, M + 12, cy, `**WORKED EXAMPLE: ${we.title || ''}**`, { size: size + 1, color: H_NAVY, width: inner });
    cy += 4;
    for (const bit of blocks) { cy = richAt(doc, M + 12, cy, bit, { size, width: inner }); cy += 4; }
    if (steps.length) {
      cy = richAt(doc, M + 12, cy, '**The solution, step by step:**', { size, width: inner }); cy += 3;
      for (const step of steps) { cy = richAt(doc, M + 12, cy, step, { size, width: inner }); cy += 3; }
    }
    if (we.code) {
      doc.font('Courier').fontSize(7.5).fillColor('#000');
      for (const line of String(we.code).split('\n')) { doc.text(line, M + 12, cy, { width: inner, lineBreak: false }); cy += 10; }
      cy += 4;
    }
    if (mistakes.length) {
      cy = richAt(doc, M + 12, cy, '**Common mistakes to avoid:**', { size, width: inner }); cy += 3;
      for (const mistake of mistakes) { cy = richAt(doc, M + 12, cy, mistake, { size, width: inner }); cy += 3; }
    }
    y = top + Math.max(height, cy - top + 8);
    space(8);
  };

  for (const unit of handout.units || []) {
    if (y > MT) { doc.addPage(); y = MT; }

    // 1. Title block
    const who = [handout.level, handout.trade].filter(Boolean).join('   |   ');
    if (who) { y = richAt(doc, M, y, who, { size: 10, font: 'B', color: '#7F7F7F', width: CW, align: 'center' }); space(2); }
    y = richAt(doc, M, y, handout.moduleName || handout.title || 'Study handout', { size: 18, font: 'B', color: H_NAVY, width: CW, align: 'center' });
    if (handout.moduleCode) { y = richAt(doc, M, y, `MODULE CODE: ${handout.moduleCode}`, { size: 11, font: 'B', width: CW, align: 'center' }); }
    y = richAt(doc, M, y, `UNIT ${unit.number} STUDY HANDOUT`, { size: 12, font: 'B', color: H_NAVY, width: CW, align: 'center' });
    space(8);
    heading(`UNIT ${unit.number}: ${unit.title}`, 1);
    if (unit.learningOutcome) callout('remember', 'Learning outcome', unit.learningOutcome);
    if (unit.duration) paragraph(`**Duration:** ${unit.duration}`, { after: 4 });
    if (unit.indicativeContents?.length) { heading('Indicative contents', 3); list(unit.indicativeContents); }
    if (unit.objectives?.length) { heading('By the end of this unit you should be able to', 3); list(unit.objectives); }

    // 2. Lessons
    for (const lesson of unit.lessons || []) {
      heading(`${lesson.number ? `${lesson.number} ` : ''}${lesson.title}`, 1);
      if (lesson.keyTerms?.length) {
        heading('Key terms', 3);
        table(['Key term', 'Clear meaning'], lesson.keyTerms.map((k) => [k.term, k.meaning]), [34, 66]);
      }
      for (const block of lesson.blocks || []) {
        if (block.heading) heading(block.heading, 3);
        if (block.kind === 'prose') paragraph(block.text, { after: 6 });
        else if (block.kind === 'bullets') list(block.items);
        else if (block.kind === 'steps') list(block.items, true);
        else if (block.kind === 'table' || block.kind === 'compare') {
          const weights = block.headers?.length === 2 ? [40, 60] : (block.headers || []).map((_, i) => (i === 0 ? 34 : 66 / Math.max(1, (block.headers.length - 1))));
          table(block.headers || [], block.rows || [], weights);
        }
        if (block.code) mono(block.code);
      }
      for (const c of lesson.callouts || []) callout(c.kind, c.label, c.text);
      if (lesson.workedExample) workedExample(lesson.workedExample);
    }

    // 3. Diagrams
    if (unit.diagrams?.length) {
      heading('Diagrams explained step by step', 1);
      for (const d of unit.diagrams) {
        heading(d.title, 2);
        mono(d.ascii, { center: true });
        list(d.readSteps, true);
        if (d.redraw) paragraph(`**How to redraw it in the exam:** ${d.redraw}`, { after: 6 });
      }
    }

    // 4. Memory sheet
    if (unit.memorySheet?.length) {
      heading('Exam memory sheet', 1);
      paragraph('Cover the right-hand column and test yourself. Say the answer out loud before you look.', { italic: true, after: 6 });
      table(['Remember', 'Quick answer'], unit.memorySheet.map((m) => [m.remember, m.answer]), [45, 55]);
    }

    // 5. Revision questions
    const rev = unit.revision || {};
    const mcq = rev.mcq || [];
    const tf = rev.trueFalse || [];
    const scenario = rev.scenario || [];
    if (mcq.length || tf.length || scenario.length || rev.extraPractice?.length) {
      heading('Revision questions', 1);
      if (mcq.length) {
        heading('Multiple choice questions', 2);
        mcq.forEach((m, i) => {
          paragraph(`${i + 1}. ${m.q}`, { after: 2 });
          (m.choices || []).forEach((c, j) => paragraph(`${L[j] || String.fromCharCode(65 + j)}.  ${c}`, { after: 1 }));
        });
      }
      if (tf.length) {
        heading('True or false', 2);
        tf.forEach((s, i) => paragraph(`${i + 1}. ${s.statement}`, { after: 2 }));
      }
      if (scenario.length) {
        heading('Scenario questions', 2);
        list(scenario.map((s) => s.q), true);
      }
      const keys = [
        ...mcq.map((m, i) => [`MCQ ${i + 1}`, m.answer, m.reason]),
        ...tf.map((s, i) => [`True/False ${i + 1}`, s.answer, s.reason]),
        ...scenario.map((s, i) => [`Scenario ${i + 1}`, s.answer, s.reason]),
      ];
      if (keys.length) { heading('Answer key', 2); table(['Question', 'Answer', 'Reason'], keys, [20, 26, 54]); }
      if (rev.extraPractice?.length) {
        heading('Answers to the extra practice', 2);
        table(['Reference', 'Answer', 'Reason'], rev.extraPractice.map((e) => [e.reference, e.answer, e.reason]), [22, 34, 44]);
      }
    }

    // 6. Practical assessment task
    const practical = unit.practical;
    if (practical && (practical.steps?.length || practical.assessor?.length || practical.scenario)) {
      heading('Practical assessment task', 1);
      if (practical.scenario) callout('remember', 'Scenario', practical.scenario);
      list(practical.steps, true);
      if (practical.assessor?.length) { heading('What the Assessor Looks For', 2); list(practical.assessor.map((a) => `\u25A1  ${a}`)); }
      if (practical.report?.length) { heading('Report Checklist', 2); list(practical.report.map((r) => `\u25A1  ${r}`)); }
    }

    // 7. Study tips
    if (unit.studyTips?.length) { heading('Last-minute study tips', 1); list(unit.studyTips); }

    // 8. End marker
    ensure(24);
    space(8);
    doc.font('B').fontSize(11).fillColor(H_NAVY).text(`END OF UNIT ${unit.number} HANDOUT`, M, y, { width: CW, align: 'center' });
    y = doc.y + 10;
  }

  return finish(doc, 'Student Study Handout');
}
