import { useRef } from 'react';
import { useAppStore } from '../store/store';

/**
 * The grand master, docked at the foot of the right rail: vertical travel,
 * lit track, 10% tick scale, BLACKOUT alongside.
 */
export function FaderRail(): React.ReactElement {
  const brightness = useAppStore((s) => s.project.master.brightness);
  const blackout = useAppStore((s) => s.blackout);
  const setMasterBrightness = useAppStore((s) => s.setMasterBrightness);
  const nudgeMasterBrightness = useAppStore((s) => s.nudgeMasterBrightness);
  const toggleBlackout = useAppStore((s) => s.toggleBlackout);
  const beginGesture = useAppStore((s) => s.beginGesture);
  const endGesture = useAppStore((s) => s.endGesture);

  const trackRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const apply = (clientY: number): void => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect || rect.height === 0) return;
    setMasterBrightness(1 - (clientY - rect.top) / rect.height);
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>): void => {
    if (e.button !== 0) return;
    beginGesture();
    dragging.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    apply(e.clientY);
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>): void => {
    if (dragging.current) apply(e.clientY);
  };
  const onPointerUp = (): void => {
    if (!dragging.current) return;
    dragging.current = false;
    endGesture();
  };
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>): void => {
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    e.preventDefault();
    e.stopPropagation();
    const dir = e.key === 'ArrowUp' ? 1 : -1;
    const step = e.shiftKey ? 0.1 : e.altKey ? 0.001 : 0.01;
    nudgeMasterBrightness(dir * step);
  };

  const pct = Math.round(brightness * 100);

  return (
    <div className="fader-rail">
      <div className="rail-title">Master</div>
      <div
        ref={trackRef}
        className="fader-track"
        tabIndex={0}
        role="slider"
        aria-label="Grand master"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onKeyDown={onKeyDown}
      >
        <div className="fader-groove">
          <div className="fader-fill" style={{ height: `${brightness * 100}%` }} />
        </div>
        <div className="fader-ticks">
          {Array.from({ length: 11 }, (_, i) => (
            <div
              key={i}
              className={i % 5 === 0 ? 'tick major' : 'tick'}
              style={{ top: `${i * 10}%` }}
            />
          ))}
        </div>
        <div className="fader-cap" style={{ top: `${(1 - brightness) * 100}%` }} />
      </div>
      <div className="fader-readout">
        <span className="fader-percent">{pct}</span>
        <span className="fader-unit">%</span>
      </div>
      <button
        type="button"
        className={blackout ? 'blackout-btn active' : 'blackout-btn'}
        onClick={toggleBlackout}
      >
        Blackout
      </button>
    </div>
  );
}
