import type { Vec2 } from '../model/types';

/**
 * Projective map from the unit square to an arbitrary quad, Heckbert's
 * closed form. Corner order matches the document convention: TL, TR, BR, BL,
 * i.e. unit-square (0,0), (1,0), (1,1), (0,1) with v down.
 *
 *   x = (a*u + b*v + c) / (g*u + h*v + 1)
 *   y = (d*u + e*v + f) / (g*u + h*v + 1)
 */
export interface Homography {
  a: number; b: number; c: number;
  d: number; e: number; f: number;
  g: number; h: number;
}

export function squareToQuad(q: readonly Vec2[]): Homography | null {
  const [p0, p1, p2, p3] = q;
  const dx1 = p1[0] - p2[0];
  const dy1 = p1[1] - p2[1];
  const dx2 = p3[0] - p2[0];
  const dy2 = p3[1] - p2[1];
  const sx = p0[0] - p1[0] + p2[0] - p3[0];
  const sy = p0[1] - p1[1] + p2[1] - p3[1];

  let g = 0;
  let h = 0;
  if (Math.abs(sx) > 1e-9 || Math.abs(sy) > 1e-9) {
    const det = dx1 * dy2 - dx2 * dy1;
    if (Math.abs(det) < 1e-12) return null;
    g = (sx * dy2 - dx2 * sy) / det;
    h = (dx1 * sy - sx * dy1) / det;
  }
  return {
    a: p1[0] - p0[0] + g * p1[0],
    b: p3[0] - p0[0] + h * p3[0],
    c: p0[0],
    d: p1[1] - p0[1] + g * p1[1],
    e: p3[1] - p0[1] + h * p3[1],
    f: p0[1],
    g,
    h,
  };
}

const UNIT_CORNERS: readonly Vec2[] = [
  [0, 0],
  [1, 0],
  [1, 1],
  [0, 1],
];

/**
 * Interleaved vertex data for a corner-pinned quad: clip-space xy plus
 * homogeneous texture coordinates (u/w, v/w, 1/w), where w is the forward
 * homography's denominator at that corner.
 *
 * Why 1/w: the inverse homography H⁻¹·(x, y, 1) is an *affine* function of
 * screen position, and at corner i it equals (uᵢ, vᵢ, 1)/wᵢ. Varyings
 * interpolate linearly in screen space here (every vertex has clip w = 1),
 * so passing exactly those values and dividing xy by z in the fragment
 * shader reconstructs the projective warp everywhere — no diagonal seam
 * across the two triangles. Multiplying by w instead of dividing is the
 * classic wrong guess and produces the seam.
 *
 * Corners are in normalized output space, y down; clip space is y up.
 * Returns null for a degenerate quad.
 */
export function cornerPinVertices(corners: readonly Vec2[]): Float32Array | null {
  const H = squareToQuad(corners);
  if (!H) return null;
  const out = new Float32Array(4 * 5);
  for (let i = 0; i < 4; i++) {
    const [u, v] = UNIT_CORNERS[i];
    const [x, y] = corners[i];
    const w = H.g * u + H.h * v + 1;
    if (!Number.isFinite(w) || Math.abs(w) < 1e-6) return null;
    const iw = 1 / w;
    out[i * 5 + 0] = x * 2 - 1;
    out[i * 5 + 1] = 1 - y * 2;
    out[i * 5 + 2] = u * iw;
    out[i * 5 + 3] = v * iw;
    out[i * 5 + 4] = iw;
  }
  return out;
}
