import { useEffect, useState } from 'react';
import { useAppStore } from '../store/store';
import { getRenderer } from '../runtime';
import { remoteEnabled, setRemoteEnabled } from '../remote';
import { NumberField } from './controls/NumberField';
import { Toggle } from './controls/common';

export function OutputPanel(): React.ReactElement {
  const master = useAppStore((s) => s.project.master);
  const setMaster = useAppStore((s) => s.setMaster);
  const beginGesture = useAppStore((s) => s.beginGesture);
  const endGesture = useAppStore((s) => s.endGesture);
  const [drops, setDrops] = useState(0);
  const [remote, setRemote] = useState(remoteEnabled);

  useEffect(() => {
    const id = window.setInterval(() => {
      setDrops(getRenderer()?.stats.dropEvents ?? 0);
    }, 2000);
    return () => window.clearInterval(id);
  }, []);

  return (
    <section className="panel panel-output">
      <h2 className="section-title">Output</h2>
      <NumberField
        label="Gamma"
        value={master.gamma}
        min={0.5}
        max={6}
        step={0.01}
        keyStep={0.05}
        decimals={2}
        defaultValue={2.2}
        onGestureStart={beginGesture}
        onGestureEnd={endGesture}
        onChange={(v) => setMaster({ gamma: v }, 'master.gamma')}
      />
      <NumberField
        label="Black lift"
        value={master.blackLift * 100}
        min={0}
        max={10}
        step={0.05}
        keyStep={0.1}
        decimals={1}
        defaultValue={0}
        suffix=" %"
        onGestureStart={beginGesture}
        onGestureEnd={endGesture}
        onChange={(v) => setMaster({ blackLift: v / 100 }, 'master.blackLift')}
      />
      <NumberField
        label="Temperature"
        value={master.temperature}
        min={-100}
        max={100}
        step={0.5}
        keyStep={1}
        decimals={0}
        defaultValue={0}
        onGestureStart={beginGesture}
        onGestureEnd={endGesture}
        onChange={(v) => setMaster({ temperature: v }, 'master.temperature')}
      />
      <div className="numfield">
        <span className="nf-label" title="Needs server/remote.mjs running on this machine">
          LAN remote
        </span>
        <Toggle
          checked={remote}
          onChange={(v) => {
            setRemote(v);
            setRemoteEnabled(v);
          }}
        />
      </div>
      {drops > 0 && (
        <div className="panel-hint">
          Frame drops logged: <span className="mono drop-count">{drops}</span>
          {' '}(see <span className="mono">__pm.renderer.watchdogLog</span>)
        </div>
      )}
    </section>
  );
}
