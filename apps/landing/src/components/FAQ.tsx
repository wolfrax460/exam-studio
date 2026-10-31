import { useMemo, useState } from 'react';
import { config, type FaqItem } from '../config';

const items = config.faq;

export default function FAQ() {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<number | null>(null);
  const list = useMemo(() => items.filter((i: FaqItem) => (i.q + ' ' + i.a).toLowerCase().includes(query.toLowerCase())), [query]);
  return (
    <section id="faq" className="section container-x">
      <h2 className="heading mb-3">FAQ</h2>
      <div className="mb-6">
        <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search FAQ…" aria-label="Search FAQ" className="w-full md:w-80 px-3 py-2 rounded-lg border border-[color:var(--c-line)] bg-transparent" />
      </div>
      <div className="space-y-3">
        {list.map((item: FaqItem, i) => {
          const id = i;
          return (
            <div key={i} className="card">
              <button
                className="w-full text-left font-semibold flex items-center justify-between gap-4"
                aria-expanded={open === id}
                aria-controls={`faq-panel-${id}`}
                onClick={() => setOpen(open === id ? null : id)}
              >
                <span>{item.q}</span>
                <span aria-hidden>{open === id ? '−' : '+'}</span>
              </button>
              <div id={`faq-panel-${id}`} hidden={open !== id} className="mt-3 text-sm" style={{ color: 'var(--c-muted)' }}>
                {item.a}
              </div>
            </div>
          );
        })}
        {list.length === 0 && <p className="text-sm opacity-70">No matches.</p>}
      </div>
    </section>
  );
}
