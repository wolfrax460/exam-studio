import { useRef, useState } from 'react';
import { ArrowRight, Menu, Moon, Sun, X } from 'lucide-react';
import { config } from '../config';
import { useTheme } from '../hooks/useTheme';

export function Brand({ subtitle = false }: { subtitle?: boolean }) {
  return (
    <a href="/" className="site-brand" aria-label="Exam Studio home">
      <img src="/images/brand/exam-studio-mark.svg" alt="" width={38} height={38} />
      <span><strong>Exam Studio</strong>{subtitle && <small>Teaching & Assessment Platform</small>}</span>
    </a>
  );
}

export default function SiteNav() {
  const [open, setOpen] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const { theme, toggle } = useTheme();
  const links = config.nav.map(({ id, label }) => (
    <a key={id} href={`/#${id}`} onClick={() => setOpen(false)}>{label}</a>
  ));
  return (
    <header className="site-header" onKeyDown={(event) => {
      if (event.key === 'Escape' && open) { setOpen(false); toggleRef.current?.focus(); }
    }}>
      <a className="skip-link" href="#main-content">Skip to content</a>
      <div className="site-nav market-wrap">
        <Brand />
        <nav className="site-nav-links" aria-label="Primary">{links}</nav>
        <div className="site-nav-actions">
          <a className="site-sign-in" href="/app">Sign In</a>
          <a className="market-button primary site-start" href="/app">Get Started <ArrowRight size={15} /></a>
          <button className="site-icon-button" type="button" aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`} onClick={toggle}>
            {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
          </button>
          <button className="site-icon-button mobile-menu-toggle" ref={toggleRef} type="button" aria-label={open ? 'Close menu' : 'Open menu'} aria-controls="mobile-navigation" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
            {open ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>
      <nav id="mobile-navigation" className="mobile-menu market-wrap" aria-label="Mobile" hidden={!open}>
        {links}
        <a href="/app">Sign In</a>
        <a href="/app" className="market-button primary">Get Started <ArrowRight size={15} /></a>
      </nav>
    </header>
  );
}
