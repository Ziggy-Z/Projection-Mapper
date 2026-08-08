import { useRef } from 'react';
import type { Vec2 } from '../model/types';
import { applyHomography, invertHomography, squareToQuad } from '../gl/homography';
import { useAppStore } from '../store/store';
import { useWindowSize } from './hooks';

/**
 * The mask edit sub-mode: click to add a point, drag to move, double-click a
 * segment to insert, Delete to remove, Enter to close and exit. Points live
 * in surface UV space and are mapped to the screen through the surface's
 * corner-pin homography, so the polygon is edited in place on the warped
 * output.
 */
export function MaskLayer(): React.ReactElement | null {
  const maskEdit = useAppStore((s) => s.maskEdit);
  const surface = useAppStore((s) =>
    s.maskEdit ? s.project.surfaces.find((x) => x.id === s.maskEdit!.surfaceId) : undefined,
  );
  const addMaskPoint = useAppStore((s) => s.addMaskPoint);
  const moveMaskPoint = useAppStore((s) => s.moveMaskPoint);
  const insertMaskPoint = useAppStore((s) => s.insertMaskPoint);
  const selectMaskPoint = useAppStore((s) => s.selectMaskPoint);
  const beginGesture = useAppStore((s) => s.beginGesture);
  const endGesture = useAppStore((s) => s.endGesture);
  const size = useWindowSize();
  const dragging = useRef<number | null>(null);

  if (!maskEdit || !surface) return null;
  const poly = surface.mask.polygons[maskEdit.polygonIndex];
  if (!poly) return null;

  const H = squareToQuad(surface.warp.corners);
  if (!H) return null;

  const toScreen = (uv: Vec2): Vec2 => {
    const [x, y] = applyHomography(H, uv[0], uv[1]);
    return [x * size.w, y * size.h];
  };
  const toUv = (clientX: number, clientY: number): Vec2 => {
    const [u, v] = invertHomography(H, clientX / size.w, clientY / size.h);
    return [Math.min(1.5, Math.max(-0.5, u)), Math.min(1.5, Math.max(-0.5, v))];
  };

  const pts = poly.points.map(toScreen);
  const path = pts.map((p) => `${p[0]},${p[1]}`).join(' ');

  return (
    <svg
      className="handles mask-layer"
      width={size.w}
      height={size.h}
      viewBox={`0 0 ${size.w} ${size.h}`}
    >
      {/* Click-catcher: a click on empty space appends a point. */}
      <rect
        className="mask-catcher"
        x={0}
        y={0}
        width={size.w}
        height={size.h}
        onClick={(e) => {
          beginGesture();
          addMaskPoint(toUv(e.clientX, e.clientY));
          endGesture();
        }}
      />
      {pts.length >= 2 && <polygon className="mask-poly" points={path} />}
      {/* Segment hit areas for double-click insertion. */}
      {pts.length >= 2 &&
        pts.map((p, i) => {
          const q = pts[(i + 1) % pts.length];
          return (
            <line
              key={`seg${i}`}
              className="mask-seg"
              x1={p[0]}
              y1={p[1]}
              x2={q[0]}
              y2={q[1]}
              onDoubleClick={(e) => {
                e.stopPropagation();
                insertMaskPoint(i, toUv(e.clientX, e.clientY));
              }}
            />
          );
        })}
      {pts.map((p, i) => (
        <g
          key={i}
          className={maskEdit.selectedPoint === i ? 'mask-point sel' : 'mask-point'}
          transform={`translate(${p[0]}, ${p[1]})`}
          onPointerDown={(e) => {
            if (e.button !== 0) return;
            e.stopPropagation();
            selectMaskPoint(i);
            beginGesture();
            dragging.current = i;
            e.currentTarget.setPointerCapture(e.pointerId);
          }}
          onPointerMove={(e) => {
            if (dragging.current !== i) return;
            moveMaskPoint(i, toUv(e.clientX, e.clientY));
          }}
          onPointerUp={() => {
            if (dragging.current !== i) return;
            dragging.current = null;
            endGesture();
          }}
        >
          <circle className="hit" r={12} />
          <rect className="mask-vertex" x={-3} y={-3} width={6} height={6} />
        </g>
      ))}
      <text className="readout mask-hint-text" x={size.w / 2} y={size.h - 40} textAnchor="middle">
        {`Mask: ${surface.name} — click to add, drag to move, double-click a segment to insert, Del removes, Enter closes`}
      </text>
    </svg>
  );
}
