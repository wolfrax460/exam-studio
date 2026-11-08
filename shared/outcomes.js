export const MAX_OUTCOMES = 10;

const BULLET = /^[\s•\-–—*]+/;
const LO_PHRASE = /^(?:learning\s+outcomes?|outcomes?)\b\s*\d{0,2}\s*[:.-]?\s*(.+)$/i;
const LO_ID = /^lo\s*\.?\s*\d{1,2}\s*[:).-]?\s*(.+)$/i;
const HEADING = /^(?:unit|topic|chapter|module|section)\s*[\d.]*\s*[:.-]?\s*(.+)$/i;
const NUMBERED = /^\d+(?:\.\d+)*\s*[:.)-]?\s*(.+)$/;
const BARE_NUMBERED = /^\d+(?:\.\d+)*\s+(\S.*)$/;

function tidy(line) {
  return String(line || '')
    .replace(BULLET, '')
    .replace(/\s+/g, ' ')
    .replace(/[.;:,]+$/, '')
    .trim();
}

// An outcome is a short, sentence-shaped thing a student can do. Anything longer is a paragraph,
// anything shorter is a page number or a stray heading.
function usable(value) {
  const text = tidy(value);
  if (text.length < 8 || text.length > 160) return '';
  if (!/[a-z]/i.test(text)) return '';
  return text;
}

/**
 * Suggest learning outcomes from course notes without calling a model.
 *
 * Explicit markers win ("Learning outcome 1:", "LO2 ...", "Unit 4: ...", "1.2 ..."), because a
 * document that names its outcomes should have those names used. Only when nothing is marked does
 * it fall back to sentence-shaped lines, which is the case for prose pasted from a PDF.
 *
 * Returns [] when the text has nothing usable, so the caller can decide whether an AI call is worth
 * spending.
 */
export function suggestOutcomes(text, { limit = MAX_OUTCOMES } = {}) {
  const source = String(text || '');
  if (!source.trim()) return [];

  const lines = source.split(/\r?\n/);
  const found = [];

  for (const line of lines) {
    const match = line.match(LO_PHRASE) || line.match(LO_ID) || line.match(HEADING)
      || line.match(NUMBERED) || line.match(BARE_NUMBERED);
    if (!match) continue;
    const value = usable(match[1]);
    if (value) found.push(value);
  }

  if (found.length === 0) {
    for (const sentence of source.split(/[.\n]+/)) {
      const value = usable(sentence);
      if (value) found.push(value);
    }
  }

  const seen = new Set();
  const unique = [];
  for (const value of found) {
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(value);
    if (unique.length >= limit) break;
  }
  return unique;
}
