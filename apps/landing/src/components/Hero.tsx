import { config } from '../config';
import { motion } from 'framer-motion';
import { useReducedMotion } from 'framer-motion';

export default function Hero(): JSX.Element {
  const reduced = useReducedMotion();
  return (
    <section id="top" className="relative overflow-hidden section-lg">
      <motion.div aria-hidden className="absolute inset-0 -z-10 opacity-40" animate={reduced ? {} : { y: [0, -10, 0] }} transition={{ duration: 15, repeat: Infinity, ease: 'linear' }}>
        <div className="absolute top-0 right-0 h-96 w-96 rounded-full blur-3xl" style={{ background: 'radial-gradient(circle, var(--c-accent) 0%, transparent 70%)' }} />
        <div className="absolute bottom-0 left-0 h-96 w-96 rounded-full blur-3xl" style={{ background: 'radial-gradient(circle, var(--c-accent) 0%, transparent 60%)' }} />
      </motion.div>
      <div className="container-x text-center">
        <motion.h1 className="heading text-4xl sm:text-6xl" initial={reduced ? {} : { opacity: 0, y: 8 }} animate={reduced ? {} : { opacity: 1, y: 0 }} transition={{ duration: 0.8 }}>
          {config.hero.headline}
        </motion.h1>
        <motion.p className="sub mt-5 mx-auto" initial={reduced ? {} : { opacity: 0 }} animate={reduced ? {} : { opacity: 1 }} transition={{ delay: 0.2 }}>
          {config.hero.sub}
        </motion.p>
        <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
          <motion.a href={config.links.openApp} className="btn btn-primary" whileHover={reduced ? {} : { scale: 1.02 }} whileTap={{ scale: 0.98 }}>
            {config.hero.primaryLabel}
          </motion.a>
          <motion.a href="#desktop" className="btn btn-ghost" whileHover={reduced ? {} : { scale: 1.02 }} whileTap={{ scale: 0.98 }}>
            {config.hero.secondaryLabel}
          </motion.a>
        </div>
      </div>
    </section>
  );
}
