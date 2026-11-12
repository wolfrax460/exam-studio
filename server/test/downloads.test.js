import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { bootApi } from './helpers.js';

test('serves the public integration JSON and ZIP with their download headers', async (t) => {
  const api = await bootApi({ MONGODB_URI: 'mongodb://127.0.0.1:59999/none', MONGODB_TIMEOUT_MS: '400' });
  t.after(() => api.close());
  const origin = 'https://exams-studio.vercel.app';
  const manifest = await fetch(api.base + '/downloads/downloads.json', { headers: { Origin: origin } });
  assert.equal(manifest.status, 200);
  assert.equal(manifest.headers.get('access-control-allow-origin'), origin);
  assert.equal(manifest.headers.get('cache-control'), 'public, max-age=86400');
  assert.deepEqual(await manifest.json(), JSON.parse(await readFile(new URL('../../downloads/downloads.json', import.meta.url))));

  const name = 'exam-studio-plugin-0.2.1.zip';
  const zip = await fetch(api.base + '/downloads/integrations/0.2.1/' + name);
  assert.equal(zip.status, 200);
  assert.match(zip.headers.get('content-disposition'), /attachment/);
  assert.deepEqual(Buffer.from(await zip.arrayBuffer()),
    await readFile(new URL('../../downloads/integrations/0.2.1/' + name, import.meta.url)));
  const missing = await fetch(api.base + '/downloads/not-a-published-asset.zip');
  assert.equal(missing.status, 404);
  assert.match(missing.headers.get('content-type'), /json/);
});
