// The MCP server (server/mcp.js) is how Claude Desktop, Claude Code and other agents use
// Exam Studio. It speaks JSON-RPC over stdout, so nothing else may ever be written there.
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';

const here = path.dirname(fileURLToPath(import.meta.url));
const serverPath = path.resolve(here, '../mcp.js');

let child;
let dir;
let buffer = '';
const pending = new Map();
const stdoutLines = [];

const rpc = (method, params) => new Promise((resolve, reject) => {
  const id = Math.floor(Math.random() * 1e9);
  pending.set(id, resolve);
  child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
  setTimeout(() => reject(new Error(`${method} timed out`)), 30_000);
});

before(async () => {
  dir = mkdtempSync(path.join(os.tmpdir(), 'exam-studio-mcp-'));
  child = spawn(process.execPath, [serverPath], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: {
      ...process.env,
      MONGODB_URI: 'mongodb://127.0.0.1:59999/none',
      MONGODB_TIMEOUT_MS: '400',
      DATA_FILE: path.join(dir, 'store.json'),
      SETTINGS_FILE: path.join(dir, 'settings.json'),
      EXAM_STUDIO_OWNER: 'mcp-test',
      DEMO_MODE: '1',
    },
  });
  child.stderr.resume();
  child.stdout.on('data', (chunk) => {
    buffer += chunk.toString();
    let index;
    while ((index = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, index).trim();
      buffer = buffer.slice(index + 1);
      if (!line) continue;
      stdoutLines.push(line);
      try {
        const message = JSON.parse(line);
        pending.get(message.id)?.(message);
        pending.delete(message.id);
      } catch { /* recorded above; asserted in the tests */ }
    }
  });

  const init = await rpc('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'test', version: '1' } });
  assert.equal(init.result?.serverInfo?.name, 'exam-studio');
  child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })}\n`);
});

after(async () => {
  child?.kill();
  rmSync(dir, { recursive: true, force: true });
});

describe('MCP server', () => {
  it('writes nothing but JSON-RPC to stdout', () => {
    const bad = stdoutLines.filter((line) => {
      try { JSON.parse(line); return false; } catch { return true; }
    });
    assert.deepEqual(bad, [], 'a stray line on stdout breaks the agent connection');
  });

  it('registers every documented tool', async () => {
    const response = await rpc('tools/list', {});
    const names = (response.result?.tools || []).map((t) => t.name);
    for (const expected of [
      'exam_studio_format_guide', 'exam_studio_read_notes', 'exam_studio_check_exam',
      'exam_studio_export_exam', 'exam_studio_export_notes', 'exam_studio_generate_exam',
      'exam_studio_generate_notes', 'exam_studio_generate_flashcards', 'exam_studio_library',
    ]) {
      assert.ok(names.includes(expected), `${expected} is missing`);
    }
  });

  it('checks an exam and reports the warnings', async () => {
    const response = await rpc('tools/call', {
      name: 'exam_studio_check_exam',
      arguments: {
        exam: { title: 'Probe', questions: [{ type: 'sequencing', marks: 4, prompt: 'x', steps: ['a', 'b', 'c'], sequenceAnswer: [1, 1, 3] }] },
        target_marks: 10,
      },
    });
    const payload = JSON.parse(response.result.content[0].text);
    assert.equal(payload.ok, false);
    assert.equal(payload.total_marks, 4);
    assert.ok(payload.warnings.some((w) => /add up to/.test(w)));
  });

  it('reads the library through the storage layer', async () => {
    const response = await rpc('tools/call', { name: 'exam_studio_library', arguments: { action: 'list' } });
    assert.equal(response.result?.isError, undefined);
    assert.ok(Array.isArray(JSON.parse(response.result.content[0].text)));
  });

  it('saves and reads back a library item', async () => {
    const saved = await rpc('tools/call', {
      name: 'exam_studio_library',
      arguments: { action: 'save', kind: 'notes', title: 'MCP notes', data: { title: 'MCP notes', sections: [] } },
    });
    const item = JSON.parse(saved.result.content[0].text);
    assert.ok(item.id);

    const list = await rpc('tools/call', { name: 'exam_studio_library', arguments: { action: 'list' } });
    assert.ok(JSON.parse(list.result.content[0].text).some((it) => it.id === item.id));
  });
});
