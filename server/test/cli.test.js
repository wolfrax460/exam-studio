// Starting the terminal AI tools (Claude Code, Codex, OpenCode, Gemini CLI).
//
// The Windows launcher problem: a tool can be on PATH as several shims, and one of them may not
// be a real program at all (a launcher script renamed to .exe). Windows then fails the spawn
// with UNKNOWN, which used to surface as "Something went wrong on the server."
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { CLI_PRESETS, cliInstalled, launchSpecs, runCli, validCliModel } from '../lib/cli.js';

const tempDirs = [];
const isWindows = process.platform === 'win32';

after(() => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
});

describe('launcher selection', () => {
  it('finds the shims a tool is installed as', () => {
    const specs = launchSpecs({ bin: process.execPath ? 'node' : 'node' });
    assert.ok(specs.length >= 1, 'node must resolve to at least one command');
    assert.ok(specs.every((spec) => typeof spec.shell === 'boolean'));
  });

  it('starts a .cmd shim through the shell', { skip: !isWindows }, () => {
    const specs = launchSpecs({ bin: 'npm' });
    const shim = specs.find((spec) => /\.cmd$/i.test(spec.command));
    assert.ok(shim, `expected a .cmd candidate, got ${JSON.stringify(specs)}`);
    assert.equal(shim.shell, true, 'cmd files can only be started through cmd.exe');
  });
});

describe('opencode arguments', () => {
  // opencode's `-f, --file` is an array flag: it swallows every following non-flag token as another
  // file. Putting the message after it made opencode look for a file called "Follow the
  // instructions...", which is what the app reported as "File not found".
  const argsFor = (model) => CLI_PRESETS.opencode.args({ model, file: path.join(os.tmpdir(), 'instructions.txt') });

  it('sends the message before the file and leaves nothing after the file path', () => {
    for (const model of ['', 'opencode/big']) {
      const args = argsFor(model);
      const file = args.indexOf('-f');
      assert.equal(args[0], 'run', `first argument must be run: ${JSON.stringify(args)}`);
      assert.match(args[1], /attached file/, `the message must be the first positional: ${JSON.stringify(args)}`);
      assert.ok(file > 1, `-f must follow the message: ${JSON.stringify(args)}`);
      assert.ok(args[file + 1], `-f needs a file path: ${JSON.stringify(args)}`);
      assert.equal(args.length, file + 2, `nothing may follow the file path: ${JSON.stringify(args)}`);
    }
  });

  it('still passes the model when one is chosen', () => {
    const args = argsFor('opencode/big');
    assert.equal(args[args.indexOf('-m') + 1], 'opencode/big');
  });
});

describe('runCli', () => {
  it('reports a tool that is not installed, instead of throwing something raw', async () => {
    CLI_PRESETS['test-missing'] = { bin: 'exam-studio-no-such-tool', name: 'No Such Tool', via: 'stdin', args: () => [] };
    await assert.rejects(() => runCli('test-missing', { prompt: 'hello' }), (error) => {
      assert.equal(error.status, 400);
      assert.match(error.message, /was not found on this computer/i);
      return true;
    });
  });

  // The real bug: `claude` resolved to a broken .exe before the working .cmd, and the failure
  // was reported as a server error.
  it('falls through to a working launcher when one shim cannot start', { skip: !isWindows }, async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'exam-studio-cli-'));
    tempDirs.push(dir);
    // A file that looks like the broken shim: a .exe that is not a program.
    writeFileSync(path.join(dir, 'exam-studio-fake.exe'), '@echo off\r\necho nope\r\n');
    // The launcher that does work, exactly as npm writes it.
    writeFileSync(path.join(dir, 'exam-studio-fake.cmd'), '@echo off\r\necho {"ok":true}\r\n');
    const previousPath = process.env.PATH;
    process.env.PATH = `${dir};${previousPath}`;
    try {
      CLI_PRESETS['test-shim'] = { bin: 'exam-studio-fake', name: 'Fake Tool', via: 'stdin', args: () => [] };
      assert.equal(cliInstalled('test-shim'), true);
      const output = await runCli('test-shim', { prompt: 'ignored' });
      assert.match(output, /"ok":true/, 'the working .cmd launcher should have been used');
    } finally {
      process.env.PATH = previousPath;
    }
  });

  it('refuses a model name with shell characters', async () => {
    assert.equal(validCliModel('sonnet'), true);
    assert.equal(validCliModel(''), true);
    for (const bad of ['sonnet; rm -rf /', 'a&&b', '$(whoami)', 'a|b', 'x'.repeat(120)]) {
      assert.equal(validCliModel(bad), false, `${bad} must be rejected`);
    }
    // 'claude' is the launcher preset; 'cli-claude' is the provider id the app passes through
    // as preset.cli, so the launcher must reject anything else.
    await assert.rejects(() => runCli('claude', { model: 'bad;name', prompt: 'x' }), /not allowed/i);
    await assert.rejects(() => runCli('cli-claude', { prompt: 'x' }), /Unknown tool/i);
  });

  it('rejects an unknown tool', async () => {
    await assert.rejects(() => runCli('not-a-tool', { prompt: 'x' }), /Unknown tool/i);
  });

  // Windows can keep the temp folder locked for a moment after the child exits. The cleanup must
  // not throw over an answer the tool already gave: a finished paper is worth more than a tidy
  // temp dir.
  it('keeps the answer when the temp folder cannot be deleted', async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'exam-studio-cli-'));
    tempDirs.push(dir);
    writeFileSync(path.join(dir, 'exam-studio-lock.cmd'), '@echo off\r\necho {"ok":true}\r\n');
    const previousPath = process.env.PATH;
    process.env.PATH = `${dir};${previousPath}`;
    const realRm = fs.rmSync;
    try {
      CLI_PRESETS['test-locked'] = { bin: 'exam-studio-lock', name: 'Locked Tool', via: 'file', args: ({ file }) => ['run', 'read it', '-f', file] };
      // Stand in for Windows refusing to delete the folder the child was just using.
      mock.method(fs, 'rmSync', (target, ...rest) => {
        if (String(target).includes('exam-studio-') && !String(target).includes('exam-studio-cli-')) {
          const err = new Error(`EPERM: operation not permitted, rm '${target}'`);
          err.code = 'EPERM';
          throw err;
        }
        return realRm(target, ...rest);
      });
      assert.equal(await runCli('test-locked', { prompt: 'x' }), '{"ok":true}\r\n');
    } finally {
      mock.restoreAll();
      process.env.PATH = previousPath;
    }
  });
});
