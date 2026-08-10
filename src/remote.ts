import { desktop } from './model/desktop';
import type { RemoteCommand } from './model/desktop';
import { useAppStore } from './store/store';
import { startSceneTransition } from './store/transitions';

/**
 * Connector to the LAN remote. On the desktop the relay runs inside the main
 * process, so this talks over IPC — no EventSource, no localhost fetch, no
 * CORS. Still strictly opt-in: nothing binds a socket until the user turns it
 * on in the Output panel.
 */

let unsubscribeStore: (() => void) | null = null;
let unsubscribeIpc: (() => void) | null = null;
let pushTimer: number | undefined;

function handleCommand(cmd: RemoteCommand): void {
  const s = useAppStore.getState();
  if (cmd.type === 'scene' && typeof cmd.sceneId === 'string') {
    startSceneTransition(cmd.sceneId, 4);
  } else if (cmd.type === 'brightness' && typeof cmd.value === 'number') {
    s.setMasterBrightness(cmd.value);
  } else if (cmd.type === 'blackout' && typeof cmd.value === 'boolean') {
    if (s.blackout !== cmd.value) s.toggleBlackout();
  }
}

function pushState(): void {
  if (!desktop) return;
  const s = useAppStore.getState();
  desktop.remotePush({
    name: s.project.meta.name,
    scenes: s.project.scenes.map((x) => ({ id: x.id, name: x.name })),
    brightness: s.project.master.brightness,
    blackout: s.blackout,
  });
}

function schedulePush(): void {
  window.clearTimeout(pushTimer);
  pushTimer = window.setTimeout(pushState, 500);
}

function connect(): void {
  if (!desktop) return;
  disconnect();
  unsubscribeIpc = desktop.onRemoteCommand(handleCommand);
  unsubscribeStore = useAppStore.subscribe((state, prev) => {
    if (state.project !== prev.project || state.blackout !== prev.blackout) schedulePush();
  });
  pushState();
}

function disconnect(): void {
  unsubscribeIpc?.();
  unsubscribeIpc = null;
  unsubscribeStore?.();
  unsubscribeStore = null;
  window.clearTimeout(pushTimer);
}

/** Returns the addresses a phone can reach; empty if it failed to start
 * (most likely the port is already in use). The enabled flag is persisted by
 * the main process in settings.json, so it survives a reinstall of the page. */
export async function setRemoteEnabled(on: boolean): Promise<string[]> {
  if (!desktop) return [];
  const status = await desktop.remoteSetEnabled(on);
  if (status.running) connect();
  else disconnect();
  return status.urls;
}

export async function remoteStatus(): Promise<{ running: boolean; urls: string[] }> {
  if (!desktop) return { running: false, urls: [] };
  const s = await desktop.remoteStatus();
  return { running: s.running, urls: s.urls };
}

export function initRemote(): void {
  if (!desktop) return;
  void desktop.remoteStatus().then((status) => {
    if (status.running) connect();
  });
}
