// Prompts and AI calls for study notes, flashcards and exams.
//
// The provider, model, address and key all come from lib/providers.js (Settings screen),
// so changing them in the app takes effect on the next generation without a restart.
import { httpError } from './errors.js';
import { examTool, examSectionTool, notesTool, cardsTool, handoutPlanTool, handoutLessonTool, handoutExtrasTool } from './schema.js';
import {
  validateExam, totalMarks, QUESTION_TYPES, validateHandout, handoutStats, estimateHandoutPages,
  LAYOUT_SECTIONS, SECTION_KINDS, buildSectionPlan, DEFAULT_SECTION_PLAN,
  sectionItemCount, structuredItemMarks, numberedItems, sanitizeSectionPlan,
} from '../../shared/format.js';
import { demoExam, demoNotes, demoCards, demoHandout } from './demo.js';
import { demoSectionsExam } from './demo-sections.js';
import { callStructured, providerReady } from './engine.js';
import * as admin from './adminStore.js';
import { resolve } from './providers.js';

export const DEMO = process.env.DEMO_MODE === '1';
// A real RTB trainee's manual runs to about 480,000 characters, and a handout is planned from the
// whole document. The cap can be lowered (or raised) from the environment.
export const MAX_NOTES_CHARS = Number(process.env.MAX_NOTES_CHARS) || 600_000;

/**
 * Detect structure in notes text: modules, learning outcomes, units, sections.
 * Returns detected tree with confidence level, or null if no structure found.
 *
 * Looks for:
 - Headings: "Learning Outcome 1", "LO1", "Unit 1", "Indicative content 1.1"
 - Numbered: "1.", "1.1", "1.1.1"
 - Module/Chapter/Chapter title patterns
 - Cleans repeated headers/footers before analysis
 *
 * @param {string} text - The notes text to analyze
 * @param {string} [title] - Optional title from the notes
 * @returns {object|null} Detected structure or null if none found
 */
export function detectStructure(text, title) {
  if (!text || text.length < 50) return null;

  // Clean: remove repeated headers/footers and page numbers
  const cleaned = cleanTextForStructure(text);

  const lines = cleaned.split(/\n\s*\n/);
  const tree = { modules: [], confidence: 'Low' };
  let highConfidenceCount = 0;

  // Patterns we look for - improved regexes for common note formats
  const patterns = {
    // Learning Outcome patterns
    lo: /learning\s+outcome\s+(\d+)/i,
    lo_short: /^[LOo]*\s*(\d+)/i,
    // Unit patterns
    unit: /unit\s+(\d+)/i,
    // Indicative content
    indicative: /indicative\s+content\s+([\d.]+)/i,
    // Module/Chapter title - more flexible, handles "Module: Title" or "Module Title"
    module: /(?:^|[\s;])module\s*:?\s*([^\n]{3,80})/i,
    chapter: /(?:^|[\s;])chapter\s*:?\s*([^\n]{3,80})/i,
    // Numbered headings - improved to match 1., 1.1, 1.1.1
    numbered: /^(\d+)(\.\d+)*\s*/m,
    // Topic patterns
    topic: /^[Tt]opic\s*:?\s*(.{3,60})/i,
  };

  // Scan each line for patterns
  const findings = {
    modules: new Map(), // title -> {lineIndex, confidence}
    outcomes: new Map(), // LO number -> {lineIndex, confidence}
    units: new Map(), // unit number -> {lineIndex, confidence}
    sections: new Map(), // section number -> {lineIndex, confidence}
  };

  lines.forEach((line, idx) => {
    // Check for module/chapter title
    const modMatch = line.match(patterns.module);
    if (modMatch && modMatch[1].trim().length >= 3) {
      findings.modules.set(modMatch[1].trim().toLowerCase(), {
        lineIndex: idx,
        confidence: 'High',
        text: modMatch[1].trim(),
      });
      highConfidenceCount++;
    }

    // Check for learning outcomes
    const loMatch = line.match(patterns.lo) || line.match(patterns.lo_short);
    if (loMatch) {
      const loNum = loMatch[1];
      if (!findings.outcomes.has(loNum)) {
        findings.outcomes.set(loNum, {
          lineIndex: idx,
          confidence: 'High',
          text: `Learning Outcome ${loNum}`,
        });
        highConfidenceCount++;
      }
    }

    // Check for units
    const unitMatch = line.match(patterns.unit);
    if (unitMatch) {
      const unitNum = unitMatch[1];
      if (!findings.units.has(unitNum)) {
        findings.units.set(unitNum, {
          lineIndex: idx,
          confidence: 'High',
          text: `Unit ${unitNum}`,
        });
        highConfidenceCount++;
      }
    }

    // Check for indicative content
    const indMatch = line.match(patterns.indicative);
    if (indMatch) {
      const sectionNum = indMatch[1];
      if (!findings.sections.has(sectionNum)) {
        findings.sections.set(sectionNum, {
          lineIndex: idx,
          confidence: 'Medium',
          text: `Indicative Content ${sectionNum}`,
        });
      }
    }

    // Check for numbered headings (1., 1.1, etc.)
    const numMatch = line.match(patterns.numbered);
    if (numMatch) {
      const headingText = numMatch[0].trim();
      // Classify by depth
      const depth = (headingText.match(/^(\.?\d)+/) || [''])[0].split('.').length;
      if (depth >= 1 && depth <= 3) {
        const key = `${depth}-${headingText.toLowerCase().slice(0, 30)}`;
        if (!findings.sections.has(key)) {
          findings.sections.set(key, {
            lineIndex: idx,
            confidence: depth === 1 ? 'High' : 'Medium',
            text: headingText,
            depth,
          });
        }
      }
    }
  });

  // Build the tree structure
  // 1. Add modules
  for (const [key, info] of findings.modules) {
    tree.modules.push({
      title: info.text,
      type: 'module',
      confidence: info.confidence,
      lineIndex: info.lineIndex,
    });
  }

  // 2. Add learning outcomes and units
  // Sort by line index to maintain order
  const sortedOutcomes = [...findings.outcomes.values()].sort((a, b) => a.lineIndex - b.lineIndex);
  const sortedUnits = [...findings.units.values()].sort((a, b) => a.lineIndex - b.lineIndex);
  const sortedSections = [...findings.sections.values()].sort((a, b) => a.lineIndex - b.lineIndex);

  // Attach outcomes and units to modules (simple approach: first module gets first outcomes/units)
  if (tree.modules.length > 0) {
    let loIdx = 0, unitIdx = 0, sectionIdx = 0;

    for (let m = 0; m < tree.modules.length; m++) {
      // Add next outcome if it's close in line number
      if (loIdx < sortedOutcomes.length && 
          Math.abs(sortedOutcomes[loIdx].lineIndex - tree.modules[m].lineIndex) < 5) {
        if (!tree.modules[m].learningOutcomes) tree.modules[m].learningOutcomes = [];
        tree.modules[m].learningOutcomes.push({
          number: sortedOutcomes[loIdx].text.match(/(\d+)/)[0],
          text: sortedOutcomes[loIdx].text,
          lineIndex: sortedOutcomes[loIdx].lineIndex,
        });
        loIdx++;
      }

      // Add next unit if close in line number
      if (unitIdx < sortedUnits.length &&
          Math.abs(sortedUnits[unitIdx].lineIndex - tree.modules[m].lineIndex) < 5) {
        if (!tree.modules[m].units) tree.modules[m].units = [];
        tree.modules[m].units.push({
          number: sortedUnits[unitIdx].text.match(/(\d+)/)[0],
          text: sortedUnits[unitIdx].text,
          lineIndex: sortedUnits[unitIdx].lineIndex,
        });
        unitIdx++;
      }

      // Add next section if close in line number
      if (sectionIdx < sortedSections.length &&
          Math.abs(sortedSections[sectionIdx].lineIndex - tree.modules[m].lineIndex) < 5) {
        if (!tree.modules[m].sections) tree.modules[m].sections = [];
        tree.modules[m].sections.push({
          number: sortedSections[sectionIdx].text.match(/(\d+)/) || ['?'],
          text: sortedSections[sectionIdx].text,
          lineIndex: sortedSections[sectionIdx].lineIndex,
          depth: sortedSections[sectionIdx].depth || 1,
        });
        sectionIdx++;
      }
    }
  }

  // Determine confidence level
  const totalDetected = findings.modules.size + findings.outcomes.size + findings.units.size + findings.sections.size;
  if (totalDetected >= 6) tree.confidence = 'High';
  else if (totalDetected >= 3) tree.confidence = 'Medium';
  else if (totalDetected > 0) tree.confidence = 'Low';

  // If we found a module title, also try to extract it
  if (title && !tree.moduleTitle) {
    const modMatch = title.match(/([A-Z]{2,}[0-9]{3,}[A-Z]?\s+[\w\s]+)/i);
    if (modMatch) {
      tree.moduleTitle = modMatch[1].trim();
    }
  }

  // Return null if very minimal detection
  if (totalDetected < 2) return null;

  return tree;
}

