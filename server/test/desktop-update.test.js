import { createHash } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { selectInstaller, downloadInstaller } from '../../electron/update-download.js';

const bytes = Buffer.from('installer contents');
const digest = `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
const filenames = [
  'Exam-Studio-Setup-2.0.1.exe', 'Exam-Studio-2.0.1-portable.exe',
  'Exam-Studio-2.0.1-linux-x86_64.AppImage', 'Exam-Studio-2.0.1-linux-amd64.deb', 'Exam-Studio-2.0.1-linux-x64.zip',
  'Exam-Studio-2.0.1-mac-arm64.dmg', 'Exam-Studio-2.0.1-mac-x64.dmg',
];
const result = {
  latest: 'v2.0.1',
  officialAssets: filenames.map((name) => ({ name, size: bytes.length, digest })),
};

test('selects only the official installer for this platform, architecture and package', () => {
  const installations = [
    ['win32', 'x64', {}, 'C:/Program Files/Exam Studio/Exam Studio.exe'],
    ['win32', 'x64', { PORTABLE_EXECUTABLE_FILE: 'C:/Downloads/Exam Studio.exe' }],
    ['linux', 'x64', { APPIMAGE: '/home/test/Exam-Studio.AppImage' }],
    ['linux', 'x64', {}, '/opt/Exam Studio/exam-studio'],
    ['linux', 'x64', {}, '/home/test/Exam Studio/exam-studio'],
    ['darwin', 'arm64', {}],
    ['darwin', 'x64', {}],
  ];
  installations.forEach(([platform, arch, env, executable], index) => {
    const asset = selectInstaller(result, { platform, arch, env, executable });
    assert.equal(asset.name, filenames[index]);
    assert.equal(asset.url, `https://github.com/wolfrax460/exam-studio/releases/download/v2.0.1/${asset.name}`);
  });
  assert.equal(selectInstaller({ ...result, latest: 'v2.0.1-rc.1' }, { platform: 'win32', arch: 'x64', env: {} }), null);
  assert.equal(selectInstaller({ latest: 'v2.0.1' }, { platform: 'win32', arch: 'x64', env: {} }), null);
  assert.equal(selectInstaller(result, { platform: 'linux', arch: 'arm64', env: {} }), null);
});

test('downloads through the GitHub CDN, verifies SHA-256 and reuses only verified cached files', async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'exam-studio-desktop-update-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const asset = selectInstaller(result, { platform: 'win32', arch: 'x64', env: {} });
  const cdn = 'https://release-assets.githubusercontent.com/test';
  const requests = [];
  const fetcher = async (url) => {
    requests.push(String(url));
    return String(url) === asset.url ? Response.redirect(cdn, 302) : new Response(bytes);
  };
  const file = await downloadInstaller(asset, directory, fetcher);
  assert.deepEqual(await readFile(file), bytes);
  assert.deepEqual(requests, [asset.url, cdn]);
  assert.equal(await downloadInstaller(asset, directory, fetcher), file);
  assert.equal(requests.length, 2);
  await writeFile(file, Buffer.alloc(bytes.length));
  assert.equal(await downloadInstaller(asset, directory, fetcher), file);
  assert.deepEqual(await readFile(file), bytes);
  assert.equal(requests.length, 4);
});

test('rejects a corrupt or oversized response and an untrusted redirect', async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'exam-studio-desktop-update-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const asset = selectInstaller(result, { platform: 'win32', arch: 'x64', env: {} });
  await assert.rejects(downloadInstaller(asset, directory, async () => new Response(Buffer.alloc(bytes.length))), /checksum/);
  await assert.rejects(downloadInstaller(asset, directory, async () => new Response(Buffer.alloc(bytes.length + 1))), /size/);
  await assert.rejects(downloadInstaller(asset, directory, async () => Response.redirect('https://other.example/asset')), /redirect/i);
  assert.deepEqual(await readdir(directory), []);
});
