import { create } from 'zustand';
import type { OverlayMode, Project, Vec2 } from '../model/types';
import { defaultProject } from '../model/defaults';

export type Mode = 'show' | 'edit';

interface UndoEntry {
  project: Project;
  /** Coalescing key: repeated edits with the same key within a short window
   * collapse into one undo step (e.g. holding an arrow key). */
  key: string | null;
  time: number;
}

const UNDO_LIMIT = 100;
const COALESCE_MS = 1200;

/** Corners may sit outside the visible frame while aiming, within reason. */
const clampCorner = (p: Vec2): Vec2 => [
  Math.min(1.5, Math.max(-0.5, p[0])),
  Math.min(1.5, Math.max(-0.5, p[1])),
];
const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));

function withCorner(project: Project, surfaceId: string, index: number, pos: Vec2): Project {
  return {
    ...project,
    surfaces: project.surfaces.map((s) =>
      s.id === surfaceId
        ? {
            ...s,
            warp: {
              ...s.warp,
              corners: s.warp.corners.map((c, i) => (i === index ? pos : c)) as [
                Vec2, Vec2, Vec2, Vec2,
              ],
            },
          }
        : s,
    ),
  };
}

export interface AppState {
  project: Project;
  mode: Mode;
  blackout: boolean;
  overlay: OverlayMode;
  handlesVisible: boolean;
  dimChrome: boolean;
  helpOpen: boolean;
  /** Seconds remaining before auto-return to show, only when <= 5. */
  editCountdown: number | null;
  /** Raw localStorage text that failed to parse at boot; blocks autosave. */
  recoveryRaw: string | null;
  notice: string | null;
  selectedSurfaceId: string | null;
  selectedHandle: number | null;
  undoStack: UndoEntry[];
  redoStack: Project[];

  setMode(mode: Mode): void;
  toggleBlackout(): void;
  cycleOverlay(): void;
  toggleHandles(): void;
  toggleDimChrome(): void;
  setHelpOpen(open: boolean): void;
  setEditCountdown(v: number | null): void;
  setNotice(text: string | null): void;
  setRecovery(raw: string | null): void;
  selectHandle(surfaceId: string, handle: number | null): void;
  cycleSurface(dir: 1 | -1): void;

  beginGesture(): void;
  endGesture(): void;
  setCorner(surfaceId: string, index: number, pos: Vec2): void;
  nudgeCorner(surfaceId: string, index: number, dxPx: number, dyPx: number): void;
  setMasterBrightness(v: number): void;
  nudgeMasterBrightness(delta: number): void;
  setProjectName(name: string): void;

  undo(): void;
  redo(): void;
  loadProject(project: Project): void;
}

/** Snapshot held between beginGesture/endGesture; module-level on purpose —
 * it must never trigger a React render. */
let gestureSnapshot: Project | null = null;

const initialProject = defaultProject();

