import { useRef, useState } from 'react';
import type { Surface, Vec2 } from '../model/types';
import { useAppStore } from '../store/store';
import { useWindowSize } from './hooks';

/**
 * SVG overlay for warp handles. Corner-pin surfaces get four crosshair
 * reticles; mesh surfaces get the full control-point grid with hairline
 * gridlines. Hit areas are generous; visuals stay small. A live coordinate
 * readout appears while dragging.
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

function Reticle(props: { small?: boolean }): React.ReactElement {
  const r = props.small ? 6 : 10;
  const gap = props.small ? 2.5 : 4;
  return (
    <>
      <line x1={-r} y1={0} x2={-gap} y2={0} />
      <line x1={gap} y1={0} x2={r} y2={0} />
      <line x1={0} y1={-r} x2={0} y2={-gap} />
      <line x1={0} y1={gap} x2={0} y2={r} />
      <circle className="dot" r={props.small ? 1.1 : 1.4} />
    </>
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
  const setMeshPoint = useAppStore((s) => s.setMeshPoint);
  const beginGesture = useAppStore((s) => s.beginGesture);
  const endGesture = useAppStore((s) => s.endGesture);

  const [dragging, setDragging] = useState<number | null>(null);
  const grab = useRef<{ dx: number; dy: number }>({ dx: 0, dy: 0 });

  const isSelected = surface.id === selectedSurfaceId;
  const isMesh = surface.warp.type === 'mesh' && !!surface.warp.mesh;
  const mesh = surface.warp.mesh;

  const points: Vec2[] = isMesh && mesh ? mesh.points : surface.warp.corners;
  const px = points.map((c) => [c[0] * w, c[1] * h] as Vec2);

  // Outline: quad edge for corner pin; grid perimeter for mesh.
  let outlinePoints: string;
  if (isMesh && mesh) {
    const cols = mesh.cols + 1;
    const rows = mesh.rows + 1;
    const per: Vec2[] = [];
    for (let c = 0; c < cols; c++) per.push(px[c]);
    for (let r = 1; r < rows; r++) per.push(px[r * cols + cols - 1]);
    for (let c = cols - 2; c >= 0; c--) per.push(px[(rows - 1) * cols + c]);
    for (let r = rows - 2; r >= 1; r--) per.push(px[r * cols]);
    outlinePoints = per.map((p) => `${p[0]},${p[1]}`).join(' ');
  } else {
    outlinePoints = px.map((p) => `${p[0]},${p[1]}`).join(' ');
  }

  const move = (i: number, x: number, y: number): void => {
    const pos: Vec2 = [x / w, y / h];
    if (isMesh) setMeshPoint(surface.id, i, pos);
    else setCorner(surface.id, i, pos);
  };

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
    move(i, e.clientX + grab.current.dx, e.clientY + grab.current.dy);
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
      {isMesh && mesh && isSelected && (
        <g className="mesh-grid">
          {Array.from({ length: mesh.rows + 1 }, (_, r) => (
            <polyline
              key={`r${r}`}
              points={px
                .slice(r * (mesh.cols + 1), (r + 1) * (mesh.cols + 1))
                .map((p) => `${p[0]},${p[1]}`)
                .join(' ')}
            />
          ))}
          {Array.from({ length: mesh.cols + 1 }, (_, c) => (
            <polyline
              key={`c${c}`}
              points={Array.from(
                { length: mesh.rows + 1 },
                (_, r) => px[r * (mesh.cols + 1) + c],
              )
                .map((p) => `${p[0]},${p[1]}`)
                .join(' ')}
            />
          ))}
        </g>
      )}
      {(isSelected || !isMesh) &&
        px.map(([x, y], i) => {
          if (isMesh && !isSelected) return null;
          const sel = isSelected && selectedHandle === i;
          const p = points[i];
          return (
            <g
              key={i}
              className={sel ? 'handle sel' : 'handle'}
              transform={`translate(${x}, ${y})`}
              onPointerDown={(e) => onPointerDown(e, i)}
              onPointerMove={(e) => onPointerMove(e, i)}
              onPointerUp={() => onPointerUp(i)}
            >
              <circle className="hit" r={isMesh ? 12 : 16} />
              <Reticle small={isMesh} />
              {dragging === i && (
                <text className="readout" x={14} y={-12}>
                  {`${(p[0] * outW).toFixed(1)}, ${(p[1] * outH).toFixed(1)}`}
                </text>
              )}
            </g>
          );
        })}
    </g>
  );
}
