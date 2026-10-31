import { useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { config } from '../config';

const OUTPUT: { study: string; handout: string; exam: string; flashcards: { front: string; back: string; trap: boolean }[] } = {
  study: '# Unit 4 — Cell membrane transport\n\n- Osmosis moves water from low solute to high solute concentration.\n- Active transport moves against the gradient using ATP.\n- Facilitated diffusion uses carrier proteins but no ATP.',
  handout: '## Handout — Cell membrane transport\nChecklist: define osmosis, compare active vs passive transport, give one example per type.',
  exam: '1. Explain osmosis in one sentence.\n\n2. Worked solution:\nWater flows from low to high solute concentration across a semipermeable membrane.',
  flashcards: [
    { front: 'What is osmosis?', back: 'Movement of water across a semipermeable membrane.', trap: false },
    { front: "Which uses ATP?", back: 'Active transport.', trap: true },
    { front: 'Facilitated diffusion uses?', back: 'Carrier proteins, no ATP.', trap: false }
  ]
};

type Tab = 'study' | 'handout' | 'exam' | 'flashcards';

export default function DemoPlayground() {
  const reduced = useReducedMotion();
  const [note, setNote] = useState<string>(config.sampleNote);
  const [tab, setTab] = useState<Tab>('study');
  const [loading, setLoading] = useState(false);
  const [generated, setGenerated] = useState(false);
  const [showMarking, setShowMarking] = useState(false);
  const [cardIdx, setCardIdx] = useState(0);
  const [flipped, setFlipped] = useState(false);

  const generate = () => {
    setLoading(true);
    setTimeout(() => { setLoading(false); setGenerated(true); setFlipped(false); setCardIdx(0); }, reduced ? 200 : 900);
  };

  const tabs: Tab[] = ['study', 'handout', 'exam', 'flashcards'];

  return (
    <section id="demo" className="section">
      <div className="container-x">
        <div className="grid lg:grid-cols-2 gap-6">
          <div className="card">
            <label className="block text-sm font-medium mb-2" htmlFor="notes">Sample notes</label>
            <textarea id="notes" value={note} onChange={(e) => setNote(e.target.value)} className="w-full h-48 rounded-xl p-3 border border-[color:var(--c-line)] bg-transparent text-sm" />
            <button onClick={generate} className="btn btn-primary mt-3" aria-label="Generate output" disabled={loading}>
              {loading ? 'Generating…' : 'Generate'}
            </button>
          </div>
          <div className="card">
            <div role="tablist" className="flex gap-1 border-b border-[color:var(--c-line)] mb-3 -mx-1">
              {tabs.map(t => (
                <button key={t} role="tab" aria-selected={tab === t} className={`px-3 py-2 text-sm capitalize ${tab === t ? 'font-semibold border-b-2 border-[color:var(--c-accent)]' : 'opacity-80'}`} onClick={() => setTab(t)}>
                  {t}
                </button>
              ))}
            </div>
            <AnimatePresence mode="wait">
              {loading && (
                <motion.div key="skeleton" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{opacity:0}} className="space-y-2">
                  {[0,1,2,3].map(i => <div key={i} className="h-3 rounded bg-gray-300/30 dark:bg-gray-600/30 animate-pulse" />)}
                </motion.div>
              )}
            </AnimatePresence>
            {!loading && generated && (
              <div className="prose max-w-none text-sm whitespace-pre-wrap">
                {tab !== 'flashcards' && (
                  <>
                    <p>{tab === 'study' ? OUTPUT.study : tab === 'handout' ? OUTPUT.handout : (showMarking ? OUTPUT.exam : OUTPUT.exam.split('2. Worked solution')[0])}</p>
                    {tab === 'exam' && (
                      <button className="btn-ghost btn-small mt-2" onClick={() => setShowMarking(s => !s)} aria-expanded={showMarking}>
                        {showMarking ? 'Hide marking scheme' : 'Show marking scheme'}
                      </button>
                    )}
                  </>
                )}
                {tab === 'flashcards' && OUTPUT.flashcards.length > 0 && (
                  <>
                    <button
                      className={`card w-full min-h-[140px] cursor-pointer ${OUTPUT.flashcards[cardIdx].trap ? 'border-l-4 border-orange-500' : ''}`}
                      onClick={() => setFlipped(f => !f)}
                      aria-label="Flip flashcard"
                    >
                      {!flipped ? OUTPUT.flashcards[cardIdx].front : OUTPUT.flashcards[cardIdx].back}
                    </button>
                    <div className="flex gap-2 mt-3">
                      <button className="btn btn-ghost btn-small" aria-label="Previous card" onClick={() => { setFlipped(false); setCardIdx(i => Math.max(0, i-1)); }}>Prev</button>
                      <button className="btn btn-ghost btn-small" aria-label="Next card" onClick={() => { setFlipped(false); setCardIdx(i => Math.min(OUTPUT.flashcards.length-1, i+1)); }}>Next</button>
                      {OUTPUT.flashcards[cardIdx].trap && <span className="ml-auto inline-flex items-center px-2 py-0.5 rounded bg-orange-100 text-orange-800 text-xs font-medium">Trap card</span>}
                    </div>
                  </>
                )}
              </div>
            )}
            {!loading && !generated && <p className="text-sm opacity-70">Click Generate to see sample output.</p>}
          </div>
        </div>
      </div>
    </section>
  );
}
