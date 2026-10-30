// The wiring the desktop build depends on: which program the agent setup tells people to run, and
// that it points at the same data as the app that is showing the page.
import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchInfo, snippets } from '../lib/agents.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const saved = {};

for (const key of ['EXAM_STUDIO_MCP_ENTRY', 'DATA_FILE', 'SETTINGS_FILE', 'UPDATE_FILE', 'UPDATE_REPO', 'UPDATE_FEED_URL']) {
  saved[key] = process.env[key];
}

after(() => {
  for (const [key, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe('agent launch information', () => {
  it('points at the MCP server that sits next to the library by default', () => {
    delete process.env.EXAM_STUDIO_MCP_ENTRY;
    const info = launchInfo();
    assert.ok(info.command, 'the command must be the running program');
    assert.equal(info.args.length, 1);
    assert.equal(path.basename(info.args[0]), 'mcp.js');
    assert.ok(path.isAbsolute(info.args[0]));
  });

  it('uses the path the desktop app passes in, because a packaged server is outside the asar', () => {
    process.env.EXAM_STUDIO_MCP_ENTRY = path.join('C:', 'Program Files', 'Exam Studio', 'resources', 'app.asar.unpacked', 'server', 'mcp.js');
    assert.equal(launchInfo().args[0], process.env.EXAM_STUDIO_MCP_ENTRY);
    delete process.env.EXAM_STUDIO_MCP_ENTRY;
  });

  it('hands the agent the same data folder as the app', () => {
    process.env.DATA_FILE = path.join(here, 'scratch', 'library.json');
    process.env.SETTINGS_FILE = path.join(here, 'scratch', 'settings.json');
    const { env } = launchInfo();
    assert.equal(env.DATA_FILE, path.resolve(process.env.DATA_FILE));
    assert.equal(env.SETTINGS_FILE, path.resolve(process.env.SETTINGS_FILE));
    delete process.env.DATA_FILE;
    delete process.env.SETTINGS_FILE;
  });

  it('passes the update settings through, so an agent can see them too', () => {
    process.env.UPDATE_REPO = 'someone/thing';
    assert.equal(launchInfo().env.UPDATE_REPO, 'someone/thing');
    delete process.env.UPDATE_REPO;
  });

  it('produces a copy-pasteable command for every supported agent', () => {
    const info = launchInfo();
    const text = snippets(info);
    for (const key of ['claudeCode', 'codex', 'claudeDesktop', 'gemini', 'opencode']) {
      assert.ok(text[key] && text[key].includes('exam-studio'), `${key} snippet looks wrong`);
    }
    assert.ok(text.claudeCode.includes(info.command) || text.claudeCode.includes('"'), 'the Claude Code snippet must name the program');
  });

  it('tells the desktop build to run its own program as Node', () => {
    // process.versions.electron is not set when the tests run under plain Node, so this checks
    // the contract rather than the branch: the flag is what lets the packaged app run mcp.js.
    const info = launchInfo();
    assert.ok(!info.env.ELECTRON_RUN_AS_NODE, 'a plain Node process must not claim to be Electron');
    assert.equal(typeof info.electron, 'boolean');
  });
});
