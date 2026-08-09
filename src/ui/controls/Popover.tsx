import { useLayoutEffect, useState } from 'react';
import { createPortal } from 'react-dom';

const GAP = 6;
const EDGE = 8;
const MAX_H = 320;

/**
 * A menu anchored to a trigger, rendered into the chrome layer so a rail's
 * `overflow: auto` cannot clip it. Flips above the trigger when there is more
 * room there, and closes on outside click, Escape, scroll or resize.
 */
export function Popover(props: {
  anchor: HTMLElement | null;
  onClose: () => void;
  className?: string;
  children: React.ReactNode;
}): React.ReactElement | null {
  const { anchor, onClose } = props;
  const [box, setBox] = useState<React.CSSProperties | null>(null);

  useLayoutEffect(() => {
    if (!anchor) return;

    const place = (): void => {
      const r = anchor.getBoundingClientRect();
      const below = window.innerHeight - r.bottom - GAP - EDGE;
      const above = r.top - GAP - EDGE;
      const dropDown = below >= Math.min(MAX_H, above) || below >= above;
      setBox({
        position: 'fixed',
        left: r.left,
        width: r.width,
        maxHeight: Math.min(MAX_H, Math.max(120, dropDown ? below : above)),
        ...(dropDown
          ? { top: r.bottom + GAP }
          : { bottom: window.innerHeight - r.top + GAP }),
      });
    };
    place();

    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      onClose();
    };
    const onDown = (e: PointerEvent): void => {
      const t = e.target as Node;
      if (anchor.contains(t)) return;
      if ((t as Element).closest?.('[data-popover]')) return;
      onClose();
    };

    window.addEventListener('keydown', onKey, true);
    window.addEventListener('pointerdown', onDown, true);
    window.addEventListener('resize', place);
    // Capture phase so a scrolling rail moves the anchor out from under us.
    window.addEventListener('scroll', onClose, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', onClose, true);
    };
  }, [anchor, onClose]);

  const host = document.getElementById('chrome');
  if (!anchor || !box || !host) return null;

  return createPortal(
    <div data-popover className={props.className} style={box} role="menu">
      {props.children}
    </div>,
    host,
  );
}
