import { useEffect, useState } from 'react';

const KEY = 'examstudio-theme';
export function prefersDark() {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches;
}

export function useTheme() {
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    try { const s = localStorage.getItem(KEY); if (s === 'dark' || s === 'light') return s; } catch {}
    return prefersDark() ? 'dark' : 'light';
  });
  useEffect(() => {
    try { localStorage.setItem(KEY, theme); } catch {}
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);
  const toggle = () => setTheme(prev => (prev === 'dark' ? 'light' : 'dark'));
  return { theme, toggle, setTheme };
}
