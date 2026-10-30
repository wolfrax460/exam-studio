// The handout renderers, checked by opening the files they produce rather than trusting a size.
// handoutDocx is the important one: a stray ** or a missing footer is invisible in a byte count.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { handoutDocx } from '../lib/docx.js';
import { handoutPdf } from '../lib/pdf.js';
import { handoutFixture } from './fixtures.js';
import { readZip, zipText } from './zip.js';

const LESSON_TITLE = 'Database concepts and the relational model';

describe('handoutDocx', () => {
  it('returns a non-empty Word file', async () => {
    const buffer = await handoutDocx(handoutFixture());
    assert.ok(Buffer.isBuffer(buffer));
    assert.ok(buffer.length > 5000, `suspiciously small: ${buffer.length} bytes`);
    assert.equal(buffer.subarray(0, 2).toString(), 'PK');
  });

  it('contains the lesson title, the end marker and the footer', async () => {
    const entries = readZip(await handoutDocx(handoutFixture()));
    const document = zipText(entries, /^word\/document\.xml$/);
    assert.ok(document.includes('END OF UNIT 1 HANDOUT'), 'the end-of-unit marker is missing');
    assert.ok(document.includes(LESSON_TITLE), 'the lesson title is missing');
    assert.ok(document.includes('WORKED EXAMPLE'), 'the worked example box is missing');
    // Footers are their own part in OOXML, so the footer text must be looked for in the package.
    const footer = zipText(entries, /^word\/footer\d*\.xml$/);
    assert.ok(footer.includes('Student Study Handout'), 'the footer label is missing');
    assert.match(footer, /PAGE|NUMPAGES/, 'the footer must use real page fields, not typed numbers');
  });

  it('never prints a bold marker: ** must not appear anywhere', async () => {
    const entries = readZip(await handoutDocx(handoutFixture()));
    for (const [name, data] of entries) {
      if (!name.endsWith('.xml')) continue;
      assert.ok(!data.toString('utf8').includes('**'), `${name} contains a stray ** - the rich() helper was not applied`);
    }
  });

  it('is A4 portrait', async () => {
    const document = zipText(readZip(await handoutDocx(handoutFixture())), /^word\/document\.xml$/);
    const sizes = document.match(/<w:pgSz[^>]*>/g) || [];
    assert.ok(sizes.length, 'no page size was written');
    for (const size of sizes) {
      assert.match(size, /w:w="11906"/, `not A4 width: ${size}`);
      assert.match(size, /w:h="16838"/, `not A4 height: ${size}`);
    }
  });

  it('uses a monospaced font for the diagrams so the ASCII cannot reflow', async () => {
    const document = zipText(readZip(await handoutDocx(handoutFixture())), /^word\/document\.xml$/);
    assert.match(document, /Courier New/, 'ASCII diagrams need an explicit monospace font');
  });

  it('renders a handout with no units without throwing', async () => {
    const buffer = await handoutDocx({ title: 'Empty' });
    assert.equal(buffer.subarray(0, 2).toString(), 'PK');
  });
});

describe('handoutPdf', () => {
  it('returns a PDF', async () => {
    const buffer = await handoutPdf(handoutFixture());
    assert.ok(Buffer.isBuffer(buffer));
    assert.equal(buffer.subarray(0, 4).toString(), '%PDF');
    assert.ok(buffer.length > 10000, `suspiciously small: ${buffer.length} bytes`);
  });

  it('renders without throwing when there are no units', async () => {
    const buffer = await handoutPdf({ title: 'Empty' });
    assert.equal(buffer.subarray(0, 4).toString(), '%PDF');
  });
});
