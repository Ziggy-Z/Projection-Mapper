import { useAppStore } from '../store/store';
import { NumberField } from './controls/NumberField';

const CORNER_NAMES = ['Top left', 'Top right', 'Bottom right', 'Bottom left'];

export function SurfacePanel(): React.ReactElement | null {
  const surface = useAppStore((s) =>
    s.project.surfaces.find((x) => x.id === s.selectedSurfaceId),
  );
  const selectedHandle = useAppStore((s) => s.selectedHandle);
  const outW = useAppStore((s) => s.project.meta.outputWidth);
  const outH = useAppStore((s) => s.project.meta.outputHeight);
  const setCorner = useAppStore((s) => s.setCorner);
  const beginGesture = useAppStore((s) => s.beginGesture);
  const endGesture = useAppStore((s) => s.endGesture);

  if (!surface) return null;
  const corner = selectedHandle != null ? surface.warp.corners[selectedHandle] : null;

  return (
    <section className="panel panel-surface">
      <h2 className="section-title">Surface</h2>
      <div className="meta-row">
        <span className="meta-label">Name</span>
        <span>{surface.name}</span>
      </div>
      {corner && selectedHandle != null ? (
        <>
          <div className="meta-row">
            <span className="meta-label">Corner</span>
            <span>{CORNER_NAMES[selectedHandle]}</span>
          </div>
          <NumberField
            label="X"
            value={corner[0] * outW}
            min={-0.5 * outW}
            max={1.5 * outW}
            step={1}
            keyStep={1}
            decimals={1}
            suffix=" px"
            onGestureStart={beginGesture}
            onGestureEnd={endGesture}
            onChange={(v) => setCorner(surface.id, selectedHandle, [v / outW, corner[1]])}
          />
          <NumberField
            label="Y"
            value={corner[1] * outH}
            min={-0.5 * outH}
            max={1.5 * outH}
            step={1}
            keyStep={1}
            decimals={1}
            suffix=" px"
            onGestureStart={beginGesture}
            onGestureEnd={endGesture}
            onChange={(v) => setCorner(surface.id, selectedHandle, [corner[0], v / outH])}
          />
          <div className="panel-hint">Arrows nudge 1px · Shift 10 · Alt 0.1</div>
        </>
      ) : (
        <div className="panel-hint">Click a corner handle to aim, or drag it directly.</div>
      )}
    </section>
  );
}
