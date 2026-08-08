import type { MeshWarp, Vec2 } from '../model/types';
import { squareToQuad, applyHomography } from './homography';

/** Tessellation steps per mesh cell. Cells become small enough that plain
 * bilinear UV interpolation has no visible error. */
const SUB = 6;

function catmullRom(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const t2 = t * t;
  const t3 = t2 * t;
  return (
    0.5 *
    (2 * p1 +
      (-p0 + p2) * t +
      (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
      (-p0 + 3 * p1 - 3 * p2 + p3) * t3)
  );
}

/** Control point with clamped edge handling. */
function ctrl(mesh: MeshWarp, col: number, row: number): Vec2 {
  const c = Math.min(mesh.cols, Math.max(0, col));
  const r = Math.min(mesh.rows, Math.max(0, row));
  return mesh.points[r * (mesh.cols + 1) + c];
}

/** Evaluates the Catmull-Rom surface at grid parameter (u, v) in cells. */
function evalMesh(mesh: MeshWarp, uCell: number, vCell: number): Vec2 {
  const ci = Math.min(mesh.cols - 1, Math.floor(uCell));
  const ri = Math.min(mesh.rows - 1, Math.floor(vCell));
  const tu = uCell - ci;
  const tv = vCell - ri;
  const rowPts: Vec2[] = [];
  for (let r = -1; r <= 2; r++) {
    const p0 = ctrl(mesh, ci - 1, ri + r);
    const p1 = ctrl(mesh, ci, ri + r);
    const p2 = ctrl(mesh, ci + 1, ri + r);
    const p3 = ctrl(mesh, ci + 2, ri + r);
    rowPts.push([
      catmullRom(p0[0], p1[0], p2[0], p3[0], tu),
      catmullRom(p0[1], p1[1], p2[1], p3[1], tu),
    ]);
  }
  return [
    catmullRom(rowPts[0][0], rowPts[1][0], rowPts[2][0], rowPts[3][0], tv),
    catmullRom(rowPts[0][1], rowPts[1][1], rowPts[2][1], rowPts[3][1], tv),
  ];
}

export interface MeshGeometry {
  /** Interleaved: clip xy + homogeneous uv (u, v, 1) — 5 floats per vertex. */
  vertices: Float32Array;
  indices: Uint16Array;
}

/**
 * Tessellates a mesh warp into a triangle grid, matching the corner-pin
 * vertex layout so the same warp program renders both.
 */
export function tessellateMesh(mesh: MeshWarp): MeshGeometry | null {
  if (mesh.points.length !== (mesh.cols + 1) * (mesh.rows + 1)) return null;
  const nx = mesh.cols * SUB;
  const ny = mesh.rows * SUB;
  const vertices = new Float32Array((nx + 1) * (ny + 1) * 5);
  let ptr = 0;
  for (let iy = 0; iy <= ny; iy++) {
    for (let ix = 0; ix <= nx; ix++) {
      const u = ix / nx;
      const v = iy / ny;
      const [x, y] = evalMesh(mesh, (ix / nx) * mesh.cols, (iy / ny) * mesh.rows);
      vertices[ptr++] = x * 2 - 1;
      vertices[ptr++] = 1 - y * 2;
      vertices[ptr++] = u;
      vertices[ptr++] = v;
      vertices[ptr++] = 1;
    }
  }
  const indices = new Uint16Array(nx * ny * 6);
  let ip = 0;
  for (let iy = 0; iy < ny; iy++) {
    for (let ix = 0; ix < nx; ix++) {
      const a = iy * (nx + 1) + ix;
      const b = a + 1;
      const c = a + (nx + 1);
      const d = c + 1;
      indices[ip++] = a;
      indices[ip++] = b;
      indices[ip++] = d;
      indices[ip++] = a;
      indices[ip++] = d;
      indices[ip++] = c;
    }
  }
  return { vertices, indices };
}

/** Builds a fresh mesh grid from a corner pin, so converting warp types
 * preserves the current alignment exactly. */
export function meshFromCorners(
  corners: readonly Vec2[],
  cols: number,
  rows: number,
): MeshWarp | null {
  const H = squareToQuad(corners);
  if (!H) return null;
  const points: Vec2[] = [];
  for (let r = 0; r <= rows; r++) {
    for (let c = 0; c <= cols; c++) {
      points.push(applyHomography(H, c / cols, r / rows));
    }
  }
  return { cols, rows, points };
}