/**
 * Clean text for structure detection: remove repeated headers, footers, page numbers
 */
function cleanTextForStructure(text) {
  // Remove common page header patterns (all caps, short, on separate lines)
  let cleaned = text;

  // Remove things like "SWDPP401 PHP Programming" repeated as headers
  // Remove page numbers like "1", "2" on their own lines or at line start
  cleaned = cleaned.replace(/^\s*\d+\s*$/gm, ''); // lone page numbers
  cleaned = cleaned.replace(/^\s*[A-Z]{2,}\s*$/gm, ''); // all-caps headers

  // Remove common footer patterns
  cleaned = cleaned.replace(/\b(page|copyright|confidential)\s+\d+/gi, '');

  // Collapse multiple spaces
  cleaned = cleaned.replace(/\s{3,}/g, ' ');

  return cleaned.trim();
}

/**
 * Estimate token count for text (rough: 1 token ≈ 4 characters for English)
 */
export function estimateTokens(text) {
  return Math.max(1, Math.ceil(text.length / 4));
}

/** Which AI is in use right now (Settings can change it while the server runs). */
export function activeInfo() {
  const cfg = resolve();
  return { id: cfg.id, provider: cfg.label, model: cfg.model, demo: DEMO };
}

const arr = (v) => (Array.isArray(v) ? v : []);

// ---------------------------------------------------------------- result cleaning
// Models sometimes return the wrong shape. Fix what is fixable and reject the rest, so the
// UI never has to defend itself against a broken reply.
function cleanNotes(result) {
  const sections = arr(result?.sections).filter((x) => x && typeof x === 'object').map((x) => ({
    topic: String(x.topic || 'Topic'),
    keyPoints: arr(x.keyPoints).map(String).filter(Boolean),
    example: x.example ? String(x.example) : '',
  })).filter((x) => x.keyPoints.length);
  if (!sections.length) throw httpError(502, 'The AI returned no usable notes. Try again.');
  return { title: String(result.title || 'Study notes'), sections };
}

function cleanCards(result) {
  const cards = arr(result?.cards).filter((c) => c && c.front && c.back).map((c) => ({
    front: String(c.front),
    back: String(c.back),
    topic: c.topic ? String(c.topic) : '',
    // "trap" cards are the ones worth filtering to: they fix a confusion that costs marks.
    cardType: ['term', 'fact', 'trap'].includes(String(c.cardType)) ? String(c.cardType) : 'term',
  }));
  if (!cards.length) throw httpError(502, 'The AI returned no usable flashcards. Try again.');
  return { title: String(result.title || 'Flashcards'), cards };
}

function cleanExam(result) {
  const questions = arr(result?.questions).filter((q) => q && typeof q === 'object' && q.type).map((q) => ({
    ...q,
    prompt: String(q.prompt || ''),
    marks: Number(q.marks) || 0,
  }));
  if (!questions.length) throw httpError(502, 'The AI returned no usable questions. Try again.');
  return { title: String(result.title || 'Exam'), questions };
}

// Save a round trip when the chosen provider cannot possibly answer.
async function ensureReady() {
  if (DEMO) return;
  if (!(await admin.isAIEnabled())) throw httpError(503, 'Exam Studio is being updated.');
  const ready = await providerReady();
  if (!ready.ok) throw httpError(500, `${ready.reason} Set it in Settings, or set DEMO_MODE=1 to try the app with sample output.`);
}

// ---------------------------------------------------------------- input splitting
// Long notes are written part by part, so no single reply has to hold everything.
// The number of parts is capped: with a small "notes per request" setting a huge file could
// otherwise mean hundreds of sequential (paid) calls. MAX_PARTS * 8 is the hard ceiling,
// because a part that comes back cut off is split again, at most three levels deep.
const MAX_PARTS = 30;

// How far a slice may be grown to make a document fit inside MAX_PARTS. Past this a single call
// takes longer than the terminal tools allow, so growing stops helping and starts timing out.
const MAX_CHUNK = 40_000;

/**
 * Split the notes into the parts that will each become one AI request.
 *
 * "Notes per request" is the slice the user asked for, not a ceiling on the file size. When a
 * document would need more than MAX_PARTS parts at that size, the slice is grown until it fits,
 * so an ordinary trainee manual is never refused for being long. The user's own setting still wins
 * everywhere it fits, which keeps small files on small, fast requests.
 */
export function partsFor(text) {
  const body = String(text);
  let size = Number(resolve().chunk) || 8000;
  let parts = splitText(body, size);
  if (parts.length <= MAX_PARTS) return parts;

  // Room to spare, because packing whole paragraphs never lands exactly on the target.
  size = Math.min(MAX_CHUNK, Math.ceil((body.length / (MAX_PARTS - 2)) * 1.05));
  parts = splitText(body, size);
  while (parts.length > MAX_PARTS && size < MAX_CHUNK) {
    size = Math.min(MAX_CHUNK, Math.ceil(size * 1.15));
    parts = splitText(body, size);
  }
  if (parts.length > MAX_PARTS) {
    throw httpError(413, `These notes are longer than one paper can hold: they need more than ${MAX_PARTS} AI requests even at the largest safe amount per request. Split the file into ${MAX_PARTS} or fewer parts.`);
  }
  return parts;
}

function splitText(text, size) {
  const pieces = [];
  for (const para of String(text).split(/\n\s*\n/)) {
    if (para.length <= size) { pieces.push(para); continue; }
    for (let i = 0; i < para.length; i += size) pieces.push(para.slice(i, i + size));
  }
  const chunks = [];
  let current = '';
  for (const piece of pieces) {
    if (current && current.length + piece.length + 2 > size) { chunks.push(current); current = ''; }
    current += (current ? '\n\n' : '') + piece;
  }
  if (current.trim()) chunks.push(current);
  return chunks.length ? chunks : [String(text)];
}

// Runs one call per part. A part that is still cut off is split in half and tried again.
async function perPart(text, run, depth = 0) {
  try {
    return [await run(text)];
  } catch (error) {
    if (!error.cutoff || depth >= 3 || text.length < 1500) throw error;
    const halves = splitText(text, Math.ceil(text.length / 2));
    const out = [];
    for (const half of halves) out.push(...(await perPart(half, run, depth + 1)));
    return out;
  }
}

const wrapNotes = (text) => `<notes>\n${text}\n</notes>`;

