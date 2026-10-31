// Shared Exam Studio MCP server: registers every tool once so the stdio server
// (mcp.js) and the remote Streamable HTTP server (/mcp) expose identical tools.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const { QUESTION_TYPES, validateExam, totalMarks, validateHandout, examStats, handoutStats, estimateHandoutPages } = await import('../../shared/format.js');
const { examDocx, keyDocx, notesDocx, handoutDocx } = await import('./docx.js');
const { examPdf, keyPdf, notesPdf, handoutPdf } = await import('./pdf.js');
const { examCsv, keyCsv } = await import('./csv.js');
const { extractText, decodeBuffer } = await import('./extract.js');
const { generateExam, generateNotes, generateCards, generateHandout, TYPE_HELP, SECTIONS_HELP, HANDOUT_GUIDE, MAX_NOTES_CHARS } = await import('./ai.js');
const { listItems, getItem, saveItem } = await import('./store.js');
const here = path.dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(fs.readFileSync(path.join(here, '..', 'package.json'), 'utf8'));
const TYPES = Object.keys(QUESTION_TYPES);

const text = (t) => ({ content: [{ type: 'text', text: typeof t === 'string' ? t : JSON.stringify(t, null, 2) }] });
const fail = (e) => ({ isError: true, content: [{ type: 'text', text: String(e?.message || e) }] });
const tool = (fn) => async (args) => { try { return await fn(args || {}); } catch (e) { return fail(e); } };

const expand = (p) => (p.startsWith('~') ? path.join(os.homedir(), p.slice(1)) : p);
const safeName = (v, fallback) => (String(v ?? '').trim().slice(0, 60).replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '_') || fallback);
const outDir = (d) => path.resolve(expand(d || process.env.EXAM_STUDIO_OUTPUT || path.join(os.homedir(), 'Documents', 'Exam Studio')));

async function readSource({ text: t, file_path: fp }) {
  if (t && String(t).trim().length >= 50) return String(t).slice(0, MAX_NOTES_CHARS);
  if (fp) {
    const file = path.resolve(expand(fp));
    if (!fs.existsSync(file)) throw new Error(`File not found: ${file}`);
    const buffer = fs.readFileSync(file);
    const decoded = decodeBuffer(buffer);
    return await extractText({ originalname: path.basename(file), buffer: Buffer.from(decoded, 'utf8') }).then((r) => r.slice(0, MAX_NOTES_CHARS));
  }
  throw new Error('Give either "text" (at least a few sentences of notes) or "file_path" (.pdf, .docx, .txt or .md).');
}

const metaOf = (m = {}) => ({
  module: String(m.module || '').slice(0, 120), level: String(m.level || '').slice(0, 20), trade: String(m.trade || '').slice(0, 120),
  school: String(m.school || '').slice(0, 120), duration: String(m.duration || '').slice(0, 40) || '3 HOURS',
});

async function exportExam(exam, meta, formats, withKey, dir, fileName) {
  const base = safeName(fileName || exam.title, 'Exam');
  const m = metaOf(meta);
  const files = [];
  for (const f of formats) {
    if (f === 'docx') {
      files.push(await writeFileUnique(dir, base, '.docx', await examDocx(exam, m)));
      if (withKey) files.push(await writeFileUnique(dir, `${base}_Marking_Scheme`, '.docx', await keyDocx(exam, m)));
    } else if (f === 'pdf') {
      files.push(await writeFileUnique(dir, base, '.pdf', await examPdf(exam, m)));
      if (withKey) files.push(await writeFileUnique(dir, `${base}_Marking_Scheme`, '.pdf', await keyPdf(exam, m)));
    } else if (f === 'csv') {
      files.push(await writeFileUnique(dir, `${base}_Questions`, '.csv', examCsv(exam)));
      if (withKey) files.push(await writeFileUnique(dir, `${base}_Answer_Key`, '.csv', keyCsv(exam)));
    }
  }
  return files;
}
async function exportNotes(notes, formats, dir, fileName) {
  const base = safeName(fileName || notes.title, 'Study_Notes');
  const files = [];
  for (const f of formats) {
    if (f === 'docx') files.push(await writeFileUnique(dir, base, '.docx', await notesDocx(notes)));
    if (f === 'pdf') files.push(await writeFileUnique(dir, base, '.pdf', await notesPdf(notes)));
  }
  return files;
}
async function exportHandout(handout, formats, dir, fileName) {
  const base = safeName(fileName || handout.title, 'Study_Handout');
  const files = [];
  for (const f of formats) {
    if (f === 'docx') files.push(await writeFileUnique(dir, base, '.docx', await handoutDocx(handout)));
    if (f === 'pdf') files.push(await writeFileUnique(dir, base, '.pdf', await handoutPdf(handout)));
  }
  return files;
}

