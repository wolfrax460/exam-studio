import path from 'node:path';
import mammoth from 'mammoth';
import pdf from 'pdf-parse/lib/pdf-parse.js';
import { httpError } from './errors.js';

export const ALLOWED = ['.pdf', '.docx', '.txt', '.md'];

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
    else text = file.buffer.toString('utf8');
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
