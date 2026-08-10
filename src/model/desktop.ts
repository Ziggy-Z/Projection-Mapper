/**
 * The contract between the renderer and the Electron main process.
 *
 * `electron/preload.ts` implements this over IPC and hands it to the page as
 * `window.desktop`; every other module in `src/` talks to the machine through
 * here and nowhere else. Types only — no runtime dependency on Electron.
 */

export interface DisplayInfo {
  id: number;
  label: string;
  /** Native pixels, i.e. what the projector actually accepts. */
  width: number;
  height: number;
  scaleFactor: number;
  primary: boolean;
  internal: boolean;
  /** True for the display the output window currently sits on. */
  current: boolean;
}

export interface RemoteStatus {
  running: boolean;
  port: number;
  /** Every LAN address a phone could reach this machine on. */
  urls: string[];
}

export interface RemoteCommand {
  type: 'scene' | 'brightness' | 'blackout';
  sceneId?: string;
  value?: number | boolean;
}

export interface RemoteState {
  name: string;
  scenes: { id: string; name: string }[];
  brightness: number;
  blackout: boolean;
}

/** Mirrors the browser `StoredResult`: a parse failure hands back the raw text
 * rather than destroying it. */
export type StoredText =
  | { ok: true; text: string }
  | { ok: false; raw: string }
  | null;

export interface DesktopApi {
  readonly version: string;

  /* ---- Project files (userData, not origin-scoped web storage) ---- */
  readProject(): Promise<StoredText>;
  writeProject(text: string): Promise<void>;
  saveProjectAs(suggestedName: string, text: string): Promise<string | null>;
  openProjectFile(): Promise<string | null>;
  saveTextAs(suggestedName: string, text: string): Promise<string | null>;
  openTextFile(): Promise<string | null>;

  /* ---- Media blobs on disk; read back over the media:// protocol ---- */
  putMedia(id: string, file: File): Promise<void>;
  deleteMedia(id: string): Promise<void>;
  mediaUrl(id: string): string;

  /* ---- Output display ---- */
  listDisplays(): Promise<DisplayInfo[]>;
  moveToDisplay(id: number): Promise<DisplayInfo | null>;
  setFullScreen(on: boolean): Promise<boolean>;
  isFullScreen(): Promise<boolean>;
  onDisplaysChanged(cb: () => void): () => void;
  onFullScreenChanged(cb: (on: boolean) => void): () => void;

  /* ---- LAN remote, served from the main process ---- */
  remoteStatus(): Promise<RemoteStatus>;
  remoteSetEnabled(on: boolean): Promise<RemoteStatus>;
  remotePush(state: RemoteState): void;
  onRemoteCommand(cb: (cmd: RemoteCommand) => void): () => void;

  /* ---- Machine ---- */
  getKeepAwake(): Promise<boolean>;
  setKeepAwake(on: boolean): Promise<boolean>;
  getAutoLaunch(): Promise<boolean>;
  setAutoLaunch(on: boolean): Promise<boolean>;
  quit(): void;
}

declare global {
  interface Window {
    desktop?: DesktopApi;
  }
}

/** Undefined only if the preload failed to load — callers fall back to the
 * browser implementations rather than white-screening. */
export const desktop: DesktopApi | undefined =
  typeof window === 'undefined' ? undefined : window.desktop;

export const isDesktop = desktop !== undefined;
