// Runs a terminal AI tool (Claude Code, Codex, OpenCode, Gemini CLI) once, headless, and returns what it printed.
// Only these fixed presets can run. A command line is never taken from Settings or from the browser.
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { httpError } from './errors.js';

const FILE_NOTE = 'Follow the instructions in the attached file. Reply with only the JSON object it asks for.';
const STDIN_NOTE = 'Follow the instructions you are given on standard input. Reply with only the JSON object it asks for.';

export const CLI_PRESETS = {
  // claude -p reads the prompt from stdin. --tools "" turns off file and shell tools: the model only writes text.
  claude: { bin: 'claude', name: 'Claude Code', via: 'stdin', args: ({ model }) => ['-p', '--tools', '', '--no-session-persistence', '--output-format', 'text', ...(model ? ['--model', model] : [])] },
  // codex exec reads the prompt from stdin with "-". Its sandbox is read-only by default.
  codex: { bin: 'codex', name: 'Codex CLI', via: 'stdin', args: ({ model }) => ['exec', '--skip-git-repo-check', '--ephemeral', ...(model ? ['-m', model] : []), '-'] },
  // opencode run takes the message as an argument, so the long prompt is attached as a file.
  // `-f` is an array flag there: it swallows every following non-flag token as another file, so
  // the message has to come first and the file path has to be the very last thing in the line.
  opencode: { bin: 'opencode', name: 'OpenCode', via: 'file', args: ({ model, file }) => ['run', FILE_NOTE, ...(model ? ['-m', model] : []), '-f', file] },
  gemini: { bin: 'gemini', name: 'Gemini CLI', via: 'stdin', args: ({ model }) => ['-p', STDIN_NOTE, ...(model ? ['-m', model] : [])] },
};

const MODEL_OK = /^[A-Za-z0-9._:/@+-]{1,100}$/;
export const validCliModel = (m) => !m || MODEL_OK.test(m);

// Commands that could not be started at all (as opposed to running and reporting a problem).
const START_FAILURES = new Set(['ENOENT', 'EINVAL', 'UNKNOWN', 'EPERM', 'EACCES']);

/** Every shim on PATH for a tool, in the order `where`/`which` reports them. */
function installedPaths(bin) {
  try {
    const found = spawnSync(process.platform === 'win32' ? 'where' : 'which', [bin], { encoding: 'utf8', windowsHide: true });
    return String(found.stdout || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  } catch {
    return [];
  }
}

export function cliInstalled(id) {
  const p = CLI_PRESETS[id];
  if (!p) return false;
  return installedPaths(p.bin).length > 0;
}

const quoteWin = (a) => `"${String(a).replace(/"/g, '\\"')}"`; // arguments are fixed presets or a validated model name
const strip = (s) => s.replace(/\u001b\[[0-9;?]*[A-Za-z]/g, '');
const TIMEOUT_MS = 10 * 60 * 1000;

/**
 * Ways to start one tool, best first.
 *
 * On Windows a tool is often reachable through several shims. npm writes a `.cmd`, some
 * installers also leave a `.exe`, and occasionally a `.exe` is not a real program at all
 * (a launcher script renamed to .exe) — Windows then fails the spawn with `UNKNOWN`, which
 * looks like a server bug. So each candidate is tried in turn: batch shims through the shell,
 * real programs directly, and the bare name last.
 */
function launchSpecs(preset) {
  const specs = [];
  const add = (command, shell) => {
    if (command && !specs.some((spec) => spec.command.toLowerCase() === command.toLowerCase())) specs.push({ command, shell });
  };
  const isBatch = (p) => /\.(cmd|bat)$/i.test(p);
  for (const found of installedPaths(preset.bin)) add(found, isBatch(found));
  if (process.platform === 'win32') add(preset.bin, true); // lets cmd.exe resolve a .cmd on PATH
  add(preset.bin, false);
  return specs;
}

function once(preset, spec, args, prompt, cwd) {
  return new Promise((resolve, reject) => {
    const opts = { cwd, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'], env: process.env };
    let child;
    try {
      child = spec.shell
        ? spawn([spec.command, ...args.map(quoteWin)].join(' '), { ...opts, shell: true })
        : spawn(spec.command, args, opts);
    } catch (error) {
      error.startFailed = true;
      return reject(error);
    }
    let out = '';
    let err = '';
    let done = false;
    const finish = (fn, v) => { if (!done) { done = true; clearTimeout(timer); fn(v); } };
    const timer = setTimeout(() => { child.kill(); finish(reject, httpError(504, `${preset.name} took too long to answer.`)); }, TIMEOUT_MS);
    child.stdout.on('data', (d) => { if (out.length < 8_000_000) out += d; });
    child.stderr.on('data', (d) => { if (err.length < 64_000) err += d; });
    // A start failure (`error` event) means this shim could not be used at all: try the next.
    child.on('error', (e) => { e.startFailed = START_FAILURES.has(e.code); finish(reject, e); });
    child.on('close', (code) => {
      if (code === 0) return finish(resolve, strip(out));
      finish(reject, httpError(502, `${preset.name} stopped with an error${code != null ? ` (code ${code})` : ''}: ${strip(err || out).trim().slice(-300) || 'no message'}`));
    });
    child.stdin.on('error', () => { /* the tool closed early; the exit code explains why */ });
    if (preset.via === 'stdin') child.stdin.end(prompt); else child.stdin.end();
  });
}

function startFailure(preset, error) {
  if (error?.code === 'ENOENT') {
    return httpError(400, `${preset.name} was not found on this computer. Install it, sign in once, and try again.`);
  }
  const hint = process.platform === 'win32'
    ? ' One of its launchers on PATH cannot be started (a command file renamed to .exe does this). Reinstall the tool, or remove the broken file from PATH.'
    : '';
  return httpError(400, `${preset.name} is installed but could not be started (${error?.code || 'unknown error'}).${hint}`);
}

export async function runCli(id, { model, prompt }) {
  const preset = CLI_PRESETS[id];
  if (!preset) throw httpError(400, 'Unknown tool.');
  if (!validCliModel(model)) throw httpError(400, 'That model name has characters that are not allowed.');
  // Nothing on PATH at all: say so plainly. Falling through to the shell would instead come
  // back as a "not recognized" exit code, which reads like the tool ran and failed.
  if (installedPaths(preset.bin).length === 0) throw startFailure(preset, { code: 'ENOENT' });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'exam-studio-')); // runs here so the tool reads no project files
  try {
    let file = '';
    if (preset.via === 'file') {
      file = path.join(dir, 'instructions.txt');
      fs.writeFileSync(file, prompt);
    }
    const args = preset.args({ model, file });
    let lastError;
    for (const spec of launchSpecs(preset)) {
      try {
        return await once(preset, spec, args, prompt, dir);
      } catch (error) {
        // The tool started and reported a problem: that answer is final.
        if (!error.startFailed) throw error;
        lastError = error;
      }
    }
    throw startFailure(preset, lastError);
  } finally {
    // Windows can still be holding the folder a moment after the child exits, and rmSync then
    // fails with EPERM. That must never throw away an answer the tool already gave us, so the
    // retries are built in and a cleanup that still fails is simply left behind in the temp dir.
    try {
      fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 150 });
    } catch { /* an orphan temp folder is not worth losing a finished paper over */ }
  }
}

export { launchSpecs };
