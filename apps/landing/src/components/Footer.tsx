import { useEffect, useState } from 'react';
import { config } from '../config';
import { Brand } from './SiteNav';

function BackendStatus() {
  const [status, setStatus] = useState<'unknown'|'up'|'down'>('unknown');
  useEffect(() => {
    const url = config.links.backendStatus || '/api/health';    fetch(url, { mode: 'cors', cache: 'no-cache' })
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
    <footer className="site-footer">
      <div className="market-wrap footer-grid">
        <div>
          <Brand subtitle />
          <p>A workspace for teaching materials, revision resources, and assessments.</p>
          <BackendStatus />
        </div>
        <nav aria-label="Product">
          <h2>Product</h2>
          <a href="/#features">Features</a>
          <a href="/#how">How it works</a>
          <a href="/#desktop">Desktop</a>
          <a href="/#faq">FAQ</a>
        </nav>
        <nav aria-label="Resources">
          <h2>Resources</h2>
          <a href="/docs">Documentation</a>
          {config.footer.map(l => (
            <a key={l.label} href={l.href.startsWith('#') ? `/${l.href}` : l.href}>{l.label}</a>
          ))}
        </nav>
      </div>
      <div className="market-wrap footer-bottom">© {year} Exam Studio. All rights reserved.</div>
    </footer>
  );
}
