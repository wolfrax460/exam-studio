import { createHash, randomUUID } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { lstat, mkdir, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { OFFICIAL_UPDATE_REPO } from '../server/lib/version.js';

const MAX_INSTALLER_SIZE = 700 * 1024 * 1024;
const DOWNLOAD_TIMEOUT_MS = 30 * 60 * 1000;
const CDN_HOSTS = new Set(['release-assets.githubusercontent.com', 'objects.githubusercontent.com']);

export function selectInstaller(result, { platform, arch, env, executable }) {
  if (typeof result.latest !== 'string' || !Array.isArray(result.officialAssets)) return null;
  const version = /^v(\d+\.\d+\.\d+)$/.exec(result.latest)?.[1];
  if (!version) return null;
  const base = `Exam-Studio-${version}`;
  let name;
  if (platform === 'win32' && arch === 'x64') {
    name = env.PORTABLE_EXECUTABLE_FILE ? `${base}-portable.exe` : `Exam-Studio-Setup-${version}.exe`;
  } else if (platform === 'linux' && arch === 'x64') {
    if (env.APPIMAGE) name = `${base}-linux-x86_64.AppImage`;
    else if (executable?.startsWith('/opt/Exam Studio/')) name = `${base}-linux-amd64.deb`;
    else name = `${base}-linux-x64.zip`;
  } else if (platform === 'darwin' && ['arm64', 'x64'].includes(arch)) {
    name = `${base}-mac-${arch}.dmg`;
  }
  if (!name) return null;
  const asset = result.officialAssets.find((item) => item?.name === name
    && Number.isSafeInteger(item.size) && item.size > 0 && item.size <= MAX_INSTALLER_SIZE
    && typeof item.digest === 'string' && /^sha256:[a-f0-9]{64}$/.test(item.digest));
  if (!asset) return null;
  return { ...asset, url: `https://github.com/${OFFICIAL_UPDATE_REPO}/releases/download/${result.latest}/${name}` };
}

async function fetchInstaller(url, fetcher) {
  const signal = AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS);
  for (let redirects = 0; redirects <= 3; redirects += 1) {
    const response = await fetcher(url, { signal, redirect: 'manual' });
    if (response.ok && response.body) return response.body;
    await response.body?.cancel();
    if (![301, 302, 303, 307, 308].includes(response.status)) {
      throw new Error(`GitHub returned HTTP ${response.status} for the installer.`);
    }
    const location = response.headers.get('location');
    const target = location && new URL(location, url);
    if (!target || target.protocol !== 'https:' || target.port || target.username || target.password || !CDN_HOSTS.has(target.hostname)) {
      throw new Error('GitHub returned an unexpected installer redirect.');
    }
    url = target.href;
  }
  throw new Error('Too many installer redirects.');
}

async function isVerified(file, { size, digest }) {
  const info = await lstat(file).catch((error) => {
    if (error.code !== 'ENOENT') throw error;
    return null;
  });
  if (!info?.isFile() || info.size !== size) return false;
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return `sha256:${hash.digest('hex')}` === digest;
}

export async function downloadInstaller(asset, directory, fetcher = fetch) {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  if (!(await lstat(directory)).isDirectory()) throw new Error('The update folder is unavailable.');
  const file = path.join(directory, asset.name);
  if (await isVerified(file, asset)) return file;

  const temporary = path.join(directory, `.${asset.name}.${randomUUID()}.part`);
  const hash = createHash('sha256');
  let received = 0;
  const verify = new Transform({
    transform(chunk, _encoding, callback) {
      received += chunk.length;
      if (received > asset.size) return callback(new Error('Installer size does not match the release.'));
      hash.update(chunk);
      callback(null, chunk);
    },
  });
  try {
    const body = await fetchInstaller(asset.url, fetcher);
    await pipeline(Readable.fromWeb(body), verify, createWriteStream(temporary, { flags: 'wx', mode: 0o600 }));
    if (received !== asset.size) throw new Error('Installer size does not match the release.');
    if (`sha256:${hash.digest('hex')}` !== asset.digest) throw new Error('Installer checksum does not match the release.');
    await rename(temporary, file);
    return file;
  } finally {
    await rm(temporary, { force: true });
  }
}