function writeFileUnique(dir, name, ext, buf) {
  fs.mkdirSync(dir, { recursive: true });
  let file = path.join(dir, `${name}${ext}`);
  for (let i = 2; fs.existsSync(file); i++) file = path.join(dir, `${name}_${i}${ext}`);
  fs.writeFileSync(file, buf);
  return file;
}

const Question = z.object({
  type: z.enum(TYPES).describe('mcq, true_false, select_all, matching, sequencing, short_answer or essay'),
  marks: z.number().int().positive().describe('Total marks for the whole question'),
  prompt: z.string().describe('Instruction or scenario shown above the question'),
}).passthrough();
const SectionItem = z.object({}).passthrough().describe('One question: text/options/answer for mcq, text/answer for true_false and fill_blank, marks/answer for short_answer, title/totalMarks/parts/markingPoints for structured.');
const Section = z.object({
  id: z.string().describe('The section letter, for example A'),
  kind: z.enum(['mcq', 'true_false', 'fill_blank', 'short_answer', 'structured']),
  title: z.string().optional().describe('For example MULTIPLE CHOICE'),
  instruction: z.string().optional(),
  marksPerItem: z.number().int().optional(),
  marks: z.number().int().optional(),
  items: z.array(SectionItem).min(1).max(200),
}).passthrough();
const ExamShape = z.object({
  title: z.string().optional(),
  layout: z.enum(['sections-a-e', 'classic']).optional().describe('Default sections-a-e. Use classic for the older flat paper.'),
  moduleCode: z.string().optional().describe('For example SWDVF301'),
  moduleName: z.string().optional().describe('Module title, shown on the paper'),
  level: z.string().optional().describe('For example "RQF LEVEL 3" or L4'),
  trade: z.string().optional(),
  school: z.string().optional(),
  duration: z.string().optional().describe('For example "3 hours"'),
  totalMarks: z.number().int().optional(),
  sections: z.array(Section).optional().describe('The sectioned paper: A multiple choice, B true/false, C fill in the blanks, D short answer, E structured. Numbering runs continuously across the whole paper.'),
  questions: z.array(Question).optional().describe('The older flat paper, used when there are no sections.'),
}).passthrough().describe('The exam. Call exam_studio_format_guide for the exact shape of a section and its questions.');
const NotesShape = z.object({
  title: z.string(),
  sections: z.array(z.object({ topic: z.string(), keyPoints: z.array(z.string()).min(1), example: z.string().optional() }).passthrough()).min(1),
}).passthrough();
const MetaShape = z.object({
  module: z.string().optional().describe('Module title shown on the paper'), level: z.string().optional().describe('For example L5'),
  trade: z.string().optional(), school: z.string().optional(), duration: z.string().optional().describe('For example "3 HOURS"'),
}).optional();
const ExamFormats = z.array(z.enum(['docx', 'pdf', 'csv'])).min(1).optional().describe('Default ["docx"]. csv writes Questions and Answer Key files for Google Sheets.');
const NotesFormats = z.array(z.enum(['docx', 'pdf'])).min(1).optional().describe('Default ["docx"]');
const OutDir = z.string().optional().describe('Folder to write into. Default: Documents/Exam Studio in the home folder. Existing files are never overwritten.');
const Source = { text: z.string().optional().describe('The notes as text'), file_path: z.string().optional().describe('Or a path to a .pdf, .docx, .txt or .md file') };

