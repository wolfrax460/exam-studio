import { config } from '../config';

export default function Changelog() {
  return (
    <section id="changelog" className="section container-x">
      <h2 className="heading mb-3">Changelog</h2>
      <div className="space-y-6">
        {config.changelog.map(entry => (
          <div key={entry.version} className="card">
            <div className="flex items-baseline gap-3">
              <h3 className="text-lg font-bold">{entry.version}</h3>
              <span className="text-sm opacity-70">{entry.date}</span>
            </div>
            <ul className="mt-3 space-y-1 text-sm" style={{ color: 'var(--c-muted)' }}>
              {entry.changes.map(c => <li key={c}>• {c}</li>)}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
