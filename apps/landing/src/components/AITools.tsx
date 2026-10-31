import { useEffect, useState, useCallback } from 'react';
import { config } from '../config';

type StatusTab = 'curl' | 'javascript' | 'python' | 'mcp';
type ViewTab = 'api' | 'integrations';

type Limits = {
  dailyGenerationLimit: number;
  anonymousGenerationLimit: number;
  resetsAt: string;
} | null;

type EndpointStatus = {
  path: string;
  methods: string[];
  status: 'ok' | 'checking' | 'error';
} | null;

export default function AITools() {
  const [limits, setLimits] = useState<Limits>(null);
  const [tab, setTab] = useState<StatusTab>('curl');
  const [view, setView] = useState<ViewTab>('api');
  const [token, setToken] = useState('');
  const [notes, setNotes] = useState<string>(config.sampleNote);
  const [endpoint, setEndpoint] = useState('/api/v1/generate/study-notes');
  const [status, setStatus] = useState<number | null>(null);
  const [time, setTime] = useState<number | null>(null);
  const [response, setResponse] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [endpointStatus, setEndpointStatus] = useState<EndpointStatus[]>([]);

  // Fetch rate limits and reset time from the backend.
  useEffect(() => {
    fetch('/api/limits', { cache: 'no-cache' })
      .then((r) => r.ok ? r.json() : null)
      .then((d) => {
        if (d) setLimits({
          dailyGenerationLimit: Number(d.dailyGenerationLimit ?? 10),
          anonymousGenerationLimit: Number(d.anonymousGenerationLimit ?? 3),
          resetsAt: String(d.resetsAt ?? ''),
        });
      })
      .catch(() => setLimits(null));
  }, []);

  // Fetch OpenAPI endpoint status so visitors can see which endpoints are live.
  useEffect(() => {
    fetch('https://examstudio.duckdns.org/api/v1/openapi.json', { cache: 'no-cache' })
      .then((r) => r.ok ? r.json() : null)
      .then((spec) => {
        if (!spec?.paths) return;
        const entries = Object.entries(spec.paths).map(([path, item]: [string, any]) => {
          const methods = (item && typeof item === 'object') ? Object.keys(item).filter((k) => ['get','post','put','delete','patch'].includes(k)).map((m) => m.toUpperCase()) : [];
          return { path, methods, status: 'ok' as const };
        });
        setEndpointStatus(entries);
      })
      .catch(() => setEndpointStatus([]));
  }, []);

  const resetCountdown = useCallback((): string => {
    if (!limits?.resetsAt) return '–';
    const target = new Date(limits.resetsAt).getTime();
    const now = Date.now();
    const diff = Math.max(0, target - now);
    if (diff === 0) return 'Resets now';
    const h = Math.floor(diff / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    const s = Math.floor((diff % 60000) / 1000);
    return h > 0 ? `${h}h ${m}m ${s}s` : `${m}m ${s}s`;
  }, [limits]);

  const snippet = (t: StatusTab): string => {
    if (t === 'curl') {
      return `curl -s -X POST https://examstudio.duckdns.org/api/v1/generate/study-notes \\\n  -H "Authorization: Bearer $EXAM_STUDIO_TOKEN" \\\n  -H "Content-Type: application/json; charset=utf-8" \\\n  -d '{"text": "${notes.replace(/"/g, '\\"').slice(0, 120)}..."}'`;
    }
    if (t === 'javascript') {
      return `const res = await fetch("https://examstudio.duckdns.org/api/v1/generate/study-notes", {\n  method: "POST",\n  headers: { "Authorization": "Bearer " + process.env.EXAM_STUDIO_TOKEN, "Content-Type": "application/json; charset=utf-8" },\n  body: JSON.stringify({ text: "Your notes here" })\n});\nconsole.log(await res.json());`;
    }
    if (t === 'python') {
      return `import requests\nr = requests.post("https://examstudio.duckdns.org/api/v1/generate/study-notes", headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json; charset=utf-8"}, json={"text": "Your notes here"})\nprint(r.json())`;
    }
    // MCP tab: real, tested connector configs with absolute URLs, no $VARS.
    return JSON.stringify({
      mcpServers: {
        'exam-studio': {
          url: 'https://examstudio.duckdns.org/mcp',
          headers: {
            'Authorization': 'Bearer es_live_YOUR_PERSONAL_ACCESS_TOKEN',
          },
        },
      },
    }, null, 2);
  };

  const runTry = async () => {
    setStatus(null); setResponse(null); setTime(null);
    const t0 = performance.now();
    try {
      const res = await fetch(endpoint.startsWith('http') ? endpoint : 'https://examstudio.duckdns.org' + endpoint, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token.trim()}`, 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify({ text: notes }),
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

  const mcpConfigs = {
    'Claude Desktop': `{
  "mcpServers": {
    "exam-studio": {
      "url": "https://examstudio.duckdns.org/mcp",
      "headers": {
        "Authorization": "Bearer es_live_YOUR_PERSONAL_ACCESS_TOKEN"
      }
    }
  }
}`,
    'opencode': `{
  "mcpServers": {
    "exam-studio": {
      "url": "https://examstudio.duckdns.org/mcp",
      "headers": {
        "Authorization": "Bearer es_live_YOUR_PERSONAL_ACCESS_TOKEN"
      }
    }
  }
}`,
    'Cursor': `{
  "mcpServers": {
    "exam-studio": {
      "url": "https://examstudio.duckdns.org/mcp",
      "headers": {
        "Authorization": "Bearer es_live_YOUR_PERSONAL_ACCESS_TOKEN"
      }
    }
  }
}`,
  };

  const downloadLinks = [
    { name: 'Exam Studio Skill (Claude)', url: 'https://examstudio.duckdns.org/downloads/integrations/0.2.1/exam-studio-skill-0.2.1.zip', type: 'zip' },
    { name: 'Exam Studio Plugin (Claude)', url: 'https://examstudio.duckdns.org/downloads/integrations/0.2.1/exam-studio-plugin-0.2.1.zip', type: 'zip' },
    { name: 'OpenAPI (ChatGPT Actions)', url: 'https://examstudio.duckdns.org/downloads/chatgpt/openapi.json', type: 'json' },
    { name: 'Tool definitions (DeepSeek / OpenAI-compatible)', url: 'https://examstudio.duckdns.org/downloads/integrations/0.2.1/tools.json', type: 'json' },
  ];

  return (
    <section id="ai-tools" className="section container-x">
      {/* Heading row: badge, heading, subtitle stacked properly */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3 mb-6">
        <div className="flex items-center gap-3 shrink-0">
          <span className="px-3 py-1 rounded-full bg-green-500/15 text-green-400 text-sm border border-green-500/30">Live</span>
        </div>
        <div>
          <h2 className="heading">API &amp; MCP</h2>
          <p className="sub">Generate exams, notes, handouts and flashcards from your own tools, and connect AI assistants (Claude, ChatGPT, DeepSeek, Cursor, opencode).</p>
        </div>
      </div>

      {/* Quick facts cards */}
      <div className="grid lg:grid-cols-3 gap-4 mb-8">
        <div className="card">
          <h3 className="text-lg font-semibold mb-2">Access tokens</h3>
          <p className="text-sm opacity-80">Create, copy once, revoke. Scopes: generate:write, library:read, library:write, export:read. From account settings.</p>
        </div>
        <div className="card">
          <h3 className="text-lg font-semibold mb-2">Daily limit resets</h3>
          <p className="text-sm opacity-80">{limits ? `In ${resetCountdown()} (Africa/Kigali midnight)` : 'Loading…'}</p>
          {limits && <p className="text-xs mt-2 opacity-70">Limit: {limits.dailyGenerationLimit} generations/day; anonymous: {limits.anonymousGenerationLimit}</p>}
        </div>
        <div className="card">
          <h3 className="text-lg font-semibold mb-2">MCP tools</h3>
          <p className="text-sm opacity-80">format_guide, read_notes, generate_exam, generate_notes, generate_flashcards, generate_handout, check_exam, check_handout, export_exam, export_notes, export_handout, library</p>
        </div>
      </div>

      {/* View tabs: API tester vs Integrations */}
      <div className="tabs flex gap-2 mb-4 flex-wrap" role="tablist" aria-label="Section">
        <button role="tab" aria-selected={view === 'api'} onClick={() => setView('api')} className={`btn btn-small ${view === 'api' ? 'btn-primary' : 'btn-ghost'}`}>API tester</button>
        <button role="tab" aria-selected={view === 'integrations'} onClick={() => setView('integrations')} className={`btn btn-small ${view === 'integrations' ? 'btn-primary' : 'btn-ghost'}`}>Integrations</button>
      </div>

      {/* ===== API tester view ===== */}
      {view === 'api' && (
        <>
          {/* Status tabs */}
          <div className="tabs flex gap-2 mb-4 flex-wrap" role="tablist" aria-label="Code sample">
            {(['curl', 'javascript', 'python', 'mcp'] as const).map((t) => (
              <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={`btn btn-small ${tab === t ? 'btn-primary' : 'btn-ghost'}`}>{t}</button>
            ))}
          </div>

          <div className="card mb-6">
            {tab === 'mcp' ? (
              <div className="relative">
                <pre className="text-xs font-mono whitespace-pre-wrap overflow-auto">{snippet('mcp')}</pre>
                <div className="flex gap-2 absolute right-2 top-2">
                  {Object.entries(mcpConfigs).map(([name, cfg]) => (
                    <button key={name} onClick={() => copy(cfg, name)} className="btn btn-ghost btn-small text-xs" title={`Copy ${name} config`}>{copied === name ? 'Copied' : 'Copy ' + name}</button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="relative">
                <pre className="text-xs font-mono whitespace-pre-wrap overflow-auto">{snippet(tab)}</pre>
                <button onClick={() => copy(snippet(tab), tab)} className="btn btn-ghost btn-small absolute right-2 top-2">{copied === tab ? 'Copied' : 'Copy'}</button>
              </div>
            )}
          </div>

          {/* Live endpoint status from openapi.json */}
          <div className="card mb-6">
            <h3 className="text-lg font-semibold mb-3">Endpoint status</h3>
            <p className="text-sm opacity-80 mb-3">Live status from <a className="underline" href="https://examstudio.duckdns.org/api/v1/openapi.json" target="_blank" rel="noopener">/api/v1/openapi.json</a>. Full docs at <a className="underline" href="/docs">/docs</a>.</p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b border-[color:var(--c-line)]">
                    <th className="text-left pb-2 text-[color:var(--c-muted)]">Path</th>
                    <th className="text-left pb-2 text-[color:var(--c-muted)]">Methods</th>
                    <th className="text-left pb-2 text-[color:var(--c-muted)]">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {endpointStatus.map((e) => {
                    if (!e) return null;
                    return (
                      <tr key={e.path} className="border-b border-[color:var(--c-line)]">
                        <td className="py-2 font-mono">{e.path}</td>
                        <td className="py-2">{e.methods.join(', ')}</td>
                        <td className="py-2"><span className="inline-block w-2 h-2 rounded-full" style={{ background: '#4fae8a' }} aria-hidden /> Live</td>
                      </tr>
                    );
                  })}
                  {endpointStatus.length === 0 && (
                    <tr><td colSpan={3} className="py-4 text-center opacity-60">Loading endpoint status…</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Try it */}
          <div className="card mb-6">
            <h3 className="text-lg font-semibold mb-3">Try it</h3>
            <div className="grid md:grid-cols-2 gap-4">
              <div className="space-y-3">
                <label className="block text-sm">Endpoint</label>
                <select value={endpoint} onChange={(e) => setEndpoint(e.target.value)} className="w-full" aria-label="Endpoint">
                  <option value="/api/v1/generate/study-notes">Study notes</option>
                  <option value="/api/v1/generate/flashcards">Flashcards</option>
                  <option value="/api/v1/generate/exam">Exam</option>
                  <option value="/api/v1/generate/handout">Handout</option>
                </select>
                <label className="block text-sm">Token (kept in memory only)</label>
                <input value={token} onChange={(e) => setToken(e.target.value)} placeholder="es_live_..." className="w-full px-3 py-2 rounded-lg border border-[color:var(--c-line)] bg-transparent font-mono text-sm" aria-label="Token" />
                <label className="block text-sm">Sample notes</label>
                <textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-[color:var(--c-line)] bg-transparent text-sm h-24" aria-label="Sample notes"></textarea>
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
        </>
      )}

      {/* ===== Integrations view ===== */}
      {view === 'integrations' && (
        <>
          <div className="mb-6">
            <h3 className="text-lg font-semibold mb-2">Connect Exam Studio to your AI assistant</h3>
            <p className="text-sm opacity-80">Choose your client, copy the config, add your personal access token, and verify.</p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5 mb-8">
            {[
              {
                name: 'Claude (Connector)',
                desc: 'Add https://examstudio.duckdns.org/mcp as a custom connector in Claude.',
                files: ['claude-desktop-connector.json'],
              },
              {
                name: 'ChatGPT (Custom GPT)',
                desc: 'Create a Custom GPT with Actions using the trimmed OpenAPI schema.',
                files: ['openapi.json'],
                url: '/downloads/chatgpt/openapi.json',
              },
              {
                name: 'DeepSeek / Other',
                desc: 'OpenAI-compatible function definitions and example scripts (Node + Python).',
                files: ['tools.json'],
                url: '/downloads/integrations/0.2.1/tools.json',
              },
            ].map((item) => (
              <div key={item.name} className="card p-4">
                <h4 className="font-semibold mb-1">{item.name}</h4>
                <p className="text-sm opacity-80 mb-3">{item.desc}</p>
                <div className="flex gap-2">
                  {item.files.map((f) => {
                    const url = item.url ?? `https://examstudio.duckdns.org/downloads/claude/${f}`;
                    return (
                      <a key={f} href={url} className="btn btn-ghost btn-small text-xs" target="_blank" rel="noopener">Download {f.split('.').pop()}</a>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          <div className="card mb-6">
            <h3 className="text-lg font-semibold mb-3">Connection status</h3>
            <p className="text-sm opacity-80 mb-3">Test your personal access token against the live API. The token stays in browser memory only — it is never sent to this page's server.</p>
            <div className="space-y-3">
              <input
                type="password"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="Paste your est_... token here"
                className="w-full px-3 py-2 rounded-lg border border-[color:var(--c-line)] bg-transparent font-mono text-sm"
                aria-label="Personal access token"
              />
              <button onClick={runTry} className="btn btn-primary" disabled={!token.trim()}>Verify token</button>
              {status !== null && (
                <p className={`text-sm ${status === 200 ? 'text-green-400' : 'text-red-400'}`}>
                  {status === 200 ? 'Token is valid and the API is reachable.' : `Verification failed (HTTP ${status}). Check your token and try again.`}
                </p>
              )}
            </div>
          </div>

          <div className="card mb-6">
            <h3 className="text-lg font-semibold mb-3">Download packages</h3>
            <p className="text-sm opacity-80 mb-3">Verified packages with SHA-256 checksums.</p>
            <div className="space-y-2">
              {downloadLinks.map((dl) => (
                <div key={dl.name} className="flex items-center gap-3 px-3 py-2 bg-[color:var(--c-bg)] rounded-lg border border-[color:var(--c-line)]">
                  <a href={dl.url} className="flex-1 text-sm underline" target="_blank" rel="noopener">{dl.name}</a>
                  <span className="text-xs font-mono opacity-60">{dl.type.toUpperCase()}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </section>
  );
}
