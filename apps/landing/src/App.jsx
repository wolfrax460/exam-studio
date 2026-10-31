import { useEffect, useState } from 'react';

const BACKEND = (typeof window !== 'undefined' && window.BACKEND_URL) || 'https://api.examstudio.app';

export default function App() {
  const [theme, setTheme] = useState(() => (typeof window !== 'undefined' && (localStorage.getItem('theme') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'))) || 'light');
  const [menuOpen, setMenuOpen] = useState(false);
  const [plans, setPlans] = useState([]);
  const [openFaq, setOpenFaq] = useState(null);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    localStorage.setItem('theme', theme);
  }, [theme]);

  useEffect(() => {
    fetch(BACKEND + '/api/v1/public/plans').then(r => r.json()).then(d => setPlans(d.items || d.plans || [])).catch(() => setPlans([]));
  }, []);

  return (
    <div className="min-h-screen bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100">
      <header className="sticky top-0 z-50 bg-white/80 dark:bg-gray-900/80 backdrop-blur border-b border-gray-200 dark:border-gray-700">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <a href="#" className="font-bold text-xl">Exam Studio</a>
          <nav className="hidden md:flex gap-6">
            <a href="#features" className="hover:text-blue-600">Features</a>
            <a href="#how" className="hover:text-blue-600">How it works</a>
            <a href="#plans" className="hover:text-blue-600">Plans</a>
            <a href="#ai-tools" className="hover:text-blue-600">AI tools</a>
            <a href="#desktop" className="hover:text-blue-600">Desktop</a>
            <a href="#faq" className="hover:text-blue-600">FAQ</a>
          </nav>
          <div className="flex items-center gap-2">
            <button onClick={() => setTheme(t => t === 'dark' ? 'light' : 'dark')} className="p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-800">{theme === 'dark' ? 'sun' : 'moon'}</button>
            <button className="md:hidden p-2" onClick={() => setMenuOpen(o => !o)}>menu</button>
          </div>
        </div>
        {menuOpen && (
          <div className="md:hidden px-4 pb-3 flex flex-col gap-2">
            {['features','how','plans','ai-tools','desktop','faq'].map(s => (
              <a key={s} href={'#'+s} onClick={() => setMenuOpen(false)} className="py-1">{s}</a>
            ))}
          </div>
        )}
      </header>

      <section className="text-center py-20 px-4">
        <h1 className="text-4xl md:text-6xl font-bold max-w-3xl mx-auto">Turn course notes into study notes, handouts, exams and flashcards</h1>
        <p className="mt-6 text-lg text-gray-600 dark:text-gray-300 max-w-2xl mx-auto">Exam Studio reads your notes and generates structured study notes, printable handouts, exam papers with marking schemes, and flashcards.</p>
        <div className="mt-8 flex gap-4 justify-center">
          <a href="https://app.examstudio.app" className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700">Open Exam Studio</a>
          <a href="#desktop" className="px-6 py-3 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800">Download desktop app</a>
        </div>
      </section>

      <section id="features" className="max-w-6xl mx-auto px-4 py-16">
        <h2 className="text-3xl font-bold mb-8">Features</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {['Study notes','Handouts (Word/PDF)','Exams with marking schemes','Flashcards','Notes library','Exam Studio AI','Admin dashboard','Plans & limits','Export'].map(f => (
            <div key={f} className="p-6 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
              <h3 className="font-semibold text-lg">{f}</h3>
              <p className="text-gray-600 dark:text-gray-300 mt-2 text-sm">Powerful and easy to use.</p>
            </div>
          ))}
        </div>
      </section>

      <section id="how" className="max-w-3xl mx-auto px-4 py-16">
        <h2 className="text-3xl font-bold mb-8">How to use</h2>
        <ol className="space-y-3 list-decimal list-inside">
          <li>Add your notes (paste or upload).</li>
          <li>Choose the unit or module.</li>
          <li>Generate study notes, handout, exam or flashcards.</li>
          <li>Review and edit.</li>
          <li>Export to Word/PDF.</li>
        </ol>
        <p className="mt-4 text-gray-500 italic">Tip: generate one unit at a time for best results.</p>
      </section>

      <section id="plans" className="max-w-6xl mx-auto px-4 py-16">
        <h2 className="text-3xl font-bold mb-8">Plans</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {plans.length ? plans.map(p => (
            <div key={p.id || p.name} className="p-6 rounded-xl border border-gray-200 dark:border-gray-700">
              <h3 className="font-bold text-xl">{p.name}</h3>
              <p className="text-gray-600 dark:text-gray-300 mt-2">{p.description}</p>
            </div>
          )) : (
            <>
              <div className="p-6 rounded-xl border border-gray-200 dark:border-gray-700"><h3 className="font-bold text-xl">Free</h3><p className="text-gray-600 dark:text-gray-300 mt-2">Starter plan.</p></div>
              <div className="p-6 rounded-xl border border-gray-200 dark:border-gray-700"><h3 className="font-bold text-xl">Teacher</h3><p className="text-gray-600 dark:text-gray-300 mt-2">Higher limits.</p></div>
              <div className="p-6 rounded-xl border border-gray-200 dark:border-gray-700"><h3 className="font-bold text-xl">Unlimited</h3><p className="text-gray-600 dark:text-gray-300 mt-2">No limits.</p></div>
            </>
          )}
        </div>
      </section>

      <section id="ai-tools" className="max-w-3xl mx-auto px-4 py-16">
        <h2 className="text-3xl font-bold mb-8">Use with AI tools</h2>
        <p>Integration guides coming soon. MCP (local) and API are available.</p>
        <h3 className="font-semibold mt-4">Access tokens</h3>
        <p className="text-gray-600 dark:text-gray-300">Create an access token in your account settings. Scopes control access.</p>
      </section>

      <section id="desktop" className="max-w-3xl mx-auto px-4 py-16">
        <h2 className="text-3xl font-bold mb-8">Desktop app</h2>
        <p>Download the installer from GitHub Releases, install, then set the server address.</p>
        <a href="https://github.com/wolfrax460/exam-studio/releases" className="mt-4 inline-block px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700">Download</a>
      </section>

      <section id="faq" className="max-w-3xl mx-auto px-4 py-16">
        <h2 className="text-3xl font-bold mb-8">FAQ</h2>
        {[
          { q: 'Are my notes stored?', a: 'Library items are stored per user. Notes are sent to the AI service you configure.' },
          { q: 'Can I use my own model?', a: 'Yes, plans that allow it let you add your own API key.' },
        ].map((f, i) => (
          <div key={i} className="border border-gray-200 dark:border-gray-700 rounded-lg mb-2">
            <button className="w-full text-left p-4 font-semibold" onClick={() => setOpenFaq(openFaq === i ? null : i)}>{f.q}</button>
            {openFaq === i && <div className="p-4 pt-0 text-gray-600 dark:text-gray-300">{f.a}</div>}
          </div>
        ))}
      </section>

      <section id="privacy" className="max-w-3xl mx-auto px-4 py-16">
        <h2 className="text-3xl font-bold mb-4">Privacy</h2>
        <p className="text-gray-600 dark:text-gray-300">Notes are sent to the AI service. We store accounts, library items and usage. No note content in logs.</p>
      </section>

      <section id="terms" className="max-w-3xl mx-auto px-4 py-16">
        <h2 className="text-3xl font-bold mb-4">Terms</h2>
        <p className="text-gray-600 dark:text-gray-300">Use Exam Studio responsibly. Content you generate is your responsibility.</p>
      </section>

      <section id="contact" className="max-w-3xl mx-auto px-4 py-16">
        <h2 className="text-3xl font-bold mb-4">Contact</h2>
        <p className="text-gray-600 dark:text-gray-300">Email: hello@examstudio.app</p>
      </section>

      <section id="changelog" className="max-w-3xl mx-auto px-4 py-16">
        <h2 className="text-3xl font-bold mb-4">Changelog</h2>
        <p className="text-gray-600 dark:text-gray-300">v0.2.1 — initial release.</p>
      </section>

      <footer className="text-center py-8 border-t border-gray-200 dark:border-gray-700 text-gray-500">
        © 2026 Exam Studio
      </footer>
    </div>
  );
}
