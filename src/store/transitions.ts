import type { Project, Scene, SourceParamValue, Surface } from '../model/types';
import { useAppStore } from './store';

/**
 * Timed scene crossfades. A ticker interpolates the *sparse* scene diff into
 * the project document; the render loop just keeps reading the project.
 * React-side code (this runs on intervals, never inside the rAF loop).
 *
 * When a surface's source changes, its opacity dips to zero in the first
 * half of the fade, the source swaps, and it fades back up — a per-surface
 * crossfade without needing to render two sources at once.
 */

interface SurfacePlan {
  surfaceId: string;
  fromOpacity: number;
  toOpacity: number;
  fromParams: Record<string, number>;
  toParams: Record<string, number>;
  discrete: {
    sourceId?: string | null;
    enabled?: boolean;
    params: Record<string, SourceParamValue>;
  } | null;
  swap: boolean;
}

interface TransitionPlan {
  surfaces: SurfacePlan[];
  fromMaster: Project['master'];
  toMaster: Project['master'];
  start: number;
  durationMs: number;
  swapped: boolean;
}

let timer: number | undefined;
let active: TransitionPlan | null = null;

const smooth = (t: number): number => t * t * (3 - 2 * t);
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

function numericParams(
  params: Record<string, SourceParamValue> | undefined,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(params ?? {})) {
    if (typeof v === 'number') out[k] = v;
  }
  return out;
}

function cancelTransition(): void {
  if (timer !== undefined) window.clearInterval(timer);
  timer = undefined;
  if (active) useAppStore.getState().endGesture();
  active = null;
}

function buildPlan(scene: Scene, project: Project, durationMs: number): TransitionPlan {
  const surfaces: SurfacePlan[] = [];
  for (const srf of project.surfaces) {
    const state = scene.surfaceStates[srf.id];
    if (!state) continue;
    const toSource = state.sourceId !== undefined ? state.sourceId : srf.sourceId;
    const swap = toSource !== srf.sourceId;
    const discreteParams: Record<string, SourceParamValue> = {};
    for (const [k, v] of Object.entries(state.sourceParams ?? {})) {
      if (typeof v !== 'number') discreteParams[k] = v;
    }
    surfaces.push({
      surfaceId: srf.id,
      fromOpacity: srf.opacity,
      toOpacity: state.opacity ?? srf.opacity,
      fromParams: numericParams(srf.sourceParams),
      toParams: numericParams(state.sourceParams),
      discrete: {
        sourceId: state.sourceId,
        enabled: state.enabled,
        params: discreteParams,
      },
      swap,
    });
  }
  return {
    surfaces,
    fromMaster: { ...project.master },
    toMaster: { ...project.master, ...scene.master },
    start: performance.now(),
    durationMs: Math.max(durationMs, 50),
    swapped: false,
  };
}

function applyPlan(plan: TransitionPlan, t: number): void {
  const store = useAppStore.getState();
  const eased = smooth(Math.min(1, t));
  const atOrPastMid = t >= 0.5;

  store.applyProjectPatch((p) => {
    let surfaces = p.surfaces;
    for (const sp of plan.surfaces) {
      surfaces = surfaces.map((srf): Surface => {
        if (srf.id !== sp.surfaceId) return srf;
        let next = srf;

        // Discrete switches (source, enabled, non-numeric params) land at
        // the midpoint, under the opacity dip when the source swaps.
        if (atOrPastMid && !plan.swapped && sp.discrete) {
          const params = { ...next.sourceParams, ...sp.discrete.params };
          next = {
            ...next,
            sourceId:
              sp.discrete.sourceId !== undefined ? sp.discrete.sourceId : next.sourceId,
            enabled: sp.discrete.enabled ?? next.enabled,
            sourceParams: params,
          };
        }

        let opacity: number;
        if (sp.swap) {
          opacity =
            t < 0.5
              ? lerp(sp.fromOpacity, 0, smooth(t * 2))
              : lerp(0, sp.toOpacity, smooth((t - 0.5) * 2));
        } else {
          opacity = lerp(sp.fromOpacity, sp.toOpacity, eased);
        }

        const sourceParams = { ...next.sourceParams };
        for (const [k, to] of Object.entries(sp.toParams)) {
          const from = sp.fromParams[k] ?? to;
          sourceParams[k] = lerp(from, to, eased);
        }
        return { ...next, opacity, sourceParams };
      });
    }
    return {
      ...p,
      surfaces,
      master: {
        brightness: lerp(plan.fromMaster.brightness, plan.toMaster.brightness, eased),
        gamma: lerp(plan.fromMaster.gamma, plan.toMaster.gamma, eased),
        blackLift: lerp(plan.fromMaster.blackLift, plan.toMaster.blackLift, eased),
        temperature: lerp(plan.fromMaster.temperature, plan.toMaster.temperature, eased),
      },
    };
  });
  if (atOrPastMid) plan.swapped = true;
}

export function startSceneTransition(sceneId: string, durationSec: number): void {
  const store = useAppStore.getState();
  const scene = store.project.scenes.find((x) => x.id === sceneId);
  if (!scene) return;
  cancelTransition();
  // One undo entry covers the whole crossfade.
  store.beginGesture();
  active = buildPlan(scene, store.project, durationSec * 1000);
  timer = window.setInterval(() => {
    if (!active) return;
    const t = (performance.now() - active.start) / active.durationMs;
    applyPlan(active, t);
    if (t >= 1) cancelTransition();
  }, 50);
  applyPlan(active, 0);
}

export function startFadeToBlack(durationSec: number): void {
  const store = useAppStore.getState();
  cancelTransition();
  store.beginGesture();
  const from = store.project.master.brightness;
  const start = performance.now();
  const durationMs = Math.max(durationSec * 1000, 50);
  active = {
    surfaces: [],
    fromMaster: store.project.master,
    toMaster: { ...store.project.master, brightness: 0 },
    start,
    durationMs,
    swapped: true,
  };
  timer = window.setInterval(() => {
    const t = Math.min(1, (performance.now() - start) / durationMs);
    useAppStore.getState().applyProjectPatch((p) => ({
      ...p,
      master: { ...p.master, brightness: lerp(from, 0, smooth(t)) },
    }));
    if (t >= 1) cancelTransition();
  }, 50);
}
