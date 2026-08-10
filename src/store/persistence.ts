import type { Project, Source, Surface } from '../model/types';
import { defaultProject, parseProject } from '../model/defaults';
import { desktop } from '../model/desktop';
import { legacyBrowserMedia, putMedia } from './media';
import { useAppStore } from './store';

/**
 * On the desktop the project is a real file under userData and every dialog
 * is a native one. The localStorage branches are the `dev:web` fallback —
 * and the source for the one-time migration in `migrateBrowserStorage`.
 */

const STORAGE_KEY = 'projection-mapper.project.v1';
const AUTOSAVE_DEBOUNCE_MS = 1000;

export type StoredResult =
  | { ok: true; project: Project }
  | { ok: false; raw: string }
  | null;

function parseStored(raw: string): StoredResult {
  try {
    return { ok: true, project: parseProject(JSON.parse(raw)) };
  } catch {
    return { ok: false, raw };
  }
}

/** Reads the autosaved project. A parse failure returns the raw text so the
 * recovery screen can offer it back to the user instead of destroying it. */
export async function readStored(): Promise<StoredResult> {
  if (desktop) {
    const stored = await desktop.readProject();
    if (stored == null) return null;
    return stored.ok ? parseStored(stored.text) : { ok: false, raw: stored.raw };
  }
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
  return raw == null ? null : parseStored(raw);
}

/** Autosaves the project on every change, debounced. Held off while the
 * recovery screen is up so damaged data is never clobbered. */
export function initAutosave(): void {
  let timer: number | undefined;
  useAppStore.subscribe((state, prev) => {
    if (state.project === prev.project) return;
    if (state.recoveryRaw != null) return;
    window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      const json = JSON.stringify(useAppStore.getState().project);
      if (desktop) {
        void desktop.writeProject(json).catch((e) => console.warn('autosave failed', e));
        return;
      }
      try {
        localStorage.setItem(STORAGE_KEY, json);
      } catch (e) {
        console.warn('autosave failed', e);
      }
    }, AUTOSAVE_DEBOUNCE_MS);
  });
}

/**
 * Moves anything the browser build left behind into the desktop's own files,
 * once, on first desktop run. Without this the app looks like it lost the
 * user's work the moment it stopped being a web page.
 */
export async function migrateBrowserStorage(): Promise<boolean> {
  if (!desktop) return false;
  if ((await desktop.readProject()) != null) return false;

  let raw: string | null = null;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch {
    return false;
  }
  if (raw == null) return false;

  await desktop.writeProject(raw);
  for (const { id, blob } of await legacyBrowserMedia()) {
    await putMedia(id, blob).catch(() => undefined);
  }
  return true;
}

function slug(name: string): string {
  const s = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return s || 'project';
}

export function downloadText(filename: string, text: string): void {
  if (desktop) {
    void desktop.saveTextAs(filename, text);
    return;
  }
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
  if (desktop) {
    const saved = await desktop.saveProjectAs(filename, json);
    if (saved) useAppStore.getState().setNotice(`Saved to ${saved}`);
    return;
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

/** Reads JSON from disk through whichever picker this build has. */
function pickJsonText(): Promise<string | null> {
  if (desktop) return desktop.openTextFile();
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) resolve(null);
      else void file.text().then(resolve);
    };
    input.click();
  });
}

export function importSnippetFromFile(): void {
  void (async () => {
    const text = await pickJsonText();
    if (text == null) return;
    const store = useAppStore.getState();
    try {
      const parsed = validateSnippet(JSON.parse(text));
      store.importSnippet(parsed.surface ?? null, parsed.source ?? null);
      store.setNotice(parsed.surface ? 'Surface imported.' : 'Source imported.');
    } catch (e) {
      store.setNotice(`Could not import: ${e instanceof Error ? e.message : String(e)}`);
    }
  })();
}

export function openProjectFromFile(): void {
  void (async () => {
    const text = desktop ? await desktop.openProjectFile() : await pickJsonText();
    if (text == null) return;
    const store = useAppStore.getState();
    try {
      store.loadProject(parseProject(JSON.parse(text)));
    } catch (e) {
      store.setNotice(`Could not load: ${e instanceof Error ? e.message : String(e)}`);
    }
  })();
}
