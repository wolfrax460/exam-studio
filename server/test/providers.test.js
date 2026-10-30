// The Settings screen and the provider engine, tested against a stub OpenAI-compatible server.
// This is what proves that changing the AI in the app actually changes which service is called.
import http from 'node:http';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { bootApi, call, makeUser } from './helpers.js';
import { demoExam, demoNotes } from '../lib/demo.js';

const state = { mode: 'tool', payload: demoExam(), rejectTools: false, lastBody: null, calls: 0 };

function startStub() {
  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      const send = (code, obj) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(obj)); };

      if (req.method === 'GET' && req.url.startsWith('/v1/models')) {
        return send(200, { object: 'list', data: [{ id: 'model-b' }, { id: 'model-a' }] });
      }
      if (req.method === 'POST' && req.url.startsWith('/v1/chat/completions')) {
        state.calls += 1;
        const body = JSON.parse(raw || '{}');
        state.lastBody = body;
        if (state.mode === '401') return send(401, { error: { message: 'invalid api key' } });
        if (state.mode === '429') return send(429, { error: { message: 'you have reached your hourly limit for this model' } });
        if (state.mode === 'html') {
          // A gateway answering 200 with an HTML page, which is not JSON.
          res.writeHead(200, { 'content-type': 'text/html' });
          return res.end('<html><body>502 Bad Gateway</body></html>');
        }
        if (state.rejectTools && body.tools) return send(400, { error: { message: 'tools are not supported by this model' } });
        if (state.mode === 'length') return send(200, { choices: [{ finish_reason: 'length', message: { content: '' } }] });
        if (state.mode === 'text') {
          return send(200, { choices: [{ finish_reason: 'stop', message: { content: `Here you go:\n\`\`\`json\n${JSON.stringify(state.payload)}\n\`\`\`` } }] });
        }
        if (state.mode === 'tool-no-choice') {
          // A server that ignores tool_choice but still calls the function.
          return send(200, { choices: [{ finish_reason: 'stop', message: { tool_calls: [{ function: { name: 'submit', arguments: JSON.stringify(state.payload) } }] } }] });
        }
        return send(200, {
          choices: [{
            finish_reason: 'stop',
            message: { tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'submit_exam', arguments: JSON.stringify(state.payload) } }] },
          }],
        });
      }
      send(404, { error: 'not found' });
    });
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve({
      server,
      url: `http://127.0.0.1:${server.address().port}/v1`,
      close: () => new Promise((r) => server.close(r)),
    }));
  });
}

let stub;
let api;
let token;

before(async () => {
  stub = await startStub();
  api = await bootApi({
    DEMO_MODE: '0',
    // Unreachable MongoDB, short timeout: these tests exercise the file store and the engine.
    MONGODB_URI: 'mongodb://127.0.0.1:59999/none',
    MONGODB_TIMEOUT_MS: '400',
    beforeImport: (dir) => writeFileSync(
      path.join(dir, 'settings.json'),
      JSON.stringify({ provider: 'custom', profiles: { custom: { baseURL: stub.url, model: 'stub-model-1' } } }, null, 2),
    ),
  });
  const user = await makeUser(api.base);
  token = user.token;
});

after(async () => {
  await api?.close();
  await stub?.close();
});

describe('GET /api/settings', () => {
  it('describes every provider and which one is active', async () => {
    const { status, body } = await call(api.base, '/api/settings', { token });
    assert.equal(status, 200);
    assert.equal(body.active, 'custom');
    assert.equal(body.canChange, true, 'a request from this computer may change settings');
    assert.ok(body.providers.length >= 10, 'all providers are listed');
    const custom = body.providers.find((p) => p.id === 'custom');
    assert.equal(custom.model, 'stub-model-1');
    assert.equal(custom.baseURL, stub.url);
    assert.ok(custom.defaults && 'maxOutput' in custom.defaults);
    const claude = body.providers.find((p) => p.id === 'cli-claude');
    assert.equal(typeof claude.installed, 'boolean', 'terminal tools report whether they are installed');
    assert.equal(claude.allowed, true, 'terminal tools are allowed from the server machine');
  });
});

