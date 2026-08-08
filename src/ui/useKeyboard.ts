import { useEffect } from 'react';
import { useAppStore } from '../store/store';
import { saveProjectToFile } from '../store/persistence';

function inTextField(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  return (
    !!el &&
    (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)
  );
}

/** Arrow-key corner nudging only applies when focus is not on a control, so
 * panel fields keep their own arrow behavior and Tab keeps focus traversal. */
function focusIsAmbient(): boolean {
  const el = document.activeElement;
  return el === null || el === document.body;
}

export function useKeyboard(): void {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      const s = useAppStore.getState();
      if (s.recoveryRaw != null) return;
      const field = inTextField(e.target);

      if (e.key === 'Escape') {
        if (field) return; // fields handle their own Escape
        if (s.helpOpen) s.setHelpOpen(false);
        else s.setMode(s.mode === 'edit' ? 'show' : 'edit');
        return;
      }
      if (field) return;

      const mod = e.ctrlKey || e.metaKey;
      if (mod) {
        const k = e.key.toLowerCase();
        if (k === 's') {
          e.preventDefault();
          void saveProjectToFile(s.project);
        } else if (k === 'z') {
          e.preventDefault();
          if (e.shiftKey) s.redo();
          else s.undo();
        } else if (k === 'y') {
          e.preventDefault();
          s.redo();
        }
        return;
      }

      const nudge = (dx: number, dy: number): void => {
        if (s.mode !== 'edit' || !focusIsAmbient()) return;
        if (s.selectedSurfaceId == null || s.selectedHandle == null) return;
        e.preventDefault();
        const scale = e.shiftKey ? 10 : e.altKey ? 0.1 : 1;
        s.nudgeCorner(s.selectedSurfaceId, s.selectedHandle, dx * scale, dy * scale);
      };

      switch (e.key) {
        case 'b':
        case 'B':
          s.toggleBlackout();
          break;
        case '\\':
          if (s.mode === 'edit') s.toggleDimChrome();
          break;
        case 'g':
        case 'G':
          if (s.mode === 'edit') s.cycleOverlay();
          break;
        case 'h':
        case 'H':
          if (s.mode === 'edit') s.toggleHandles();
          break;
        case '?':
          if (s.mode === 'edit') s.setHelpOpen(!s.helpOpen);
          break;
        case 'Tab':
          if (s.mode === 'edit' && focusIsAmbient()) {
            e.preventDefault();
            s.cycleSurface(e.shiftKey ? -1 : 1);
          }
          break;
        case 'ArrowLeft':
          nudge(-1, 0);
          break;
        case 'ArrowRight':
          nudge(1, 0);
          break;
        case 'ArrowUp':
          nudge(0, -1);
          break;
        case 'ArrowDown':
          nudge(0, 1);
          break;
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
}