// ---------------------------------------------------------------- generate
// In demo mode every generator returns the fixed sample in lib/demo.js. The result is marked
// `demo: true` so the app can say so on screen instead of looking like it ignored your notes.
export async function generateNotes({ text, title, focus }) {
  if (DEMO) return { ...demoNotes(), demo: true };
  await ensureReady();
  const parts = partsFor(text);
  const results = [];
  for (let i = 0; i < parts.length; i++) {
    const where = parts.length > 1 ? `This is part ${i + 1} of ${parts.length} of the notes. Cover only the text in this part.\n` : '';
    results.push(...(await perPart(parts[i], (chunk) => callStructured({
      tool: notesTool,
      maxTokens: 8000,
      system:
        `You write quick revision notes for TVET students. Use only what the supplied notes say.

Keep the topic order and the numbering of the source. For each topic:
- keyPoints: short, self-contained points a student could memorise. The first point of each topic defines the topic's main term in plain language. Where the source contrasts two things, make those two consecutive points in the form "X: ... / Y: ...". Where the source gives a procedure, make the points the steps in order. Do not write a point that is a vague generalisation - every point must carry a fact, a number or a distinction.
- example: one concrete example or memory aid, from the source where the source has one.

Rewrite everything in your own words. Never copy a sentence from the notes. Simple English, short sentences.`,
      user: `${title ? `Module: ${title}\n` : ''}${focus ? `Focus on: ${focus}\n` : ''}${where}Write study notes from these course notes.\n\n${wrapNotes(chunk)}`,
    }))));
  }
  const cleaned = results.map(cleanNotes);
  return { title: cleaned[0].title, sections: cleaned.flatMap((c) => c.sections) };
}

export async function generateCards({ text, title, count }) {
  if (DEMO) return { ...demoCards(), demo: true };
  await ensureReady();
  const parts = partsFor(text);
  const want = count || 30;
  const each = Math.max(5, Math.ceil(want / parts.length));
  const results = [];
  for (let i = 0; i < parts.length; i++) {
    const where = parts.length > 1 ? `This is part ${i + 1} of ${parts.length} of the notes. Cover only the text in this part.\n` : '';
    results.push(...(await perPart(parts[i], (chunk) => callStructured({
      tool: cardsTool,
      maxTokens: 6000,
      system:
        `You write flashcards for TVET students. Each card tests one fact or idea from the supplied notes: a clear question or term on the front, a short accurate answer on the back. Use only the supplied notes. Do not repeat a card.

Aim for roughly one card in five to be a "trap" card: cardType "trap", where the front is a pair of terms students constantly confuse and the back states the difference in one sentence. For example, front "Encryption vs hashing", back "Encryption is reversible with a key; hashing is one-way and cannot be reversed." Trap cards are the highest-value cards in the deck, because the confusion they fix is the one that costs marks.`,
      user: `${title ? `Module: ${title}\n` : ''}${where}Write about ${each} flashcards from these notes.\n\n${wrapNotes(chunk)}`,
    }))));
  }
  const cleaned = results.map(cleanCards);
  const seen = new Set();
  const cards = cleaned.flatMap((c) => c.cards).filter((c) => !seen.has(c.front.toLowerCase()) && seen.add(c.front.toLowerCase()));
  return { title: cleaned[0].title, cards: cards.slice(0, Math.max(want, 5)) };
}

export const TYPE_HELP = `Question types and their required fields:
- mcq: "items" = sub-questions, each with "text", exactly 4 "options" (no letters in the text) and "answer" as a letter A-D. Use two sub-questions per question. Spread the correct answers across A-D. Every wrong option must be wrong for a specific reason that you can state in "notes". Set "notes" whenever a distractor is a common misconception.
- true_false: "items" = statements with "answer" "True" or "False". Use four statements.
- select_all: "options" (5 options) and "correct" (letters).
- matching: "columnA", "columnB" in mixed order (same length as columnA), "matchAnswers" = for each columnA item the matching columnB letter.
- sequencing: "steps" in SHUFFLED order and "sequenceAnswer" = the step numbers in the correct order.
- short_answer: "items" with "text" and the expected "answer".
- essay: "prompt" with a realistic scenario, lettered "parts" whose marks add up to the question marks, and "markingPoints" whose marks add up to the question marks.
For every question "marks" is the total for the whole question.`;

export async function generateClassicExam({ text, title, level, totalMarksTarget, types, essayCount, avoid, variant }) {
  if (DEMO) return { ...demoExam(), demo: true };
  await ensureReady();
  const enabled = types.map((t) => `${t} (${QUESTION_TYPES[t]})`).join(', ');
  const system = `You are an experienced assessor writing a written exam for a Rwanda TVET (RTB) trade module. The style is a formal national mock paper: numbered questions, each with a mark value, objective questions first and long scenario questions last.

Rules:
- Base every question on the supplied notes only. Do not test anything the notes do not cover.
- Cover the whole of the notes, not one topic.
- Write original questions. Never copy sentences from the notes or from any sample paper.
- Every question must have exactly one defensible answer (or a clear marking scheme for essays). Avoid trick wording and "all of the above".
- Wrong options must be plausible but clearly wrong according to the notes.
- Use only these question types: ${enabled}.
- The marks of all questions must add up to exactly ${totalMarksTarget}.
- Include exactly ${essayCount} essay question(s), placed last, with a realistic scenario.
- When a question asks a student to choose or describe an approach, the marking points must award marks for the reason as well as the action. A point that is only the name of a thing earns one mark; a point that names the thing and says why it is right earns two.
- Order: sequencing and matching first, then mcq, select_all, true_false, short_answer, then essays.
- Produce variant ${(variant === 'B' ? 'B' : 'A')} for this run. Keep all answers defensible; vary scenarios and combinations while preserving coverage.
${avoid?.length ? `- Do not repeat or closely re-word any of these earlier questions:\n${avoid.map((a) => `  * ${a}`).join('\n')}` : ''}

${TYPE_HELP}`;
  const exam = cleanExam(await callStructured({
    tool: examTool,
    maxTokens: 32000,
    system,
    user: `${title ? `Module: ${title}\n` : ''}${level ? `Level: ${level}\n` : ''}Write the exam (${totalMarksTarget} marks) from these notes.\n\n${wrapNotes(text)}`,
  }));
  exam.warnings = validateExam(exam, totalMarksTarget);
  exam.totalMarks = totalMarks(exam);
  return exam;
}

// ================================================================ sectioned exam (sections A-E)
//
// The RTB end-of-module papers are laid out in sections A-E with numbering that runs continuously
// across the whole paper. So the paper is generated ONE SECTION AT A TIME: each call is small
// enough for a local model, each prompt can be specific about the kind of question wanted, and a
// section that comes back cut off is retried in halves instead of losing the whole paper.

export const SECTIONS_HELP = `A sectioned paper is JSON: { "title", "layout": "sections-a-e", "moduleCode", "moduleName", "level", "trade", "school", "duration", "sections": [ section ] }.
section = { "id": "A".."E", "kind", "title", "instruction", "marksPerItem", "marks", "items": [ item ] }
kind and its item shape:
- "mcq":          { "text", "options": [4 strings], "answer": "A"|"B"|"C"|"D", "notes" }
- "true_false":   { "text", "answer": "True"|"False" }
- "fill_blank":   { "text" containing ________ , "answer" }
- "short_answer": { "text", "marks", "answer", "markingPoints": [ { "point", "marks" } ] }
- "structured":   { "title", "totalMarks", "parts": [ { "letter", "text", "marks" } ], "markingPoints": [ { "point", "marks" } ], "modelAnswer", "code" }
Numbering is continuous across the paper (1..N) and is applied by the app, not by you.
The default 100-mark plan is A 30x1, B 10x1, C 10x1, D 10x2, E 4 structured (8,8,7,7) = 64 questions.
Checks: section marks must add to the paper total; every structured question's part marks and marking-point marks must each add to its totalMarks;
every mcq answer letter must exist and the letters must be spread (no letter more than 40% of the section); no "all of the above".`;

const SECTIONS_STYLE = `You are an experienced assessor for the Rwanda TVET Board (RTB), writing an end-of-module examination for a TVET trade module. The paper is laid out in sections A to E with continuous numbering, in the formal style of a national examination.

Rules, without exception:
- Base every question only on the supplied notes. Do not test anything the notes do not cover.
- Cover the whole of the notes - every unit - in proportion to how much of the notes each unit takes.
- Write many short questions rather than a few long ones.
- Write original questions. Never copy a sentence from the notes or from any sample paper.
- Every objective question must have exactly one defensible answer. A wrong option must be plausible to a student who has studied the module, and clearly wrong to a marker.
- Simple English and short sentences. Write for a student reading in their second or third language.
- Use realistic Rwandan context in scenarios: local schools, businesses, prices in RWF, local names.
- Do not put letters such as "A." in front of options, and do not number the questions; the paper does that.`;