describe('PUT /api/settings', () => {
  it('saves a model and an address, and reports them back', async () => {
    const { status, body } = await call(api.base, '/api/settings', {
      method: 'PUT', token,
      body: { provider: 'custom', profile: { model: 'stub-model-2', baseURL: stub.url, maxOutput: 4096, chunkChars: 5000 } },
    });
    assert.equal(status, 200);
    const custom = body.providers.find((p) => p.id === 'custom');
    assert.equal(custom.model, 'stub-model-2');
    assert.equal(custom.maxOutput, 4096);
    assert.equal(custom.chunkChars, 5000);
  });

  it('rejects an unknown provider and a bad address', async () => {
    const unknown = await call(api.base, '/api/settings', { method: 'PUT', token, body: { provider: 'nope', profile: {} } });
    assert.equal(unknown.status, 400);

    const badUrl = await call(api.base, '/api/settings', { method: 'PUT', token, body: { provider: 'custom', profile: { baseURL: 'ftp://example.com' } } });
    assert.equal(badUrl.status, 400);
    assert.match(badUrl.body.error, /http/i);

    const badNumber = await call(api.base, '/api/settings', { method: 'PUT', token, body: { provider: 'custom', profile: { maxOutput: 'lots' } } });
    assert.equal(badNumber.status, 400);
  });

  it('clears a value when an empty string is sent', async () => {
    await call(api.base, '/api/settings', { method: 'PUT', token, body: { provider: 'custom', profile: { maxOutput: '' } } });
    const { body } = await call(api.base, '/api/settings', { token });
    const custom = body.providers.find((p) => p.id === 'custom');
    assert.equal(custom.maxOutput, custom.defaults.maxOutput, 'falls back to the provider default');
  });

  it('rejects a profile that is not an object', async () => {
    for (const profile of [[], 'custom', 42, null, true]) {
      const { status } = await call(api.base, '/api/settings', { method: 'PUT', token, body: { provider: 'custom', profile } });
      assert.equal(status, 400, `profile ${JSON.stringify(profile)} must be refused`);
    }
    // The saved profile must have survived those attempts.
    const { body } = await call(api.base, '/api/settings', { token });
    assert.equal(body.providers.find((p) => p.id === 'custom').model, 'stub-model-2');
  });

  it('clearing the model and the address really clears them', async () => {
    const cleared = await call(api.base, '/api/settings', { method: 'PUT', token, body: { provider: 'custom', profile: { model: '', baseURL: '', maxOutput: '' } } });
    assert.equal(cleared.status, 200);
    const custom = cleared.body.providers.find((p) => p.id === 'custom');
    assert.equal(custom.model, custom.defaults.model, 'the stale model must not survive');
    assert.equal(custom.baseURL, custom.defaults.baseURL, 'the stale address must not survive');

    // Put the stub configuration back for the generation tests below.
    await call(api.base, '/api/settings', { method: 'PUT', token, body: { provider: 'custom', profile: { model: 'stub-model-2', baseURL: stub.url } } });
    const restored = await call(api.base, '/api/settings', { token });
    assert.equal(restored.body.providers.find((p) => p.id === 'custom').baseURL, stub.url);
  });

  it('saves where to look for a newer version, and validates it', async () => {
    const badRepo = await call(api.base, '/api/settings', { method: 'PUT', token, body: { update: { repo: 'not a repo' } } });
    assert.equal(badRepo.status, 400);
    assert.match(badRepo.body.error, /owner\/name/i);

    const badUrl = await call(api.base, '/api/settings', { method: 'PUT', token, body: { update: { feedUrl: 'ftp://example.com/v.json' } } });
    assert.equal(badUrl.status, 400);

    const badShape = await call(api.base, '/api/settings', { method: 'PUT', token, body: { update: [] } });
    assert.equal(badShape.status, 400);

    const saved = await call(api.base, '/api/settings', { method: 'PUT', token, body: { update: { repo: 'someone/thing' } } });
    assert.equal(saved.status, 200, JSON.stringify(saved.body));
    assert.equal(saved.body.update.repo, 'someone/thing');
    assert.equal(saved.body.update.configured, true);
    assert.equal(saved.body.update.source, 'github');

    const cleared = await call(api.base, '/api/settings', { method: 'PUT', token, body: { update: { repo: '' } } });
    assert.equal(cleared.body.update.repo, '');
    assert.equal(cleared.body.update.configured, false);
  });

  it('refuses a settings change with nothing in it', async () => {
    const { status } = await call(api.base, '/api/settings', { method: 'PUT', token, body: {} });
    assert.equal(status, 400);
  });

  // The settings file was cached on first read and never re-checked, so an edit made outside
  // the running server (or the file being removed) was ignored until a restart.
  it('notices a settings file that changed on disk', async () => {
    const file = path.join(api.dir, 'settings.json');
    const before = JSON.parse(readFileSync(file, 'utf8'));
    writeFileSync(file, JSON.stringify({ provider: 'custom', profiles: { custom: { baseURL: stub.url, model: 'a-different-model-name' } } }));
    await new Promise((resolve) => setTimeout(resolve, 20));

    const changed = await call(api.base, '/api/settings', { token });
    assert.equal(changed.body.providers.find((p) => p.id === 'custom').model, 'a-different-model-name');

    writeFileSync(file, JSON.stringify(before));
    await new Promise((resolve) => setTimeout(resolve, 20));
    const restored = await call(api.base, '/api/settings', { token });
    assert.equal(restored.body.providers.find((p) => p.id === 'custom').model, before.profiles.custom.model);
  });
});

