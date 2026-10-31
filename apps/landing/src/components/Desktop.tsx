import { useEffect, useState } from 'react';

const SERVER_ADDRESS = 'https://examstudio.duckdns.org';

type Platform = {
  os: 'windows' | 'linux' | 'mac';
  status: 'available' | 'coming-soon';
  file: string | null;
  label: string;
  sizeBytes: number | null;
  sha256: string | null;
  url: string | null;
};

type Downloads = {
  version: string;
  releaseDate: string;
  whatIsNew: string;
  platforms: Platform[];
  previousVersions?: { version: string; releaseDate: string; platforms: Platform[] }[];
};

function isPhone(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

function detectOS(): 'windows' | 'linux' | 'mac' | 'other' {
  const ua = (typeof navigator !== 'undefined' ? navigator.userAgent : '').toLowerCase();
  if (ua.includes('win')) return 'windows';
  if (ua.includes('mac')) return 'mac';
  if (ua.includes('linux')) return 'linux';
  return 'other';
}

function fmtBytes(n: number | null): string {
  if (n == null) return '';
  const mb = n / (1024 * 1024);
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${n} bytes`;
}

export default function Desktop() {
  const [data, setData] = useState<Downloads | null>(null);
  const [os, setOs] = useState<'windows' | 'linux' | 'mac' | 'other'>('other');
  const [installTab, setInstallTab] = useState<'windows' | 'linux' | 'mac'>('windows');
  const [started, setStarted] = useState<{ name: string; size: string; sha: string } | null>(null);
  const [showPrevious, setShowPrevious] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const phone = isPhone();

  useEffect(() => {
    setOs(detectOS());
    fetch('/downloads/downloads.json').then(r => r.json()).then(setData).catch(() => setData(null));
  }, []);

  const platformFor = (name: string) => data?.platforms.find((p) => p.os === name) || null;
  const version = data?.version ?? '0.2.1';
  const releaseDate = data?.releaseDate ?? '';
  const windows = platformFor('windows');
  const linux = platformFor('linux');
  const mac = platformFor('mac');

  const startDownload = (platform: Platform | null) => {
    if (!platform?.url || !platform.file) return;
    setStarted({ name: platform.file, size: fmtBytes(platform.sizeBytes), sha: platform.sha256 || '' });
  };

  if (phone) {
    return (
      <section id="desktop" className="section container-x">
        <h2 className="heading mb-3">Desktop app</h2>
        <p className="sub mb-8">Desktop app is for Windows and Linux. Use the web app on your phone instead.</p>
        <div className="card text-center">
          <a href="/app" className="btn btn-primary">Open Exam Studio</a>
        </div>
      </section>
    );
  }

  return (
    <section id="desktop" className="section container-x">
      <h2 className="heading mb-3">Desktop app</h2>
      <p className="sub mb-8">Install once on your computer. Files download from this same server and keep your data local.</p>

      <div className="grid lg:grid-cols-2 gap-6 mb-6">
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <span className="px-3 py-1 rounded-full bg-green-500/15 text-green-400 text-sm border border-green-500/30">Version {version}</span>
            <span className="text-sm opacity-70">{releaseDate}</span>
          </div>
          <h3 className="text-xl font-semibold mb-3">Download for {os === 'mac' ? 'Mac' : os === 'linux' ? 'Linux' : 'Windows'}</h3>
          <p className="text-sm opacity-75 mb-3">{data?.whatIsNew || 'Desktop build hosted on the same domain.'}</p>

          {os !== 'mac' ? (
            <a
              href={(os === 'linux' ? linux?.url : windows?.url) || '#'}
              download={(os === 'linux' ? linux?.file : windows?.file) || undefined}
              onClick={() => startDownload(os === 'linux' ? linux : windows)}
              className="btn btn-primary w-full"
            >
              Download {os === 'linux' ? `Linux package (${fmtBytes(linux?.sizeBytes ?? null)})` : `Windows installer (${fmtBytes(windows?.sizeBytes ?? null)})`}
            </a>
          ) : (
            <button className="btn btn-ghost w-full" disabled>
              Mac: coming soon
            </button>
          )}

          {mac?.status === 'coming-soon' ? null : null}

          <p className="text-xs mt-3 opacity-70">
            If the download did not start, use <a className="underline" href={(os === 'linux' ? linux?.url : windows?.url) || '#'} download>Try again</a>.
          </p>

          {started ? (
            <div className="mt-4 p-4 rounded-xl border border-[color:var(--c-line)]">
              <p className="font-semibold mb-2">Download started: {started.name}</p>
              <p className="text-sm mb-1">Size: {started.size}</p>
              <p className="text-sm mb-1 break-all">SHA-256: {started.sha}</p>
              <button className="btn btn-small btn-ghost" onClick={() => navigator.clipboard.writeText(started.sha)}>Copy</button>
              <a href="#desktop-install-windows" className="btn btn-small btn-ghost ml-2">Next: install guide</a>
              <p className="text-xs mt-3 opacity-70">Mac support is still on the way. <a className="underline" href="mailto:wolfras87@gmail.com">Notify me when ready</a></p>
            </div>
          ) : null}

          <h4 className="font-semibold mt-5 mb-2">Platforms</h4>
          <table className="w-full text-sm mb-4">
            <thead><tr className="opacity-70"><th className="text-left py-1">Platform</th><th className="text-left py-1">Status</th><th className="text-right py-1">Size</th></tr></thead>
            <tbody>
              <tr><td className="py-1">Windows</td><td className="py-1">{windows?.status === 'available' ? 'Available' : 'Coming soon'}</td><td className="py-1 text-right">{fmtBytes(windows?.sizeBytes ?? null)}</td></tr>
              <tr><td className="py-1">Linux</td><td className="py-1">{linux?.status === 'available' ? 'Available' : 'Coming soon'}</td><td className="py-1 text-right">{fmtBytes(linux?.sizeBytes ?? null)}</td></tr>
              <tr><td className="py-1">Mac</td><td className="py-1">Coming soon</td><td className="py-1 text-right">-</td></tr>
            </tbody>
          </table>

          <div className="text-sm">
            <button onClick={() => setShowPrevious((s) => !s)} className="btn btn-small btn-ghost">
              {showPrevious ? 'Hide previous versions' : 'Previous versions'}
            </button>
            {showPrevious && (data?.previousVersions?.length || 0) > 0 ? (
              <ul className="mt-2 space-y-1">
                {data!.previousVersions!.map((v) => (
                  <li key={v.version}>{v.version} - {v.releaseDate}</li>
                ))}
              </ul>
            ) : null}
          </div>
        </div>

        <div className="card">
          <h3 className="text-xl font-semibold mb-3">System requirements</h3>
          <ul className="space-y-2 text-sm">
            <li>Windows 10 or later, or Linux with a supported desktop environment</li>
            <li>At least 8 GB RAM</li>
            <li>1 GB disk space</li>
            <li>Internet access to this server</li>
          </ul>

          <h3 className="text-xl font-semibold mt-5 mb-2">First-time setup</h3>
          <p className="text-sm opacity-80">
            Server address: <code>{SERVER_ADDRESS}</code>
            <button className="btn btn-small btn-ghost ml-2" onClick={() => navigator.clipboard.writeText(SERVER_ADDRESS)}>Copy</button>
          </p>
          <ol className="list-decimal pl-5 text-sm mt-2 space-y-1">
            <li>Download the installer or package.</li>
            <li>Install or extract it.</li>
            <li>Launch Exam Studio.</li>
            <li>Enter the server address shown above, sign in, add notes, generate, and export.</li>
          </ol>
        </div>
      </div>

      <div className="card mb-6">
        <h3 className="heading text-lg mb-4">Install guide</h3>
        <div className="flex gap-2 mb-4">
          <button className={`btn btn-small ${installTab === 'windows' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setInstallTab('windows')}>Windows</button>
          <button className={`btn btn-small ${installTab === 'linux' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setInstallTab('linux')}>Linux</button>
          <button className={`btn btn-small ${installTab === 'mac' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setInstallTab('mac')}>Mac (coming soon)</button>
        </div>

        {installTab === 'windows' && (
          <ol className="space-y-4 text-sm">
            <li className="flex items-start gap-3"><span className="font-bold">1.</span><span>Download the Windows installer and run it.</span></li>
            <li className="flex items-start gap-3"><span className="font-bold">2.</span><span>If Windows shows "Windows protected your PC", click More info, then Run anyway. The app is not code-signed yet.</span></li>
            <li className="flex items-start gap-3"><span className="font-bold">3.</span><span>Open Exam Studio. If needed, paste the server address and sign in.</span></li>
          </ol>
        )}
        {installTab === 'linux' && (
          <ol className="space-y-4 text-sm">
            <li className="flex items-start gap-3"><span className="font-bold">1.</span><span><code>unzip Exam-Studio-0.2.1.zip</code></span></li>
            <li className="flex items-start gap-3"><span className="font-bold">2.</span><span><code>chmod +x "Exam Studio"</code></span></li>
            <li className="flex items-start gap-3"><span className="font-bold">3.</span><span><code>./Exam Studio</code></span></li>
          </ol>
        )}
        {installTab === 'mac' && (
          <p className="text-sm opacity-80">Mac build is coming soon. <a className="underline" href="mailto:wolfras87@gmail.com">Notify me when ready</a>.</p>
        )}
      </div>

      <div className="card mb-6">
        <button onClick={() => setExpanded(expanded === 'verify' ? null : 'verify')} className="flex w-full justify-between items-center font-semibold">
          <span>Verify your download</span><span>{expanded === 'verify' ? '-' : '+'}</span>
        </button>
        {expanded === 'verify' && (
          <div className="mt-3 text-sm space-y-2">
            <p>Windows:</p>
            <code className="block bg-black/30 p-2 rounded">Get-FileHash -Algorithm SHA256 .\\Exam-Studio-Setup-0.2.1.exe</code>
            <p>Linux:</p>
            <code className="block bg-black/30 p-2 rounded">sha256sum ./Exam-Studio-0.2.1.zip</code>
            <p>Compare the result with the SHA-256 shown in the download panel.</p>
          </div>
        )}
      </div>

      <div className="card">
        <button onClick={() => setExpanded(expanded === 'trouble' ? null : 'trouble')} className="flex w-full justify-between items-center font-semibold">
          <span>Troubleshooting</span><span>{expanded === 'trouble' ? '-' : '+'}</span>
        </button>
        {expanded === 'trouble' && (
          <div className="mt-3 text-sm space-y-2 opacity-80">
            <p>If the browser blocks the download, look for browser site settings and retry. If antivirus flags the app, the app is unsigned, so use your own judgment. If the app cannot connect, confirm the server address. To update, download the newest installer. To uninstall, use Add/Remove Programs or delete the extracted folder.</p>
          </div>
        )}
      </div>
    </section>
  );
}
