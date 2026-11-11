// Desktop shell: runs the Exam Studio server inside the app, on this computer only, then shows
// it in a window. Packaged with electron-builder; see "Desktop app" in README.md.
import { app, BrowserWindow, Menu, dialog, shell } from 'electron';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
app.setName('Exam Studio');
// Windows uses this to group the taskbar button and to name notifications.
app.setAppUserModelId('com.examstudio.app');

// A second copy must not start its own server or window. Focus the first one instead.
const isPrimaryInstance = app.requestSingleInstanceLock();
if (!isPrimaryInstance) app.quit();

// ---------------------------------------------------------------- logging
// A packaged app has no console, so everything worth knowing goes to a log file the user can
// find from the Help menu when something goes wrong.
let logFile = null;
function log(message) {
  const line = `${new Date().toISOString()}  ${message}`;
  process.stdout.write(`${line}\n`);
  if (!logFile) return;
  try {
    // Append first: on the very first run the file does not exist yet, and a stat() before the
    // append would throw and silently lose every line.
    fs.appendFileSync(logFile, `${line}\n`);
    if (fs.statSync(logFile).size > 512 * 1024) fs.writeFileSync(logFile, `${line}\n`); // keep one file
  } catch { /* logging must never break the app */ }
}

// ---------------------------------------------------------------- preferences
const prefsPath = () => path.join(app.getPath('userData'), 'window.json');

function readPrefs() {
  try {
    return JSON.parse(fs.readFileSync(prefsPath(), 'utf8')) || {};
  } catch {
    return {};
  }
}

function writePrefs(patch) {
  try {
    fs.mkdirSync(path.dirname(prefsPath()), { recursive: true });
    fs.writeFileSync(prefsPath(), JSON.stringify({ ...readPrefs(), ...patch }, null, 2));
  } catch { /* preferences are a nicety */ }
}

let win = null;
let server = null;

app.on('second-instance', () => {
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.focus();
});

// ---------------------------------------------------------------- update check
const updateMessageFile = () => path.join(app.getPath('userData'), 'update-notified.json');
let checkingUpdates = false;

/** Check for a new release and prepare its verified installer in the background. */
async function checkForUpdates({ quiet = false, force = false } = {}) {
  if (checkingUpdates) {
    if (!quiet) await dialog.showMessageBox(win, { type: 'info', title: 'Updates', message: 'Exam Studio is already checking for or downloading an update.' });
    return null;
  }
  checkingUpdates = true;
  try {
    const { checkForUpdate } = await import(pathToFileURL(path.join(here, '..', 'server', 'lib', 'version.js')).href);
    // force is for the Help menu. The check at start-up must not force, or the 24-hour cache
    // would be pointless and every launch would call out to the update server.
    const result = await checkForUpdate({ force });
    if (!result.configured) {
      if (!quiet) await dialog.showMessageBox(win, {
        type: 'info', title: 'Updates', message: 'Update checks are off.',
        detail: 'Set UPDATE_REPO (owner/repo) or UPDATE_FEED_URL in server/.env, then restart Exam Studio.',
      });
      return result;
    }
    if (result.error) {
      if (!quiet) await dialog.showMessageBox(win, { type: 'warning', title: 'Updates', message: 'The update check failed.', detail: result.error });
      return result;
    }
    if (!result.updateAvailable) {
      if (!quiet) await dialog.showMessageBox(win, {
        type: 'info', title: 'Updates', message: `Exam Studio ${result.current} is up to date.`,
        detail: `Checked ${new Date(result.checkedAt).toLocaleString()}. The next automatic check is in 24 hours.`,
      });
      return result;
    }

    let installer = null;
    const downloader = app.isPackaged ? await import('./update-download.js') : null;
    const asset = downloader?.selectInstaller(result, {
      platform: process.platform, arch: process.arch, env: process.env, executable: process.execPath,
    });

    // One dialog per version, unless a previously announced update is now ready to install.
    let notified = {};
    try { notified = JSON.parse(fs.readFileSync(updateMessageFile(), 'utf8')) || {}; } catch { /* first run */ }
    if (quiet && notified.version === result.latest && (!asset || notified.downloaded)) return result;

    let downloadFailed = false;
    if (asset) {
      try {
        installer = await downloader.downloadInstaller(asset, path.join(app.getPath('userData'), 'updates'));
        log(`verified desktop update ${asset.name}`);
      } catch (error) {
        log(`update download failed: ${error.message}`);
        if (quiet) return result;
        downloadFailed = true;
      }
    }
    if (quiet && (!win || win.isDestroyed())) return result;
    const link = typeof result.url === 'string' && /^https?:\/\//i.test(result.url) ? result.url : null;
    const action = installer ? 'Show download' : link ? 'Get it now' : null;
    const { response } = await dialog.showMessageBox(win, {
      type: 'info', title: installer ? 'Update downloaded' : 'A newer version is available',
      message: installer ? `Exam Studio ${result.latest} is ready to install.` : `Exam Studio ${result.latest} is available.`,
      detail: [
        `You are using ${result.current}.`,
        installer ? 'Exam Studio verified the installer. Open the download folder when you are ready to update.' : '',
        downloadFailed ? 'The automatic download could not be verified. You can open the release page or try again later.' : '',
        String(result.notes || '').slice(0, 400),
      ].filter(Boolean).join('\n\n'),
      buttons: action ? [action, 'Later'] : ['OK'],
      defaultId: 0, cancelId: action ? 1 : 0,
    });
    if (response === 0) {
      if (installer) shell.showItemInFolder(installer);
      else if (link) await shell.openExternal(link);
    }
    if (!downloadFailed) writeFileSyncSafe(updateMessageFile(), JSON.stringify({
      version: result.latest, downloaded: Boolean(installer), at: new Date().toISOString(),
    }));
    return result;
  } catch (error) {
    log(`update check failed: ${error.message}`);
    if (!quiet) await dialog.showMessageBox(win, { type: 'warning', title: 'Updates', message: 'The update check failed.', detail: String(error.message || error) });
    return null;
  } finally {
    checkingUpdates = false;
  }
}