const looksLikeProgramming = (text, title) => /javascript|typescript|vue|react|angular|python|java\b|php|c\+\+|c#|node\.?js|sql|\bcode\b|programming|web develop/i.test(`${title} ${String(text).slice(0, 4000)}`);

const KIND_RULES = {
  mcq: ({ count }) => `Write exactly ${count} multiple-choice questions.
Each question has exactly 4 options. Exactly one option is correct and the other three must be wrong for a specific reason; put that reason in "notes" for the tempting ones.
Vary which letter is correct: spread the answers evenly over A, B, C and D across the whole section.
Never use "all of the above" or "none of the above".`,
  true_false: ({ count }) => `Write exactly ${count} statements about the notes. About half must be true and half false, in mixed order.
"answer" is exactly "True" or "False". Make a false statement wrong in a specific way a prepared student can spot, not trivially silly.`,
  fill_blank: ({ count }) => `Write exactly ${count} sentences taken from the ideas in the notes, each with one important word or short phrase missing, written as ________ (eight underscores).
"answer" is the missing word or phrase, and each blank must have exactly one defensible answer.`,
  short_answer: ({ count, marksPerItem }) => `Write exactly ${count} short-answer questions, worth ${marksPerItem} marks each.
Each question must need a precise answer of one or two sentences: a definition, a difference, a reason, or a short comparison.
"answer" is the expected answer.`,
  structured: ({ count, itemMarks, programming }) => `Write exactly ${count} structured questions, worth these marks in this order: ${itemMarks.join(', ')}.
Each question has a short scenario title, lettered parts (a), (b), ... whose marks add up EXACTLY to its totalMarks, and "markingPoints" whose marks also add up EXACTLY to totalMarks.
Make the scenario realistic and local, and let the parts build on each other.${programming ? `\nThis is a programming module: include a part that asks the candidate to write a short piece of code, and put the model code in "code" using \\n for newlines.` : ''}`,
};

function sectionUserMessage({ spec, count, itemMarks, programming, title, level, notes, avoid }) {
  const rules = KIND_RULES[spec.kind]?.({ count, itemMarks, programming, marksPerItem: spec.marksPerItem }) || '';
  return `Module: ${title || '(from the notes)'}${level ? `\nLevel: ${level}` : ''}
Section ${spec.id}: ${spec.title}. ${spec.marks} marks in total.${spec.marksPerItem ? ` ${spec.marksPerItem} mark${spec.marksPerItem === 1 ? '' : 's'} per question.` : ''}

${rules}
${avoid?.length ? `\nDo not repeat or closely re-word any of these questions from the saved papers:\n${avoid.map((a) => `  * ${a}`).join('\n')}` : ''}

Write section ${spec.id} now, from these notes.`;
}

/** Coerce one section result into the shape the renderers and the checker expect. */
export function cleanExamSection(result, spec, { count = null, itemMarks = null } = {}) {
  const text = (v) => (typeof v === 'string' ? v.trim() : v === undefined || v === null ? '' : String(v));
  const list = (v) => (Array.isArray(v) ? v.map(text).filter(Boolean) : []);
  const objects = (v) => (Array.isArray(v) ? v.filter((x) => x && typeof x === 'object' && !Array.isArray(x)) : []);

  const raw = objects(result?.items);
  const limited = count ? raw.slice(0, count) : raw;

  const items = limited.map((item, i) => {
    if (spec.kind === 'mcq') {
      const options = list(item.options).slice(0, 4);
      return { text: text(item.text), options, answer: text(item.answer).toUpperCase().slice(0, 1), notes: text(item.notes) };
    }
    if (spec.kind === 'true_false') {
      const answer = text(item.answer).toLowerCase() === 'false' ? 'False' : text(item.answer).toLowerCase() === 'true' ? 'True' : text(item.answer);
      return { text: text(item.text), answer };
    }
    if (spec.kind === 'fill_blank') return { text: text(item.text), answer: text(item.answer) };
    if (spec.kind === 'short_answer') {
      return {
        text: text(item.text),
        marks: Number(item.marks) || spec.marksPerItem || 2,
        answer: text(item.answer),
        markingPoints: objects(item.markingPoints).map((point) => ({ point: text(point.point), marks: Number(point.marks) || 0 })),
      };
    }
    // structured: the planned marks are authoritative, so the paper total cannot drift because the
    // model split its parts slightly differently.
    const plannedTotal = itemMarks?.[i] ?? Number(item.totalMarks) ?? 0;
    const parts = objects(item.parts).map((part, pi) => ({
      letter: text(part.letter).replace(/[^a-zA-Z]/g, '').slice(0, 1) || String.fromCharCode(97 + pi),
      text: text(part.text),
      marks: Number(part.marks) || 0,
    }));
    const totalMarks = Number(plannedTotal) || parts.reduce((sum, part) => sum + part.marks, 0);
    // Distribute any difference onto the biggest part so the parts always add up to the question.
    const partSum = parts.reduce((sum, part) => sum + part.marks, 0);
    if (parts.length && partSum !== totalMarks) {
      const target = parts.reduce((best, part) => (part.marks > best.marks ? part : best), parts[0]);
      target.marks = Math.max(0, target.marks + (totalMarks - partSum));
    }
    const points = objects(item.markingPoints).map((point) => ({ point: text(point.point), marks: Number(point.marks) || 0 }));
    const pointSum = points.reduce((sum, point) => sum + point.marks, 0);
    if (points.length && pointSum !== totalMarks) {
      const target = points.reduce((best, point) => (point.marks > best.marks ? point : best), points[0]);
      target.marks = Math.max(0, target.marks + (totalMarks - pointSum));
    }
    return {
      title: text(item.title) || `Question ${i + 1}`,
      totalMarks,
      parts,
      markingPoints: points,
      modelAnswer: text(item.modelAnswer),
      code: text(item.code),
    };
  });

  if (!items.length) throw httpError(502, `The AI returned no usable questions for section ${spec.id}. Try again.`);
  return items;
}

async function generateOneSection({ spec, count, itemMarks, programming, title, level, notes, avoid, variant }) {
  const result = await callStructured({
    tool: examSectionTool,
    maxTokens: Math.max(6000, Math.min(resolve().maxOut || 16000, spec.kind === 'mcq' ? 16000 : 12000)),
    system: SECTIONS_STYLE,
    user: `${sectionUserMessage({ spec, count, itemMarks, programming, title, level, notes, avoid, variant })}\nVariant: ${(variant === 'B' ? 'B' : 'A')}\n\n${wrapNotes(String(notes).slice(0, Math.max(resolve().chunk, 40_000)))}`,
  });
  return cleanExamSection(result, spec, { count, itemMarks });
}

/** One section, splitting it in half if the model ran out of room. */
async function generateSectionItems(options, depth = 0) {
  const { spec, count, itemMarks } = options;
  try {
    return await generateOneSection(options);
  } catch (error) {
    if (!error.cutoff || depth >= 2 || count < 4) throw error;
    const half = Math.ceil(count / 2);
    const first = await generateSectionItems({ ...options, count: half, itemMarks: itemMarks ? itemMarks.slice(0, half) : null }, depth + 1);
    const second = await generateSectionItems({ ...options, count: count - half, itemMarks: itemMarks ? itemMarks.slice(half) : null, skip: first.length }, depth + 1);
    return [...first, ...second];
  }
}

