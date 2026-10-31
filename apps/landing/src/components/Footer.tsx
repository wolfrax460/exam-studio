import { useEffect, useState } from 'react';
import { config } from '../config';

function BackendStatus() {
  const [status, setStatus] = useState<'unknown'|'up'|'down'>('unknown');
  useEffect(() => {
    const url = `${config.links.openApp.replace(/\/$/, '')}/health`;
    fetch(url, { mode: 'cors', cache: 'no-cache' })
      .then((r) => r.ok ? setStatus('up') : setStatus('down'))
      .catch(() => setStatus('down'));
  }, []);
  const color = status === 'up' ? '#4fae8a' : status === 'down' ? '#e11d48' : '#9ca3af';
  return (
    <span className="inline-flex items-center gap-2 text-sm" aria-live="polite">
      <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: color }} aria-hidden />
      {status === 'unknown' ? 'Checking backend…' : status === 'up' ? 'Backend online' : 'Backend unavailable'}
    </span>
  );
}

export default function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer className="border-t border-[color:var(--c-line)] py-10">
      <div className="container-x flex flex-col md:flex-row md:items-center md:justify-between gap-6">
        <div className="space-y-2">
          <p className="font-semibold">{config.brand.name}</p>
          <p className="text-xs" style={{ color: 'var(--c-muted)' }}>© {year} {config.brand.name}. All rights reserved.</p>
          <BackendStatus />
        </div>
        <nav className="flex flex-wrap gap-4">
          {config.footer.map(l => (
            <a key={l.label} href={l.href} className="text-sm text-[color:var(--c-muted)] hover:text-[color:var(--c-accent)]">{l.label}</a>
          ))}
        </nav>
      </div>
    </footer>
  );
}
