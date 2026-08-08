import type { Project, Source, Surface } from '../model/types';
import { defaultProject, parseProject } from '../model/defaults';
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

/* ---- Shareable snippets: single surfaces or sources ---- */

const SURFACE_KIND = 'projection-mapper/surface';
const SOURCE_KIND = 'projection-mapper/source';

export function exportSurfaceSnippet(project: Project, surfaceId: string): void {
  const surface = project.surfaces.find((x) => x.id === surfaceId);
  if (!surface) return;
  const source = surface.sourceId
    ? project.sources.find((x) => x.id === surface.sourceId)
    : undefined;
  downloadText(
    `${slug(surface.name)}.surface.json`,
    JSON.stringify({ kind: SURFACE_KIND, version: 1, surface, source }, null, 2),
  );
}

export function exportSourceSnippet(project: Project, sourceId: string): void {
  const source = project.sources.find((x) => x.id === sourceId);
  if (!source) return;
  downloadText(
    `${slug(source.name)}.source.json`,
    JSON.stringify({ kind: SOURCE_KIND, version: 1, source }, null, 2),
  );
}

/** Validates snippet contents by round-tripping them through the project
 * parser, so imports get the same normalization as a full project load. */
function validateSnippet(data: unknown): { surface?: Surface; source?: Source } {
  const d = data as { kind?: string; surface?: unknown; source?: unknown } | null;
  const base = defaultProject();
  if (d?.kind === SURFACE_KIND) {
    const proj = parseProject({
      ...base,
      surfaces: [d.surface],
      sources: d.source ? [d.source] : [],
    });
    return { surface: proj.surfaces[0], source: proj.sources[0] };
  }
  if (d?.kind === SOURCE_KIND) {
    const proj = parseProject({ ...base, surfaces: [], sources: [d.source] });
    return { source: proj.sources[0] };
  }
  throw new Error('not a projection-mapper snippet');
}

export function importSnippetFromFile(): void {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json,application/json';
  input.onchange = async () => {
    const file = input.files?.[0];
    if (!file) return;
    const store = useAppStore.getState();
    try {
      const parsed = validateSnippet(JSON.parse(await file.text()));
      store.importSnippet(parsed.surface ?? null, parsed.source ?? null);
      store.setNotice(
        parsed.surface ? 'Surface imported.' : 'Source imported.',
      );
    } catch (e) {
      store.setNotice(`Could not import: ${e instanceof Error ? e.message : String(e)}`);
    }
  };
  input.click();
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
