import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mammoth from 'mammoth';
import pdf from 'pdf-parse/lib/pdf-parse.js';
import { ocrPdf } from './extract.js';

const here = path.dirname(fileURLToPath(import.meta.url));
export const NOTES_DIR = path.resolve(here, '..', '..', 'notes');
const CACHE_FILE = path.resolve(here, '..', 'data', 'notes-cache.json');

function readCache() {
  try { return JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8')); } catch { return { files: {} }; }
}
function writeCache(cache) {
  try {
    fs.mkdirSync(path.dirname(CACHE_FILE), { recursive: true });
    fs.writeFileSync(CACHE_FILE, JSON.stringify(cache));
  } catch { /* ignore cache write errors */ }
}

const ALLOWED_EXT = ['.pdf', '.docx', '.txt', '.md'];
function extOf(name) { return path.extname(name).toLowerCase(); }

function cleanTitleSegment(value) {
  return String(value || '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function detectModuleCode(name) {
  const m = String(name).match(/\b([A-Z]{2,7}\d{3,4})\b/);
  return m ? m[1] : '';
}

function detectModuleTitle(name, code) {
  let s = path.basename(name, path.extname(name));
  // Strip leading numeric upload prefixes (e.g. "1791878979963 ") and underscores.
  s = s.replace(/^\d+[\s_]+/, '');
  if (code) s = s.replace(code, '');
  s = s.replace(/TeM\b/gi, '');
  s = cleanTitleSegment(s);
  return s || (code ? code : path.basename(name, path.extname(name)));
}

function detectUnits(pages) {
  const headings = [];
  pages.forEach((page, index) => {
    (String(page || '').split(/\r?\n/)).forEach((line) => {
      const text = line.trim();
      if (text.length < 4 || text.length > 120) return;
      if (/^(unit|lesson|module|chapter|learning outcome|LO)\b/i.test(text) || /\bLO\s*[0-9]/i.test(text)) {
        // avoid obvious whole-sentence false positives
        if (text.split(/\s+/).length > 12) return;
        headings.push({ title: text, page: index + 1 });
      }
    });
  });
  if (!headings.length) {
    return [{ title: 'Full unit', pageStart: 1, pageEnd: Math.max(1, pages.length) }];
  }
  return headings.map((h, i) => ({
    title: h.title,
    pageStart: h.page,
    pageEnd: i < headings.length - 1 ? Math.max(h.page, headings[i + 1].page - 1) : pages.length,
  }));
}

async function parseFile(fullPath, name) {
  const buffer = fs.readFileSync(fullPath);
  const ext = extOf(name);
  let pages = [];
  let charCount = 0;
  let numPages = null;

  if (ext === '.pdf') {
    const r = await pdf(buffer);
    let raw = r.text || '';
    numPages = r.numpages || raw.split('\f').length || 1;
    let pagesTry = raw.split('\f').map((p) => p.trim()).filter((p) => p.length);
    if (pagesTry.join('').trim().length < 50) {
      const ocr = await ocrPdf(buffer);
      if (ocr) {
        raw = ocr;
        pagesTry = [raw];
      }
    }
    pages = pagesTry.length ? pagesTry : [raw.trim()];
  } else if (ext === '.docx') {
    const r = await mammoth.extractRawText({ buffer });
    const text = r.value || '';
    pages = [text];
    charCount = text.length;
  } else {
    const text = buffer.toString('utf8');
    pages = [text];
    charCount = text.length;
  }

  if (ext === '.pdf' || ext === '.docx' || ext === '.txt' || ext === '.md') {
    const text = pages.join('\n');
    charCount = charCount || text.length;
  }

  const code = detectModuleCode(name);
  const title = detectModuleTitle(name, code);
  const units = detectUnits(pages);

  return {
    name,
    ext,
    size: fs.statSync(fullPath).size,
    mtimeMs: fs.statSync(fullPath).mtimeMs,
    numPages,
    charCount,
    moduleCode: code,
    moduleTitle: title,
    units,
    scanned: ext === '.pdf' && charCount < 50,
    text: pages.join('\f'),
  };
}

export async function scanNotes() {
  if (!fs.existsSync(NOTES_DIR)) return [];
  const statsList = [];
  const entries = fs.readdirSync(NOTES_DIR, { withFileTypes: true });
  const cache = readCache();
  let dirty = false;

  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const name = entry.name;
    const ext = extOf(name);
    if (!ALLOWED_EXT.includes(ext)) continue;
    const fullPath = path.join(NOTES_DIR, name);
    const st = fs.statSync(fullPath);
    const key = name;
    const cached = cache.files && cache.files[key];

    if (cached && cached.mtimeMs === st.mtimeMs && cached.size === st.size) {
      statsList.push({
        name, ext, size: st.size, mtimeMs: st.mtimeMs,
        numPages: cached.numPages, charCount: cached.charCount,
        moduleCode: cached.moduleCode, moduleTitle: cached.moduleTitle,
        units: cached.units, scanned: cached.scanned,
      });
      continue;
    }

    try {
      const parsed = await parseFile(fullPath, name);
      cache.files = cache.files || {};
      cache.files[key] = parsed;
      dirty = true;
      statsList.push({
        name, ext, size: parsed.size, mtimeMs: parsed.mtimeMs,
        numPages: parsed.numPages, charCount: parsed.charCount,
        moduleCode: parsed.moduleCode, moduleTitle: parsed.moduleTitle,
        units: parsed.units, scanned: parsed.scanned,
      });
    } catch (e) {
      statsList.push({ name, ext, size: st.size, mtimeMs: st.mtimeMs, error: String(e && e.message ? e.message : e) });
    }
  }

  if (dirty) writeCache(cache);
  return statsList;
}

export async function loadNote(name, selected = []) {
  if (!name || name.includes('..') || path.isAbsolute(name)) throw new Error('invalid file name');
  const cache = readCache();
  const fullPath = path.join(NOTES_DIR, name);
  if (!fs.existsSync(fullPath)) throw new Error('file not found');
  const st = fs.statSync(fullPath);
  const cached = cache.files && cache.files[name];
  let file = cached && cached.mtimeMs === st.mtimeMs && cached.size === st.size
    ? cached
    : null;
  if (!file) {
    file = await parseFile(fullPath, name);
    cache.files = cache.files || {};
    cache.files[name] = file;
    writeCache(cache);
  }
  if (Array.isArray(selected) && selected.length && Array.isArray(file.units) && file.units.length) {
    const selectedSet = new Set(selected);
    const pages = (file.text || '').split('\f');
    const pickedPages = file.units.filter((_, i) => selectedSet.has(i))
      .map((u) => pages.slice(Math.max(0, (u.pageStart || 1) - 1), u.pageEnd || u.pageStart || 1))
      .flat();
    if (pickedPages.length) {
      file = { ...file, text: pickedPages.join('\f') };
    }
  }
  return file;
}
