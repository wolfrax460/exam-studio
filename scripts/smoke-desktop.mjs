import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const version = JSON.parse(await readFile(new URL('../package.json', import.meta.url))).version;
const home = await mkdtemp(path.join(tmpdir(), 'exam-studio-desktop-'));
const app = spawn(path.resolve(process.argv[2]), [], {
  cwd: home,
  env: {
    ...process.env,
    APPDATA: home,
    HOME: home,
    XDG_CONFIG_HOME: home,
    DOTENV_CONFIG_PATH: path.join(home, 'no-env'),
    MONGODB_URI: 'mongodb://127.0.0.1:59999/desktop_smoke',
    MONGODB_TIMEOUT_MS: '300',
    DEMO_MODE: '1',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});

let output = '';
app.stdout.on('data', (chunk) => { output += chunk; });
app.stderr.on('data', (chunk) => { output += chunk; });
const stopped = new Promise((resolve) => {
  app.once('error', (error) => { output += error.message; });
  app.once('close', resolve);
});

try {
  const deadline = Date.now() + 60_000;
  while (!output.includes('window loaded') && app.exitCode === null && Date.now() < deadline) {
    await Promise.race([stopped, delay(250)]);
    if (!app.pid) break;
  }
  assert.match(output, /window loaded/, 'Packaged Electron window did not load');
  const origin = output.match(/server listening on (http:\/\/127\.0\.0\.1:\d+)/)?.[1];
  assert.ok(origin, 'Embedded server did not start on loopback');

  const healthResponse = await fetch(origin + '/api/health', { signal: AbortSignal.timeout(5_000) });
  assert.ok(healthResponse.ok);
  const health = await healthResponse.json();
  assert.equal(health.version, version);

  const appResponse = await fetch(origin, { signal: AbortSignal.timeout(5_000) });
  assert.ok(appResponse.ok);
  const html = await appResponse.text();
  assert.match(html, /exam-studio-mark-.*\.svg/);
  const script = html.match(/<script[^>]+src="([^"]+\.js)"/)?.[1];
  assert.ok(script, 'The desktop package is missing the compiled React app');
  const scriptResponse = await fetch(new URL(script, origin), { signal: AbortSignal.timeout(5_000) });
  assert.ok(scriptResponse.ok);
  assert.match(scriptResponse.headers.get('content-type'), /javascript/);
  await scriptResponse.body.cancel();
  console.log(`Exam Studio ${version} started, served the React app, and loaded its Electron window.`);
} catch (error) {
  console.error(output);
  throw error;
} finally {
  app.kill();
  await stopped;
  await rm(home, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
