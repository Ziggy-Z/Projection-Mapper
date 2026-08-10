import {
  app,
  BrowserWindow,
  dialog,
  globalShortcut,
  ipcMain,
  Menu,
  net,
  powerSaveBlocker,
  protocol,
  screen,
} from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { DisplayInfo, RemoteCommand, RemoteState } from '../src/model/desktop';
import * as remote from './remote';
import * as storage from './storage';

const DEV_URL = process.env.VITE_DEV_SERVER_URL;
// Compiled to dist-electron/electron/, so the renderer bundle is two up.
const RENDERER_DIR = path.join(__dirname, '..', '..', 'dist');
const APP_ORIGIN = 'app://local';

let win: BrowserWindow | null = null;
let keepAwakeId: number | null = null;
/** Set while we are deliberately tearing down, so the crash handler does not
 * fight an intentional quit. */
let quitting = false;

/* ------------------------------------------------------------------ *
 * Protocols
 *
 * The bundle cannot be loaded over file:// — Chromium blocks ES modules
 * from opaque origins, and Vite emits `<script type="module">`. A standard,
 * secure scheme gives the renderer a stable origin instead.
 * ------------------------------------------------------------------ */

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'app',
    privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true },
  },
  {
    scheme: 'media',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true, // range requests, so video can seek
    },
  },
]);

function serveFrom(root: string, rel: string): Promise<Response> {
  const file = path.join(root, rel);
  // Never let a crafted URL climb out of the served directory.
  if (!file.startsWith(root)) return Promise.resolve(new Response('', { status: 403 }));
  return net.fetch(pathToFileURL(file).toString());
}

function registerProtocols(): void {
  protocol.handle('app', (req) => {
    const rel = decodeURIComponent(new URL(req.url).pathname).replace(/^\/+/, '');
    return serveFrom(RENDERER_DIR, rel || 'index.html');
  });

  protocol.handle('media', async (req) => {
    const id = decodeURIComponent(new URL(req.url).pathname).replace(/^\/+/, '');
    const file = storage.resolveMedia(id);
    if (!file) return new Response('', { status: 400 });
    try {
      await fs.access(file);
    } catch {
      return new Response('', { status: 404 });
    }
    return net.fetch(pathToFileURL(file).toString());
  });
}

/* ------------------------------------------------------------------ *
 * Window
 * ------------------------------------------------------------------ */

function displayInfo(): DisplayInfo[] {
  const current = win ? screen.getDisplayMatching(win.getBounds()).id : -1;
  const primaryId = screen.getPrimaryDisplay().id;
  return screen.getAllDisplays().map((d, i) => ({
    id: d.id,
    label: d.label || `Display ${i + 1}`,
    width: Math.round(d.bounds.width * d.scaleFactor),
    height: Math.round(d.bounds.height * d.scaleFactor),
    scaleFactor: d.scaleFactor,
    primary: d.id === primaryId,
    internal: d.internal,
    current: d.id === current,
  }));
}

async function createWindow(): Promise<void> {
  const settings = await storage.readSettings();
  const target = settings.displayId
    ? screen.getAllDisplays().find((d) => d.id === settings.displayId)
    : undefined;
  const area = (target ?? screen.getPrimaryDisplay()).workArea;
  const b = settings.bounds;

  win = new BrowserWindow({
    x: b?.x ?? area.x + 40,
    y: b?.y ?? area.y + 40,
    width: b?.width ?? Math.min(1600, area.width - 80),
    height: b?.height ?? Math.min(950, area.height - 80),
    minWidth: 900,
    minHeight: 600,
    frame: false,
    backgroundColor: '#0a0b0d',
    show: false,
    title: 'Projection Mapper',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      // A projector does not care whether the window has focus. Without this
      // Chromium throttles rAF the moment you alt-tab and the wall stutters.
      backgroundThrottling: false,
    },
  });

  Menu.setApplicationMenu(null);
  win.once('ready-to-show', async () => {
    if (!win) return;
    if (target) win.setBounds(target.bounds);
    if (settings.fullScreen) win.setFullScreen(true);
    win.show();
  });

  // Remember where the user left it, but only when it is a real window.
  let saveTimer: NodeJS.Timeout | undefined;
  const remember = (): void => {
    if (!win || win.isFullScreen() || win.isMinimized()) return;
    clearTimeout(saveTimer);
    const bounds = win.getBounds();
    saveTimer = setTimeout(() => void storage.patchSettings({ bounds }), 400);
  };
  win.on('resize', remember);
  win.on('move', remember);

  win.on('enter-full-screen', () => {
    void storage.patchSettings({ fullScreen: true });
    win?.webContents.send('fullscreen:changed', true);
  });
  win.on('leave-full-screen', () => {
    void storage.patchSettings({ fullScreen: false });
    win?.webContents.send('fullscreen:changed', false);
  });

  // An installation must come back on its own after a GPU or renderer crash.
  win.webContents.on('render-process-gone', (_e, details) => {
    console.error('renderer gone:', details.reason);
    if (!quitting) win?.reload();
  });

  win.on('closed', () => {
    win = null;
  });

  if (DEV_URL) await win.loadURL(DEV_URL);
  else await win.loadURL(`${APP_ORIGIN}/index.html`);

  if (settings.keepAwake) setKeepAwake(true);
  if (settings.remoteEnabled) await remote.start().catch(() => undefined);
}

