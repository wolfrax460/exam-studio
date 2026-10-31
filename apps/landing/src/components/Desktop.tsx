import { useEffect, useState } from 'react';
import { config } from '../config';

type OS = 'windows' | 'mac' | 'linux';

function detectOS(): OS {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent.toLowerCase() : '';
  if (ua.includes('win')) return 'windows';
  if (ua.includes('mac')) return 'mac';
  return 'linux';
}

export default function Desktop() {
  const [os, setOs] = useState<OS>('windows');
  useEffect(() => { setOs(detectOS()); }, []);
  const primary = config.desktop[os];
  return (
    <section id="desktop" className="section container-x">
      <h2 className="heading mb-3">Desktop app</h2>
      <p className="sub mb-8">Runs locally and keeps you in control of where your data goes.</p>
      <div className="card grid lg:grid-cols-2 gap-6 items-center">
        <div>
          <p className="text-sm font-semibold">Detected OS: {os}</p>
          <p className="text-sm opacity-80 mt-1">Version {config.desktop.version} · {config.desktop.fileSize}</p>
          <a href={primary} download className="btn btn-primary mt-5">Download for {os}</a>
          <div className="mt-4 flex flex-wrap gap-2 text-sm">
            {(['windows', 'mac', 'linux'] as OS[]).filter(o => o !== os).map(o => (
              <a key={o} href={config.desktop[o]} download className="btn btn-ghost btn-small capitalize">{o}</a>
            ))}
          </div>
          <p className="text-xs mt-4 opacity-70">{config.desktop.notes}</p>
        </div>
        <div className="p-6 rounded-2xl border border-[color:var(--c-line)]">
          <ol className="space-y-2 text-sm" style={{ color: 'var(--c-muted)' }}>
            <li>1. Download the installer for your OS.</li>
            <li>2. Install and launch Exam Studio.</li>
            <li>3. Set the server address (Oracle) in settings.</li>
            <li>4. Sign in and start generating.</li>
          </ol>
          <a href={config.desktopReleasesUrl} className="text-sm mt-4 inline-block" style={{ color: 'var(--c-accent)' }}>All releases →</a>
        </div>
      </div>
    </section>
  );
}
