import type { Project, Source, Surface, Vec2 } from './types';
import { SLOW_DRIFT } from '../content/shaders';

export function newId(prefix: string): string {
  const hex = Math.floor(Math.random() * 0xffffffff)
    .toString(16)
    .padStart(8, '0');
  return `${prefix}_${hex.slice(0, 6)}`;
}

export function defaultProject(): Project {
  const sourceId = newId('src');
  const surfaceId = newId('srf');
  return {
    version: 1,
    meta: {
      name: 'Wall',
      outputWidth: 1920,
      outputHeight: 1080,
      created: new Date().toISOString(),
    },
    master: { brightness: 1, gamma: 2.2, blackLift: 0, temperature: 0 },
    surfaces: [
      {
        id: surfaceId,
        name: 'Surface 1',
        enabled: true,
        solo: false,
        opacity: 1,
        blendMode: 'normal',
        warp: {
          type: 'cornerPin',
          corners: [
            [0.2, 0.2],
            [0.8, 0.2],
            [0.8, 0.8],
            [0.2, 0.8],
          ],
        },
        mask: { enabled: false, polygons: [], feather: 0.02 },
        sourceId,
        sourceParams: {},
      },
    ],
    sources: [
      {
        id: sourceId,
        type: 'shader',
        name: 'Slow drift',
        glsl: SLOW_DRIFT,
        uniforms: { speed: 0.4, level: 0.55, tint: '#F2A93B', base: '#0F1826' },
      },
    ],
    scenes: [],
    schedule: {
      enabled: false,
      location: { lat: 39.29, lon: -76.61 },
      events: [],
    },
  };
}

function isFinite2(v: unknown): v is [number, number] {
  return (
    Array.isArray(v) &&
    v.length >= 2 &&
    Number.isFinite(Number(v[0])) &&
    Number.isFinite(Number(v[1]))
  );
}

function normalizeSurface(raw: unknown, index: number): Surface {
  const s = raw as Partial<Surface> | null;
  if (!s || typeof s !== 'object' || typeof s.id !== 'string') {
    throw new Error(`surface ${index}: missing id`);
  }
  const warp = s.warp as Partial<Surface['warp']> | undefined;
  const corners = warp?.corners;
  if (!Array.isArray(corners) || corners.length !== 4 || !corners.every(isFinite2)) {
    throw new Error(`surface ${index} (${s.id}): warp.corners must be 4 [x,y] pairs`);
  }
  const c = corners.map((p) => [Number(p[0]), Number(p[1])] as Vec2);
  return {
    id: s.id,
    name: typeof s.name === 'string' ? s.name : `Surface ${index + 1}`,
    enabled: s.enabled !== false,
    solo: s.solo === true,
    opacity: Number.isFinite(Number(s.opacity)) ? Math.min(1, Math.max(0, Number(s.opacity))) : 1,
    blendMode:
      s.blendMode === 'add' || s.blendMode === 'screen' || s.blendMode === 'multiply'
        ? s.blendMode
        : 'normal',
    warp: {
      type: warp?.type === 'mesh' ? 'mesh' : 'cornerPin',
      corners: [c[0], c[1], c[2], c[3]],
      mesh: warp?.mesh,
    },
    mask:
      s.mask && typeof s.mask === 'object'
        ? {
            enabled: s.mask.enabled === true,
            polygons: Array.isArray(s.mask.polygons) ? s.mask.polygons : [],
            feather: Number.isFinite(Number(s.mask.feather)) ? Number(s.mask.feather) : 0.02,
          }
        : { enabled: false, polygons: [], feather: 0.02 },
    sourceId: typeof s.sourceId === 'string' ? s.sourceId : null,
    sourceParams:
      s.sourceParams && typeof s.sourceParams === 'object' ? s.sourceParams : {},
  };
}

function normalizeSource(raw: unknown, index: number): Source {
  const s = raw as Partial<Source> | null;
  if (!s || typeof s !== 'object' || typeof s.id !== 'string') {
    throw new Error(`source ${index}: missing id`);
  }
  const type =
    s.type === 'shader' || s.type === 'image' || s.type === 'video' ||
    s.type === 'solid' || s.type === 'gradient'
      ? s.type
      : 'shader';
  return {
    id: s.id,
    type,
    name: typeof s.name === 'string' ? s.name : `Source ${index + 1}`,
    glsl: typeof s.glsl === 'string' ? s.glsl : undefined,
    uniforms: s.uniforms && typeof s.uniforms === 'object' ? s.uniforms : {},
  };
}

/** Parse and validate an untrusted project document. Throws with a reason. */
export function parseProject(data: unknown): Project {
  if (!data || typeof data !== 'object') throw new Error('project is not an object');
  const d = data as Partial<Project> & { version?: unknown };
  if (d.version !== 1) throw new Error(`unsupported project version: ${String(d.version)}`);
  if (!Array.isArray(d.surfaces)) throw new Error('surfaces is not an array');
  if (!Array.isArray(d.sources)) throw new Error('sources is not an array');

  const base = defaultProject();
  const meta = { ...base.meta, ...(d.meta && typeof d.meta === 'object' ? d.meta : {}) };
  if (!Number.isFinite(meta.outputWidth) || meta.outputWidth <= 0) throw new Error('meta.outputWidth invalid');
  if (!Number.isFinite(meta.outputHeight) || meta.outputHeight <= 0) throw new Error('meta.outputHeight invalid');

  const master = { ...base.master, ...(d.master && typeof d.master === 'object' ? d.master : {}) };

  return {
    version: 1,
    meta,
    master,
    surfaces: d.surfaces.map(normalizeSurface),
    sources: d.sources.map(normalizeSource),
    scenes: Array.isArray(d.scenes) ? d.scenes : [],
    schedule:
      d.schedule && typeof d.schedule === 'object'
        ? { ...base.schedule, ...d.schedule }
        : base.schedule,
  };
}
