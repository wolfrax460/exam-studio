// UTF-8 / BOM / Windows-1252 decoding tests for extract.js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { decodeBuffer } from '../lib/extract.js';

describe('decodeBuffer', () => {
  it('decodes plain UTF-8 text with en/em dashes and accents', () => {
    const text = 'Café — École – amashusho — résumé — ibiryo';
    const buf = Buffer.from(text, 'utf8');
    assert.strictEqual(decodeBuffer(buf), text.normalize('NFC'));
  });

  it('strips UTF-8 BOM', () => {
    const text = 'Café — École';
    const buf = Buffer.concat([Buffer.from([0xEF, 0xBB, 0xBF]), Buffer.from(text, 'utf8')]);
    assert.strictEqual(decodeBuffer(buf), text.normalize('NFC'));
  });

  it('strips UTF-16 LE BOM', () => {
    const text = 'Café — École';
    const buf = Buffer.concat([Buffer.from([0xFF, 0xFE]), Buffer.from(text, 'utf16le')]);
    assert.strictEqual(decodeBuffer(buf), text.normalize('NFC'));
  });

  it('decodes Windows-1252 em dash (0x97) and en dash (0x96)', () => {
    // Windows-1252: 0x96 = en dash (–), 0x97 = em dash (—)
    const buf = Buffer.from([0x43, 0x61, 0x66, 0x65, 0x20, 0x96, 0x20, 0x45, 0x63, 0x6f, 0x6c, 0x65, 0x20, 0x97]);
    const result = decodeBuffer(buf);
    assert.ok(result.includes('–'), 'should contain en dash');
    assert.ok(result.includes('—'), 'should contain em dash');
  });

  it('decodes Windows-1252 French accent (0xE2 = â)', () => {
    // Windows-1252: 0xE2 = â (U+00E2)
    const buf = Buffer.from([0x43, 0x61, 0x66, 0x65, 0x20, 0xE2]);
    const result = decodeBuffer(buf);
    assert.ok(result.includes('â'), 'should contain â');
  });

  it('normalizes to NFC', () => {
    // é can be U+00E9 (NFC) or U+0065 U+0301 (NFD)
    const nfd = 'Cafe\u0301'; // e + combining acute accent
    const nfc = 'Café'; // precomposed é
    const buf = Buffer.from(nfd, 'utf8');
    assert.strictEqual(decodeBuffer(buf), nfc);
  });
});
