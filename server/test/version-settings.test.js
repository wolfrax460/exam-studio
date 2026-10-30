// Where the update check looks when nothing is set in the environment, which is the case for a
// packaged desktop app. This file needs its own process: settings.js reads SETTINGS_FILE once, at
// import time, so the environment has to be set before anything is imported.
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';

const dir = mkdtempSync(path.join(os.tmpdir(), 'exam-studio-update-settings-'));
process.env.SETTINGS_FILE = path.join(dir, 'settings.json');
process.env.DATA_FILE = path.join(dir, 'store.json');
writeFileSync(process.env.SETTINGS_FILE, JSON.stringify({
  version: 1,
  provider: 'deepseek',
  profiles: {},
  update: { repo: 'someone/thing' },
}));

const { updateSource, currentVersion } = await import('../lib/version.js');
const { updateSettings, getSettings } = await import('../lib/settings.js');

after(() => rmSync(dir, { recursive: true, force: true }));

describe('update source from the app settings', () => {
  // Every test starts from a clean slate, so a failure cannot leak into the next one.
  beforeEach(() => {
    delete process.env.UPDATE_REPO;
    delete process.env.UPDATE_FEED_URL;
  });

  it('uses the repository saved in settings.json', () => {
    assert.deepEqual(updateSource(), {
      kind: 'github',
      repo: 'someone/thing',
      url: 'https://api.github.com/repos/someone/thing/releases/latest',
    });
  });

  it('accepts a full GitHub address or a .git suffix', () => {
    updateSettings({ update: { repo: 'https://github.com/other/project.git' } });
    assert.equal(updateSource().repo, 'other/project');
  });

  it('prefers a feed address over a repository', () => {
    updateSettings({ update: { repo: 'someone/thing', feedUrl: 'https://example.test/version.json' } });
    assert.deepEqual(updateSource(), { kind: 'url', url: 'https://example.test/version.json' });
  });

  it('lets the environment win over the saved settings', () => {
    updateSettings({ update: { repo: 'saved/repo', feedUrl: '' } });

    process.env.UPDATE_REPO = 'from/env';
    assert.equal(updateSource().repo, 'from/env', 'the environment beats the saved repository');

    process.env.UPDATE_FEED_URL = 'https://env.test/version.json';
    assert.deepEqual(updateSource(), { kind: 'url', url: 'https://env.test/version.json' }, 'the environment beats the saved repository too');

    delete process.env.UPDATE_FEED_URL;
    assert.equal(updateSource().repo, 'from/env');
  });

  it('clears a saved value without touching the repository', () => {
    updateSettings({ update: { repo: 'someone/thing', feedUrl: 'https://example.test/version.json' } });
    updateSettings({ update: { feedUrl: '' } });
    assert.equal(updateSource().repo, 'someone/thing', 'clearing the feed falls back to the repository');
  });

  it('switches the check off when both are cleared', () => {
    updateSettings({ update: { repo: '', feedUrl: '' } });
    assert.equal(updateSource(), null);
    assert.deepEqual(getSettings().update, {}, 'cleared values are removed, not stored empty');
  });

  it('ignores a saved repository that is not owner/name', () => {
    updateSettings({ update: { repo: 'nonsense' } });
    assert.equal(updateSource(), null);
  });

  it('still knows the version of this build', () => {
    assert.match(currentVersion(), /^\d+\.\d+\.\d+/);
  });
});
