import { useAppStore } from './store/store';
import { startSceneTransition } from './store/transitions';

/**
 * Optional connector to the LAN remote relay (server/remote.mjs). Strictly
 * opt-in: nothing here runs unless the user enables it in the Output panel,
 * so the core app stays fully offline. Talks only to this machine's own
 * hostname; EventSource handles reconnection.
 */

const FLAG_KEY = 'projection-mapper.remote.v1';
const PORT = 9270;

let es: EventSource | null = null;
let pushTimer: number | undefined;
let unsubscribe: (() => void) | null = null;

export function remoteEnabled(): boolean {
  try {
    return localStorage.getItem(FLAG_KEY) === '1';
  } catch {
    return false;
  }
}

export function setRemoteEnabled(on: boolean): void {
  try {
    localStorage.setItem(FLAG_KEY, on ? '1' : '0');
  } catch {
    /* storage unavailable — stays session-only */
  }
  if (on) connect();
  else disconnect();
}

function base(): string {
  return `http://${window.location.hostname || 'localhost'}:${PORT}`;
}

interface RemoteCommand {
  type: 'scene' | 'brightness' | 'blackout';
  sceneId?: string;
  value?: number | boolean;
}

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
  const s = useAppStore.getState();
  const body = JSON.stringify({
    name: s.project.meta.name,
    scenes: s.project.scenes.map((x) => ({ id: x.id, name: x.name })),
    brightness: s.project.master.brightness,
    blackout: s.blackout,
  });
  void fetch(`${base()}/state`, { method: 'POST', body }).catch(() => undefined);
}

function schedulePush(): void {
  window.clearTimeout(pushTimer);
  pushTimer = window.setTimeout(pushState, 500);
}

function connect(): void {
  disconnect();
  es = new EventSource(`${base()}/events?role=app`);
  es.onmessage = (e) => {
    try {
      handleCommand(JSON.parse(e.data) as RemoteCommand);
    } catch {
      /* malformed command — ignore */
    }
  };
  es.onopen = () => pushState();
  unsubscribe = useAppStore.subscribe((state, prev) => {
    if (state.project !== prev.project || state.blackout !== prev.blackout) schedulePush();
  });
}

function disconnect(): void {
  es?.close();
  es = null;
  unsubscribe?.();
  unsubscribe = null;
  window.clearTimeout(pushTimer);
}

export function initRemote(): void {
  if (remoteEnabled()) connect();
}
