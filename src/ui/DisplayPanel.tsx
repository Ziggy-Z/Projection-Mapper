import { useCallback, useEffect, useState } from 'react';
import type { DisplayInfo } from '../model/desktop';
import { desktop } from '../model/desktop';
import { useAppStore } from '../store/store';
import { Panel } from './controls/Panel';
import { Toggle } from './controls/common';

/**
 * Which physical output the show goes to. This is machine configuration, not
 * part of the project — a piece moved to a different venue keeps its mapping
 * but picks its projector again.
 */
export function DisplayPanel(): React.ReactElement | null {
  const outW = useAppStore((s) => s.project.meta.outputWidth);
  const outH = useAppStore((s) => s.project.meta.outputHeight);
  const setOutputSize = useAppStore((s) => s.setOutputSize);
  const setNotice = useAppStore((s) => s.setNotice);

  const [displays, setDisplays] = useState<DisplayInfo[]>([]);
  const [fullScreen, setFullScreen] = useState(false);
  const [keepAwake, setKeepAwake] = useState(true);
  const [autoLaunch, setAutoLaunch] = useState(false);

  const refresh = useCallback(() => {
    if (!desktop) return;
    void desktop.listDisplays().then(setDisplays);
  }, []);

  useEffect(() => {
    if (!desktop) return;
    refresh();
    void desktop.isFullScreen().then(setFullScreen);
    void desktop.getKeepAwake().then(setKeepAwake);
    void desktop.getAutoLaunch().then(setAutoLaunch);
    const offDisplays = desktop.onDisplaysChanged(refresh);
    const offFull = desktop.onFullScreenChanged((on) => {
      setFullScreen(on);
      refresh();
    });
    return () => {
      offDisplays();
      offFull();
    };
  }, [refresh]);

  // Narrowing does not survive into the callbacks below, so bind it once.
  const api = desktop;
  if (!api) return null;

  const current = displays.find((d) => d.current);
  const mismatch =
    current != null && (current.width !== outW || current.height !== outH);

  return (
    <Panel id="display" title="Display" note={current ? `${current.width}×${current.height}` : undefined}>
      <div className="numfield">
        <span className="nf-label">Output</span>
        <select
          className="select"
          aria-label="Output display"
          value={current ? String(current.id) : ''}
          onChange={(e) => {
            void api.moveToDisplay(Number(e.target.value)).then(() => refresh());
          }}
        >
          {displays.length === 0 && <option value="">—</option>}
          {displays.map((d) => (
            <option key={d.id} value={String(d.id)}>
              {d.label}
              {d.primary ? ' (primary)' : ''}
            </option>
          ))}
        </select>
      </div>

      {displays.map((d) => (
        <div key={d.id} className={d.current ? 'display-row current' : 'display-row'}>
          <span className="display-dot" />
          <span className="display-name">{d.label}</span>
          <span className="mono display-res">
            {d.width}×{d.height}
          </span>
        </div>
      ))}

      <div className="numfield">
        <span className="nf-label">Fullscreen</span>
        <Toggle
          checked={fullScreen}
          title="F11"
          onChange={(v) => {
            void api.setFullScreen(v).then(setFullScreen);
          }}
        />
      </div>

      {mismatch && (
        <button
          type="button"
          className="btn wide"
          title="Set the project's output resolution to this display's native size"
          onClick={() => {
            setOutputSize(current.width, current.height);
            setNotice(`Output set to ${current.width} × ${current.height}.`);
          }}
        >
          Match {current.width} × {current.height}
        </button>
      )}

      <div className="subsection-title">Installation</div>
      <div className="numfield">
        <span className="nf-label" title="Prevents the projector going to sleep">
          Keep display awake
        </span>
        <Toggle
          checked={keepAwake}
          onChange={(v) => {
            void api.setKeepAwake(v).then(setKeepAwake);
          }}
        />
      </div>
      <div className="numfield">
        <span className="nf-label" title="Start the app when this machine boots">
          Launch at login
        </span>
        <Toggle
          checked={autoLaunch}
          onChange={(v) => {
            void api.setAutoLaunch(v).then(setAutoLaunch);
          }}
        />
      </div>
    </Panel>
  );
}
