import { useEffect, useState } from 'react';
import { config } from '../config';
import defaultDownloads from '../downloads.json';
import { DesktopVisual } from './ProductMarketing';

const SERVER_ADDRESS = 'https://examstudio.duckdns.org';
const OS_LABELS = { windows: 'Windows', linux: 'Linux', mac: 'macOS' } as const;
type DesktopOS = keyof typeof OS_LABELS;

type Platform = {
  os: DesktopOS;
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

const bundledDownloads = defaultDownloads as Downloads;

function downloadUrl(platform: Platform) {
  if (platform.status !== 'available' || !platform.url) return undefined;
  try {
    const url = new URL(platform.url, SERVER_ADDRESS);
    return url.protocol === 'https:' ? url.href : undefined;
  } catch {
    return undefined;
  }
}

function isPhone(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

function detectOS(): DesktopOS {
  const ua = (typeof navigator !== 'undefined' ? navigator.userAgent : '').toLowerCase();
  if (ua.includes('win')) return 'windows';
  if (ua.includes('mac')) return 'mac';
  if (ua.includes('linux')) return 'linux';
  return 'windows';
}

function fmtBytes(n: number | null): string {
  if (n == null) return '';
  const mb = n / (1024 * 1024);
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${n} bytes`;
}

export default function Desktop() {
  const [data, setData] = useState(bundledDownloads);
  const [os] = useState(detectOS);
  const [installTab, setInstallTab] = useState<DesktopOS>(os);
  const [started, setStarted] = useState<{ name: string; size: string; sha: string } | null>(null);
  const [showPrevious, setShowPrevious] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const phone = isPhone();

  useEffect(() => {
    const controller = new AbortController();
    fetch(`${SERVER_ADDRESS}/downloads/downloads.json`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) return;
        const manifest: Downloads = await response.json();
        if (Array.isArray(manifest?.platforms) && typeof manifest.version === 'string'
          && manifest.platforms.every((platform) => platform && Object.hasOwn(OS_LABELS, platform.os))
          && manifest.version.localeCompare(bundledDownloads.version, undefined, { numeric: true }) > 0) {
          setData(manifest);
        }
      }).catch(() => {});
    return () => controller.abort();
  }, []);

  const { platforms, version, releaseDate, whatIsNew, previousVersions } = data;
  const available = platforms.filter(downloadUrl);
  const availableNames = [...new Set(available.map(({ os }) => OS_LABELS[os]))];
  const supported = new Intl.ListFormat('en').format(availableNames);
  const choices = available.filter((platform) => platform.os === os);
  const recommended = os === 'mac' ? choices : choices.slice(0, 1);
  const linuxZip = available.find(({ os, file }) => os === 'linux' && file?.endsWith('.zip'));
  const hasMac = available.some(({ os }) => os === 'mac');

  const startDownload = (platform: Platform) => {
    if (!platform.file) return;
    setInstallTab(platform.os);
    setStarted({ name: platform.file, size: fmtBytes(platform.sizeBytes), sha: platform.sha256 || '' });
  };

  if (phone) {
    return (
      <section id="desktop" className="section container-x">
        <h2 className="heading mb-3">Desktop app</h2>
        <p className="sub mb-8">Exam Studio is available on {supported}. On your phone, open the web app.</p>
        <div className="card text-center">
          <a href="/app" className="btn btn-primary">Open Exam Studio</a>
        </div>
      </section>
    );
  }

  return (
    <section id="desktop" className="section container-x">
      <h2 className="heading mb-3">Desktop app</h2>
      <p className="sub mb-8">Download Exam Studio for {supported} and use the teaching workspace in its own desktop window.</p>
      <DesktopVisual />

      <div className="grid lg:grid-cols-2 gap-6 mb-6">
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <span className="px-3 py-1 rounded-full bg-green-500/15 text-green-400 text-sm border border-green-500/30">Version {version}</span>
            <span className="px-3 py-1 rounded-full bg-amber-500/15 text-amber-400 text-sm border border-amber-500/30">Beta</span>
            <span className="text-sm opacity-70">{releaseDate}</span>
          </div>
          <h3 className="text-xl font-semibold mb-3">Download for {OS_LABELS[os]}</h3>
          <p className="text-sm opacity-75 mb-3">{whatIsNew}</p>

          {recommended.length ? (
            <div className="grid gap-2">
              {recommended.map((platform) => (
                <a key={platform.file} href={downloadUrl(platform)} download={platform.file ?? undefined}
                  onClick={() => startDownload(platform)} className="btn btn-primary w-full">
                  {platform.label} · {fmtBytes(platform.sizeBytes)}
                </a>
              ))}
            </div>
          ) : <p className="text-sm">A download is currently unavailable for this platform.</p>}

          {started ? (
            <div role="status" className="mt-4 p-4 rounded-xl border border-[color:var(--c-line)]">
              <p className="font-semibold mb-2">Download started: {started.name}</p>
              <p className="text-sm mb-1">Size: {started.size}</p>
              <p className="text-sm mb-1 break-all">SHA-256: {started.sha}</p>
              <button className="btn btn-small btn-ghost" onClick={() => navigator.clipboard.writeText(started.sha)}>Copy SHA-256</button>
              <a href="#desktop-install" className="btn btn-small btn-ghost ml-2">Next: install guide</a>
            </div>
          ) : null}

          <h4 className="font-semibold mt-5 mb-2">All downloads</h4>
          <table className="w-full text-sm mb-4">
            <thead><tr className="opacity-70"><th scope="col" className="text-left py-1">Package</th><th scope="col" className="text-right py-1">Size</th></tr></thead>
            <tbody>
              {available.map((platform) => (
                <tr key={platform.file} className="border-t border-[color:var(--c-line)]">
                  <td className="py-2 pr-3">
                    <a className="underline underline-offset-4" href={downloadUrl(platform)} download={platform.file ?? undefined}
                      onClick={() => startDownload(platform)}>{platform.label}</a>
                  </td>
                  <td className="py-2 text-right whitespace-nowrap">{fmtBytes(platform.sizeBytes)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <a className="text-sm underline underline-offset-4" href={config.desktopReleasesUrl}>Release notes and checksums</a>

          {!!previousVersions?.length && <div className="text-sm mt-3">
            <button aria-expanded={showPrevious} onClick={() => setShowPrevious((s) => !s)} className="btn btn-small btn-ghost">
              {showPrevious ? 'Hide previous versions' : 'Previous versions'}
            </button>
            {showPrevious && (
              <ul className="mt-2 space-y-1">
                {previousVersions.map((v) => (
                  <li key={v.version}>
                    <span className="font-semibold">{v.version} · {v.releaseDate}</span>
                    <ul className="pl-4">
                      {v.platforms.filter(downloadUrl).map((platform) => (
                        <li key={platform.file}><a className="underline" href={downloadUrl(platform)} download={platform.file ?? undefined}>
                          {platform.label}
                        </a></li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            )}
          </div>}
        </div>

        <div className="card">
          <h3 className="text-xl font-semibold mb-3">System requirements</h3>
          <ul className="space-y-2 text-sm">
            <li>Windows 10 or later (x64)</li>
            <li>Linux x64 with a supported desktop environment</li>
            {hasMac && <li>macOS 13 Ventura or later (Apple silicon or Intel)</li>}
            <li>At least 8 GB RAM</li>
            <li>1 GB disk space</li>
            <li>Internet access for cloud AI providers</li>
          </ul>

          <h3 className="text-xl font-semibold mt-5 mb-2">First-time setup</h3>
          <ol className="list-decimal pl-5 text-sm mt-2 space-y-1">
            <li>Download the package for your computer and follow the install guide.</li>
            <li>Launch Exam Studio and sign in or create a local account.</li>
            <li>Choose an AI provider in Settings, then add source material in Study Guide.</li>
          </ol>
          <p className="mt-3 text-sm opacity-80">The desktop app keeps its own local account and library. To use your hosted workspace, <a className="underline" href="/app">open the web app</a>.</p>
        </div>
      </div>

      <div id="desktop-install" className="card mb-6">
        <h3 className="heading text-lg mb-4">Install guide</h3>
        <div className="flex flex-wrap gap-2 mb-4">
          {(Object.keys(OS_LABELS) as DesktopOS[]).map((platform) => (
            <button key={platform} aria-pressed={installTab === platform}
              className={`btn btn-small ${installTab === platform ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setInstallTab(platform)}>{OS_LABELS[platform]}</button>
          ))}
        </div>

        {installTab === 'windows' && (
          <ul className="space-y-2 text-sm">
            <li>Run the setup executable and follow the installer, or open the portable executable directly.</li>
            <li>The Windows builds are unsigned, so SmartScreen may ask you to confirm. Verify the SHA-256 first.</li>
          </ul>
        )}
        {installTab === 'linux' && (
          <ul className="space-y-2 text-sm">
            {available.some(({ file }) => file?.endsWith('.AppImage')) && (
              <li><strong>AppImage</strong> — Mark the file executable in your file manager, then open it. AppImage requires FUSE.</li>
            )}
            {available.some(({ file }) => file?.endsWith('.deb')) && (
              <li><strong>Debian package</strong> — Open the downloaded <code>.deb</code> in your package installer on Debian or Ubuntu.</li>
            )}
            {linuxZip && <li><strong>Portable ZIP</strong> — Extract <code>{linuxZip.file}</code> and run <code>./exam-studio</code> from the extracted folder.</li>}
          </ul>
        )}
        {installTab === 'mac' && (hasMac ? (
          <ol className="list-decimal pl-5 space-y-2 text-sm">
            <li>In Apple menu → About This Mac, check the chip or processor. Choose Apple silicon for Apple M-series chips or Intel for Intel processors.</li>
            <li>Open the matching <code>.dmg</code> and drag Exam Studio into Applications.</li>
            <li>The beta uses ad hoc signing and has no Apple notarization. Verify the SHA-256 before opening it. See <a className="underline" href="https://support.apple.com/en-us/102445">Apple’s guidance on Gatekeeper alerts</a>.</li>
          </ol>
        ) : <p className="text-sm">A download is currently unavailable for macOS.</p>)}
      </div>

      <div className="card mb-6">
        <button aria-expanded={expanded === 'verify'} onClick={() => setExpanded(expanded === 'verify' ? null : 'verify')} className="flex w-full justify-between items-center font-semibold">
          <span>Verify your download</span><span>{expanded === 'verify' ? '-' : '+'}</span>
        </button>
        {expanded === 'verify' && (
          <div className="mt-3 text-sm space-y-2">
            <p>Replace <code>filename</code> with the downloaded file’s name. Compare the result with the SHA-256 shown when you select a download.</p>
            <p>Windows PowerShell</p>
            <code className="block bg-black/30 p-2 rounded break-words">Get-FileHash -Algorithm SHA256 "filename"</code>
            <p>Linux terminal</p>
            <code className="block bg-black/30 p-2 rounded break-words">sha256sum "filename"</code>
            {hasMac && <><p>macOS Terminal</p><code className="block bg-black/30 p-2 rounded break-words">shasum -a 256 "filename"</code></>}
          </div>
        )}
      </div>

      <div className="card">
        <button aria-expanded={expanded === 'trouble'} onClick={() => setExpanded(expanded === 'trouble' ? null : 'trouble')} className="flex w-full justify-between items-center font-semibold">
          <span>Troubleshooting</span><span>{expanded === 'trouble' ? '-' : '+'}</span>
        </button>
        {expanded === 'trouble' && (
          <div className="mt-3 text-sm space-y-2 opacity-80">
            <p>Install version 0.2.5 once to enable automatic downloads of future official updates. Exam Studio verifies each installer and shows where to find it when it’s ready. Use <strong>Help → Check for updates</strong> to check immediately.</p>
            <p>If Exam Studio cannot start, open the app’s data folder and check <code>desktop.log</code>. You can also <a className="underline" href="/app">open the web app</a>.</p>
          </div>
        )}
      </div>
    </section>
  );
}