export async function generateSectionsExam({ text, title, level, totalMarksTarget, sectionPlan, moduleCode, trade, school, duration, avoid, variant }) {
  await ensureReady();
  const target = Number(totalMarksTarget) || 100;
  const plan = buildSectionPlan(target, sanitizeSectionPlan(sectionPlan) || DEFAULT_SECTION_PLAN);
  const programming = looksLikeProgramming(text, title);
  const sections = [];

  for (const spec of plan) {
    const count = sectionItemCount(spec);
    const itemMarks = spec.kind === 'structured' ? structuredItemMarks(spec.marks) : null;
    const items = await generateSectionItems({ spec, count, itemMarks, programming, title, level, notes: text, avoid, variant });
    sections.push({
      id: spec.id,
      kind: spec.kind,
      title: spec.title || String(SECTION_KINDS[spec.kind] || spec.kind).toUpperCase(),
      instruction: '',
      marksPerItem: spec.kind === 'structured' ? 0 : spec.marksPerItem,
      marks: spec.marks,
      items,
    });
  }

  const exam = {
    title: title || `${moduleCode || 'Module'} end of module examination`,
    layout: LAYOUT_SECTIONS,
    moduleCode: moduleCode || '',
    moduleName: title || '',
    level: level || '',
    trade: trade || '',
    school: school || '',
    duration: duration || '3 hours',
    targetMarks: Number(totalMarksTarget) || 100,
    sections,
  };
  // Section marks come from the registered plan, not from what the model happened to write, so the
  // paper total is exactly the requested total; the checker then reports any section that is short.
  exam.totalMarks = totalMarks(exam);
  exam.warnings = validateExam(exam, exam.targetMarks);
  return exam;
}

/**
 * The one entry point for exams. `layout` picks the paper: `sections-a-e` (the default) or the old
 * flat `classic` paper, which saved exams keep using.
 */
export async function generateExam(options = {}) {
  const layout = options.layout === 'classic' ? 'classic' : LAYOUT_SECTIONS;
  if (DEMO) return layout === LAYOUT_SECTIONS ? { ...demoSectionsExam(), demo: true } : { ...demoExam(), demo: true };
  if (layout === LAYOUT_SECTIONS) return generateSectionsExam(options);
  return generateClassicExam(options);
}

// ================================================================ study handouts
//
// A handout is the one document that cannot be built the way notes are. Notes flatten one AI call
// per chunk of text; that works for a summary because a summary has no structure to keep. A
// handout has to give every indicative content exactly one lesson, in the manual's own order, with
// no repetition and no gaps, and it has to stay the same shape across a 300-page manual. So it is
// built in four passes instead:
//
//   1 PLAN    the whole manual  -> the skeleton: units, lessons, sub-topics, defects in the source
//   2 BUILD   one lesson at a time -> the full lesson (key terms, blocks, callouts, worked example)
//   3 EXTRAS  one unit at a time  -> diagrams, memory sheet, revision, practical task, tips
//   4 ASSEMBLE  pure code, no AI
//
// Pass 1 sees everything but returns almost nothing, so even a 300-page manual fits. Pass 2 gets
// the plan plus only its own slice of text, so lesson 3 knows it is lesson 3 and what lessons 2
// and 4 already cover. Pass 3 is per unit because diagrams and a practical task are unit-level.
// Each pass is independent, so a failed lesson is retried on its own rather than restarting the run.

const HANDOUT_STYLE = `You are writing a Student Study Handout for a Rwanda TVET Board (RTB) trainee, RQF Level 4, who is revising for a written examination and a practical assessment.

You are not a summariser. You are a teacher who rewrites source material into something learnable, and an examiner's coach who knows which facts get asked and which traps get set.

Rules, without exception:
- Simple English. Short sentences. Plain explanations. Write for a student reading in their second or third language.
- Rewrite everything in your own words. Never copy a paragraph from the notes. Copying is the one unforgivable failure, because the whole point of the handout is that the notes were too dense to revise from.
- Stay accurate to the notes. Do not invent facts. If you add anything from outside the notes, mark it clearly as "Extra" and say why it is worth knowing.
- Cover every sub-topic. If the notes have sixteen sub-headings under one indicative content, the lesson has sixteen sub-headings. Skip nothing.
- Explain the why, not just the what. Every instruction carries its reason, because that turns recall into understanding.
- Use realistic local context in examples: local currency and place names, locally plausible companies, schools and personal names. Keep examples in the same setting as the source material's own scenarios.
- No filler. If a sentence does not teach something or earn a mark, delete it.`;

const PLAN_SYSTEM = `${HANDOUT_STYLE}

Your job now is ONLY to find the structure. Do not write any lesson content.

From the notes, work out:
1. The module name, module code, level and trade - detect these yourself from the notes. Never ask and never invent.
2. Each unit. In RTB manuals a unit is a Learning Outcome.
3. Under each unit, the list of indicative contents, exactly as the notes list them and in the notes order.
4. Under each indicative content, one lesson. Its number matches the source (for example "1.3"). Its title is the indicative content title, or the lesson title the notes use.
5. Under each lesson, EVERY sub-topic heading the notes give, in order. Be complete - this list is the checklist that later passes must satisfy, so a sub-topic you omit here can never be written.
6. For each lesson, copy a short distinctive phrase that appears at the very start of that lesson in the source notes. This is used later to locate the lesson's text, so it must be an exact quotation from the notes, not a paraphrase.

Then list every defect you can find in the notes. Look specifically for:
- factual errors - a statement that contradicts the notes' own definition elsewhere
- mismatched answers - a question with two correct options, or a wrong answer key
- mis-numbered lists - 1, then 3, then 3 again; or a list that jumps 8 to 11
- wrong labels - a heading titled "authorization" over a section teaching accountability
- names used wrongly - "database" where the thing created is a table
- duplicated words, blank fields such as "Duration:" with no number, leftover editing marks
- commands used wrongly - for example a Java deploy command shown for a Node.js application
- terminology that is not standard in the field

Do not correct these silently. Each one becomes an Exam tip later. Report them all now.`;

const LESSON_SYSTEM = `${HANDOUT_STYLE}

You are writing ONE lesson of the handout. You are given the full plan of the handout so that your lesson fits with the others: do not repeat what an earlier lesson already teaches, and do not assume knowledge from a later one.

The lesson must contain, in this order:

1. keyTerms - one row for every term this lesson introduces. The meaning must be in plain words, not a restatement of the notes' sentence.

2. blocks - the body, following the notes' own order of sub-topics so a student reading both documents side by side can follow along. Use:
   - "prose" for a short explanatory paragraph
   - "bullets" for a list, where EVERY bullet starts with a bold lead-in written as **Lead-in:** rest of the point
   - "steps" for ANY procedure - every installation, configuration or workflow. Number them; never describe a procedure in prose.
   - "table" for a two-column reference table such as Key term / meaning
   - "compare" for a Feature | A | B table, whenever the notes contrast two or more things. Find these even when the notes present them as loose prose: if the notes say "ES5 uses var but ES6 uses let", that is a comparison table.
   - "code" for a command, listing or formula, which renders in a monospaced shaded box.

3. callouts - at least one, and more where they help:
   - "tip" with the label "Exam tip" for traps, commonly confused terms, and EVERY defect in the notes that falls in this lesson. Give the correction and the defensible answer.
   - "remember" for a definition, default or number that must be memorised.
   - "trap" for a pair of terms students constantly confuse.

4. workedExample - a full, correct, commented solution. Base it on the notes' own practical activities and scenarios. It must include the task restated, how to think about it, the steps, what the correct result looks like, why each decision is right, and the common mistakes to avoid. If the lesson is not practical in nature, the worked answer is a full written model answer instead, and still follows the same shape.

Keep the lesson to the sub-topics listed for it in the plan. Nothing more, nothing less.`;

