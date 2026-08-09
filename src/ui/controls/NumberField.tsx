import { useRef, useState } from 'react';

export interface NumberFieldProps {
  label?: string;
  value: number;
  onChange: (v: number) => void;
  /** Wrap continuous drags for undo coalescing. */
  onGestureStart?: () => void;
  onGestureEnd?: () => void;
  min?: number;
  max?: number;
  /** Value delta per pixel of horizontal drag. */
  step?: number;
  /** Value delta per arrow key press while focused. */
  keyStep?: number;
  decimals?: number;
  /** Alt+click resets to this. */
  defaultValue?: number;
  suffix?: string;
}

/**
 * Scrub-draggable numeric field: drag horizontally to change, click to type,
 * Alt+click to reset. Shift scrubs coarse, Alt scrubs fine.
 */
export function NumberField(p: NumberFieldProps): React.ReactElement {
  const step = p.step ?? 1;
  const keyStep = p.keyStep ?? 1;
  const decimals = p.decimals ?? 1;
  const min = p.min ?? -Infinity;
  const max = p.max ?? Infinity;

  const [draft, setDraft] = useState<string | null>(null);
  const drag = useRef<{ lastX: number; moved: number; active: boolean } | null>(null);
  const raw = useRef(0);

  const clamp = (v: number): number => Math.min(max, Math.max(min, v));
  const fmt = (v: number): string => v.toFixed(decimals);

  // A bounded field draws its position as a fill behind the number; an
  // unbounded one stays a plain well.
  const bounded = Number.isFinite(min) && Number.isFinite(max) && max > min;
  const fill = bounded ? `${(clamp(p.value) - min) * (100 / (max - min))}%` : undefined;

  const applyOnce = (v: number): void => {
    p.onGestureStart?.();
    p.onChange(clamp(v));
    p.onGestureEnd?.();
  };

  const commitDraft = (): void => {
    if (draft == null) return;
    const v = Number.parseFloat(draft.replace(',', '.'));
    setDraft(null);
    if (Number.isFinite(v)) applyOnce(v);
  };

  const onPointerDown = (e: React.PointerEvent<HTMLSpanElement>): void => {
    if (e.button !== 0) return;
    if (e.altKey && p.defaultValue !== undefined) {
      applyOnce(p.defaultValue);
      return;
    }
    drag.current = { lastX: e.clientX, moved: 0, active: false };
    raw.current = p.value;
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLSpanElement>): void => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.lastX;
    d.lastX = e.clientX;
    d.moved += Math.abs(dx);
    if (!d.active && d.moved > 3) {
      d.active = true;
      p.onGestureStart?.();
    }
    if (d.active) {
      const scale = e.shiftKey ? 10 : e.altKey ? 0.1 : 1;
      raw.current = clamp(raw.current + dx * step * scale);
      p.onChange(raw.current);
    }
  };

  const onPointerUp = (): void => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    if (d.active) p.onGestureEnd?.();
    else setDraft(fmt(p.value)); // a plain click enters typing mode
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLSpanElement>): void => {
    if (e.key === 'Enter') {
      e.stopPropagation();
      setDraft(fmt(p.value));
      return;
    }
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      e.stopPropagation();
      const dir = e.key === 'ArrowUp' ? 1 : -1;
      const scale = e.shiftKey ? 10 : e.altKey ? 0.1 : 1;
      applyOnce(p.value + dir * keyStep * scale);
    }
  };

  return (
    <div className="numfield">
      {p.label && <span className="nf-label">{p.label}</span>}
      {draft != null ? (
        <input
          className="nf-input"
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onFocus={(e) => e.currentTarget.select()}
          onBlur={commitDraft}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Enter') commitDraft();
            else if (e.key === 'Escape') setDraft(null);
          }}
        />
      ) : (
        <span
          className="nf-value"
          style={fill != null ? ({ '--fill': fill } as React.CSSProperties) : undefined}
          tabIndex={0}
          role="spinbutton"
          aria-label={p.label}
          aria-valuenow={p.value}
          aria-valuemin={bounded ? min : undefined}
          aria-valuemax={bounded ? max : undefined}
          title="Drag to scrub, click to type, Alt+click to reset"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onKeyDown={onKeyDown}
        >
          <span>
            {fmt(p.value)}
            {p.suffix}
          </span>
        </span>
      )}
    </div>
  );
}
