// Copy-paste setup for connecting Exam Studio's MCP server to AI agents and terminal tools.
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const NAME = 'exam-studio';

export function launchInfo() {
  const electron = Boolean(process.versions.electron);
  const env = {};
  if (electron) env.ELECTRON_RUN_AS_NODE = '1'; // lets the desktop app's own program run the server script
  // Make the agent server use the same library and settings as the app that is showing this page.
  if (process.env.DATA_FILE) env.DATA_FILE = path.resolve(process.env.DATA_FILE);
  if (process.env.SETTINGS_FILE) env.SETTINGS_FILE = path.resolve(process.env.SETTINGS_FILE);
  if (process.env.UPDATE_FILE) env.UPDATE_FILE = path.resolve(process.env.UPDATE_FILE);
  if (process.env.UPDATE_REPO) env.UPDATE_REPO = process.env.UPDATE_REPO;
  if (process.env.UPDATE_FEED_URL) env.UPDATE_FEED_URL = process.env.UPDATE_FEED_URL;
  // A packaged desktop app keeps its server files outside the asar, so the path is passed in.
  const script = process.env.EXAM_STUDIO_MCP_ENTRY || path.resolve(here, '../mcp.js');
  return { command: process.execPath, args: [script], env, electron };
}

export function snippets({ command, args, env }) {
  const win = process.platform === 'win32';
  const sh = (s) => (win ? `"${s}"` : `'${String(s).replace(/'/g, "'\\''")}'`);
  const toml = (s) => (String(s).includes("'") ? JSON.stringify(s) : `'${s}'`);
  const envEntries = Object.entries(env);

  // Options go after the server name: with several -e flags, Claude Code rejects them in front of it.
  const claudeCode = `claude mcp add ${NAME} --scope user${envEntries.map(([k, v]) => ` -e ${k}=${sh(v)}`).join('')} -- ${sh(command)} ${args.map(sh).join(' ')}`;

  const codex = [
    `[mcp_servers.${NAME}]`,
    `command = ${toml(command)}`,
    `args = [${args.map(toml).join(', ')}]`,
    ...(envEntries.length ? ['', `[mcp_servers.${NAME}.env]`, ...envEntries.map(([k, v]) => `${k} = ${toml(v)}`)] : []),
  ].join('\n');

  const stdio = { command, args, ...(envEntries.length ? { env } : {}) };
  const claudeDesktop = JSON.stringify({ mcpServers: { [NAME]: stdio } }, null, 2);
  const gemini = claudeDesktop;
  const opencode = JSON.stringify({
    $schema: 'https://opencode.ai/config.json',
    mcp: { [NAME]: { type: 'local', command: [command, ...args], enabled: true, ...(envEntries.length ? { environment: env } : {}) } },
  }, null, 2);

  return { claudeCode, codex, claudeDesktop, gemini, opencode, deepSeekHarness: claudeDesktop };
}