describe('POST /api/settings/test and models', () => {
  it('pings the configured provider', async () => {
    state.mode = 'text';
    state.payload = { ok: true };
    const { status, body } = await call(api.base, '/api/settings/test', { method: 'POST', token, body: {} });
    assert.equal(status, 200);
    assert.equal(body.provider, 'Other (OpenAI-compatible)');
    assert.equal(body.model, 'stub-model-2');
    assert.equal(typeof body.ms, 'number');
  });

  it('lists the models the provider offers', async () => {
    const { status, body } = await call(api.base, '/api/settings/models', { token });
    assert.equal(status, 200);
    assert.deepEqual(body.models, ['model-a', 'model-b']);
  });

  it('reports a rejected key in plain language', async () => {
    state.mode = '401';
    const { status, body } = await call(api.base, '/api/settings/test', { method: 'POST', token, body: {} });
    assert.equal(status, 500);
    assert.match(body.error, /API key/i);
    state.mode = 'tool';
  });

  // "busy or over its limit" on its own does not tell the user what to do; the provider
  // usually explains the real reason, so pass that on.
  it('passes on what the provider said when it rate-limits us', async () => {
    state.mode = '429';
    const { status, body } = await call(api.base, '/api/settings/test', { method: 'POST', token, body: {} });
    assert.equal(status, 429);
    assert.match(body.error, /hourly limit for this model/i);
    assert.match(body.error, /Settings/i);
    state.mode = 'tool';
  });
});

describe('generation through the chosen provider', () => {
  it('returns a cleaned exam from a tool call', async () => {
    state.mode = 'tool';
    state.payload = demoExam();
    const { status, body } = await call(api.base, '/api/exams/generate', {
      method: 'POST', token,
      body: { layout: 'classic', text: 'x'.repeat(200), title: 'Database', level: 'L4', totalMarks: 35, types: ['sequencing', 'matching', 'mcq', 'select_all', 'true_false', 'short_answer', 'essay'], essayCount: 1 },
    });
    assert.equal(status, 200);
    assert.equal(body.title, demoExam().title);
    assert.ok(body.questions.length > 0);
    assert.equal(typeof body.totalMarks, 'number');
    assert.ok(Array.isArray(body.warnings));
    assert.equal(state.lastBody.model, 'stub-model-2');
  });

  it('understands a plain-text reply when the server will not call tools', async () => {
    state.mode = 'tool';
    state.rejectTools = true;
    state.payload = demoNotes();
    const { status, body } = await call(api.base, '/api/notes/generate', {
      method: 'POST', token, body: { text: 'y'.repeat(200), title: 'Notes' },
    });
    assert.equal(status, 200);
    assert.equal(body.title, demoNotes().title);
    assert.ok(body.sections.length > 0);
    state.rejectTools = false;
  });

  it('reads a fenced JSON reply as a fallback', async () => {
    state.mode = 'text';
    state.payload = demoNotes();
    const { status, body } = await call(api.base, '/api/notes/generate', {
      method: 'POST', token, body: { text: 'z'.repeat(200), title: 'Fenced' },
    });
    assert.equal(status, 200);
    assert.equal(body.sections.length, demoNotes().sections.length);
  });

  it('turns a cut-off reply into a clear message', async () => {
    state.mode = 'length';
    const { status, body } = await call(api.base, '/api/notes/generate', {
      method: 'POST', token, body: { text: 'w'.repeat(200), title: 'Long' },
    });
    assert.equal(status, 502);
    assert.match(body.error, /cut off/i);
    state.mode = 'tool';
  });

  it('refuses to run when the notes are too short', async () => {
    const { status } = await call(api.base, '/api/exams/generate', { method: 'POST', token, body: { text: 'too short', types: ['mcq'] } });
    assert.equal(status, 400);
  });

  it('refuses a request with no question types', async () => {
    const { status, body } = await call(api.base, '/api/exams/generate', { method: 'POST', token, body: { layout: 'classic', text: 'q'.repeat(200), types: [] } });    assert.equal(status, 400);
    assert.match(body.error, /question type/i);
  });

  // A request with no body at all must be a clean 400, not a TypeError.
  it('answers 400 when a generate request has no body', async () => {
    for (const path of ['/api/exams/generate', '/api/notes/generate', '/api/flashcards/generate']) {
      const response = await fetch(`${api.base}${path}`, { method: 'POST', headers: { authorization: `Bearer ${token}` } });
      assert.equal(response.status, 400, `${path} with no body`);
      assert.ok((await response.json()).error);
    }
  });
});

