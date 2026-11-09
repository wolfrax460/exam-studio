export type FaqItem = { q: string; a: string };

const backend = String(import.meta.env.VITE_BACKEND_URL || 'https://examstudio.duckdns.org');

export const config = {
  brand: { name: 'Exam Studio' },
  links: {
    openApp: '/app',
    backendStatus: '/api/health',    github: 'https://github.com/wolfrax460/exam-studio',
    releases: 'https://github.com/wolfrax460/exam-studio/releases',
    contact: 'wolfras87@gmail.com'  },
  nav: [
    { id: 'features', label: 'Features' },
    { id: 'how', label: 'How It Works' },
    { id: 'study-guide', label: 'Study Guide' },
    { id: 'paper-studio', label: 'Paper Studio' },
    { id: 'online-exams', label: 'Online Exams' },
    { id: 'ai-tools', label: 'AI Tools' },
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
    windows: backend + '/downloads/Exam-Studio-Setup-0.2.1.exe',
    mac: 'https://github.com/wolfrax460/exam-studio/releases',
    linux: backend + '/downloads/Exam-Studio-0.2.1.zip'
  },
  desktopReleasesUrl: 'https://github.com/wolfrax460/exam-studio/releases',
  faq: [
    { q: 'What is Exam Studio?', a: 'A teaching workspace for building study notes, handouts, assessment papers, and revision cards from course material.' },
    { q: 'How do I generate study notes?', a: 'Open Study Guide, upload or paste source notes, choose a module and level if useful, then select Generate Study Notes. Review the result before sharing it.' },
    { q: 'Can I create examination papers?', a: 'Yes. Paper Studio supports several question types, marks, and a separate marking scheme.' },
    { q: 'Does Exam Studio support online exams?', a: 'Yes. Publish a paper to create a student link. You can set a timer, attempt limits, and when students see results.' },
    { q: 'Can I download handouts?', a: 'Yes. The Handout workspace supports Word and PDF exports.' },
    { q: 'Can I save generated materials?', a: 'Yes. Your account’s Library stores study notes, handouts, examination papers and flashcards and lets you open them again.' },
    { q: 'How does the Question Bank work?', a: 'Use Paper Studio to create, search, and reuse questions. The current bank and module workspace store their data in this browser.' },
    { q: 'What AI models are supported?', a: 'The provider list includes Claude, OpenAI, DeepSeek, OpenRouter, NVIDIA and Ollama options. Availability depends on your server and account configuration.' },
    { q: 'Is there a desktop application?', a: 'Yes. The Desktop section lists the current downloads and setup instructions. The desktop app runs its own local workspace.' },
    { q: 'Is institution management available?', a: 'Personal teaching workspaces are available. Institution workspace foundations are in development. The roadmap separates current features from planned school management.' },
    { q: 'How do I get started?', a: 'Open Exam Studio, sign in or create an account, and add your first source material in Study Guide.' }
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
