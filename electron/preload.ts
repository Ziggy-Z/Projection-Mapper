import { contextBridge, ipcRenderer, webUtils } from 'electron';
import type {
  DesktopApi,
  DisplayInfo,
  RemoteCommand,
  RemoteState,
  RemoteStatus,
  StoredText,
} from '../src/model/desktop';

/** Wraps an ipcRenderer.on subscription as an unsubscribe function, so the
 * renderer can use it directly from a useEffect. */
function subscribe<T extends unknown[]>(
  channel: string,
  cb: (...args: T) => void,
): () => void {
  const listener = (_e: unknown, ...args: unknown[]): void => cb(...(args as T));
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

const api: DesktopApi = {
  version: process.versions.electron,

  readProject: () => ipcRenderer.invoke('project:read') as Promise<StoredText>,
  writeProject: (text) => ipcRenderer.invoke('project:write', text) as Promise<void>,
  saveProjectAs: (name, text) =>
    ipcRenderer.invoke('project:saveAs', name, text) as Promise<string | null>,
  openProjectFile: () => ipcRenderer.invoke('project:open') as Promise<string | null>,
  saveTextAs: (name, text) =>
    ipcRenderer.invoke('text:saveAs', name, text) as Promise<string | null>,
  openTextFile: () => ipcRenderer.invoke('text:open') as Promise<string | null>,

  async putMedia(id, file) {
    // Copying by path keeps a two-hour video out of the IPC channel entirely.
    const from = webUtils.getPathForFile(file);
    if (from) {
      await ipcRenderer.invoke('media:putPath', id, from);
      return;
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    await ipcRenderer.invoke('media:putBytes', id, bytes);
  },
  deleteMedia: (id) => ipcRenderer.invoke('media:delete', id) as Promise<void>,
  mediaUrl: (id) => `media://local/${encodeURIComponent(id)}`,

  listDisplays: () => ipcRenderer.invoke('display:list') as Promise<DisplayInfo[]>,
  moveToDisplay: (id) =>
    ipcRenderer.invoke('display:move', id) as Promise<DisplayInfo | null>,
  setFullScreen: (on) =>
    ipcRenderer.invoke('display:setFullScreen', on) as Promise<boolean>,
  isFullScreen: () => ipcRenderer.invoke('display:isFullScreen') as Promise<boolean>,
  onDisplaysChanged: (cb) => subscribe('displays:changed', cb),
  onFullScreenChanged: (cb) => subscribe<[boolean]>('fullscreen:changed', cb),

  remoteStatus: () => ipcRenderer.invoke('remote:status') as Promise<RemoteStatus>,
  remoteSetEnabled: (on) =>
    ipcRenderer.invoke('remote:setEnabled', on) as Promise<RemoteStatus>,
  remotePush: (state: RemoteState) => ipcRenderer.send('remote:push', state),
  onRemoteCommand: (cb) => subscribe<[RemoteCommand]>('remote:command', cb),

  getKeepAwake: () => ipcRenderer.invoke('power:getKeepAwake') as Promise<boolean>,
  setKeepAwake: (on) => ipcRenderer.invoke('power:keepAwake', on) as Promise<boolean>,
  getAutoLaunch: () => ipcRenderer.invoke('startup:get') as Promise<boolean>,
  setAutoLaunch: (on) => ipcRenderer.invoke('startup:set', on) as Promise<boolean>,
  quit: () => ipcRenderer.send('app:quit'),
};

contextBridge.exposeInMainWorld('desktop', api);