const GUIDE = `EXAM STUDIO FORMAT GUIDE

An exam is JSON in one of two layouts. New papers use the sectioned one.

1) "sections-a-e" - the RTB end-of-module paper (default)
${SECTIONS_HELP}

2) "classic" - the older flat paper; papers saved in it keep that layout
{ "title": string, "questions": [ { "type", "marks", "prompt", ...fields } ] }
"marks" is the total for the whole question, and all questions must add up to the paper total.
${TYPE_HELP}

Style (Rwanda TVET / RTB national examination):
- Base every question only on the supplied notes and cover the whole of them. Write original questions.
- Exactly one defensible answer per objective item. No trick wording and no "all of the above".
- Spread correct answers evenly across the letters. Wrong options must be plausible but clearly wrong.
- Option text must not contain letters like "A." (the paper adds them).
- Simple English, short sentences, realistic Rwandan context.

Study notes are JSON: { "title": string, "sections": [ { "topic": string, "keyPoints": string[], "example"?: string } ] }.
Keep the order and numbering of the source, short self-contained points, one example or memory aid per topic.

${HANDOUT_GUIDE}

Workflow: exam_studio_read_notes (if the notes are a file) -> write the exam or the handout -> exam_studio_check_exam / exam_studio_check_handout -> fix every warning -> exam_studio_export_exam / exam_studio_export_handout.`;

