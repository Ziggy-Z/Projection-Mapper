import type { Project } from '../model/types';
import { parseProject } from '../model/defaults';
import { useAppStore } from './store';

const STORAGE_KEY = 'projection-mapper.project.v1';
const AUTOSAVE_DEBOUNCE_MS = 1000;

declare global {
  interface Window {
    showSaveFilePicker?: (options?: {
      suggestedName?: string;
      types?: { description: string; accept: Record<string, string[]> }[];
    }) => Promise<{
      createWritable: () => Promise<{
        write: (data: string) => Promise<void>;
        close: () => Promise<void>;
      }>;
    }>;
  }
}

export type StoredResult =
  | { ok: true; project: Project }
  | { ok: false; raw: string }
  | null;

/** Reads the autosaved project. A parse failure returns the raw text so the
 * recovery screen can offer it back to the user instead of destroying it. */
export function readStored(): StoredResult {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
  if (raw == null) return null;
  try {
    return { ok: true, project: parseProject(JSON.parse(raw)) };
  } catch {
    return { ok: false, raw };
  }
}

/** Autosaves the project to localStorage on every change, debounced. Held off
 * while the recovery screen is up so damaged data is never clobbered. */
export function initAutosave(): void {
  let timer: number | undefined;
  useAppStore.subscribe((state, prev) => {
    if (state.project === prev.project) return;
    if (state.recoveryRaw != null) return;
    window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(useAppStore.getState().project));
      } catch (e) {
        console.warn('autosave failed', e);
      }
    }, AUTOSAVE_DEBOUNCE_MS);
  });
}

function slug(name: string): string {
  const s = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return s || 'project';
}

export function downloadText(filename: string, text: string): void {
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export async function saveProjectToFile(project: Project): Promise<void> {
  const json = JSON.stringify(project, null, 2);
  const filename = `${slug(project.meta.name)}.projection.json`;
  if (window.showSaveFilePicker) {
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: filename,
        types: [
          {
            description: 'Projection Mapper project',
            accept: { 'application/json': ['.json'] },
          },
        ],
      });
      const writable = await handle.createWritable();
      await writable.write(json);
      await writable.close();
      return;
    } catch (e) {
      if ((e as DOMException).name === 'AbortError') return; // user cancelled
      // fall through to plain download
    }
  }
  downloadText(filename, json);
}

export function openProjectFromFile(): void {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json,application/json';
  input.onchange = async () => {
    const file = input.files?.[0];
    if (!file) return;
    const store = useAppStore.getState();
    try {
      store.loadProject(parseProject(JSON.parse(await file.text())));
    } catch (e) {
      store.setNotice(`Could not load: ${e instanceof Error ? e.message : String(e)}`);
    }
  };
  input.click();
}
