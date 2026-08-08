import { useRef, useState } from 'react';
import type { Surface, Vec2 } from '../model/types';
import { useAppStore } from '../store/store';
import { useWindowSize } from './hooks';

/**
 * SVG overlay for corner-pin handles: crosshair reticles with a generous hit
 * area, a live coordinate readout while dragging, and the selected surface's
 * outline in the accent color.
 */
export function HandlesLayer(): React.ReactElement | null {
  const surfaces = useAppStore((s) => s.project.surfaces);
  const visible = useAppStore((s) => s.handlesVisible);
  const maskEditing = useAppStore((s) => s.maskEdit != null);
  const size = useWindowSize();
  // Mask editing is a distinct sub-mode: warp handles get out of the way.
  if (!visible || maskEditing) return null;
  return (
    <svg
      className="handles"
      width={size.w}
      height={size.h}
      viewBox={`0 0 ${size.w} ${size.h}`}
    >
      {surfaces.map((srf) => (
        <SurfaceHandles key={srf.id} surface={srf} w={size.w} h={size.h} />
      ))}
    </svg>
  );
}

function SurfaceHandles(props: {
  surface: Surface;
  w: number;
  h: number;
}): React.ReactElement {
  const { surface, w, h } = props;
  const selectedSurfaceId = useAppStore((s) => s.selectedSurfaceId);
  const selectedHandle = useAppStore((s) => s.selectedHandle);
  const outW = useAppStore((s) => s.project.meta.outputWidth);
  const outH = useAppStore((s) => s.project.meta.outputHeight);
  const selectHandle = useAppStore((s) => s.selectHandle);
  const setCorner = useAppStore((s) => s.setCorner);
  const beginGesture = useAppStore((s) => s.beginGesture);
  const endGesture = useAppStore((s) => s.endGesture);

  const [dragging, setDragging] = useState<number | null>(null);
  const grab = useRef<{ dx: number; dy: number }>({ dx: 0, dy: 0 });

  const isSelected = surface.id === selectedSurfaceId;
  const px = surface.warp.corners.map((c) => [c[0] * w, c[1] * h] as Vec2);
  const outlinePoints = px.map((p) => `${p[0]},${p[1]}`).join(' ');

  const onPointerDown = (e: React.PointerEvent<SVGGElement>, i: number): void => {
    if (e.button !== 0) return;
    selectHandle(surface.id, i);
    beginGesture();
    grab.current = { dx: px[i][0] - e.clientX, dy: px[i][1] - e.clientY };
    setDragging(i);
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent<SVGGElement>, i: number): void => {
    if (dragging !== i) return;
    setCorner(surface.id, i, [
      (e.clientX + grab.current.dx) / w,
      (e.clientY + grab.current.dy) / h,
    ]);
  };

  const onPointerUp = (i: number): void => {
    if (dragging !== i) return;
    setDragging(null);
    endGesture();
  };

  return (
    <g>
      <polygon
        className={isSelected ? 'outline' : 'outline unselected'}
        points={outlinePoints}
      />
      {px.map(([x, y], i) => {
        const sel = isSelected && selectedHandle === i;
        const corner = surface.warp.corners[i];
        return (
          <g
            key={i}
            className={sel ? 'handle sel' : 'handle'}
            transform={`translate(${x}, ${y})`}
            onPointerDown={(e) => onPointerDown(e, i)}
            onPointerMove={(e) => onPointerMove(e, i)}
            onPointerUp={() => onPointerUp(i)}
          >
            <circle className="hit" r={16} />
            <line x1={-10} y1={0} x2={-4} y2={0} />
            <line x1={4} y1={0} x2={10} y2={0} />
            <line x1={0} y1={-10} x2={0} y2={-4} />
            <line x1={0} y1={4} x2={0} y2={10} />
            <circle className="dot" r={1.4} />
            {dragging === i && (
              <text className="readout" x={14} y={-12}>
                {`${(corner[0] * outW).toFixed(1)}, ${(corner[1] * outH).toFixed(1)}`}
              </text>
            )}
          </g>
        );
      })}
    </g>
  );
}
