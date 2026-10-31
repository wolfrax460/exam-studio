import { useState } from 'react';
import { config } from '../config';

export default function Pricing() {
  const [yearly, setYearly] = useState(false);
  return (
    <section id="plans" className="section container-x">
      <div className="flex items-end justify-between gap-4 flex-wrap mb-10">
        <div>
          <h2 className="heading">Pricing</h2>
          <p className="sub mt-2">Choose a plan that fits your class.</p>
        </div>
        <div className="flex items-center gap-2 border border-[color:var(--c-line)] rounded-full px-2 py-1">
          <span className={!yearly ? 'font-semibold text-sm' : 'text-sm opacity-70'}>Monthly</span>
          <button onClick={() => setYearly(y => !y)} className="relative w-10 h-6 rounded-full transition" style={{ background: 'var(--c-line)' }} aria-label="Toggle yearly">
            <span className={`absolute top-0.5 ${yearly ? 'left-6' : 'left-0.5'} w-5 h-5 rounded-full bg-white transition-all`} />
          </button>
          <span className={yearly ? 'font-semibold text-sm' : 'text-sm opacity-70'}>Yearly</span>
        </div>
      </div>
      <div className="grid md:grid-cols-3 gap-5">
        {config.plans.map(p => (
          <div key={p.id} className={`card relative ${p.recommended ? 'ring-2 ring-[color:var(--c-accent)]' : ''}`}>
            {p.recommended && <span className="recommended-pill absolute -top-3 left-4">Recommended</span>}
            <h3 className="text-xl font-bold">{p.name}</h3>
            <div className="mt-3 text-3xl font-bold">{yearly ? p.priceYearly : p.priceMonthly}<span className="text-sm font-normal opacity-70">/{yearly ? 'yr' : 'mo'}</span></div>
            <ul className="mt-4 space-y-2 text-sm" style={{ color: 'var(--c-muted)' }}>
              {p.features.map(f => <li key={f} className="flex gap-2"><span style={{ color: 'var(--c-accent)' }}>✓</span>{f}</li>)}
            </ul>
            <a href={config.links.openApp} className="btn btn-primary mt-6 w-full">{p.recommended ? 'Start plan' : 'Get started'}</a>
          </div>
        ))}
      </div>
      <div className="card mt-6 text-center">
        <h3 className="text-lg font-semibold">{config.customPlan.title}</h3>
        <p className="text-sm mt-1 opacity-80">{config.customPlan.description}</p>
        <a href={`mailto:${config.links.contact}`} className="btn btn-ghost mt-4">{config.customPlan.cta}</a>
      </div>
      <div className="overflow-x-auto mt-8">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[color:var(--c-line)] text-left">
              <th className="py-2 pr-4">Feature</th>
              <th className="py-2 pr-4 text-center">Free</th>
              <th className="py-2 pr-4 text-center font-semibold">Teacher</th>
              <th className="py-2 pr-4 text-center">Unlimited</th>
            </tr>
          </thead>
          <tbody>
            {config.comparison.map(row => {
              const cell = (v: boolean | string) => (typeof v === 'boolean' ? (v ? '✓' : '—') : v);
              return (
                <tr key={row.feature} className="border-b border-[color:var(--c-line)]">
                  <td className="py-2 pr-4">{row.feature}</td>
                  <td className="py-2 pr-4 text-center">{cell(row.free)}</td>
                  <td className="py-2 pr-4 text-center font-semibold">{cell(row.teacher)}</td>
                  <td className="py-2 pr-4 text-center">{cell(row.unlimited)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
