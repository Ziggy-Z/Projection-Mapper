import { create } from 'zustand';
import type {
  BlendMode,
  Master,
  OverlayMode,
  Project,
  SceneSurfaceState,
  ScheduleEvent,
  Source,
  SourceParamValue,
  Surface,
  Vec2,
  WarpType,
} from '../model/types';
import { createSurface, defaultProject, newId } from '../model/defaults';
import { meshFromCorners } from '../gl/mesh';

export type Mode = 'show' | 'edit';

export interface MaskEditState {
  surfaceId: string;
  polygonIndex: number;
  selectedPoint: number | null;
}

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
  maskEdit: MaskEditState | null;
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
  selectSurface(id: string | null): void;
  selectHandle(surfaceId: string, handle: number | null): void;
  cycleSurface(dir: 1 | -1): void;
  selectSurfaceByIndex(index: number): void;

  beginGesture(): void;
  endGesture(): void;
  setCorner(surfaceId: string, index: number, pos: Vec2): void;
  nudgeCorner(surfaceId: string, index: number, dxPx: number, dyPx: number): void;
  setMasterBrightness(v: number): void;
  nudgeMasterBrightness(delta: number): void;
  setMaster(patch: Partial<Master>, undoKey: string): void;
  setProjectName(name: string): void;

  addSurface(): void;
  duplicateSurface(id: string): void;
  deleteSurface(id: string): void;
  moveSurface(id: string, dir: 1 | -1): void;
  renameSurface(id: string, name: string): void;
  setSurfaceEnabled(id: string, enabled: boolean): void;
  toggleSolo(id: string): void;
  setSurfaceOpacity(id: string, opacity: number): void;
  setSurfaceBlend(id: string, blend: BlendMode): void;
  assignSource(surfaceId: string, sourceId: string | null): void;
  setSourceParam(surfaceId: string, key: string, value: SourceParamValue): void;

  addSource(source: Source, opts?: { assignToSelected?: boolean }): void;
  deleteSource(id: string): void;
  renameSource(id: string, name: string): void;
  updateSourceGlsl(id: string, glsl: string, mergedDefaults: Record<string, SourceParamValue>): void;

  setMaskEnabled(surfaceId: string, enabled: boolean): void;
  setMaskFeather(surfaceId: string, feather: number): void;
  setMaskInvert(surfaceId: string, polygonIndex: number, invert: boolean): void;
  addMaskPolygon(surfaceId: string): void;
  deleteMaskPolygon(surfaceId: string, polygonIndex: number): void;
  enterMaskEdit(surfaceId: string, polygonIndex: number): void;
  exitMaskEdit(): void;
  selectMaskPoint(index: number | null): void;
  addMaskPoint(uv: Vec2): void;
  moveMaskPoint(index: number, uv: Vec2): void;
  insertMaskPoint(afterIndex: number, uv: Vec2): void;
  deleteMaskPoint(index: number): void;

  /** Direct project patch with no undo entry — for transitions/scheduler. */
  applyProjectPatch(fn: (p: Project) => Project): void;

  setWarpType(surfaceId: string, type: WarpType): void;
  setMeshGrid(surfaceId: string, cols: number, rows: number): void;
  setMeshPoint(surfaceId: string, index: number, pos: Vec2): void;
  /** Nudges a corner or mesh point depending on the surface's warp type. */
  nudgeHandle(surfaceId: string, index: number, dxPx: number, dyPx: number): void;

  captureScene(name: string): void;
  updateScene(id: string): void;
  deleteScene(id: string): void;
  renameScene(id: string, name: string): void;

  setScheduleEnabled(enabled: boolean): void;
  setScheduleLocation(lat: number, lon: number): void;
  addScheduleEvent(): void;
  updateScheduleEvent(index: number, patch: Partial<ScheduleEvent>): void;
  deleteScheduleEvent(index: number): void;

  shaderEditorId: string | null;
  setShaderEditor(id: string | null): void;

  /** Inserts an imported snippet with fresh ids, relinking surface→source. */
  importSnippet(surface: Surface | null, source: Source | null): void;

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
    // During a gesture the begin/end pair owns the undo entry.
    if (gestureSnapshot != null) return;
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

  const patchProject = (fn: (p: Project) => Project): void => {
    set((s) => ({ project: fn(s.project) }));
  };

  const patchSurface = (id: string, fn: (srf: Surface) => Surface): void => {
    patchProject((p) => ({
      ...p,
      surfaces: p.surfaces.map((x) => (x.id === id ? fn(x) : x)),
    }));
  };

  /** Undoable one-shot surface edit. */
  const editSurface = (id: string, fn: (srf: Surface) => Surface, undoKey?: string): void => {
    if (undoKey) pushCoalesced(undoKey);
    else pushUndo(get().project, null);
    patchSurface(id, fn);
  };

  const patchMaskPoints = (fn: (points: Vec2[]) => Vec2[]): void => {
    const me = get().maskEdit;
    if (!me) return;
    patchSurface(me.surfaceId, (srf) => ({
      ...srf,
      mask: {
        ...srf.mask,
        polygons: srf.mask.polygons.map((poly, i) =>
          i === me.polygonIndex ? { ...poly, points: fn(poly.points) } : poly,
        ),
      },
    }));
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
    maskEdit: null,
    undoStack: [],
    redoStack: [],

    setMode: (mode) =>
      set((s) =>
        s.mode === mode ? s : { mode, helpOpen: false, editCountdown: null, maskEdit: null },
      ),
    toggleBlackout: () => set((s) => ({ blackout: !s.blackout })),
    cycleOverlay: () =>
      set((s) => {
        const order: OverlayMode[] = ['off', 'grid', 'checker', 'fill', 'outline'];
        return { overlay: order[(order.indexOf(s.overlay) + 1) % order.length] };
      }),
    toggleHandles: () => set((s) => ({ handlesVisible: !s.handlesVisible })),
    toggleDimChrome: () => set((s) => ({ dimChrome: !s.dimChrome })),
    setHelpOpen: (helpOpen) => set({ helpOpen }),
    setEditCountdown: (editCountdown) =>
      set((s) => (s.editCountdown === editCountdown ? s : { editCountdown })),
    setNotice: (notice) => set({ notice }),
    setRecovery: (recoveryRaw) => set({ recoveryRaw }),
    selectSurface: (id) =>
      set({ selectedSurfaceId: id, selectedHandle: null, maskEdit: null }),
    selectHandle: (surfaceId, handle) =>
      set({ selectedSurfaceId: surfaceId, selectedHandle: handle }),
    cycleSurface: (dir) =>
      set((s) => {
        const ids = s.project.surfaces.map((x) => x.id);
        if (ids.length === 0) return s;
        const at = ids.indexOf(s.selectedSurfaceId ?? '');
        const next = ids[(at + dir + ids.length) % ids.length];
        return { selectedSurfaceId: next, selectedHandle: null, maskEdit: null };
      }),
    selectSurfaceByIndex: (index) =>
      set((s) => {
        const srf = s.project.surfaces[index];
        return srf
          ? { selectedSurfaceId: srf.id, selectedHandle: null, maskEdit: null }
          : s;
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
      patchSurface(surfaceId, (srf) => ({
        ...srf,
        warp: {
          ...srf.warp,
          corners: srf.warp.corners.map((c, i) =>
            i === index ? clampCorner(pos) : c,
          ) as [Vec2, Vec2, Vec2, Vec2],
        },
      })),
    nudgeCorner: (surfaceId, index, dxPx, dyPx) => {
      const s = get();
      const surface = s.project.surfaces.find((x) => x.id === surfaceId);
      if (!surface) return;
      pushCoalesced(`corner:${surfaceId}:${index}`);
      const [x, y] = surface.warp.corners[index];
      get().setCorner(surfaceId, index, [
        x + dxPx / s.project.meta.outputWidth,
        y + dyPx / s.project.meta.outputHeight,
      ]);
    },
    setMasterBrightness: (v) =>
      patchProject((p) => ({ ...p, master: { ...p.master, brightness: clamp01(v) } })),
    nudgeMasterBrightness: (delta) => {
      pushCoalesced('master.brightness');
      get().setMasterBrightness(get().project.master.brightness + delta);
    },
    setMaster: (patch, undoKey) => {
      pushCoalesced(undoKey);
      patchProject((p) => ({ ...p, master: { ...p.master, ...patch } }));
    },
    setProjectName: (name) => {
      pushCoalesced('meta.name');
      patchProject((p) => ({ ...p, meta: { ...p.meta, name } }));
    },

    addSurface: () => {
      pushUndo(get().project, null);
      const p = get().project;
      const srf = createSurface(`Surface ${p.surfaces.length + 1}`, p.sources[0]?.id ?? null);
      patchProject((pr) => ({ ...pr, surfaces: [...pr.surfaces, srf] }));
      set({ selectedSurfaceId: srf.id, selectedHandle: null, maskEdit: null });
    },
    duplicateSurface: (id) => {
      const src = get().project.surfaces.find((x) => x.id === id);
      if (!src) return;
      pushUndo(get().project, null);
      const copy: Surface = structuredClone(src);
      copy.id = newId('srf');
      copy.name = `${src.name} copy`;
      copy.warp.corners = copy.warp.corners.map(
        (c) => clampCorner([c[0] + 0.03, c[1] + 0.03]),
      ) as [Vec2, Vec2, Vec2, Vec2];
      patchProject((pr) => ({ ...pr, surfaces: [...pr.surfaces, copy] }));
      set({ selectedSurfaceId: copy.id, selectedHandle: null, maskEdit: null });
    },
    deleteSurface: (id) => {
      pushUndo(get().project, null);
      patchProject((pr) => ({ ...pr, surfaces: pr.surfaces.filter((x) => x.id !== id) }));
      set((s) => ({
        selectedSurfaceId:
          s.selectedSurfaceId === id
            ? get().project.surfaces[0]?.id ?? null
            : s.selectedSurfaceId,
        selectedHandle: null,
        maskEdit: null,
      }));
    },
    moveSurface: (id, dir) => {
      const p = get().project;
      const at = p.surfaces.findIndex((x) => x.id === id);
      const to = at + dir;
      if (at < 0 || to < 0 || to >= p.surfaces.length) return;
      pushCoalesced(`move:${id}`);
      patchProject((pr) => {
        const arr = [...pr.surfaces];
        [arr[at], arr[to]] = [arr[to], arr[at]];
        return { ...pr, surfaces: arr };
      });
    },
    renameSurface: (id, name) =>
      editSurface(id, (srf) => ({ ...srf, name }), `rename:${id}`),
    setSurfaceEnabled: (id, enabled) =>
      editSurface(id, (srf) => ({ ...srf, enabled }), `enabled:${id}`),
    toggleSolo: (id) =>
      editSurface(id, (srf) => ({ ...srf, solo: !srf.solo }), `solo:${id}`),
    setSurfaceOpacity: (id, opacity) =>
      patchSurface(id, (srf) => ({ ...srf, opacity: clamp01(opacity) })),
    setSurfaceBlend: (id, blendMode) =>
      editSurface(id, (srf) => ({ ...srf, blendMode }), `blend:${id}`),
    assignSource: (surfaceId, sourceId) =>
      editSurface(surfaceId, (srf) => ({ ...srf, sourceId, sourceParams: {} })),
    setSourceParam: (surfaceId, key, value) =>
      editSurface(
        surfaceId,
        (srf) => ({ ...srf, sourceParams: { ...srf.sourceParams, [key]: value } }),
        `param:${surfaceId}:${key}`,
      ),

    addSource: (source, opts) => {
      pushUndo(get().project, null);
      patchProject((pr) => ({ ...pr, sources: [...pr.sources, source] }));
      const sel = get().selectedSurfaceId;
      if (opts?.assignToSelected && sel) {
        patchSurface(sel, (srf) => ({ ...srf, sourceId: source.id, sourceParams: {} }));
      }
    },
    deleteSource: (id) => {
      pushUndo(get().project, null);
      patchProject((pr) => ({
        ...pr,
        sources: pr.sources.filter((x) => x.id !== id),
        surfaces: pr.surfaces.map((srf) =>
          srf.sourceId === id ? { ...srf, sourceId: null } : srf,
        ),
      }));
    },
    renameSource: (id, name) => {
      pushCoalesced(`srcname:${id}`);
      patchProject((pr) => ({
        ...pr,
        sources: pr.sources.map((x) => (x.id === id ? { ...x, name } : x)),
      }));
    },
    updateSourceGlsl: (id, glsl, mergedDefaults) => {
      pushCoalesced(`glsl:${id}`);
      patchProject((pr) => ({
        ...pr,
        sources: pr.sources.map((x) =>
          x.id === id ? { ...x, glsl, uniforms: mergedDefaults } : x,
        ),
      }));
    },

    setMaskEnabled: (surfaceId, enabled) =>
      editSurface(surfaceId, (srf) => ({ ...srf, mask: { ...srf.mask, enabled } }), `maskon:${surfaceId}`),
    setMaskFeather: (surfaceId, feather) =>
      patchSurface(surfaceId, (srf) => ({
        ...srf,
        mask: { ...srf.mask, feather: Math.min(0.2, Math.max(0, feather)) },
      })),
    setMaskInvert: (surfaceId, polygonIndex, invert) =>
      editSurface(surfaceId, (srf) => ({
        ...srf,
        mask: {
          ...srf.mask,
          polygons: srf.mask.polygons.map((poly, i) =>
            i === polygonIndex ? { ...poly, invert } : poly,
          ),
        },
      })),
    addMaskPolygon: (surfaceId) => {
      pushUndo(get().project, null);
      let index = 0;
      patchSurface(surfaceId, (srf) => {
        index = srf.mask.polygons.length;
        return {
          ...srf,
          mask: {
            ...srf.mask,
            enabled: true,
            polygons: [...srf.mask.polygons, { points: [], invert: false }],
          },
        };
      });
      set({ maskEdit: { surfaceId, polygonIndex: index, selectedPoint: null } });
    },
    deleteMaskPolygon: (surfaceId, polygonIndex) =>
      editSurface(surfaceId, (srf) => ({
        ...srf,
        mask: {
          ...srf.mask,
          polygons: srf.mask.polygons.filter((_, i) => i !== polygonIndex),
        },
      })),
    enterMaskEdit: (surfaceId, polygonIndex) =>
      set({ maskEdit: { surfaceId, polygonIndex, selectedPoint: null }, selectedHandle: null }),
    exitMaskEdit: () =>
      set((s) => {
        // Drop degenerate polygons (fewer than 3 points) on the way out.
        const me = s.maskEdit;
        if (!me) return { maskEdit: null };
        const srf = s.project.surfaces.find((x) => x.id === me.surfaceId);
        const poly = srf?.mask.polygons[me.polygonIndex];
        if (srf && poly && poly.points.length < 3) {
          return {
            maskEdit: null,
            project: {
              ...s.project,
              surfaces: s.project.surfaces.map((x) =>
                x.id === srf.id
                  ? {
                      ...x,
                      mask: {
                        ...x.mask,
                        polygons: x.mask.polygons.filter((_, i) => i !== me.polygonIndex),
                      },
                    }
                  : x,
              ),
            },
          };
        }
        return { maskEdit: null };
      }),
    selectMaskPoint: (index) =>
      set((s) => (s.maskEdit ? { maskEdit: { ...s.maskEdit, selectedPoint: index } } : s)),
    addMaskPoint: (uv) => {
      const me = get().maskEdit;
      if (!me) return;
      pushCoalesced(`maskpts:${me.surfaceId}:${me.polygonIndex}`);
      patchMaskPoints((pts) => [...pts, uv]);
      set((s) => (s.maskEdit ? { maskEdit: { ...s.maskEdit, selectedPoint: null } } : s));
    },
    moveMaskPoint: (index, uv) =>
      patchMaskPoints((pts) => pts.map((p, i) => (i === index ? uv : p))),
    insertMaskPoint: (afterIndex, uv) => {
      const me = get().maskEdit;
      if (!me) return;
      pushCoalesced(`maskpts:${me.surfaceId}:${me.polygonIndex}`);
      patchMaskPoints((pts) => [
        ...pts.slice(0, afterIndex + 1),
        uv,
        ...pts.slice(afterIndex + 1),
      ]);
    },
    deleteMaskPoint: (index) => {
      const me = get().maskEdit;
      if (!me) return;
      pushCoalesced(`maskpts:${me.surfaceId}:${me.polygonIndex}`);
      patchMaskPoints((pts) => pts.filter((_, i) => i !== index));
      set((s) => (s.maskEdit ? { maskEdit: { ...s.maskEdit, selectedPoint: null } } : s));
    },

    applyProjectPatch: (fn) => patchProject(fn),

    setWarpType: (surfaceId, type) => {
      const srf = get().project.surfaces.find((x) => x.id === surfaceId);
      if (!srf || srf.warp.type === type) return;
      if (type === 'mesh') {
        const mesh =
          srf.warp.mesh && srf.warp.mesh.points.length === (srf.warp.mesh.cols + 1) * (srf.warp.mesh.rows + 1)
            ? srf.warp.mesh
            : meshFromCorners(srf.warp.corners, 4, 4);
        if (!mesh) return;
        editSurface(surfaceId, (x) => ({ ...x, warp: { ...x.warp, type, mesh } }));
      } else {
        editSurface(surfaceId, (x) => ({ ...x, warp: { ...x.warp, type } }));
      }
      set({ selectedHandle: null });
    },
    setMeshGrid: (surfaceId, cols, rows) => {
      const srf = get().project.surfaces.find((x) => x.id === surfaceId);
      if (!srf) return;
      const mesh = meshFromCorners(srf.warp.corners, cols, rows);
      if (!mesh) return;
      editSurface(surfaceId, (x) => ({ ...x, warp: { ...x.warp, mesh } }));
      set({ selectedHandle: null });
    },
    setMeshPoint: (surfaceId, index, pos) =>
      patchSurface(surfaceId, (srf) => {
        if (!srf.warp.mesh) return srf;
        return {
          ...srf,
          warp: {
            ...srf.warp,
            mesh: {
              ...srf.warp.mesh,
              points: srf.warp.mesh.points.map((p, i) =>
                i === index ? clampCorner(pos) : p,
              ),
            },
          },
        };
      }),
    nudgeHandle: (surfaceId, index, dxPx, dyPx) => {
      const s = get();
      const srf = s.project.surfaces.find((x) => x.id === surfaceId);
      if (!srf) return;
      const dx = dxPx / s.project.meta.outputWidth;
      const dy = dyPx / s.project.meta.outputHeight;
      if (srf.warp.type === 'mesh' && srf.warp.mesh) {
        const p = srf.warp.mesh.points[index];
        if (!p) return;
        pushCoalesced(`handle:${surfaceId}:${index}`);
        get().setMeshPoint(surfaceId, index, [p[0] + dx, p[1] + dy]);
      } else {
        const c = srf.warp.corners[index];
        if (!c) return;
        pushCoalesced(`handle:${surfaceId}:${index}`);
        get().setCorner(surfaceId, index, [c[0] + dx, c[1] + dy]);
      }
    },

    captureScene: (name) => {
      pushUndo(get().project, null);
      const p = get().project;
      const surfaceStates: Record<string, SceneSurfaceState> = {};
      for (const srf of p.surfaces) {
        surfaceStates[srf.id] = {
          sourceId: srf.sourceId,
          opacity: srf.opacity,
          enabled: srf.enabled,
          sourceParams: { ...srf.sourceParams },
        };
      }
      patchProject((pr) => ({
        ...pr,
        scenes: [
          ...pr.scenes,
          { id: newId('scn'), name, surfaceStates, master: { ...p.master } },
        ],
      }));
    },
    updateScene: (id) => {
      pushUndo(get().project, null);
      const p = get().project;
      const surfaceStates: Record<string, SceneSurfaceState> = {};
      for (const srf of p.surfaces) {
        surfaceStates[srf.id] = {
          sourceId: srf.sourceId,
          opacity: srf.opacity,
          enabled: srf.enabled,
          sourceParams: { ...srf.sourceParams },
        };
      }
      patchProject((pr) => ({
        ...pr,
        scenes: pr.scenes.map((sc) =>
          sc.id === id ? { ...sc, surfaceStates, master: { ...p.master } } : sc,
        ),
      }));
    },
    deleteScene: (id) => {
      pushUndo(get().project, null);
      patchProject((pr) => ({ ...pr, scenes: pr.scenes.filter((x) => x.id !== id) }));
    },
    renameScene: (id, name) => {
      pushCoalesced(`scnname:${id}`);
      patchProject((pr) => ({
        ...pr,
        scenes: pr.scenes.map((x) => (x.id === id ? { ...x, name } : x)),
      }));
    },

    setScheduleEnabled: (enabled) => {
      pushCoalesced('schedule.enabled');
      patchProject((pr) => ({ ...pr, schedule: { ...pr.schedule, enabled } }));
    },
    setScheduleLocation: (lat, lon) => {
      pushCoalesced('schedule.location');
      patchProject((pr) => ({ ...pr, schedule: { ...pr.schedule, location: { lat, lon } } }));
    },
    addScheduleEvent: () => {
      pushUndo(get().project, null);
      const firstScene = get().project.scenes[0];
      patchProject((pr) => ({
        ...pr,
        schedule: {
          ...pr.schedule,
          events: [
            ...pr.schedule.events,
            {
              at: 'sunset-00:30',
              action: firstScene ? 'fadeToScene' : 'fadeToBlack',
              sceneId: firstScene?.id,
              durationSec: 60,
            },
          ],
        },
      }));
    },
    updateScheduleEvent: (index, patch) => {
      pushCoalesced(`schedevent:${index}`);
      patchProject((pr) => ({
        ...pr,
        schedule: {
          ...pr.schedule,
          events: pr.schedule.events.map((ev, i) => (i === index ? { ...ev, ...patch } : ev)),
        },
      }));
    },
    deleteScheduleEvent: (index) => {
      pushUndo(get().project, null);
      patchProject((pr) => ({
        ...pr,
        schedule: {
          ...pr.schedule,
          events: pr.schedule.events.filter((_, i) => i !== index),
        },
      }));
    },

    shaderEditorId: null,
    setShaderEditor: (shaderEditorId) => set({ shaderEditorId }),

    importSnippet: (surface, source) => {
      if (!surface && !source) return;
      pushUndo(get().project, null);
      const newSourceId = source ? newId('src') : null;
      const newSurfaceId = surface ? newId('srf') : null;
      patchProject((pr) => {
        let sources = pr.sources;
        let surfaces = pr.surfaces;
        if (source && newSourceId) {
          sources = [...sources, { ...structuredClone(source), id: newSourceId }];
        }
        if (surface && newSurfaceId) {
          const copy = structuredClone(surface);
          copy.id = newSurfaceId;
          if (newSourceId) copy.sourceId = newSourceId;
          else if (copy.sourceId && !sources.some((x) => x.id === copy.sourceId)) {
            copy.sourceId = null;
          }
          surfaces = [...surfaces, copy];
        }
        return { ...pr, sources, surfaces };
      });
      if (newSurfaceId) {
        set({ selectedSurfaceId: newSurfaceId, selectedHandle: null, maskEdit: null });
      }
    },

    undo: () => {
      const s = get();
      const entry = s.undoStack[s.undoStack.length - 1];
      if (!entry) return;
      set({
        project: entry.project,
        undoStack: s.undoStack.slice(0, -1),
        redoStack: [...s.redoStack, s.project].slice(-UNDO_LIMIT),
        maskEdit: null,
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
        maskEdit: null,
      });
    },
    loadProject: (project) =>
      set({
        project,
        undoStack: [],
        redoStack: [],
        selectedSurfaceId: project.surfaces[0]?.id ?? null,
        selectedHandle: null,
        maskEdit: null,
        recoveryRaw: null,
      }),
  };
});
