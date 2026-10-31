import path from 'node:path';
import mammoth from 'mammoth';
import pdf from 'pdf-parse/lib/pdf-parse.js';
import { httpError } from './errors.js';

export const ALLOWED = ['.pdf', '.docx', '.txt', '.md'];

// Byte-order marks.
const BOM_UTF8 = Buffer.from([0xEF, 0xBB, 0xBF]);
const BOM_UTF16_LE = Buffer.from([0xFF, 0xFE]);
const BOM_UTF16_BE = Buffer.from([0xFE, 0xFF]);

// Windows-1252 bytes (0x80-0x9F) that differ from ISO-8859-1/latin1.
const CP1252 = {
  0x80: '\u20AC', 0x82: '\u201A', 0x83: '\u0192', 0x84: '\u201E', 0x85: '\u2026',
  0x86: '\u2020', 0x87: '\u2021', 0x88: '\u02C6', 0x89: '\u2030', 0x8A: '\u2039',
  0x8B: '\u0152', 0x8E: '\u017D', 0x91: '\u2018', 0x92: '\u2019', 0x93: '\u201C',
  0x94: '\u201D', 0x95: '\u2022', 0x96: '\u2013', 0x97: '\u2014', 0x98: '\u02DC',
  0x99: '\u2122', 0x9A: '\u203A', 0x9B: '\u0153', 0x9E: '\u017E', 0x9F: '\u0178',
};

/**
 * Decode a buffer to a UTF-8 string, detecting UTF-8 / UTF-16 (LE/BE) BOMs and
 * Windows-1252 fallback. Strips the BOM and normalises to NFC so dashes and
 * accents (Kinyarwanda / French) never turn into â□□ mojibake.
 */
export function decodeBuffer(buffer) {
  let text;
  if (buffer.length >= 3 && Buffer.compare(buffer.subarray(0, 3), BOM_UTF8) === 0) {
    text = buffer.subarray(3).toString('utf8');
  } else if (buffer.length >= 2 && Buffer.compare(buffer.subarray(0, 2), BOM_UTF16_LE) === 0) {
    text = buffer.subarray(2).toString('utf16le');
  } else if (buffer.length >= 2 && Buffer.compare(buffer.subarray(0, 2), BOM_UTF16_BE) === 0) {
    text = buffer.subarray(2).toString('utf16be');
  } else {
    // Try UTF-8 first; if it fails, fall back to Windows-1252.
    try {
      text = buffer.toString('utf8');
      // Reject if the buffer looks like Windows-1252 (high bytes that are invalid UTF-8).
      const check = Buffer.from(text, 'utf8');
      if (check.length !== buffer.length && /[\x80-\xFF]/.test(buffer.toString('latin1'))) {
        text = decodeCp1252(buffer);
      }
    } catch {
      text = decodeCp1252(buffer);
    }
  }
  return text.normalize('NFC');
}

function decodeCp1252(buffer) {
  let out = '';
  for (let i = 0; i < buffer.length; i++) {
    const b = buffer[i];
    if (b >= 0x80 && b <= 0x9F && CP1252[b] !== undefined) {
      out += CP1252[b];
    } else if (b >= 0x80) {
      // Latin1-compatible range: 0xA0-0xFF maps directly to U+00A0-U+00FF
      out += String.fromCharCode(b);
    } else {
      out += String.fromCharCode(b);
    }
  }
  return out;
}

// Render every page of a PDF to text with OCR, for scanned PDFs that have no text layer.
// Returns '' on failure so the caller can decide what to do.
export async function ocrPdf(buffer) {
  const maxPages = Number(process.env.OCR_MAX_PAGES) || 50;
  try {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const { createCanvas } = await import('@napi-rs/canvas');
    const { createWorker } = await import('tesseract.js');
    const loadingTask = pdfjs.getDocument({ data: new Uint8Array(buffer) });
    const doc = await loadingTask.promise;
    const worker = await createWorker('eng');
    try {
      const pieces = [];
      const pages = Math.min(doc.numPages, maxPages);
      for (let pageNum = 1; pageNum <= pages; pageNum++) {
        const page = await doc.getPage(pageNum);
        const viewport = page.getViewport({ scale: 2 });
        const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
        const ctx = canvas.getContext('2d');
        await page.render({ canvasContext: ctx, viewport }).promise;
        const png = canvas.toBuffer('image/png');
        const { data } = await worker.recognize(png);
        if (data?.text) pieces.push(data.text);
      }
      return pieces.join('\n\n').trim();
    } finally {
      await worker.terminate().catch(() => {});
    }
  } catch {
    return '';
  }
}

export async function extractText(file) {
  const ext = path.extname(file.originalname || '').toLowerCase();
  if (!ALLOWED.includes(ext)) throw httpError(400, `Unsupported file type. Use ${ALLOWED.join(', ')}.`);
  let text = '';
  try {
    if (ext === '.pdf') text = (await pdf(file.buffer)).text;
    else if (ext === '.docx') text = (await mammoth.extractRawText({ buffer: file.buffer })).value;
    else text = decodeBuffer(file.buffer);
  } catch {
    // A scanned PDF's missing or malformed text layer can make pdf-parse throw outright;
    // keep going so OCR gets a chance to recover the text.
    if (ext !== '.pdf') throw httpError(422, 'That file could not be read. If it is a scanned PDF, it has no text layer.');
    text = '';
  }
  text = text.replace(/\r/g, '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  if (ext === '.pdf' && text.length < 50) {
    // No usable text layer: the PDF is probably scanned. Try OCR before giving up.
    const ocr = await ocrPdf(file.buffer);
    if (ocr.length >= 50) text = ocr;
  }
  if (text.length < 50) throw httpError(422, 'Almost no text was found in that file. A scanned PDF has no text layer (OCR also tried).');
  return text;
}
