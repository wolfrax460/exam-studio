import React, { useEffect, useRef, useState } from 'react';
import { get } from './api.js';

const TOOLS = [
  { id: 'claudeDesktop', label: 'Claude Desktop', kind: 'json',
    where: 'Open Claude Desktop, then Settings, Developer, Edit Config. Paste this into claude_desktop_config.json (if it already has "mcpServers", add only the "exam-studio" entry), then restart Claude Desktop.',
    paths: ['Windows: %APPDATA%\\Claude\\claude_desktop_config.json', 'macOS: ~/Library/Application Support/Claude/claude_desktop_config.json'] },
  { id: 'claudeCode', label: 'Claude Code', kind: 'shell', where: 'Run this once in any terminal. Check it with: claude mcp list. It also works when Claude Code runs on DeepSeek or another model.' },
  { id: 'codex', label: 'Codex', kind: 'toml', where: 'Add this to ~/.codex/config.toml (on Windows: C:\\Users\\you\\.codex\\config.toml), then restart Codex.' },
  { id: 'opencode', label: 'OpenCode', kind: 'json', where: 'Add this to opencode.json in your project, or to your global OpenCode config. If the file already has an "mcp" section, add only the "exam-studio" entry.' },
  { id: 'gemini', label: 'Gemini CLI', kind: 'json', where: 'Add this to ~/.gemini/settings.json (on Windows: C:\\Users\\you\\.gemini\\settings.json). Not tested by the author.' },
  { id: 'deepSeekHarness', label: 'DeepSeek Harness (DSH)', kind: 'json', where: "Add this to DSH's MCP server configuration (the same \"mcpServers\" JSON form DSH uses). Restart the harness to pick up the new server. DSH can also spawn harness models as its own provider if you prefer no API key." },
];

const TRY = [
  'Read ~/Documents/notes/unit2.pdf and make a 100 mark exam with a marking scheme as Word and PDF.',
  'Make study notes from this file and save them as PDF.',
  'Check this exam for mistakes, fix them, and export it.',
];

export default function Agents({ onClose, onOpenSettings }) {
  const [info, setInfo] = useState(null);
  const [tool, setTool] = useState(TOOLS[0].id);
  const [copied, setCopied] = useState('');
  const [err, setErr] = useState('');
  const first = useRef(null);

  useEffect(() => { get('/agents/info').then(setInfo).catch((e) => setErr(e.message)); }, []);
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  useEffect(() => { first.current?.focus(); }, [info]);

  const cur = TOOLS.find((t) => t.id === tool);
  const code = info?.snippets?.[tool] || '';
  async function copy() {
    try { await navigator.clipboard.writeText(code); setCopied(tool); setTimeout(() => setCopied(''), 2000); }
    catch { setErr('Copy did not work here. Select the text and copy it by hand.'); }
  }

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog wide" role="dialog" aria-modal="true" aria-labelledby="agents-title">
        <div className="dialog-head">
          <h2 id="agents-title">Connect AI agents</h2>
          <button className="link" onClick={onClose} aria-label="Close">Close</button>
        </div>
        <p className="hint">Exam Studio can be a tool inside Claude Desktop, Claude Code, Codex, OpenCode, Gemini CLI and any other app that supports MCP. The agent reads your notes, writes the exam, and Exam Studio checks it and saves the Word, PDF and CSV files in <strong>Documents/Exam Studio</strong>.</p>

        <nav className="tabs" role="tablist" aria-label="Agent">
          {TOOLS.map((t, i) => (
            <button key={t.id} ref={i === 0 ? first : null} role="tab" aria-selected={tool === t.id} className={tool === t.id ? 'on' : ''} onClick={() => setTool(t.id)}>{t.label}</button>
          ))}
        </nav>

        {err && <div className="banner error" role="alert">{err}</div>}
        {!info && !err && <p className="hint">Loading…</p>}
        {info && (
          <>
            <p>{cur.where}</p>
            {cur.paths && <ul className="paths">{cur.paths.map((p) => <li key={p}><code>{p}</code></li>)}</ul>}
            <pre className="code" tabIndex={0}><code>{code}</code></pre>
            <div className="bar">
              <button className="primary" onClick={copy}>{copied === tool ? 'Copied' : 'Copy'}</button>
            </div>
            {info.electron && <p className="hint">This is the desktop app, so the command runs the app's own program. Keep the app installed where it is, or paste the new text again after you move it.</p>}
          </>
        )}

        <h3 style={{ marginTop: 14 }}>Then ask your agent</h3>
        <ul className="try">{TRY.map((t) => <li key={t}>{t}</li>)}</ul>

        <h3>The other direction</h3>
        <p className="hint">To make Exam Studio itself use Claude Code, Codex, OpenCode or Gemini CLI as its AI (no API key needed), pick them under <button className="link" onClick={onOpenSettings}>Settings</button>.</p>
      </div>
    </div>
  );
}
