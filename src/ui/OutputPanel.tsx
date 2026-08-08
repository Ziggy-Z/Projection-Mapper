import { useEffect, useState } from 'react';
import { useAppStore } from '../store/store';
import { getRenderer } from '../runtime';
import { NumberField } from './controls/NumberField';

export function OutputPanel(): React.ReactElement {
  const master = useAppStore((s) => s.project.master);
  const setMaster = useAppStore((s) => s.setMaster);
  const beginGesture = useAppStore((s) => s.beginGesture);
  const endGesture = useAppStore((s) => s.endGesture);
  const [drops, setDrops] = useState(0);

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
      {drops > 0 && (
        <div className="panel-hint">
          Frame drops logged: <span className="mono drop-count">{drops}</span>
          {' '}(see <span className="mono">__pm.renderer.watchdogLog</span>)
        </div>
      )}
    </section>
  );
}
