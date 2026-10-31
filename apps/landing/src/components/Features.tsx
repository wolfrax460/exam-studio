import { BookOpen, FileText, ClipboardList, Layers, Library, Cpu, SlidersHorizontal, Download } from 'lucide-react';
import { motion, useInView } from 'framer-motion';
import { useRef } from 'react';
import { config } from '../config';

const iconMap: Record<string, React.ElementType> = {
  BookOpen, FileText, ClipboardList, Layers, Library, Cpu, SlidersHorizontal, Download
};

export default function Features() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: '-100px' });
  return (
    <section id="features" className="section container-x" ref={ref}>
      <h2 className="heading mb-3">Features</h2>
      <p className="sub mb-10">Everything you need to turn notes into study materials.</p>
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {config.features.map((f, i) => {
          const Icon = iconMap[f.icon] ?? BookOpen;
          return (
            <motion.article
              key={f.title}
              initial={{ opacity: 0, y: 12 }}
              animate={inView ? { opacity: 1, y: 0 } : {}}
              transition={{ delay: i * 0.06 }}
              className="card hover:-translate-y-1 transition-transform"
            >
              <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-4" style={{ background: 'color-mix(in srgb, var(--c-accent) 14%, transparent)' }}>
                <Icon className="w-5 h-5" style={{ color: 'var(--c-accent)' }} />
              </div>
              <h3 className="font-semibold text-lg">{f.title}</h3>
              <p className="text-sm mt-2 opacity-80" style={{ color: 'var(--c-muted)' }}>{f.text}</p>
            </motion.article>
          );
        })}
      </div>
    </section>
  );
}