function writeFileSyncSafe(file, contents) {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, contents);
  } catch { /* ignore */ }
}

// ---------------------------------------------------------------- menu
function buildMenu() {
  const dataFolder = () => shell.openPath(app.getPath('userData'));
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { role: 'fileMenu' },
    { role: 'editMenu' },
    { role: 'viewMenu' },
    { role: 'windowMenu' },
    {
      label: 'Help',
      submenu: [
        { label: 'Check for updates…', click: () => checkForUpdates({ quiet: false, force: true }) },
        { label: `About Exam Studio ${app.getVersion()}`, click: () => dialog.showMessageBox(win, {
          type: 'info', title: 'About Exam Studio',
          message: `Exam Studio ${app.getVersion()}`,
          detail: `Turn course notes into study handouts, notes, flashcards and exams.\n\nNode ${process.versions.node} · Electron ${process.versions.electron}\nData folder: ${app.getPath('userData')}`,
          buttons: ['OK', 'Open data folder'],
        }).then(({ response }) => { if (response === 1) dataFolder(); }) },
        { label: 'Open the data folder', click: dataFolder },
        { label: 'Open the log file', click: () => shell.openPath(logFile || app.getPath('userData')) },
      ],
    },
  ]));
}


async function waitForServer(origin, timeoutMs = 30000, intervalMs = 500) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const ok = await new Promise((resolve) => {
      const req = http.get(origin + '/api/health', (res) => {
        res.resume();
        resolve(res.statusCode === 200);
      });
      req.on('error', () => resolve(false));
      req.setTimeout(1000, () => { req.destroy(); resolve(false); });
    });
    if (ok) return true;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  return false;
}

