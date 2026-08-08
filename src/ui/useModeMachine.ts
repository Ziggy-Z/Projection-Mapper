import { useEffect } from 'react';
import { useAppStore } from '../store/store';

/** Accumulated pointer travel required to leave Show mode — a stray bump on
 * the table must not wake the editor. */
const ENTER_EDIT_TRAVEL_PX = 40;
/** Gap that resets the travel accumulator. */
const TRAVEL_WINDOW_MS = 800;
/** Ignore residual pointer motion right after returning to Show. */
const SHOW_GRACE_MS = 1000;
const EDIT_IDLE_SEC = 60;
const COUNTDOWN_FROM_SEC = 5;

/**
 * Show/Edit mode transitions: deliberate mouse movement enters Edit, 60s of
 * no input returns to Show with a short visible countdown. Esc is handled by
 * the keyboard hook; this hook only tracks activity.
 */
export function useModeMachine(): void {
  useEffect(() => {
    let travel = 0;
    let lastMove: { x: number; y: number; t: number } | null = null;
    let graceUntil = 0;
    let lastActivity = Date.now();

    const activity = (): void => {
      lastActivity = Date.now();
    };

    const onPointerMove = (e: PointerEvent): void => {
      const s = useAppStore.getState();
      if (s.recoveryRaw != null) return;
      const now = performance.now();
      if (s.mode === 'edit') {
        activity();
        return;
      }
      if (now < graceUntil) {
        lastMove = { x: e.clientX, y: e.clientY, t: now };
        return;
      }
      if (!lastMove || now - lastMove.t > TRAVEL_WINDOW_MS) {
        travel = 0;
      } else {
        travel += Math.hypot(e.clientX - lastMove.x, e.clientY - lastMove.y);
      }
      lastMove = { x: e.clientX, y: e.clientY, t: now };
      if (travel > ENTER_EDIT_TRAVEL_PX) {
        s.setMode('edit');
        activity();
      }
    };

    const unsubscribe = useAppStore.subscribe((s, prev) => {
      if (s.mode === prev.mode) return;
      if (s.mode === 'show') {
        graceUntil = performance.now() + SHOW_GRACE_MS;
        travel = 0;
        lastMove = null;
      } else {
        activity();
      }
    });

    const tick = window.setInterval(() => {
      const s = useAppStore.getState();
      if (s.mode !== 'edit' || s.recoveryRaw != null) return;
      const remaining = EDIT_IDLE_SEC - (Date.now() - lastActivity) / 1000;
      if (remaining <= 0) {
        s.setMode('show');
      } else {
        s.setEditCountdown(remaining <= COUNTDOWN_FROM_SEC ? Math.ceil(remaining) : null);
      }
    }, 250);

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerdown', activity);
    window.addEventListener('keydown', activity);
    window.addEventListener('wheel', activity);
    return () => {
      window.clearInterval(tick);
      unsubscribe();
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerdown', activity);
      window.removeEventListener('keydown', activity);
      window.removeEventListener('wheel', activity);
    };
  }, []);
}
