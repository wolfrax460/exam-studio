import { useEffect, useState } from 'react';

type Status = { dailyGenerationLimit: number; anonymousGenerationLimit: number; resetsAt: string } | null;

const tabs = ['curl', 'javascript', 'python', 'mcp'] as const;
type Tab = typeof tabs[number];

export default function AITools() {
  const [limits, setLimits] = useState<Status>(null);
  const [tab, setTab] = useState<Tab>('curl');
  const [token, setToken] = useState('');
  const [notes, setNotes] = useState('Unit 1: ..."');
  const [endpoint, setEndpoint] = useState('/api/v1/generate/study-notes');
  const [status, setStatus] = useState<number | null>(null);
  const [time, setTime] = useState<number | null>(null);
  const [response, setResponse] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/limits').then((r) => r.json()).then((d) => setLimits(d)).catch(() => setLimits(null));
  }, []);

  const snippet = (t: Tab): string => {
    if (t === 'curl') return 'export EXAM_STUDIO_TOKEN="$EXAM_STUDIO_TOKEN"\ncurl -s -X POST https://examstudio.duckdns.org/api/v1/generate/study-notes \\\n  -H "Authorization: Bearer $EXAM_STUDIO_TOKEN" \\\n  -H "Content-Type: application/json" \\\n  -d \'{"notes":"Your sample notes here"}\'';
    if (t === 'javascript') return 'const res = await fetch("https://examstudio.duckdns.org/api/v1/generate/study-notes", {\n  method: "POST",\n  headers: { "Authorization": "Bearer " + process.env.EXAM_STUDIO_TOKEN, "Content-Type": "application/json" },\n  body: JSON.stringify({ notes: "Your sample notes here" })\n});\nconsole.log(await res.json());';
    return 'import requests\nr = requests.post("https://examstudio.duckdns.org/api/v1/generate/study-notes", headers={"Authorization": f"Bearer {token}"}, json={"notes": "Your sample notes here"})\nprint(r.json())';
  };
  const runTry = async () => {
    setStatus(null); setResponse(null); setTime(null);
    const t0 = performance.now();
    try {
      const res = await fetch(endpoint.startsWith('http') ? endpoint : 'https://examstudio.duckdns.org' + endpoint, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token.trim()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes }),
      });
      const txt = await res.text();
      setStatus(res.status);
      setResponse(txt.slice(0, 4000));
      setTime(Math.round(performance.now() - t0));
    } catch (err) {
      setStatus(0);
      setResponse(String(err));
    }
  };

  const copy = async (value: string | null, id: string) => {
    if (!value) return;
    try { await navigator.clipboard.writeText(value); setCopied(id); setTimeout(() => setCopied(null), 1600); } catch {}
  };

  const mcpJson = JSON.stringify({
    mcpServers: {
      examStudio: {
        command: 'node',
        args: ['build/index.js'],
        env: { EXAM_STUDIO_TOKEN: '$EXAM_STUDIO_TOKEN', EXAM_STUDIO_URL: 'https://examstudio.duckdns.org' }
      }
    }
  }, null, 2);

  return (
    <section id="ai-tools" className="section container-x">
      <div className="flex flex-col md:flex-row items-start md:items-center gap-3 mb-6">
        <div className="flex items-center gap-3">
          <span className="px-3 py-1 rounded-full bg-green-500/15 text-green-400 text-sm border border-green-500/30">Live</span>
        </div>
        <h2 className="heading">API &amp; MCP</h2>
        <p className="sub">Generate exams, notes, handouts and flashcards from your own tools and connect AI assistants.</p>
      </div>

      <div className="grid lg:grid-cols-3 gap-5 mb-6">
        {[['Access tokens','Scopes: generate:write, library:read, library:write, export:read. Create, copy once and revoke from account settings.'],
          ['Rate limits',limits ? `Daily generation limit ${limits.dailyGenerationLimit}; anonymous ${limits.anonymousGenerationLimit}; resets ${limits.resetsAt}` : 'Loading...'],
          ['MCP tools','generate_study_notes, generate_handout, generate_exam, generate_flashcards, list_library, get_library_item, export_item, get_usage']
        ].map(([h,d]) => (
          <div key={h} className="card">
            <h3 className="text-lg font-semibold mb-2">{h}</h3>
            <p className="text-sm opacity-80">{d}</p>
          </div>
        ))}
      </div>

      <div className="card mb-6">
        <div className="tabs flex gap-2 mb-4 flex-wrap" role="tablist">
          {tabs.map((t) => (
            <button key={t} role="tab" aria-selected={tab===t} onClick={() => setTab(t)} className={`btn btn-small ${tab===t ? 'btn-primary' : 'btn-ghost'}`}>{t}</button>
          ))}
        </div>
        {tab === 'mcp' ? (
          <div className="relative">
            <pre className="text-xs font-mono whitespace-pre-wrap overflow-auto">{mcpJson}</pre>
          </div>
        ) : (
          <div className="relative">
            <pre className="text-xs font-mono whitespace-pre-wrap overflow-auto">{snippet(tab)}</pre>
            <button onClick={() => copy(snippet(tab), tab)} className="btn btn-ghost btn-small absolute right-2 top-2">{copied===tab ? 'Copied' : 'Copy'}</button>
          </div>
        )}
      </div>

      <div className="card mb-6">
        <h3 className="text-lg font-semibold mb-3">Try it</h3>
        <div className="grid md:grid-cols-2 gap-4">
          <div className="space-y-3">
            <label className="block text-sm">Endpoint</label>
            <select value={endpoint} onChange={(e)=>setEndpoint(e.target.value)} className="w-full" aria-label="Endpoint">
              <option value="/api/v1/generate/study-notes">Study notes</option>
              <option value="/api/v1/generate/flashcards">Flashcards</option>
              <option value="/api/v1/generate/exam">Exam</option>
              <option value="/api/v1/generate/handout">Handout</option>
            </select>
            <label className="block text-sm">Token (kept in memory only)</label>
            <input value={token} onChange={(e)=>setToken(e.target.value)} placeholder="es_live_..." className="w-full px-3 py-2 rounded-lg border border-[color:var(--c-line)] bg-transparent font-mono text-sm" aria-label="Token" />
            <label className="block text-sm">Sample notes</label>
            <textarea value={notes} onChange={(e)=>setNotes(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-[color:var(--c-line)] bg-transparent text-sm h-24" aria-label="Sample notes"></textarea>
            <button onClick={runTry} className="btn btn-primary" disabled={!token.trim()}>Run</button>
          </div>
          <div className="space-y-2">
            <div className="flex gap-4 text-sm opacity-80"><span>Status: {status}</span><span>Time: {time} ms</span></div>
            <pre className="text-xs font-mono whitespace-pre-wrap overflow-auto max-h-64 border rounded p-2">{response || 'Response appears here.'}</pre>
          </div>
        </div>
      </div>

      <div className="flex gap-4 flex-wrap mt-6">
        <a href="/app" className="btn btn-primary">Create an API token</a>
        <a href="/docs" className="btn btn-ghost">Read the docs</a>
      </div>
    </section>
  );
}
