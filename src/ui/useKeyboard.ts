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
        if (s.maskEdit) s.exitMaskEdit();
        else if (s.helpOpen) s.setHelpOpen(false);
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
        } else if (k === 'd') {
          if (s.mode === 'edit' && s.selectedSurfaceId) {
            e.preventDefault();
            s.duplicateSurface(s.selectedSurfaceId);
          }
        }
        return;
      }

      const edit = s.mode === 'edit';
      const ambient = focusIsAmbient();

      const nudge = (dx: number, dy: number): void => {
        if (!edit || !ambient) return;
        if (s.selectedSurfaceId == null || s.selectedHandle == null) return;
        e.preventDefault();
        const scale = e.shiftKey ? 10 : e.altKey ? 0.1 : 1;
        s.nudgeCorner(s.selectedSurfaceId, s.selectedHandle, dx * scale, dy * scale);
      };

      if (/^[1-9]$/.test(e.key)) {
        if (edit && ambient) s.selectSurfaceByIndex(Number(e.key) - 1);
        return;
      }

      switch (e.key) {
        case 'b':
        case 'B':
          s.toggleBlackout();
          break;
        case '\\':
          if (edit) s.toggleDimChrome();
          break;
        case 'g':
        case 'G':
          if (edit) s.cycleOverlay();
          break;
        case 'h':
        case 'H':
          if (edit) s.toggleHandles();
          break;
        case 'n':
        case 'N':
          if (edit && ambient) s.addSurface();
          break;
        case 'f':
        case 'F':
          if (edit && s.selectedSurfaceId) s.toggleSolo(s.selectedSurfaceId);
          break;
        case 'm':
        case 'M':
          if (edit && s.selectedSurfaceId) {
            if (s.maskEdit) {
              s.exitMaskEdit();
            } else {
              const srf = s.project.surfaces.find((x) => x.id === s.selectedSurfaceId);
              if (srf && srf.mask.polygons.length > 0) s.enterMaskEdit(srf.id, 0);
              else if (srf) s.addMaskPolygon(srf.id);
            }
          }
          break;
        case 'Enter':
          if (s.maskEdit && ambient) s.exitMaskEdit();
          break;
        case 'Delete':
        case 'Backspace':
          if (!edit || !ambient) break;
          e.preventDefault();
          if (s.maskEdit) {
            if (s.maskEdit.selectedPoint != null) s.deleteMaskPoint(s.maskEdit.selectedPoint);
          } else if (s.selectedSurfaceId) {
            s.deleteSurface(s.selectedSurfaceId);
          }
          break;
        case '?':
          if (edit) s.setHelpOpen(!s.helpOpen);
          break;
        case 'Tab':
          if (edit && ambient) {
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
