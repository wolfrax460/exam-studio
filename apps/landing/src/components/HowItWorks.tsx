import { useState } from 'react';
import { config } from '../config';

export default function HowItWorks() {
  const [step, setStep] = useState(0);
  const cur = config.howSteps[step];
  return (
    <section id="how" className="section container-x">
      <h2 className="heading mb-3">How it works</h2>
      <p className="sub mb-8">Five steps from notes to finished handout.</p>
      <div className="card">
        <div className="flex flex-col md:flex-row gap-2 mb-6">
          {config.howSteps.map((s, i) => (
            <button key={s.title} onClick={() => setStep(i)} className={`flex-1 text-sm px-3 py-3 rounded-xl border text-left transition ${step === i ? 'border-[color:var(--c-accent)] bg-[color:color-mix(in_srgb,var(--c-accent)_10%,transparent)]' : 'border-[color:var(--c-line)]'}`}>{i + 1}. {s.title}</button>
          ))}
        </div>
        <div className="mt-4">
          <h3 className="text-xl font-semibold">{step + 1}. {cur.title}</h3>
          <p style={{ color: 'var(--c-muted)' }} className="mt-2">{cur.text}</p>
        </div>
      </div>
    </section>
  );
}