export const useAppStore = create<AppState>()((set, get) => {
  const pushUndo = (snapshot: Project, key: string | null): void => {
    set((s) => ({
      undoStack: [...s.undoStack, { project: snapshot, key, time: Date.now() }].slice(-UNDO_LIMIT),
      redoStack: [],
    }));
  };

  /** Push the current project as an undo point unless the previous point has
   * the same key and is recent — that coalesces held-key nudges. */
  const pushCoalesced = (key: string): void => {
    const s = get();
    const last = s.undoStack[s.undoStack.length - 1];
    if (last && last.key === key && Date.now() - last.time < COALESCE_MS) return;
    pushUndo(s.project, key);
  };

  return {
    project: initialProject,
    mode: 'show',
    blackout: false,
    overlay: 'off',
    handlesVisible: true,
    dimChrome: false,
    helpOpen: false,
    editCountdown: null,
    recoveryRaw: null,
    notice: null,
    selectedSurfaceId: initialProject.surfaces[0]?.id ?? null,
    selectedHandle: null,
    undoStack: [],
    redoStack: [],

    setMode: (mode) =>
      set((s) => (s.mode === mode ? s : { mode, helpOpen: false, editCountdown: null })),
    toggleBlackout: () => set((s) => ({ blackout: !s.blackout })),
    cycleOverlay: () =>
      set((s) => ({
        overlay: s.overlay === 'off' ? 'grid' : s.overlay === 'grid' ? 'checker' : 'off',
      })),
    toggleHandles: () => set((s) => ({ handlesVisible: !s.handlesVisible })),
    toggleDimChrome: () => set((s) => ({ dimChrome: !s.dimChrome })),
    setHelpOpen: (helpOpen) => set({ helpOpen }),
    setEditCountdown: (editCountdown) =>
      set((s) => (s.editCountdown === editCountdown ? s : { editCountdown })),
    setNotice: (notice) => set({ notice }),
    setRecovery: (recoveryRaw) => set({ recoveryRaw }),
    selectHandle: (surfaceId, handle) =>
      set({ selectedSurfaceId: surfaceId, selectedHandle: handle }),
    cycleSurface: (dir) =>
      set((s) => {
        const ids = s.project.surfaces.map((x) => x.id);
        if (ids.length === 0) return s;
        const at = ids.indexOf(s.selectedSurfaceId ?? '');
        const next = ids[(at + dir + ids.length) % ids.length];
        return { selectedSurfaceId: next, selectedHandle: null };
      }),

    beginGesture: () => {
      gestureSnapshot = get().project;
    },
    endGesture: () => {
      const snapshot = gestureSnapshot;
      gestureSnapshot = null;
      if (snapshot && snapshot !== get().project) pushUndo(snapshot, null);
    },
    setCorner: (surfaceId, index, pos) =>
      set((s) => ({ project: withCorner(s.project, surfaceId, index, clampCorner(pos)) })),
    nudgeCorner: (surfaceId, index, dxPx, dyPx) => {
      const s = get();
      const surface = s.project.surfaces.find((x) => x.id === surfaceId);
      if (!surface) return;
      pushCoalesced(`corner:${surfaceId}:${index}`);
      const [x, y] = surface.warp.corners[index];
      const pos = clampCorner([
        x + dxPx / s.project.meta.outputWidth,
        y + dyPx / s.project.meta.outputHeight,
      ]);
      set((st) => ({ project: withCorner(st.project, surfaceId, index, pos) }));
    },
    setMasterBrightness: (v) =>
      set((s) => ({
        project: { ...s.project, master: { ...s.project.master, brightness: clamp01(v) } },
      })),
    nudgeMasterBrightness: (delta) => {
      pushCoalesced('master.brightness');
      get().setMasterBrightness(get().project.master.brightness + delta);
    },
    setProjectName: (name) => {
      pushCoalesced('meta.name');
      set((s) => ({ project: { ...s.project, meta: { ...s.project.meta, name } } }));
    },

    undo: () => {
      const s = get();
      const entry = s.undoStack[s.undoStack.length - 1];
      if (!entry) return;
      set({
        project: entry.project,
        undoStack: s.undoStack.slice(0, -1),
        redoStack: [...s.redoStack, s.project].slice(-UNDO_LIMIT),
      });
    },
    redo: () => {
      const s = get();
      const project = s.redoStack[s.redoStack.length - 1];
      if (!project) return;
      set({
        project,
        redoStack: s.redoStack.slice(0, -1),
        undoStack: [
          ...s.undoStack,
          { project: s.project, key: null, time: Date.now() },
        ].slice(-UNDO_LIMIT),
      });
    },
    loadProject: (project) =>
      set({
        project,
        undoStack: [],
        redoStack: [],
        selectedSurfaceId: project.surfaces[0]?.id ?? null,
        selectedHandle: null,
        recoveryRaw: null,
      }),
  };
});
