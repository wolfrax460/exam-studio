export type FaqItem = { q: string; a: string };

export const config = {
  brand: { name: 'Exam Studio' },
  links: {
    openApp: '/app',
    backendStatus: '/api/health',    github: 'https://github.com/wolfrax460/exam-studio',
    releases: 'https://github.com/wolfrax460/exam-studio/releases',
    contact: 'wolfras87@gmail.com'  },
  nav: [
    { id: 'features', label: 'Features' },
    { id: 'how', label: 'How it works' },
    { id: 'free', label: 'Free' },
    { id: 'ai-tools', label: 'AI tools' },
    { id: 'desktop', label: 'Desktop' },
    { id: 'faq', label: 'FAQ' }
  ],
  hero: {
    headline: 'Turn your course notes into study notes, handouts, exams and flashcards.',
    sub: 'Exam Studio reads your notes and generates structured study notes, printable handouts (Word/PDF), exam papers with separate marking schemes, and flashcards — including trap cards for common mistakes.',
    primaryLabel: 'Open Exam Studio',
    secondaryLabel: 'Download desktop app'
  },
  features: [
    { icon: 'BookOpen', title: 'Study notes', text: 'Structured notes that mirror your course units.' },
    { icon: 'FileText', title: 'Handouts', text: 'Printable handouts exported to Word or PDF.' },
    { icon: 'ClipboardList', title: 'Exams', text: 'Question papers with a separate marking scheme.' },
    { icon: 'Layers', title: 'Flashcards', text: 'Classic cards plus trap cards that target common mistakes.' },
    { icon: 'Library', title: 'Notes library', text: 'Save per-unit notes and detect the units you have already covered.' },
    { icon: 'Cpu', title: 'Exam Studio AI', text: 'Built-in AI with a bring-your-own-model option.' },
    { icon: 'SlidersHorizontal', title: 'Fair use limits', text: 'A daily generation limit shared equally by everyone, raised server-side uniformly.' },
    { icon: 'Download', title: 'Exports', text: 'Word, PDF and CSV exports from day one.' }
  ],
  howSteps: [
    { title: 'Add your notes', text: 'Paste or upload your course notes.' },
    { title: 'Pick the unit', text: 'Choose the unit or module you want to generate.' },
    { title: 'Generate', text: 'Generate study notes, a handout, an exam or flashcards.' },
    { title: 'Review and refine', text: 'Edit the AI output until it is yours.' },
    { title: 'Export', text: 'Export to Word, PDF or CSV and hand out.' }
  ],
  desktop: {
    version: '0.2.1', fileSize: 'Windows setup 171 MB / Linux zip 194 MB', notes: 'Requires setting the server address after install.',
    windows: String(import.meta.env.VITE_BACKEND_URL || 'http://localhost:3100') + '/downloads/Exam-Studio-Setup-0.2.1.exe',
    mac: 'https://github.com/wolfrax460/exam-studio/releases',
    linux: String(import.meta.env.VITE_BACKEND_URL || 'http://localhost:3100') + '/downloads/Exam-Studio-0.2.1.zip'
  },
  desktopReleasesUrl: 'https://github.com/wolfrax460/exam-studio/releases',
  faq: [
    { q: 'Where are my notes stored?', a: 'Library notes are stored per-account on your server. Notes sent to the AI endpoint follow that endpoint policy; we do not log note content.' },
    { q: 'Is it really free?', a: 'Yes. Exam Studio is free for everyone. A fair-use daily generation limit applies to the built-in AI; users with their own model/API key are not limited by it.' },
    { q: 'What file types can I import/export?', a: 'Import pasted text; export Word, PDF and CSV; handwriting recognition is coming soon.' },
    { q: 'What is the daily limit and when does it reset?', a: 'The built-in service allows a fixed number of generations per day, read from the server, and resets at 00:00 Africa/Kigali.' },
    { q: 'What happens when I reach the limit?', a: 'You will see a friendly daily_limit_reached message with the reset time; you can still export and browse saved notes.' },
    { q: 'Can I work offline?', a: 'The desktop app runs locally; generation still needs a configured AI endpoint unless your model runs locally.' },
    { q: 'Do exams have marking schemes?', a: 'Yes — every exam is generated with a separate marking scheme you can print or hide.' },
    { q: 'Can I get more?', a: 'Configure your own model/API key, or email wolfras87@gmail.com for school or class use.' }
  ] as FaqItem[],
  aiTools: {
    title: 'API & MCP — coming soon',
    notifyEndpoint: 'TODO',
    sampleCode: `# Planned usage (illustrative, coming soon)\n\ncurl -s -X POST "$BACKEND/generate/exam" \\\n  -H "Authorization: Bearer $TOKEN" \\\n  -d '{"notes": "...", "unit": 4}'`
  },
  privacy: { title: 'Privacy', body: 'TODO (legal): Describe what data is collected, how notes are handled (sent only to the configured AI endpoint), retention, deletion and contact details.' },
  terms: { title: 'Terms', body: 'TODO (legal): Explain acceptable use, ownership of generated content, liability and jurisdiction.' },
  changelog: [
    { version: 'v0.2.1', date: '2026-10-31', changes: ['Initial public landing page (React, Vite, Tailwind)', 'Dark/light theme with system preference and persistence', 'Pricing comparison table'] }
  ],
  footer: [
    { label: 'Privacy', href: '/privacy' },
    { label: 'Terms', href: '/terms' },
    { label: 'Refunds', href: '/refunds' },
    { label: 'Contact', href: 'mailto:wolfras87@gmail.com' },
    { label: 'GitHub', href: 'https://github.com/wolfrax460/exam-studio' },
    { label: 'Changelog', href: '#changelog' }
  ],
  sampleNote: `Unit 4 — Cell membrane transport.

Osmosis is the movement of water across a selectively permeable membrane. Active transport moves substances against their gradient and requires ATP. Facilitated diffusion uses carrier proteins but no ATP.`
} as const;
export type Config = typeof config;