const EXTRAS_SYSTEM = `${HANDOUT_STYLE}

You are writing the end-of-unit revision material for one unit of a handout.

- diagrams: four to six of the most exam-relevant processes, flows or structures in this unit. Choose the ones that carry the most marks, not the most decorative. Draw each with plain ASCII in a box, using only + - | > < v ^ and letters - no unicode box-drawing characters, because they must render in any font. Then give numbered steps on how to read it, and a paragraph on how to redraw it in an exam and what the marker looks for.
- memorySheet: about 20 rows for a normal unit, more for a large one. Definitions, defaults and numbers, differences between confusable pairs, acronyms expanded, and the specific facts examiners return to. The right-hand column is one line.
- revision: 5 multiple choice with exactly 4 choices each, 5 true/false, and 5 scenario questions. Scenario questions are set in a realistic local workplace and test judgement, not recall. Give a one-line reason for every answer. Then work through the notes' OWN end-of-unit exercises question by question under extraPractice, with a short reason for each. Where the notes' own answer is wrong or ambiguous, say so and give the defensible answer.
- practical: restate the practical scenario from the notes. If the notes have none, write one in exactly the same style and register. Then the numbered steps, the assessor checklist, and the report checklist. Every assessor point must be specific and testable.
- studyTips: 12 to 15 one-line bullets in the form "When you see X, think Y". The LAST bullet must always say that in practical work, explaining WHY earns marks as well as doing the thing, and give a concrete example of the difference. This is the single most valuable instruction in the handout, because most students lose marks by answering what and stopping.`;

const BLOCK_KINDS = new Set(['prose', 'bullets', 'steps', 'table', 'compare']);
const CALLOUT_KINDS = new Set(['tip', 'remember', 'trap', 'manual_note']);
const CALLOUT_LABELS = { tip: 'Exam tip', remember: 'Remember', trap: 'Trap', manual_note: 'Manual note' };

const count = (name, fallback) => {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
};

// Caps: a runaway plan must not quietly cost a hundred AI calls.
const MAX_LESSONS = count('HANDOUT_MAX_LESSONS', 40);
const MAX_CALLS = count('HANDOUT_MAX_CALLS', 120);
const CONCURRENCY = Math.min(6, count('HANDOUT_CONCURRENCY', 3));

// A planning pass only returns titles, so it can take a much bigger slice than a normal
// generation. Lessons and extras want more output room than notes do, but never more than the
// provider can actually emit: maxOut is 8,192 on a small local model and 32,000 on the hosted ones.
const planChunkSize = () => Math.max(resolve().chunk, 40_000);
const passBudget = (floor) => Math.max(4000, Math.min(floor, resolve().maxOut || floor));

const str = (v) => (typeof v === 'string' ? v.trim() : v === undefined || v === null ? '' : String(v).trim());
const strList = (v) => (Array.isArray(v) ? v.map(str).filter(Boolean) : []);
const objList = (v) => (Array.isArray(v) ? v.filter((x) => x && typeof x === 'object' && !Array.isArray(x)) : []);

// ---------------------------------------------------------------- pass 1: the plan
export function cleanHandoutPlan(result, { allowEmpty = false } = {}) {
  const units = objList(result?.units).map((unit, ui) => {
    const number = str(unit.number) || String(ui + 1);
    const lessons = objList(unit.lessons).map((lesson, li) => ({
      number: str(lesson.number) || `${number}.${li + 1}`,
      title: str(lesson.title) || 'Lesson',
      indicativeContent: str(lesson.indicativeContent),
      subtopics: strList(lesson.subtopics),
      sourceMarker: str(lesson.sourceMarker),
    }));
    return {
      number,
      title: str(unit.title) || `Unit ${number}`,
      learningOutcome: str(unit.learningOutcome),
      duration: str(unit.duration),
      indicativeContents: strList(unit.indicativeContents),
      objectives: strList(unit.objectives),
      lessons,
    };
  }).filter((unit) => unit.lessons.length);

  if (!units.length && !allowEmpty) throw httpError(502, 'The AI returned no usable handout plan. Try again.');

  const errorsInSource = objList(result?.errorsInSource).map((e) => ({
    where: str(e.where), says: str(e.says), correction: str(e.correction),
  })).filter((e) => e.where || e.says);

  return {
    moduleName: str(result?.moduleName), moduleCode: str(result?.moduleCode),
    level: str(result?.level), trade: str(result?.trade),
    units, errorsInSource,
  };
}

// A long manual is planned in slices. Merging them is still coherent: units keep their number,
// lessons keep theirs, and a unit that straddles two slices is joined into one.
export function mergeHandoutPlans(plans) {
  const meta = {};
  for (const key of ['moduleName', 'moduleCode', 'level', 'trade']) {
    meta[key] = plans.map((plan) => plan[key]).find(Boolean) || '';
  }
  const units = new Map();
  for (const plan of plans) {
    for (const unit of plan.units) {
      const key = unit.number || unit.title;
      const existing = units.get(key);
      if (!existing) {
        units.set(key, {
          ...unit,
          lessons: [...(unit.lessons || [])],
          indicativeContents: [...(unit.indicativeContents || [])],
          objectives: [...(unit.objectives || [])],
        });
        continue;
      }
      existing.title = existing.title || unit.title;
      existing.learningOutcome = existing.learningOutcome || unit.learningOutcome;
      existing.duration = existing.duration || unit.duration;
      existing.indicativeContents = [...new Set([...existing.indicativeContents, ...(unit.indicativeContents || [])])];
      existing.objectives = [...new Set([...existing.objectives, ...(unit.objectives || [])])];
      const seen = new Set(existing.lessons.map((l) => l.number));
      for (const lesson of unit.lessons || []) {
        if (seen.has(lesson.number)) continue;
        existing.lessons.push(lesson);
        seen.add(lesson.number);
      }
    }
  }
  const errorsInSource = [];
  const seenError = new Set();
  for (const plan of plans) {
    for (const error of plan.errorsInSource) {
      const key = `${error.where}|${error.says}`;
      if (seenError.has(key)) continue;
      seenError.add(key);
      errorsInSource.push(error);
    }
  }
  return { ...meta, units: [...units.values()], errorsInSource };
}

export async function planHandout({ text, title, level }) {
  await ensureReady();
  const size = planChunkSize();
  const parts = text.length <= size ? [text] : splitText(text, size);
  const plans = [];
  for (let i = 0; i < parts.length; i++) {
    const where = parts.length > 1
      ? `This is part ${i + 1} of ${parts.length} of the manual. Plan only the units and lessons that appear in this part.\n`
      : '';
    // Retried like the lessons are: a free terminal tool drops the odd connection, and losing the
    // whole handout to one dropped call on a manual this size is not an acceptable trade.
    const results = await perPart(parts[i], (chunk) => withRetry(() => callStructured({
      tool: handoutPlanTool,
      maxTokens: passBudget(8000),
      system: PLAN_SYSTEM,
      user: `${title ? `Module name given by the user (verify it against the notes): ${title}\n` : ''}${level ? `Level given by the user (verify): ${level}\n` : ''}${where}Find the structure of this manual.\n\n${wrapNotes(chunk)}`,
    })));
    for (const result of results) plans.push(cleanHandoutPlan(result, { allowEmpty: parts.length > 1 }));
  }
  return mergeHandoutPlans(plans);
}

// ---------------------------------------------------------------- pass 2: one lesson
export function cleanHandoutLesson(result, fallback = {}) {
  const keyTerms = objList(result?.keyTerms).map((term) => ({ term: str(term.term), meaning: str(term.meaning) }))
    .filter((term) => term.term && term.meaning);

  const blocks = objList(result?.blocks).filter((block) => BLOCK_KINDS.has(str(block.kind))).map((block) => {
    const kind = str(block.kind);
    const out = { kind };
    const heading = str(block.heading);
    if (heading) out.heading = heading;
    if (kind === 'prose') out.text = str(block.text);
    if (kind === 'bullets' || kind === 'steps') out.items = strList(block.items);
    if (kind === 'table' || kind === 'compare') {
      out.headers = strList(block.headers);
      out.rows = (Array.isArray(block.rows) ? block.rows : []).filter(Array.isArray).map((row) => row.map(str)).filter((row) => row.length);
    }
    const code = str(block.code);
    if (code) out.code = code;
    return out;
  }).filter((block) => block.items?.length || block.headers?.length || block.text || block.code);

  const callouts = objList(result?.callouts).filter((callout) => CALLOUT_KINDS.has(str(callout.kind))).map((callout) => {
    const kind = str(callout.kind);
    return { kind, label: str(callout.label) || CALLOUT_LABELS[kind], text: str(callout.text) };
  }).filter((callout) => callout.text);

  let workedExample = null;
  const example = result?.workedExample;
  if (example && typeof example === 'object' && !Array.isArray(example)) {
    const steps = strList(example.steps);
    const candidate = {
      title: str(example.title) || 'Worked example',
      task: str(example.task),
      thinking: str(example.thinking),
      steps,
      code: str(example.code),
      expected: str(example.expected),
      why: str(example.why),
      mistakes: strList(example.mistakes),
    };
    if (candidate.task || steps.length) workedExample = candidate;
  }

  if (!blocks.length && !keyTerms.length) {
    throw httpError(502, 'The AI returned no usable lesson content. Try again.');
  }

  return {
    number: str(result?.number) || str(fallback.number),
    title: str(result?.title) || str(fallback.title) || 'Lesson',
    keyTerms, blocks, callouts, workedExample,
  };
}

