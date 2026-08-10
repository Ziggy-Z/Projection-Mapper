import { app } from 'electron';
import fs from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import path from 'node:path';
import type { StoredText } from '../src/model/desktop';

/**
 * Everything the app persists lives as real files under userData:
 *
 *   project.json    the autosaved show
 *   settings.json   machine config (which display, fullscreen, autostart)
 *   media/<id>      image and video blobs
 *
 * Deliberately not localStorage or IndexedDB: those are scoped to the page
 * origin, so the app would appear to lose the user's work the first time the
 * origin changed (dev server -> app://). Files have no such trapdoor.
 */

const dir = (): string => app.getPath('userData');
const projectFile = (): string => path.join(dir(), 'project.json');
const settingsFile = (): string => path.join(dir(), 'settings.json');
const mediaDir = (): string => path.join(dir(), 'media');

/** Media ids are generated (`med_...`), but they arrive from a JSON file the
 * user could have edited, so never let one escape the media directory. */
function mediaPath(id: string): string | null {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(id)) return null;
  return path.join(mediaDir(), id);
}

async function writeAtomic(file: string, text: string): Promise<void> {
  const tmp = `${file}.tmp`;
  await fs.writeFile(tmp, text, 'utf8');
  await fs.rename(tmp, file);
}

/* ---- Project ---- */

export async function readProject(): Promise<StoredText> {
  let raw: string;
  try {
    raw = await fs.readFile(projectFile(), 'utf8');
  } catch {
    return null; // first run
  }
  try {
    JSON.parse(raw);
    return { ok: true, text: raw };
  } catch {
    return { ok: false, raw };
  }
}

export async function writeProject(text: string): Promise<void> {
  await fs.mkdir(dir(), { recursive: true });
  await writeAtomic(projectFile(), text);
}

/* ---- Settings ---- */

export interface Settings {
  displayId: number | null;
  fullScreen: boolean;
  remoteEnabled: boolean;
  keepAwake: boolean;
  /** Restored only when not fullscreen on a chosen display. */
  bounds: { x: number; y: number; width: number; height: number } | null;
}

const DEFAULTS: Settings = {
  displayId: null,
  fullScreen: false,
  remoteEnabled: false,
  keepAwake: true,
  bounds: null,
};

let cache: Settings | null = null;

export async function readSettings(): Promise<Settings> {
  if (cache) return cache;
  try {
    const raw = await fs.readFile(settingsFile(), 'utf8');
    cache = { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Settings>) };
  } catch {
    cache = { ...DEFAULTS };
  }
  return cache;
}

export async function patchSettings(patch: Partial<Settings>): Promise<Settings> {
  const next = { ...(await readSettings()), ...patch };
  cache = next;
  await fs.mkdir(dir(), { recursive: true });
  await writeAtomic(settingsFile(), JSON.stringify(next, null, 2));
  return next;
}

/* ---- Media ---- */

/** Copies rather than reads-into-memory: a two-hour video should never have to
 * fit in an IPC message. */
export async function importMediaFromPath(id: string, from: string): Promise<void> {
  const to = mediaPath(id);
  if (!to) throw new Error('bad media id');
  await fs.mkdir(mediaDir(), { recursive: true });
  await fs.copyFile(from, to);
}

export async function importMediaFromBytes(id: string, bytes: Uint8Array): Promise<void> {
  const to = mediaPath(id);
  if (!to) throw new Error('bad media id');
  await fs.mkdir(mediaDir(), { recursive: true });
  await new Promise<void>((resolve, reject) => {
    const out = createWriteStream(to);
    out.on('error', reject);
    out.on('finish', () => resolve());
    out.end(bytes);
  });
}

export async function deleteMedia(id: string): Promise<void> {
  const file = mediaPath(id);
  if (!file) return;
  await fs.rm(file, { force: true });
}

export function resolveMedia(id: string): string | null {
  return mediaPath(id);
}