// ---------------------------------------------------------------- boot
async function boot() {
  const data = app.getPath('userData');
  logFile = path.join(data, 'desktop.log');
  log(`--- Exam Studio ${app.getVersion()} starting (packaged: ${app.isPackaged}) ---`);

  // Accounts, library and settings live in the user's own folder, never inside the app bundle.
  process.env.DATA_FILE = path.join(data, 'library.json');
  process.env.SETTINGS_FILE = path.join(data, 'settings.json');
  process.env.HOST = '127.0.0.1';
  process.env.UPDATE_REPO ||= 'wolfrax460/exam-studio';
  // When run from the source folder, still pick up server/.env if there is one.
  if (!app.isPackaged) process.env.DOTENV_CONFIG_PATH ||= path.join(here, '..', 'server', '.env');

  const clientDist = path.join(here, '..', 'client', 'dist');
  if (!fs.existsSync(clientDist)) {
    log('client/dist is missing');
    dialog.showErrorBox('Exam Studio could not start', `The app files are missing from ${clientDist}.\n\nRun "npm run build" in the project folder, then try again.`);
    app.quit();
    return;
  }

  const serverEntry = path.join(here, '..', 'server', 'index.js');
  // In a packaged app the server files are unpacked next to the asar, because the agent (MCP)
  // server is started as a separate Node process and cannot read inside an asar.
  process.env.EXAM_STUDIO_MCP_ENTRY = app.isPackaged
    ? path.join(process.resourcesPath, 'app.asar.unpacked', 'server', 'mcp.js')
    : serverEntry.replace(/index\.js$/, 'mcp.js');

  const { start } = await import(pathToFileURL(serverEntry).href);
  server = await start(0, '127.0.0.1');
  const origin = `http://127.0.0.1:${server.address().port}`;
  log(`server listening on ${origin}`);

  // The server has to be answering before the window asks for the page. On a first portable start
  // the machine is still busy unpacking ~450 MB, and one failed load used to abort the launch.
  if (!(await waitForServer(origin))) {
    throw new Error(`The server started on ${origin} but did not answer. If another copy of Exam Studio is running or still starting, close it and try again.`);
  }
  log('server answered');

  buildMenu();

  const prefs = readPrefs();
  const bounds = prefs.bounds && Number.isFinite(prefs.bounds.width) ? prefs.bounds : null;
  win = new BrowserWindow({
    width: bounds?.width || 1280,
    height: bounds?.height || 860,
    x: bounds?.x,
    y: bounds?.y,
    minWidth: 900,
    minHeight: 600,
    title: 'Exam Studio',
    autoHideMenuBar: true,
    backgroundColor: '#f6f3ec',
    show: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  if (prefs.maximized) win.maximize();
  win.setTitle(`Exam Studio ${app.getVersion()}`);

  win.once('ready-to-show', () => win.show());
  win.on('closed', () => { win = null; });
  // Resizing fires continuously, so the position is written once the user stops.
  let saveTimer = null;
  win.on('resize', () => {
    if (!win || win.isMinimized()) return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => { if (win) writePrefs({ bounds: win.getBounds(), maximized: win.isMaximized() }); }, 600);
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(origin)) {
      event.preventDefault();
      if (/^https?:/i.test(url)) shell.openExternal(url);
    }
  });
  win.webContents.on('render-process-gone', (_event, details) => log(`renderer gone: ${details.reason}`));

  // A load can still fail once for no lasting reason (a slow disk, a scanner, a busy machine), so
  // it is retried rather than turning the whole launch into an error box.
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await win.loadURL(origin);
      break;
    } catch (error) {
      log(`loading the window failed (attempt ${attempt} of 3): ${error.message}`);
      if (attempt === 3) throw error;
      await new Promise((resolve) => setTimeout(resolve, 800 * attempt));
    }
  }
  log('window loaded');

  // A quiet check a few seconds after the window is up, so start-up is never held up by it.
  setTimeout(() => { checkForUpdates({ quiet: true }).catch(() => {}); }, 6000);
  if (app.isPackaged) {
    setInterval(() => { checkForUpdates({ quiet: true }).catch(() => {}); }, 60 * 60 * 1000).unref();
  }
}

app.whenReady().then(() => {
  if (!isPrimaryInstance) return undefined;
  return boot();
}).catch((error) => {
  log(`fatal: ${error?.stack || error}`);
  dialog.showErrorBox(
    'Exam Studio could not start',
    `${error?.message || error}\n\nIf another copy of Exam Studio is running or still starting, close it and try again.\n\nLog file: ${logFile || 'not available'}`,
  );
  app.quit();
});

app.on('window-all-closed', () => app.quit());

// Close the listener before the process goes, so a restart can bind the same port immediately.
app.on('before-quit', () => {
  try { server?.close(); } catch { /* already closed */ }
});