export async function buildHandoutLesson({ plan, lesson, sourceText }) {
  const planSummary = plan.units.map((unit) => ({
    unit: `${unit.number}. ${unit.title}`,
    indicativeContents: unit.indicativeContents,
    lessons: unit.lessons.map((l) => `${l.number}. ${l.title}`),
  }));
  const result = await callStructured({
    tool: handoutLessonTool,
    maxTokens: passBudget(16000),
    system: LESSON_SYSTEM,
    user: `The full plan of the handout, so your lesson fits with the others:
${JSON.stringify(planSummary, null, 1)}

Now write lesson ${lesson.number}: ${lesson.title}
Indicative content it covers: ${lesson.indicativeContent || lesson.title}
Sub-topics it must cover, in this order: ${lesson.subtopics.join(' | ') || '(as the notes give them)'}
Module: ${plan.moduleName}${plan.moduleCode ? ` (${plan.moduleCode})` : ''}${plan.level ? `, ${plan.level}` : ''}${plan.trade ? `, ${plan.trade}` : ''}

The source notes for this lesson:
${wrapNotes(sourceText)}`,
  });
  return cleanHandoutLesson(result, lesson);
}

// ---------------------------------------------------------------- pass 3: unit extras
export function cleanHandoutExtras(result) {
  const diagrams = objList(result?.diagrams).map((diagram) => ({
    title: str(diagram.title) || 'Diagram',
    ascii: str(diagram.ascii),
    readSteps: strList(diagram.readSteps),
    redraw: str(diagram.redraw),
  })).filter((diagram) => diagram.ascii);

  const memorySheet = objList(result?.memorySheet).map((row) => ({ remember: str(row.remember), answer: str(row.answer) }))
    .filter((row) => row.remember && row.answer);

  const revisionIn = result?.revision && typeof result.revision === 'object' ? result.revision : {};
  const revision = {
    mcq: objList(revisionIn.mcq).map((item) => ({
      q: str(item.q), choices: strList(item.choices), answer: str(item.answer).toUpperCase().slice(0, 1), reason: str(item.reason),
    })).filter((item) => item.q && item.choices.length),
    trueFalse: objList(revisionIn.trueFalse).map((item) => ({
      statement: str(item.statement), answer: str(item.answer), reason: str(item.reason),
    })).filter((item) => item.statement),
    scenario: objList(revisionIn.scenario).map((item) => ({ q: str(item.q), answer: str(item.answer), reason: str(item.reason) }))
      .filter((item) => item.q),
    extraPractice: objList(revisionIn.extraPractice).map((item) => ({ reference: str(item.reference), answer: str(item.answer), reason: str(item.reason) }))
      .filter((item) => item.reference || item.answer),
  };

  const practicalIn = result?.practical && typeof result.practical === 'object' ? result.practical : {};
  const practical = {
    scenario: str(practicalIn.scenario),
    steps: strList(practicalIn.steps),
    assessor: strList(practicalIn.assessor),
    report: strList(practicalIn.report),
  };

  const studyTips = strList(result?.studyTips);

  const empty = !diagrams.length && !memorySheet.length && !studyTips.length
    && !revision.mcq.length && !revision.trueFalse.length && !revision.scenario.length
    && !practical.steps.length && !practical.assessor.length;
  if (empty) throw httpError(502, 'The AI returned no usable end-of-unit material. Try again.');

  return { unitNumber: str(result?.unitNumber), diagrams, memorySheet, revision, practical, studyTips };
}

export async function buildHandoutExtras({ plan, unit, sourceText }) {
  const result = await callStructured({
    tool: handoutExtrasTool,
    maxTokens: passBudget(24000),
    system: EXTRAS_SYSTEM,
    user: `Unit ${unit.number}: ${unit.title}
Learning outcome: ${unit.learningOutcome || unit.title}
Indicative contents in this unit: ${unit.indicativeContents.join(' | ') || '(as the notes list them)'}
Lessons in this unit: ${unit.lessons.map((l) => `${l.number}. ${l.title}`).join('; ')}
Module: ${plan.moduleName}${plan.moduleCode ? ` (${plan.moduleCode})` : ''}${plan.level ? `, ${plan.level}` : ''}${plan.trade ? `, ${plan.trade}` : ''}
Defects already found in the source for this unit, which must appear as Exam tips where they belong: ${JSON.stringify((plan.errorsInSource || []).slice(0, 30))}

Write the end-of-unit material for this unit.

The source notes for this unit:
${wrapNotes(sourceText)}`,
  });
  return cleanHandoutExtras(result);
}

// ---------------------------------------------------------------- pass 4: assemble
// Finds each lesson's own slice of the manual, so a lesson is written from its own text and not
// from the whole manual. A marker the model paraphrased cannot be trusted: falling back to the
// wrong text would produce a confidently wrong lesson, so gaps take the text between the nearest
// markers that were found, and the caller is told how many markers were lost.
export function locateLessonSlices(text, plan) {
  const haystack = text.toLowerCase();
  const flat = [];
  for (const unit of plan.units) for (const lesson of unit.lessons) flat.push({ unit, lesson });

  const starts = flat.map(({ lesson }) => {
    const marker = str(lesson.sourceMarker).toLowerCase();
    if (marker.length < 8) return -1;
    return haystack.indexOf(marker);
  });

  const hardCap = Math.max(resolve().chunk, 30_000);
  const slices = new Map();
  let located = 0;
  for (let i = 0; i < flat.length; i++) {
    if (starts[i] >= 0) located += 1;
    const next = starts.slice(i + 1).find((start) => start >= 0);
    const from = starts[i] >= 0 ? starts[i] : (starts.slice(0, i).filter((start) => start >= 0).pop() ?? 0);
    const to = next !== undefined ? next : Math.min(text.length, from + hardCap);
    slices.set(flat[i].lesson, text.slice(from, Math.max(from, to)).slice(0, hardCap));
  }
  return { slices, located, total: flat.length, lessons: flat };
}

const unitSourceText = (unit, slices) => {
  const cap = Math.max(resolve().chunk, 60_000);
  const parts = unit.lessons.map((lesson) => slices.get(lesson) || '').filter(Boolean);
  const joined = parts.join('\n\n');
  if (joined) return joined.slice(0, cap);
  // Nothing was located for this unit: give the model the start of the manual rather than nothing.
  return [...slices.values()].join('\n\n').slice(0, cap);
};

async function withRetry(run, attempts = 1) {
  let lastError;
  for (let attempt = 0; attempt <= attempts; attempt++) {
    try {
      return await run();
    } catch (error) {
      lastError = error;
      // A missing key or an exhausted quota will not fix itself on a retry.
      if (error.status && error.status < 500 && error.status !== 429) throw error;
    }
  }
  throw lastError;
}

/**
 * Build a study handout from a whole manual.
 * @param {{text: string, title?: string, level?: string, units?: string[],
 *   includeRevision?: boolean, includePractical?: boolean, onProgress?: (step: object) => void}} input
 */
