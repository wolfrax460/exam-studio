import { BookOpen, ClipboardList, FileText, FolderKanban, GraduationCap, Layers, Library, Network, NotebookPen } from 'lucide-react';

export const product = {
  study: {
    title: 'Study Guide', icon: BookOpen, image: 'study-notes', alt: 'Exam Studio Study Guide with a formatted study-notes preview and source panel',
    summary: 'Turn course materials into structured notes for teaching and revision.',
    highlights: ['Upload documents, paste text, or choose from the notes folder', 'Review structured notes before sharing them', 'Save to Library, export to Word, or print'],
    href: '/app#notes',
  },
  handout: {
    title: 'Handout Generator', icon: FileText, image: 'handout', alt: 'Exam Studio handout preview with lessons and revision material',
    summary: 'Build a printable teaching handout with unit-by-unit lessons, examples, and revision support.',
    highlights: ['Choose which units to include', 'Review lessons, key terms, and worked examples', 'Export to Word or PDF'],
    href: '/app#handout',
  },
  paper: {
    title: 'Paper Studio', icon: ClipboardList, image: 'exam-paper', alt: 'Generated examination paper in Exam Studio’s Paper Studio',
    summary: 'Build examination papers and separate marking schemes in a dedicated workspace.',
    highlights: ['Choose question types and total marks', 'Review and export the paper and marking scheme', 'Publish a paper online when it is ready'],
    href: '/app#exam',
  },
  bank: {
    title: 'Question Bank', icon: NotebookPen, image: 'question-bank', alt: 'Question Bank tools for finding and reusing questions in Paper Studio',
    summary: 'Create, search, and reuse questions when assembling a paper.',
    highlights: ['Filter by topic or question type', 'Create questions by hand or import supported generated items', 'Bank data is stored in this browser'],
    href: '/app#studio',
  },
  modules: {
    title: 'Modules', icon: FolderKanban, image: 'modules', alt: 'Module management screen in the Exam Studio workspace',
    summary: 'Organize reusable questions by module and learning outcome.',
    highlights: ['Group teaching materials by module', 'Organize questions by learning outcome', 'Module data is stored in this browser'],
    href: '/app#studio',
  },
  cards: {
    title: 'Flashcards', icon: Layers, image: 'flashcards', alt: 'Flashcard review in Exam Studio',
    summary: 'Make quick revision cards and revisit concepts with active recall.',
    highlights: ['Create cards from the source material', 'Reveal answers when you are ready', 'Save a set to the Library'],
    href: '/app#flashcards',
  },
  library: {
    title: 'Library', icon: Library, image: 'library', alt: 'Saved notes, handouts, papers and flashcard sets in the Exam Studio Library',
    summary: 'Keep teaching materials together and reopen them when you need them.',
    highlights: ['Save notes, handouts, papers and flashcards', 'Search by title and filter by resource type', 'Open a saved item in its original workspace'],
    href: '/app#library',
  },
  online: {
    title: 'Online Exams', icon: GraduationCap, image: 'online-exam', alt: 'Student taking a timed sample exam in Exam Studio',
    summary: 'Publish a paper with a shareable link, a timer, and configurable result visibility.',
    highlights: ['Set duration and attempt limits', 'Students can submit through the web interface', 'Review submissions and available scoring statistics'],
    href: '/app#exam',
  },
  ai: {
    title: 'AI Integrations', icon: Network, image: 'ai-settings', alt: 'Exam Studio’s AI settings dialog showing provider selection',
    summary: 'Choose a supported model in Settings or connect compatible tools through API tokens and MCP.',
    highlights: ['Provider availability depends on the server and account', 'Use compatible API and MCP clients', 'Review AI-generated content before using it'],
    href: '/docs',
  },
} as const;

export type ProductKey = keyof typeof product;
export const appUrl = '/app';
export const galleryTabs: ProductKey[] = ['study', 'paper', 'bank', 'cards', 'library', 'online'];
