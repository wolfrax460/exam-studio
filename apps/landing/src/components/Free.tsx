import { useEffect, useState } from 'react';

export default function Free() {
  const [limits, setLimits] = useState<{ dailyGenerationLimit: number; resetsAt: string } | null>(null);
  useEffect(() => { fetch('/api/limits').then(r=>r.json()).then(setLimits).catch(()=>setLimits(null)); }, []);
  return (
    <section id="free" className="section container-x">
      <h2 className="heading mb-3">Free for everyone</h2>
      <p className="sub mb-8">Exam Studio is free. Generate study notes, handouts, exam papers, and flashcards. You may bring your own model to avoid the fair-use limit.</p>
      <div className="grid md:grid-cols-2 gap-6 mb-6">
        <div className="card">
          <h3 className="text-xl font-semibold mb-3">What's included</h3>
          <ul className="space-y-2 text-sm">
            <li>Study notes mirroring your course units</li>
            <li>Handout generation (Word/PDF)</li>
            <li>Exam papers with marking schemes</li>
            <li>Flashcards including trap cards</li>
            <li>Notes library and exports (Word, PDF, CSV)</li>
            <li>Desktop app</li>
          </ul>
        </div>
        <div className="card">
          <h3 className="text-xl font-semibold mb-3">Fair use (daily limit)</h3>
          <p className="text-lg font-bold mb-1">{limits ? `${limits.dailyGenerationLimit} generations per day` : 'A small fair-use daily limit'}</p>
          <p className="text-sm opacity-80 mb-1">Resets at 00:00 Africa/Kigali{limits ? ` (${limits.resetsAt})` : ''}.</p>
          <p className="text-sm opacity-80">The limit is shared equally by everyone on the built-in AI. Users with their own model/API key are exempt.</p>
        </div>
      </div>
      <div className="flex gap-3 flex-wrap">
        <a href="#signin" className="btn btn-primary">Get started (sign up)</a>
        <a href="/app" className="btn btn-ghost">Open Exam Studio</a>
      </div>
    </section>
  );
}
