// The smallest ZIP reader that can open an OOXML file, so the render tests can look inside the
// .docx the app produces without adding a dependency.
import { inflateRawSync } from 'node:zlib';

const EOCD = 0x06054b50;
const CENTRAL = 0x02014b50;

/** @returns {Map<string, Buffer>} entry name -> contents */
export function readZip(buffer) {
  let eocd = -1;
  // The end-of-central-directory record sits at the end, after an optional comment.
  for (let i = buffer.length - 22; i >= 0 && i > buffer.length - 22 - 0xffff; i--) {
    if (buffer.readUInt32LE(i) === EOCD) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('Not a ZIP file: no end-of-central-directory record.');

  const count = buffer.readUInt16LE(eocd + 10);
  let offset = buffer.readUInt32LE(eocd + 16);
  const entries = new Map();

  for (let i = 0; i < count; i++) {
    if (buffer.readUInt32LE(offset) !== CENTRAL) throw new Error('Not a ZIP file: bad central directory entry.');
    const method = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localOffset = buffer.readUInt32LE(offset + 42);
    const name = buffer.toString('utf8', offset + 46, offset + 46 + nameLength);

    // The local header repeats the name and extra fields, and its lengths can differ, so the
    // data offset has to be computed from the local record rather than the central one.
    const localNameLength = buffer.readUInt16LE(localOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const raw = buffer.subarray(dataStart, dataStart + compressedSize);
    entries.set(name, method === 0 ? Buffer.from(raw) : inflateRawSync(raw));

    offset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

/** Every entry whose name matches, as text. */
export function zipText(entries, pattern) {
  const found = [];
  for (const [name, data] of entries) if (pattern.test(name)) found.push(data.toString('utf8'));
  return found.join('\n');
}
