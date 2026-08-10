/**
 * Storage for image/video sources. On the desktop these are real files under
 * userData, read back over the `media://` protocol so a large video streams
 * through Chromium rather than being copied through an IPC message.
 *
 * `getMedia` still resolves to a Blob, so gl/renderer.ts is unaffected by
 * where the bytes actually live. The IndexedDB path below is the fallback for
 * `npm run dev:web` and for the one-time migration off browser storage.
 */

import { desktop } from '../model/desktop';

const DB_NAME = 'projection-mapper-media';
const STORE = 'blobs';

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

export async function putMedia(id: string, file: Blob): Promise<void> {
  if (desktop) {
    await desktop.putMedia(id, file as File);
    return;
  }
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(file, id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getMedia(id: string): Promise<Blob | null> {
  if (desktop) {
    try {
      const res = await fetch(desktop.mediaUrl(id));
      return res.ok ? await res.blob() : null;
    } catch {
      return null;
    }
  }
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(id);
    req.onsuccess = () => resolve((req.result as Blob | undefined) ?? null);
    req.onerror = () => reject(req.error);
  });
}

export async function deleteMedia(id: string): Promise<void> {
  if (desktop) {
    await desktop.deleteMedia(id);
    return;
  }
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/* ---- Migration off browser storage ---- */

/** Reads straight from IndexedDB, bypassing the desktop branch above. */
export async function legacyBrowserMedia(): Promise<{ id: string; blob: Blob }[]> {
  if (!('indexedDB' in globalThis)) return [];
  let db: IDBDatabase;
  try {
    db = await openDb();
  } catch {
    return [];
  }
  const ids = await new Promise<string[]>((resolve) => {
    const req = db.transaction(STORE, 'readonly').objectStore(STORE).getAllKeys();
    req.onsuccess = () => resolve(req.result.map(String));
    req.onerror = () => resolve([]);
  });
  const out: { id: string; blob: Blob }[] = [];
  for (const id of ids) {
    const blob = await new Promise<Blob | null>((resolve) => {
      const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(id);
      req.onsuccess = () => resolve((req.result as Blob | undefined) ?? null);
      req.onerror = () => resolve(null);
    });
    if (blob) out.push({ id, blob });
  }
  return out;
}