export async function generateHandout({ text, title, level, units: wantedUnits, includeRevision = true, includePractical = true, onProgress, shouldCancel }) {
  if (DEMO) return { ...demoHandout(), demo: true };
  await ensureReady();

  const progress = [];
function checkCancel() { if (typeof shouldCancel === 'function' && shouldCancel()) throw httpError(499, 'Handout generation cancelled.'); }
  const warnings = [];
  const report = (step) => {
    const entry = { ...step, at: new Date().toISOString() };
    progress.push(entry);
    try { onProgress?.(entry); } catch { /* a broken progress handler must not stop the build */ }
  };

  // PASS 1 - the skeleton.
  report({ pass: 1, message: 'Reading the manual and planning the units and lessons' });
  const plan = await planHandout({ text, title, level });
  const planned = plan.units.reduce((sum, unit) => sum + unit.lessons.length, 0);
  if (!planned) throw httpError(502, 'The AI planned no lessons. Try again.');

  // Narrow to the units the user asked for before paying for any lessons or extras.
  const selected = (Array.isArray(wantedUnits) ? wantedUnits : []).map((u) => String(u).trim()).filter(Boolean);
  if (selected.length) {
    const keep = plan.units.filter((unit) => selected.includes(String(unit.number)));
    if (!keep.length) {
      throw httpError(400, `This manual has no unit ${selected.join(', ')}. It has: ${plan.units.map((u) => `${u.number} (${u.title})`).join(', ')}.`);
    }
    plan.units = keep;
  }
  const wanted = plan.units.reduce((sum, unit) => sum + unit.lessons.length, 0);

  if (wanted > MAX_LESSONS) {
    throw httpError(413, `This manual plans ${wanted} lessons, more than the ${MAX_LESSONS} this server will build in one handout. Build it one unit at a time, or raise HANDOUT_MAX_LESSONS.`);
  }
  const estimatedCalls = plan.units.length * 2 + wanted;
  if (estimatedCalls > MAX_CALLS) {
    throw httpError(413, `This handout would need about ${estimatedCalls} AI requests, more than the ${MAX_CALLS} this server allows. Build it one unit at a time, or raise HANDOUT_MAX_CALLS.`);
  }
  report({ pass: 1, done: 1, total: 1, units: plan.units.length, lessons: wanted, message: `Planned ${plan.units.length} unit(s) and ${wanted} lesson(s)` });

  // Locate each lesson's own text before writing anything.
  const { slices, located, total, lessons: flat } = locateLessonSlices(text, plan);
  if (located < total / 2) {
    throw httpError(422, `Only ${located} of ${total} lessons could be matched to the notes, so the handout cannot be built reliably. The notes need one clear heading per lesson, or build the handout one unit at a time.`);
  }
  if (located < total) {
    warnings.push(`${total - located} of ${total} lessons could not be matched to their text by heading, so the nearest surrounding text was used for them. Check those lessons.`);
  }

  // PASS 2 - the lessons, a few at a time. Lessons are independent, so they can be built in
  // parallel; results are put back in plan order so the document keeps the manual's sequence.
  report({ pass: 2, done: 0, total: flat.length, message: `Writing ${flat.length} lessons` });
  const built = new Array(flat.length);
  const queue = flat.map((item, index) => ({ item, index }));
  let finished = 0;
  const workers = Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
    while (queue.length) {
      checkCancel();
      const { item, index } = queue.shift();
      const sourceText = slices.get(item.lesson) || text.slice(0, 30_000);
      try {
        built[index] = await withRetry(() => buildHandoutLesson({ plan, lesson: item.lesson, sourceText }));
      } catch (error) {
        // Keep going: one unusable lesson must not throw away the other thirty.
        warnings.push(`Lesson ${item.lesson.number} (${item.lesson.title}) could not be written: ${error.message}`);
        built[index] = { number: item.lesson.number, title: item.lesson.title, keyTerms: [], blocks: [], callouts: [], workedExample: null, failed: true };
      }
      finished += 1;
      report({ pass: 2, done: finished, total: flat.length, lesson: item.lesson.number, message: `Wrote lesson ${finished} of ${flat.length}` });
    }
  });
  await Promise.all(workers);

  // PASS 3 - the end-of-unit material.
  const extras = [];
  for (let i = 0; i < plan.units.length; i++) {
    const unit = plan.units[i];
    report({ pass: 3, done: i, total: plan.units.length, message: `Writing the end-of-unit material for Unit ${unit.number}` });
    try {
      extras.push(await withRetry(() => buildHandoutExtras({ plan, unit, sourceText: unitSourceText(unit, slices) })));
    } catch (error) {
      warnings.push(`The end-of-unit material for Unit ${unit.number} could not be written: ${error.message}`);
      extras.push({ unitNumber: unit.number, diagrams: [], memorySheet: [], revision: {}, practical: {}, studyTips: [] });
    }
    report({ pass: 3, done: i + 1, total: plan.units.length, message: `Finished Unit ${unit.number}` });
  }

  // PASS 4 - assemble, in plan order.
  const units = plan.units.map((unit, ui) => {
    const own = flat.map((item, index) => ({ item, index })).filter(({ item }) => item.unit === unit).map(({ index }) => built[index]);
    const extra = extras[ui] || {};
    return {
      number: unit.number,
      title: unit.title,
      learningOutcome: unit.learningOutcome,
      duration: unit.duration,
      indicativeContents: unit.indicativeContents,
      objectives: unit.objectives,
      lessons: own,
      diagrams: extra.diagrams || [],
      memorySheet: extra.memorySheet || [],
      revision: includeRevision ? (extra.revision || {}) : {},
      practical: includePractical ? (extra.practical || {}) : {},
      studyTips: extra.studyTips || [],
    };
  });

  const handout = {
    title: str(title) || plan.moduleName || 'Study handout',
    moduleName: plan.moduleName,
    moduleCode: plan.moduleCode,
    level: plan.level || str(level),
    trade: plan.trade,
    units,
    errorsInSource: plan.errorsInSource,
    progress,
  };
  handout.warnings = [...warnings, ...validateHandout(handout)];
  handout.stats = handoutStats(handout);
  handout.estimatedPages = estimateHandoutPages(handout);
  return handout;
}

/** The shape of a handout, for the MCP format guide and for agents writing one by hand. */
export const HANDOUT_GUIDE = `A study handout is JSON: { "title", "moduleName", "moduleCode", "level", "trade", "units": [ unit ] }.
unit = { "number", "title", "learningOutcome", "duration", "indicativeContents": [string], "objectives": [string],
         "lessons": [ lesson ], "diagrams": [ diagram ], "memorySheet": [ { "remember", "answer" } ],
         "revision": { "mcq", "trueFalse", "scenario", "extraPractice" }, "practical": { "scenario", "steps", "assessor", "report" },
         "studyTips": [string] }
lesson = { "number", "title", "keyTerms": [ { "term", "meaning" } ], "blocks": [ block ], "callouts": [ callout ],
           "workedExample": { "title", "task", "thinking", "steps": [string], "code", "expected", "why", "mistakes": [string] } }
block = { "kind": "prose"|"bullets"|"steps"|"table"|"compare", "heading", "text", "items": [string], "headers": [string], "rows": [[string]], "code" }
callout = { "kind": "tip"|"remember"|"trap", "label", "text" }
diagram = { "title", "ascii", "readSteps": [string], "redraw" }

Rules the checker enforces: every unit has at least one lesson; every lesson has key terms, blocks and a worked example;
table and compare blocks must have headers and every row must match the header count; a compare block needs at least 3 columns;
a steps block needs at least 2 steps; revision has exactly 5 mcq (4 choices each, answer is a letter that exists), 5 true/false and
5 scenario questions; studyTips has 12 to 15 entries and the last one is about explaining why in practical work;
memorySheet has at least 15 rows; every unit has at least 3 diagrams; the practical task has steps and an assessor checklist.
Bold lead-ins inside bullets are written as **Lead-in:** text. Rewrite everything in your own words; never copy the notes.`;

