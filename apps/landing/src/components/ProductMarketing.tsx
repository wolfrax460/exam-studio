import { useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { ArrowDown, ArrowRight, BookOpen, Check, ChevronLeft, ChevronRight, Download, ExternalLink, FileText, GraduationCap, Monitor, Sparkles, Upload } from 'lucide-react';
import { appUrl, galleryTabs, product, type ProductKey } from '../product';

export function ProductImage({ image, alt, eager = false }: { image: string; alt: string; eager?: boolean }) {
  return (
    <img
      className="product-image"
      src={`/images/product/${image}.webp`}
      alt={alt}
      width={1440}
      height={900}
      loading={eager ? 'eager' : 'lazy'}
      fetchPriority={eager ? 'high' : 'auto'}
      decoding="async"
    />
  );
}

export function ProductFrame({ image, alt, label, eager = false }: { image: string; alt: string; label: string; eager?: boolean }) {
  return (
    <figure className="product-frame">
      <div className="product-frame-bar">
        <span className="frame-dots" aria-hidden="true"><i /><i /><i /></span>
        <span>{label}</span>
        <a className="frame-open" href={`/images/product/${image}.webp`} target="_blank" rel="noreferrer" aria-label={`View full-size ${label} screenshot`}><ExternalLink size={14} /></a>
      </div>
      <ProductImage image={image} alt={alt} eager={eager} />
    </figure>
  );
}

export function MarketingHero() {
  return (
    <section className="marketing-hero" aria-labelledby="hero-title">
      <div className="market-wrap">
        <div className="hero-copy">
          <h1 id="hero-title">Create better learning materials.<br /><span>Build smarter exams.</span></h1>
          <p>Transform course materials into structured study notes, professional handouts, examination papers and flashcards, all from one intelligent teaching workspace.</p>
          <div className="market-actions">
            <a className="market-button primary" href={appUrl}>Open Exam Studio <ArrowRight size={18} /></a>
            <a className="market-button" href="#features">Explore Features <ArrowDown size={17} /></a>
          </div>
        </div>
        <ProductFrame image="hero-dashboard" alt={product.study.alt} label="Exam Studio / Study Guide" eager />
        <p className="frame-caption">Actual Exam Studio interface with sample teaching material.</p>
      </div>
    </section>
  );
}

const featureAnchors: Record<ProductKey, string> = {
  study: 'study-guide', handout: 'study-guide', paper: 'paper-studio', bank: 'organize', modules: 'organize',
  cards: 'flashcards', library: 'library', online: 'online-exams', ai: 'ai-tools',
};

export function FeatureGrid() {
  return (
    <section id="features" className="market-section market-wrap" aria-labelledby="features-title">
      <div className="section-copy">
        <h2 id="features-title">Everything you need to teach, create and assess</h2>
        <p>Start with your course material and choose what your class needs next.</p>
      </div>
      <div className="feature-grid">
        {(Object.keys(product) as ProductKey[]).map((key) => {
          const item = product[key];
          return (
            <article className="feature-card" key={key}>
              <div className="feature-card-copy">
                <item.icon className="market-icon" size={22} aria-hidden="true" />
                <h3>{item.title}</h3>
                <p>{item.summary}</p>
              </div>
              <ProductImage image={item.image} alt={item.alt} />
              <a className="market-text-link" href={`#${featureAnchors[key]}`}>Explore {item.title} <ArrowRight size={15} /></a>
            </article>
          );
        })}
      </div>
    </section>
  );
}

export function ProductShowcase() {
  const [active, setActive] = useState(0);
  const tabs = useRef<Array<HTMLButtonElement | null>>([]);
  const handleKey = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const last = galleryTabs.length - 1;
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? last
      : event.key === 'ArrowRight' ? (index + 1) % galleryTabs.length
        : event.key === 'ArrowLeft' ? (index + last) % galleryTabs.length : null;
    if (next === null) return;
    event.preventDefault();
    setActive(next);
    tabs.current[next]?.focus();
  };
  return (
    <section id="showcase" className="market-section market-wrap" aria-labelledby="showcase-title">
      <div className="section-copy"><h2 id="showcase-title">Explore the workspace</h2><p>Switch between real views of Exam Studio.</p></div>
      <div className="showcase">
        <div className="showcase-tabs" role="tablist" aria-label="Exam Studio features">
          {galleryTabs.map((key, index) => (
            <button
              id={`showcase-tab-${key}`} key={key} type="button" role="tab" aria-selected={index === active}
              aria-controls={`showcase-panel-${key}`} tabIndex={index === active ? 0 : -1}
              ref={(el) => { tabs.current[index] = el; }}
              onClick={() => setActive(index)} onKeyDown={(event) => handleKey(event, index)}
            >{product[key].title}</button>
          ))}
        </div>
        {galleryTabs.map((key, index) => {
          const item = product[key];
          return (
            <div key={key} id={`showcase-panel-${key}`} role="tabpanel" aria-labelledby={`showcase-tab-${key}`} hidden={index !== active}>
              {index === active && (
                <div className="showcase-panel">
                  <div>
                    <h3>{item.title}</h3><p>{item.summary}</p>
                    <Highlights items={item.highlights} />
                    <a className="market-text-link" href={item.href}>Open in Exam Studio <ArrowRight size={16} /></a>
                  </div>
                  <ProductFrame image={item.image} alt={item.alt} label={item.title} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

const steps = [
  { icon: Upload, title: 'Add your material', text: 'Upload a document, paste text, or choose from the notes folder.', image: 'study-guide', alt: 'Upload, paste and Library options in the source panel' },
  { icon: FileText, title: 'Choose your output', text: 'Select study notes, a handout, an exam paper, or flashcards.', image: 'paper-studio', alt: 'Question generation options in Paper Studio' },
  { icon: Sparkles, title: 'Generate and review', text: 'Read the draft and check it against your curriculum before sharing.', image: 'study-notes', alt: product.study.alt },
  { icon: Download, title: 'Save, export or publish', text: 'Save to the Library, export supported formats, or publish an exam link.', image: 'library', alt: product.library.alt },
];

export function MarketingWorkflow() {
  return (
    <section id="how" className="market-section market-wrap" aria-labelledby="how-title">
      <div className="section-copy"><h2 id="how-title">From source material to class-ready resources</h2><p>Four steps, one workspace.</p></div>
      <ol className="workflow">
        {steps.map((step, index) => (
          <li key={step.title}>
            <div className="workflow-step"><span>{String(index + 1).padStart(2, '0')}</span><step.icon size={21} aria-hidden="true" /></div>
            <h3>{step.title}</h3><p>{step.text}</p>
            <ProductImage image={step.image} alt={step.alt} />
          </li>
        ))}
      </ol>
    </section>
  );
}

function Highlights({ items }: { items: readonly string[] }) {
  return <ul className="market-highlights">{items.map((item) => <li key={item}><Check size={16} aria-hidden="true" />{item}</li>)}</ul>;
}

function FeatureSection({ id, title, feature, reverse, children }: { id: string; title: string; feature: ProductKey; reverse?: boolean; children?: ReactNode }) {
  const item = product[feature];
  return (
    <section id={id} className={`market-section market-wrap feature-detail${reverse ? ' reverse' : ''}`} aria-labelledby={`${id}-title`}>
      <div className="detail-copy">
        <item.icon className="market-icon" size={24} aria-hidden="true" />
        <h2 id={`${id}-title`}>{title}</h2>
        <p>{item.summary}</p>
        <Highlights items={item.highlights} />
        <a className="market-text-link" href={item.href}>{feature === 'ai' ? 'Read the integration docs' : `Open ${item.title}`} <ArrowRight size={16} /></a>
      </div>
      <div className="detail-media"><ProductFrame image={item.image} alt={item.alt} label={item.title} />{children}</div>
    </section>
  );
}

const demoCards = [
  { front: 'What is osmosis?', back: 'The net movement of water through a selectively permeable membrane, from lower to higher solute concentration.' },
  { front: 'How does facilitated diffusion move a solute?', back: 'Through a channel or carrier protein, down its concentration gradient, without ATP.' },
  { front: 'Why does active transport require energy?', back: 'It moves substances against their electrochemical gradient.' },
];

function FlashcardDemo() {
  const [index, setIndex] = useState(0);
  const [answer, setAnswer] = useState(false);
  const move = (delta: number) => { setIndex((i) => (i + delta + demoCards.length) % demoCards.length); setAnswer(false); };
  return (
    <div className="flashcard-demo">
      <p className="demo-label">Interactive sample · Card {index + 1} of {demoCards.length}</p>
      <div className="flashcard-face" aria-live="polite">{answer ? demoCards[index].back : demoCards[index].front}</div>
      <div className="flashcard-controls">
        <button className="market-button" type="button" onClick={() => move(-1)} aria-label="Previous sample card"><ChevronLeft size={18} /></button>
        <button className="market-button primary" type="button" onClick={() => setAnswer((value) => !value)}>{answer ? 'Show question' : 'Reveal answer'}</button>
        <button className="market-button" type="button" onClick={() => move(1)} aria-label="Next sample card"><ChevronRight size={18} /></button>
      </div>
    </div>
  );
}

export function FeatureDetails() {
  return (
    <div className="feature-details">
      <FeatureSection id="study-guide" feature="study" title="Turn your course notes into structured learning materials">
        <a className="market-text-link detail-extra" href="/app#handout">Try the Handout Generator <ArrowRight size={16} /></a>
      </FeatureSection>
      <FeatureSection id="paper-studio" feature="paper" title="Create professional examination papers with less manual work" reverse>
        <p className="media-note">Use multiple choice, true/false, matching, sequencing, short answer, and essay questions.</p>
      </FeatureSection>
      <FeatureSection id="online-exams" feature="online" title="Create, publish and manage online assessments">
        <details className="sample-result">
          <summary>View a sample submission result</summary>
          <ProductFrame image="exam-results" alt="Score displayed after a sample student submitted the online exam" label="Online Exams / Submission result" />
        </details>
      </FeatureSection>
      <FeatureSection id="organize" feature="bank" title="Organize and reuse your questions" reverse>
        <ProductFrame image={product.modules.image} alt={product.modules.alt} label="Modules and learning outcomes" />
      </FeatureSection>
      <FeatureSection id="flashcards" feature="cards" title="Give learners a way to practise active recall"><FlashcardDemo /></FeatureSection>
      <FeatureSection id="library" feature="library" title="Find the resource you made last term" reverse />
      <FeatureSection id="ai-integrations" feature="ai" title="Connect the AI tools your workflow supports">
        <figure className="roadmap-visual">
          <img src="/images/illustrations/ai-assisted-teaching.webp" alt="Concept illustration linking source material to study cards, a book and an exam answer sheet" width={1200} height={675} loading="lazy" decoding="async" />
          <figcaption>Illustration · From source material to teaching resources</figcaption>
        </figure>
      </FeatureSection>
    </div>
  );
}

export function InstitutionRoadmap() {
  return (
    <section id="roadmap" className="market-section market-wrap feature-detail" aria-labelledby="roadmap-title">
      <div className="detail-copy">
        <GraduationCap className="market-icon" size={24} aria-hidden="true" />
        <h2 id="roadmap-title">Building the future of school and examination management</h2>
        <dl className="roadmap-list">
          <div><dt>Available</dt><dd>Personal teaching workspaces and online exam publishing.</dd></div>
          <div><dt>In development</dt><dd>Institution workspace foundations and academic organization.</dd></div>
          <div><dt>Planned</dt><dd>Teacher collaboration, school-wide examination administration, and integrated educational records.</dd></div>
        </dl>
      </div>
      <figure className="roadmap-visual">
        <img src="/images/illustrations/institution-workspaces.webp" alt="Concept illustration of teal teaching folders, books, a graduation cap and an academic arch" width={1200} height={675} loading="lazy" decoding="async" />
        <figcaption>Concept illustration · Institution roadmap</figcaption>
      </figure>
    </section>
  );
}

export function DesktopVisual() {
  return (
    <div className="desktop-visual">
      <div className="detail-copy"><Monitor className="market-icon" size={24} aria-hidden="true" /><h3>Bring your workspace to your desktop</h3><p>The desktop client uses the same teaching workflows. It connects to a configured server for online features and generation.</p></div>
      <ProductFrame image="paper-studio" alt="Paper Studio workspace, also available in the desktop client" label="Exam Studio workspace" />
    </div>
  );
}

export function ClosingCallToAction() {
  return (
    <section className="market-wrap closing-section" aria-labelledby="closing-title">
      <div className="closing-panel">
        <BookOpen className="market-icon" size={26} aria-hidden="true" />
        <h2 id="closing-title">Spend less time preparing. More time teaching.</h2>
        <p>Organize your learning materials, prepare assessments, and manage educational resources with Exam Studio.</p>
        <a className="market-button primary" href={appUrl}>Open Exam Studio <ArrowRight size={18} /></a>
      </div>
    </section>
  );
}