function setKeepAwake(on: boolean): boolean {
  if (on && keepAwakeId === null) {
    keepAwakeId = powerSaveBlocker.start('prevent-display-sleep');
  } else if (!on && keepAwakeId !== null) {
    powerSaveBlocker.stop(keepAwakeId);
    keepAwakeId = null;
  }
  return keepAwakeId !== null;
}

/* ------------------------------------------------------------------ *
 * IPC
 * ------------------------------------------------------------------ */

function registerIpc(): void {
  ipcMain.handle('project:read', () => storage.readProject());
  ipcMain.handle('project:write', (_e, text: string) => storage.writeProject(text));

  ipcMain.handle('project:saveAs', async (_e, name: string, text: string) => {
    if (!win) return null;
    const { canceled, filePath } = await dialog.showSaveDialog(win, {
      defaultPath: name,
      filters: [{ name: 'Projection Mapper project', extensions: ['json'] }],
    });
    if (canceled || !filePath) return null;
    await fs.writeFile(filePath, text, 'utf8');
    return filePath;
  });

  ipcMain.handle('project:open', async () => {
    if (!win) return null;
    const { canceled, filePaths } = await dialog.showOpenDialog(win, {
      properties: ['openFile'],
      filters: [{ name: 'Projection Mapper project', extensions: ['json'] }],
    });
    if (canceled || filePaths.length === 0) return null;
    return fs.readFile(filePaths[0], 'utf8');
  });

  ipcMain.handle('text:saveAs', async (_e, name: string, text: string) => {
    if (!win) return null;
    const { canceled, filePath } = await dialog.showSaveDialog(win, {
      defaultPath: name,
      filters: [{ name: 'JSON', extensions: ['json'] }],
    });
    if (canceled || !filePath) return null;
    await fs.writeFile(filePath, text, 'utf8');
    return filePath;
  });

  ipcMain.handle('text:open', async () => {
    if (!win) return null;
    const { canceled, filePaths } = await dialog.showOpenDialog(win, {
      properties: ['openFile'],
      filters: [{ name: 'JSON', extensions: ['json'] }],
    });
    if (canceled || filePaths.length === 0) return null;
    return fs.readFile(filePaths[0], 'utf8');
  });

  ipcMain.handle('media:putPath', (_e, id: string, from: string) =>
    storage.importMediaFromPath(id, from),
  );
  ipcMain.handle('media:putBytes', (_e, id: string, bytes: Uint8Array) =>
    storage.importMediaFromBytes(id, bytes),
  );
  ipcMain.handle('media:delete', (_e, id: string) => storage.deleteMedia(id));

  ipcMain.handle('display:list', () => displayInfo());
  ipcMain.handle('display:move', async (_e, id: number) => {
    const d = screen.getAllDisplays().find((x) => x.id === id);
    if (!d || !win) return null;
    const wasFull = win.isFullScreen();
    if (wasFull) win.setFullScreen(false);
    win.setBounds(d.bounds);
    if (wasFull) win.setFullScreen(true);
    await storage.patchSettings({ displayId: id });
    return displayInfo().find((x) => x.id === id) ?? null;
  });
  ipcMain.handle('display:setFullScreen', (_e, on: boolean) => {
    win?.setFullScreen(on);
    return win?.isFullScreen() ?? false;
  });
  ipcMain.handle('display:isFullScreen', () => win?.isFullScreen() ?? false);

  ipcMain.handle('remote:status', () => remote.status());
  ipcMain.handle('remote:setEnabled', async (_e, on: boolean) => {
    if (on) {
      try {
        await remote.start();
      } catch {
        // Port already taken — report not-running rather than throwing at the UI.
      }
    } else {
      remote.stop();
    }
    await storage.patchSettings({ remoteEnabled: on });
    return remote.status();
  });
  ipcMain.on('remote:push', (_e, state: RemoteState) => remote.pushState(state));

  ipcMain.handle('power:getKeepAwake', () => keepAwakeId !== null);
  ipcMain.handle('power:keepAwake', async (_e, on: boolean) => {
    const active = setKeepAwake(on);
    await storage.patchSettings({ keepAwake: on });
    return active;
  });

  ipcMain.handle('startup:get', () => app.getLoginItemSettings().openAtLogin);
  ipcMain.handle('startup:set', (_e, on: boolean) => {
    app.setLoginItemSettings({ openAtLogin: on, args: [] });
    return app.getLoginItemSettings().openAtLogin;
  });

  ipcMain.on('app:quit', () => {
    quitting = true;
    app.quit();
  });
}

/* ------------------------------------------------------------------ *
 * Lifecycle
 * ------------------------------------------------------------------ */

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.focus();
  });

  void app.whenReady().then(async () => {
    registerProtocols();
    registerIpc();

    remote.setCommandHandler((cmd: RemoteCommand) => {
      win?.webContents.send('remote:command', cmd);
    });

    const notifyDisplays = (): void => win?.webContents.send('displays:changed');
    screen.on('display-added', notifyDisplays);
    screen.on('display-removed', notifyDisplays);
    screen.on('display-metrics-changed', notifyDisplays);

    await createWindow();

    // The window is borderless with no menu bar, so these are the only ways out.
    globalShortcut.register('F11', () => win?.setFullScreen(!win.isFullScreen()));
    globalShortcut.register('CommandOrControl+Q', () => {
      quitting = true;
      app.quit();
    });
  });

  app.on('before-quit', () => {
    quitting = true;
  });

  app.on('will-quit', () => {
    globalShortcut.unregisterAll();
    remote.stop();
  });

  app.on('window-all-closed', () => app.quit());
}
