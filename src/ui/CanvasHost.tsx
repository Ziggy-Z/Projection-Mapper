import { useEffect, useRef } from 'react';
import { Renderer } from '../gl/renderer';
import { setRenderer } from '../runtime';
import { useAppStore } from '../store/store';

/**
 * Owns the canvas and the renderer's lifetime. The effect runs once; the
 * render loop is never torn down by a re-render. React writes the store,
 * the loop reads it — one direction only.
 */
export function CanvasHost(): React.ReactElement {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    let renderer: Renderer;
    try {
      renderer = new Renderer(canvas, () => {
        const s = useAppStore.getState();
        return {
          project: s.project,
          blackout: s.blackout,
          // Show mode is pure output: calibration overlays never leak into it.
          overlay: s.mode === 'edit' ? s.overlay : 'off',
        };
      });
    } catch (e) {
      console.error(e);
      useAppStore.getState().setNotice('WebGL2 is not available on this machine.');
      return;
    }
    renderer.start();
    setRenderer(renderer);
    // Console access for acceptance testing (e.g. __pm.renderer.debugLoseContext()).
    (window as unknown as Record<string, unknown>).__pm = { renderer };
    return () => {
      setRenderer(null);
      renderer.dispose();
    };
  }, []);

  return <canvas ref={ref} className="output" />;
}