describe('hostile input', () => {
  const exam = { title: 'Hostile', questions: [{ type: 'mcq', marks: 5, prompt: 'p', items: [] }] };

  it('refuses to export an exam whose questions are not objects', async () => {
    for (const questions of [[null], [null, exam.questions[0]], ['a string'], [42], [[]]]) {
      const response = await call(api.base, '/api/export/exam-docx', { method: 'POST', token, body: { exam: { title: 'T', questions } } });
      assert.equal(response.status, 400, `questions ${JSON.stringify(questions)}`);
    }
    const good = await call(api.base, '/api/export/exam-docx', { method: 'POST', token, body: { exam } });
    assert.equal(good.status, 200);
  });

  it('turns a non-JSON provider reply into a clean 502', async () => {
    state.mode = 'html';
    const { status, body } = await call(api.base, '/api/settings/test', { method: 'POST', token, body: {} });
    assert.equal(status, 502, JSON.stringify(body));
    assert.match(body.error, /not JSON/i);
    assert.ok(!/Bad Gateway/.test(body.error), 'the provider body must not be echoed back');
    state.mode = 'tool';
  });

  it('writes a long manual instead of refusing it', async () => {
    await call(api.base, '/api/settings', { method: 'PUT', token, body: { provider: 'custom', profile: { chunkChars: 1500 } } });
    const paragraph = `${'Normalisation removes redundancy and keeps the data consistent. '.repeat(5)}\n\n`;
    const long = paragraph.repeat(400); // ~120k characters, the size of a real trainee manual
    const { status, body } = await call(api.base, '/api/notes/generate', { method: 'POST', token, body: { text: long, title: 'Huge' } });
    // A small "notes per request" must not turn into "this file is too long": the slice grows to
    // fit the request budget instead.
    assert.equal(status, 200, JSON.stringify(body));
    assert.ok(body.sections.length > 0, 'notes should come back');
    await call(api.base, '/api/settings', { method: 'PUT', token, body: { provider: 'custom', profile: { chunkChars: '' } } });
  });

  it('refuses notes past the whole-document limit', async () => {
    await call(api.base, '/api/settings', { method: 'PUT', token, body: { provider: 'custom', profile: { chunkChars: 1500 } } });
    const paragraph = `${'Normalisation removes redundancy and keeps the data consistent. '.repeat(5)}\n\n`;
    const absurd = paragraph.repeat(3000); // past the 600,000 character document limit
    const { status, body } = await call(api.base, '/api/notes/generate', { method: 'POST', token, body: { text: absurd, title: 'Absurd' } });
    assert.equal(status, 413, JSON.stringify(body));
    assert.match(body.error, /too long/i);

    await call(api.base, '/api/settings', { method: 'PUT', token, body: { provider: 'custom', profile: { chunkChars: '' } } });
  });

  it('does not store an array or object where a string belongs', async () => {
    const wrongKind = await call(api.base, '/api/library', { method: 'POST', token, body: { kind: ['exam'], data: { a: 1 } } });
    assert.equal(wrongKind.status, 400);

    const objectTitle = await call(api.base, '/api/library', { method: 'POST', token, body: { kind: 'notes', data: { a: 1 }, title: { x: 1 } } });
    assert.equal(objectTitle.status, 201);
    assert.equal(objectTitle.body.title, 'Untitled');
    assert.ok(!objectTitle.body.title.includes('object'));
  });
});
