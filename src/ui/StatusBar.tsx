import { useEffect, useState } from 'react';
import { useAppStore } from '../store/store';
import { getRenderer } from '../runtime';

/**
 * The bottom strip: render health on the left, the keys worth knowing on the
 * right. Nothing here is interactive — it is the instrument panel.
 */
export function StatusBar(): React.ReactElement {
  const surfaces = useAppStore((s) => s.project.surfaces);
  const scenes = useAppStore((s) => s.project.scenes.length);
  const blackout = useAppStore((s) => s.blackout);
  const brightness = useAppStore((s) => s.project.master.brightness);
  const [stats, setStats] = useState({ ms: 0, drops: 0 });

  useEffect(() => {
    const id = window.setInterval(() => {
      const r = getRenderer();
      setStats({ ms: r?.stats.frameMs ?? 0, drops: r?.stats.dropEvents ?? 0 });
    }, 500);
    return () => window.clearInterval(id);
  }, []);

  const live = surfaces.filter((s) => s.enabled).length;
  const dark = blackout || brightness < 0.005;

  return (
    <footer className="statusbar">
      <span className="status-item" title={dark ? 'Nothing is on the wall' : 'Output is live'}>
        <span className={dark ? 'status-dot off' : 'status-dot hot'} />
        {dark ? 'Dark' : 'Live'}
      </span>
      <span className="status-item">
        Surfaces <span className="mono">{live}/{surfaces.length}</span>
      </span>
      <span className="status-item">
        Scenes <span className="mono">{scenes}</span>
      </span>
      <span className="status-item" title="Time to render the last frame">
        Frame <span className="mono">{stats.ms.toFixed(1)} ms</span>
      </span>
      {stats.drops > 0 && (
        <span
          className="status-item warn"
          title="Frame drops logged — see __pm.renderer.watchdogLog in the console"
        >
          Drops <span className="mono">{stats.drops}</span>
        </span>
      )}

      <span className="status-spacer" />

      <span className="status-keys">
        <span>
          <kbd>Esc</kbd> show
        </span>
        <span>
          <kbd>G</kbd> overlays
        </span>
        <span>
          <kbd>B</kbd> blackout
        </span>
        <span>
          <kbd>?</kbd> keys
        </span>
      </span>
    </footer>
  );
}
