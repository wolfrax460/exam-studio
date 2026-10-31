import { useEffect, useState } from 'react';
import { config } from '../config';
import { useTheme } from '../hooks/useTheme';

function ThemeToggle() {
  const { theme, toggle } = useTheme();
  return (
    <button onClick={toggle} aria-label="Toggle theme" className="p-2 rounded-lg border border-[color:var(--c-line)] outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--c-accent)]">
      {theme === 'dark' ? ' Sun' : ' Moon'}
    </button>
  );
}

export default function Navbar() {
  const [open, setOpen] = useState<boolean>(false);
  const [active, setActive] = useState<string>('features');

  useEffect(() => {
    const handler = () => {
      const sections = config.nav.map((n) => ({ id: n.id, top: document.getElementById(n.id)?.offsetTop ?? Infinity }));
      const y = window.scrollY + 120;
      let current = sections[0]?.id ?? 'features';
      for (const s of sections) if (s.top <= y) current = s.id;
      setActive(current);
    };
    handler();
    window.addEventListener('scroll', handler, { passive: true });
    return () => window.removeEventListener('scroll', handler);
  }, []);

  const smooth = (e: React.MouseEvent, id: string): void => {
    e.preventDefault();
    setOpen(false);
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <header className="sticky top-0 z-50 backdrop-blur border-b border-[color:var(--c-line)]" style={{ background: 'color-mix(in srgb, var(--c-bg) 86%, transparent)' }}>
      <nav className="container-x flex items-center justify-between py-3" aria-label="Primary">
        <a href="#top" className="font-bold text-lg" onClick={(e) => smooth(e, 'top')}>{config.brand.name}</a>
        <div className="hidden md:flex gap-6">
          {config.nav.map((n) => (
            <a key={n.id} href={'#' + n.id} onClick={(e) => smooth(e, n.id)} className={`text-sm hover:text-[color:var(--c-accent)] relative ${active === n.id ? 'font-semibold' : ''}`}>
              {n.label}
              {active === n.id && <span className="absolute -bottom-1 left-0 right-0 h-[2px] bg-[color:var(--c-accent)] rounded-full" />}
            </a>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <a href="#" className="hidden sm:inline-block btn btn-ghost btn-small">Sign in</a>
          <a href={config.links.openApp} className="btn btn-primary btn-small">Get started</a>
          <ThemeToggle />
          <button aria-label="Open menu" className="md:hidden p-2 rounded-lg border border-[color:var(--c-line)]" onClick={() => setOpen((o) => !o)}>
            {open ? '✕' : '≡'}
          </button>
        </div>
      </nav>
      {open && (
        <div className="md:hidden container-x pb-4">
          <ul className="flex flex-col gap-2">
            {config.nav.map((n) => (
              <li key={n.id}><a href={'#' + n.id} onClick={(e) => smooth(e, n.id)} className="block py-2">{n.label}</a></li>
            ))}
          </ul>
        </div>
      )}
    </header>
  );
}
