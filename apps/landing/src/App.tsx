import { useEffect, useState } from 'react';
import Navbar from './components/Navbar';
import Hero from './components/Hero';
import DemoPlayground from './components/DemoPlayground';
import Features from './components/Features';
import HowItWorks from './components/HowItWorks';
import Pricing from './components/Pricing';
import AITools from './components/AITools';
import Desktop from './components/Desktop';
import FAQ from './components/FAQ';
import { Privacy, Terms } from './components/Legal';
import Contact from './components/Contact';
import Changelog from './components/Changelog';
import Footer from './components/Footer';

function ScrollChrome() {
  const [pct, setPct] = useState(0);
  const [showTop, setShowTop] = useState(false);
  useEffect(() => {
    const fn = () => {
      const h = document.documentElement;
      const max = h.scrollHeight - h.clientHeight;
      setPct(max > 0 ? (h.scrollTop / max) * 100 : 0);
      setShowTop(h.scrollTop > 400);
    };
    fn();
    window.addEventListener('scroll', fn, { passive: true });
    return () => window.removeEventListener('scroll', fn);
  }, []);
  const toTop = () => window.scrollTo({ top: 0, behavior: 'smooth' });
  return (
    <>
      <div className="fixed top-0 left-0 right-0 h-[3px] z-[60] origin-left" style={{ background: 'var(--c-accent)', transform: `scaleX(${pct / 100})`, transition: 'transform 100ms' }} aria-hidden />
      {showTop && (
        <button onClick={toTop} aria-label="Back to top" className="fixed bottom-6 right-6 z-50 w-11 h-11 rounded-full shadow-lg flex items-center justify-center border border-[color:var(--c-line)] bg-[color:var(--c-panel)]">
          ↑
        </button>
      )}
    </>
  );
}

export default function App() {
  return (
    <div id="top">
      <ScrollChrome />
      <Navbar />
      <main>
        <Hero />
        <DemoPlayground />
        <Features />
        <HowItWorks />
        <Pricing />
        <AITools />
        <Desktop />
        <FAQ />
        <Privacy />
        <Terms />
        <Contact />
        <Changelog />
      </main>
      <Footer />
    </div>
  );
}