export function createMcpServer() {
  const server = new McpServer({ name: 'exam-studio', version: pkg.version }, {
    instructions: 'Exam Studio turns course notes into study notes, flashcards, exams and study handouts for TVET teachers, and writes Word, PDF and CSV files. You (the agent) can write the exam or handout yourself and use these tools to check and export it, or ask the app\'s own AI to generate it. Start with exam_studio_format_guide.',
  });

  server.registerTool('exam_studio_format_guide', {
    title: 'Exam format guide',
    description: 'Returns the exact JSON format for exams, study notes and study handouts, the question types and their fields, and the style rules. Read this before writing an exam or a handout.',
    annotations: { readOnlyHint: true, idempotentHint: true },
  }, tool(async () => text(GUIDE)));

  server.registerTool('exam_studio_read_notes', {
    title: 'Read notes from a file',
    description: 'Extracts the text of a .pdf, .docx, .txt or .md file on this computer (scanned PDFs have no text). Long files are returned in pieces: use next_offset to continue.',
    inputSchema: { file_path: z.string().describe('Path to the notes file'), offset: z.number().int().min(0).optional(), max_chars: z.number().int().min(1000).max(200000).optional().describe('Default 60000') },
    annotations: { readOnlyHint: true, idempotentHint: true },
  }, tool(async ({ file_path, offset = 0, max_chars = 60000 }) => {
    const full = await readSource({ file_path });
    const slice = full.slice(offset, offset + max_chars);
    const next = offset + slice.length;
    return text({ total_chars: full.length, offset, returned_chars: slice.length, next_offset: next < full.length ? next : null, text: slice });
  }));

  server.registerTool('exam_studio_check_exam', {
    title: 'Check an exam',
    description: 'Checks an exam for problems: marks that do not add up, answer letters that do not exist, a sequence that is not a permutation, missing options. Returns the total marks and a list of warnings. Fix every warning before exporting.',
    inputSchema: { exam: ExamShape, target_marks: z.number().int().positive().optional().describe('The marks the paper should add up to, for example 100') },
    annotations: { readOnlyHint: true, idempotentHint: true },
  }, tool(async ({ exam, target_marks }) => {
    const warnings = validateExam(exam, target_marks ?? null);
    const stats = examStats(exam);
    return text({ ok: warnings.length === 0, layout: stats.layout, total_marks: totalMarks(exam), questions: stats.questions, sections: stats.sections, warnings });
  }));

  server.registerTool('exam_studio_export_exam', {
    title: 'Export an exam to files',
    description: 'Writes the exam as a two-column Word paper and/or PDF and/or CSV (for Google Sheets), plus the separate marking scheme. Returns the file paths. Run exam_studio_check_exam first.',
    inputSchema: { exam: ExamShape, meta: MetaShape, formats: ExamFormats, include_marking_scheme: z.boolean().optional().describe('Default true'), output_dir: OutDir, file_name: z.string().optional().describe('Base file name, default the exam title') },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
  }, tool(async ({ exam, meta, formats = ['docx'], include_marking_scheme = true, output_dir, file_name }) => {
    const warnings = validateExam(exam, null);
    const files = await exportExam(exam, meta, formats, include_marking_scheme, outDir(output_dir), file_name);
    return text({ files, total_marks: totalMarks(exam), warnings });
  }));

  server.registerTool('exam_studio_export_notes', {
    title: 'Export study notes to files',
    description: 'Writes study notes as a Word and/or PDF file. Returns the file paths.',
    inputSchema: { notes: NotesShape, formats: NotesFormats, output_dir: OutDir, file_name: z.string().optional() },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
  }, tool(async ({ notes, formats = ['docx'], output_dir, file_name }) => text({ files: await exportNotes(notes, formats, outDir(output_dir), file_name) })));

  server.registerTool('exam_studio_export_handout', {
    title: 'Export a study handout to files',
    description: 'Writes a handout as a Word and/or PDF file. Returns the file paths. Run exam_studio_check_handout first.',
    inputSchema: { handout: z.object({}).passthrough(), formats: NotesFormats, output_dir: OutDir, file_name: z.string().optional() },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
  }, tool(async ({ handout, formats = ['docx'], output_dir, file_name }) => text({
    files: await exportHandout(handout, formats, outDir(output_dir), file_name),
    warnings: validateHandout(handout),
  })));

  server.registerTool('exam_studio_check_handout', {
    title: 'Check a study handout',
    description: 'Checks a handout for problems: a unit with no lesson, a lesson with no key terms, blocks or worked example, a comparison table that compares nothing, a steps block with one step, revision questions that are not five of each with the right number of choices, too few study tips, too few diagrams, a missing practical task. Returns the warnings, the page estimate and the counts. Fix every warning before exporting.',
    inputSchema: { handout: z.object({}).passthrough() },
    annotations: { readOnlyHint: true, idempotentHint: true },
  }, tool(async ({ handout }) => text({
    ok: validateHandout(handout).length === 0,
    warnings: validateHandout(handout),
    stats: handoutStats(handout),
    estimated_pages: estimateHandoutPages(handout),
  })));

  server.registerTool('exam_studio_generate_exam', {
    title: 'Generate an exam with the app\'s AI',
    description: 'Uses the AI chosen in the Exam Studio app (DeepSeek, Ollama, NVIDIA, a terminal tool, ...) to write an exam from notes. Slow for big papers. Returns the exam JSON and its warnings; optionally also writes files. Skip this tool if you would rather write the exam yourself.',
    inputSchema: {
      ...Source, title: z.string().optional(), level: z.string().optional(), total_marks: z.number().int().min(10).max(200).optional().describe('Default 100'),
      types: z.array(z.enum(TYPES)).optional().describe('Default: all types'), essay_count: z.number().int().min(1).max(4).optional().describe('Default 2'),
      meta: MetaShape, export_formats: ExamFormats, output_dir: OutDir,
    },
    annotations: { readOnlyHint: false, openWorldHint: true },
  }, tool(async ({ text: t, file_path, title, level, total_marks = 100, types = TYPES, essay_count = 2, meta, export_formats, output_dir }) => {
    const exam = await generateExam({ text: await readSource({ text: t, file_path }), title, level, totalMarksTarget: total_marks, types, essayCount: types.includes('essay') ? essay_count : 0, avoid: [] });
    const out = { exam, total_marks: exam.totalMarks, warnings: exam.warnings };
    if (export_formats) out.files = await exportExam(exam, { module: title, level, ...meta }, export_formats, true, outDir(output_dir));
    return text(out);
  }));

  server.registerTool('exam_studio_generate_notes', {
    title: 'Generate study notes with the app\'s AI',
    description: 'Uses the AI chosen in the Exam Studio app to write study notes from course notes. Returns the notes JSON; optionally also writes Word/PDF files.',
    inputSchema: { ...Source, title: z.string().optional(), focus: z.string().optional().describe('Optional topic to focus on'), export_formats: NotesFormats, output_dir: OutDir },
    annotations: { readOnlyHint: false, openWorldHint: true },
  }, tool(async ({ text: t, file_path, title, focus, export_formats, output_dir }) => {
    const notes = await generateNotes({ text: await readSource({ text: t, file_path }), title, focus });
    const out = { notes };
    if (export_formats) out.files = await exportNotes(notes, export_formats, outDir(output_dir));
    return text(out);
  }));

  server.registerTool('exam_studio_generate_flashcards', {
    title: 'Generate flashcards with the app\'s AI',
    description: 'Uses the AI chosen in the Exam Studio app to write flashcards (front and back) from course notes.',
    inputSchema: { ...Source, title: z.string().optional(), count: z.number().int().min(5).max(80).optional().describe('Default 30') },
    annotations: { readOnlyHint: true, openWorldHint: true },
  }, tool(async ({ text: t, file_path, title, count = 30 }) => text(await generateCards({ text: await readSource({ text: t, file_path }), title, count }))));

  server.registerTool('exam_studio_generate_handout', {
    title: 'Generate a student study handout with the app\'s AI',
    description: 'Turns a whole module manual into a study handout: one lesson per indicative content, with key terms, worked examples, diagrams, a memory sheet, revision questions, a practical task and study tips. This is SLOW - it makes one AI call per lesson plus one per unit, so a four-unit manual can take a long time. Returns the handout JSON, its warnings and stats; optionally also writes files.',
    inputSchema: {
      ...Source, title: z.string().optional(), level: z.string().optional(),
      units: z.array(z.string()).optional().describe('Build only these unit numbers, for example ["1","2"]. Omit for the whole manual.'),
      include_revision: z.boolean().optional().describe('Default true. Set false to leave out the revision questions.'),
      include_practical: z.boolean().optional().describe('Default true. Set false to leave out the practical assessment task.'),
      export_formats: NotesFormats, output_dir: OutDir,
    },
    annotations: { readOnlyHint: false, openWorldHint: true },
  }, tool(async ({ text: t, file_path, title, level, units, include_revision = true, include_practical = true, export_formats, output_dir }) => {
    const handout = await generateHandout({
      text: await readSource({ text: t, file_path }), title, level, units,
      includeRevision: include_revision, includePractical: include_practical,
    });
    const out = { handout, warnings: handout.warnings, stats: handout.stats, estimated_pages: handout.estimatedPages };
    if (export_formats) out.files = await exportHandout(handout, export_formats, outDir(output_dir));
    return text(out);
  }));

  server.registerTool('exam_studio_library', {
    title: 'Exam Studio library',
    description: 'The app\'s saved library of notes, exams and flashcards. action "list" shows items, "get" returns one by id, "save" stores a new one (kind: notes, exam or flashcards).',
    inputSchema: { action: z.enum(['list', 'get', 'save']), id: z.string().optional(), kind: z.enum(['notes', 'exam', 'flashcards', 'handout']).optional(), title: z.string().optional(), data: z.record(z.any()).optional() },
    annotations: { readOnlyHint: false, destructiveHint: false },
  }, tool(async ({ action, id, kind, title, data }) => {
    if (action === 'list') return text(await listItems());
    if (action === 'get') {
      const item = id && (await getItem(id));
      if (!item) throw new Error('No library item with that id.');
      return text(item);
    }
    if (!kind || !data) throw new Error('To save, give "kind" and "data".');
    return text(await saveItem({ kind, title: String(title || data.title || 'Untitled').slice(0, 120), data }));
  }));

  server.registerResource('format-guide', 'exam-studio://format-guide', { title: 'Exam Studio format guide', description: 'Exam, study notes and study handout JSON format and style rules', mimeType: 'text/markdown' },
    async (uri) => ({ contents: [{ uri: uri.href, mimeType: 'text/markdown', text: GUIDE }] }));

  server.registerPrompt('make_exam', {
    title: 'Make an exam from notes',
    description: 'Writes a new exam and marking scheme from a notes file, checks it, and saves Word and PDF files.',
    argsSchema: { notes_file: z.string().describe('Path to the notes (.pdf, .docx, .txt, .md)'), module: z.string().optional(), level: z.string().optional(), total_marks: z.string().optional().describe('Default 100') },
  }, ({ notes_file, module, level, total_marks }) => ({
    messages: [{ role: 'user', content: { type: 'text', text:
      `Use the Exam Studio tools to make an exam from my notes.\n1. Call exam_studio_format_guide.\n2. Read the notes with exam_studio_read_notes (file: ${notes_file}); continue with next_offset until you have all of it.\n3. Write an original exam of ${total_marks || 100} marks${level ? ` for level ${level}` : ''}${module ? ` (module: ${module})` : ''}, following the guide.\n4. Run exam_studio_check_exam with target_marks ${total_marks || 100} and fix every warning.\n5. Call exam_studio_export_exam with formats ["docx","pdf"] and tell me where the files are.` } }],
  }));

  return server;
}
