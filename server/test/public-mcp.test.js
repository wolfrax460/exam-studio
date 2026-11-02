// Public, no-auth MCP endpoint at /mcp/public.
// Verifies: anonymous access works, only the 5 generate tools are exposed, input is capped,
// daily/burst limits apply, /mcp still requires a token, and no library/file tools leak.
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { bootApi, call, dropTestDatabase } from './helpers.js';

let api;

const PUBLIC_INPUT_MAX_CHARS = 12_000;

before(async () => {
  await dropTestDatabase();
  api = await bootApi({ envOverrides: { PUBLIC_MCP_ENABLED: 'true' } });
});

after(async () => {
  await api?.close();
  await dropTestDatabase();
});

// The Streamable HTTP transport requires an Accept header and an mcp-session-id after initialize.
let publicSessionId = null;

// POST a raw JSON-RPC request to /mcp/public and return { status, headers, body }.
async function publicRpc(method, params = {}, { sessionId = publicSessionId } = {}) {
  const body = JSON.stringify({ jsonrpc: '2.0', id: 1, method, params });
  const headers = {
    'content-type': 'application/json',
    accept: 'application/json, text/event-stream',
  };
  if (sessionId) headers['mcp-session-id'] = sessionId;
  const response = await fetch(`${api.base}/mcp/public`, { method: 'POST', headers, body });
  const text = await response.text();
  if (response.headers.get('mcp-session-id')) publicSessionId = response.headers.get('mcp-session-id');
  let parsed;
  try {
    const dataLine = text.split('\n').find((line) => line.startsWith('data: '));
    parsed = dataLine ? JSON.parse(dataLine.slice(6)) : JSON.parse(text);
  } catch {
    parsed = text;
  }
  const responseHeaders = Object.fromEntries(response.headers.entries());
  return { status: response.status, headers: responseHeaders, body: parsed };
}

describe('POST /mcp/public (no auth)', () => {
  it('initialize answers 200 with no WWW-Authenticate', async () => {
    const { status, headers, body } = await publicRpc('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'test', version: '1' },
    });
    assert.equal(status, 200);
    assert.equal(headers['www-authenticate'], undefined, 'no WWW-Authenticate on the public endpoint');
    assert.equal(body.result?.serverInfo?.name, 'exam-studio');
  });

  it('tools/list returns only the five public tools', async () => {
    const { status, body } = await publicRpc('tools/list');
    assert.equal(status, 200);
    const names = (body.result?.tools || []).map((t) => t.name);
    const expected = [
      'exam_studio_generate_notes',
      'exam_studio_generate_exam',
      'exam_studio_generate_handout',
      'exam_studio_generate_flashcards',
      'exam_studio_get_usage',
    ];
    for (const name of expected) {
      assert.ok(names.includes(name), `${name} is exposed`);
    }
    // None of the restricted tools may appear.
    const forbidden = ['exam_studio_library', 'exam_studio_read_notes', 'exam_studio_export_exam', 'exam_studio_check_exam', 'exam_studio_format_guide'];
    for (const name of forbidden) {
      assert.ok(!names.includes(name), `${name} must not be exposed publicly`);
    }
  });

  it('get_usage reports the public limits', async () => {
    const { status, body } = await publicRpc('tools/call', {
      name: 'exam_studio_get_usage',
      arguments: {},
    });
    assert.equal(status, 200);
    const payload = JSON.parse(body.result.content[0].text);
    assert.equal(payload.generationsPerDayPerIp, 5);
    assert.equal(payload.inputMaxChars, PUBLIC_INPUT_MAX_CHARS);
  });

  it('generate_notes works with short text', async () => {
    const { status, body } = await publicRpc('tools/call', {
      name: 'exam_studio_generate_notes',
      arguments: { text: 'The water cycle describes how water evaporates, condenses and falls as rain. It is driven by the sun.', title: 'Water cycle' },
    });
    assert.equal(status, 200);
    const payload = JSON.parse(body.result.content[0].text);
    assert.ok(payload.notes, 'notes are returned');
  });

  it('rejects input over 12,000 characters with a clear error', async () => {
    const longText = 'x'.repeat(PUBLIC_INPUT_MAX_CHARS + 1);
    const { status, body } = await publicRpc('tools/call', {
      name: 'exam_studio_generate_notes',
      arguments: { text: longText },
    });
    assert.equal(status, 400);
    assert.equal(body.error, 'input_too_large', 'oversize input is rejected before rate limiting');
    assert.match(String(body.message), /too long|12,000|limit/i);
  });

  it('does not expose library or file tools through tools/call', async () => {
    const { status, body } = await publicRpc('tools/call', {
      name: 'exam_studio_library',
      arguments: { action: 'list' },
    });
    assert.equal(status, 200, 'unknown tool is an MCP error, not HTTP 400');
    assert.equal(body.result?.isError, true, 'library tool must not be reachable');
    assert.match(String(body.result?.content?.[0]?.text), /not found/i);
  });
});

describe('POST /mcp (still requires a token)', () => {
  it('returns 401 without WWW-Authenticate without a bearer token', async () => {
    const body = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} });
    const response = await fetch(`${api.base}/mcp`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
      body,
    });
    assert.equal(response.status, 401);
    assert.equal(response.headers.get('www-authenticate'), null, '/mcp must NOT send WWW-Authenticate (API-key-only auth)');
  });
});
