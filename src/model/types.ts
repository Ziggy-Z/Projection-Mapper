/**
 * The whole application is a UI over this one JSON document.
 * Warp geometry lives in normalized output space (0..1 across the projector
 * frame, y down). Masks live in surface-local UV space (0..1, v down).
 */

export type Vec2 = [number, number];

export type BlendMode = 'normal' | 'add' | 'screen' | 'multiply';
export type WarpType = 'cornerPin' | 'mesh';
export type SourceType = 'shader' | 'image' | 'video' | 'solid' | 'gradient';
export type OverlayMode = 'off' | 'grid' | 'checker';

export interface MeshWarp {
  cols: number;
  rows: number;
  /** (cols+1)*(rows+1) points, row-major, normalized output space. */
  points: Vec2[];
}

export interface Warp {
  type: WarpType;
  /** Normalized output space, clockwise from top-left: TL, TR, BR, BL. */
  corners: [Vec2, Vec2, Vec2, Vec2];
  mesh?: MeshWarp;
}

export interface MaskPolygon {
  /** Surface-local UV space, 0..1. */
  points: Vec2[];
  invert: boolean;
}

export interface Mask {
  enabled: boolean;
  polygons: MaskPolygon[];
  /** Soft edge width in UV units, 0..0.2, rendered as an SDF falloff. */
  feather: number;
}

export type SourceParamValue = number | string | boolean;

export interface Surface {
  id: string;
  name: string;
  enabled: boolean;
  solo: boolean;
  opacity: number;
  blendMode: BlendMode;
  warp: Warp;
  mask: Mask;
  sourceId: string | null;
  /** Per-surface overrides of the source's uniform defaults. */
  sourceParams: Record<string, SourceParamValue>;
}

export interface Source {
  id: string;
  type: SourceType;
  name: string;
  /** Fragment shader body (no #version line; the runtime prepends a header). */
  glsl?: string;
  /** Uniform defaults, keyed without the `u_` prefix. */
  uniforms?: Record<string, SourceParamValue>;
}

export interface SceneSurfaceState {
  sourceId?: string | null;
  opacity?: number;
  enabled?: boolean;
  sourceParams?: Record<string, SourceParamValue>;
}

export interface Master {
  /** 0..1, grand master, applied last. */
  brightness: number;
  /** Output gamma; 2.2 is neutral (no correction). */
  gamma: number;
  /** 0..0.1, raises the black floor to compensate projector black crush. */
  blackLift: number;
  /** -100..100, cool..warm output tint. */
  temperature: number;
}

export interface Scene {
  id: string;
  name: string;
  /** Sparse overrides per surface id — not full copies. */
  surfaceStates: Record<string, SceneSurfaceState>;
  master?: Partial<Master>;
}

export interface ScheduleEvent {
  /** "HH:MM" local, or "sunset±HH:MM" / "sunrise±HH:MM". */
  at: string;
  action: 'fadeToScene' | 'fadeToBlack';
  sceneId?: string;
  durationSec: number;
}

export interface Schedule {
  enabled: boolean;
  location: { lat: number; lon: number };
  events: ScheduleEvent[];
}

export interface ProjectMeta {
  name: string;
  outputWidth: number;
  outputHeight: number;
  created: string;
}

export interface Project {
  version: 1;
  meta: ProjectMeta;
  master: Master;
  surfaces: Surface[];
  sources: Source[];
  scenes: Scene[];
  schedule: Schedule;
}
