import { useEffect, useState } from 'react';
import { useAppStore } from '../store/store';
import { remoteStatus, setRemoteEnabled } from '../remote';
import { isDesktop } from '../model/desktop';
import { NumberField } from './controls/NumberField';
import { Panel } from './controls/Panel';
import { Toggle } from './controls/common';

export function OutputPanel(): React.ReactElement {
  const master = useAppStore((s) => s.project.master);
  const setMaster = useAppStore((s) => s.setMaster);
  const beginGesture = useAppStore((s) => s.beginGesture);
  const endGesture = useAppStore((s) => s.endGesture);
  const [remote, setRemote] = useState(false);
  const [urls, setUrls] = useState<string[]>([]);

  // The relay lives in the main process, so it — not this component — is the
  // authority on whether it is actually listening.
  useEffect(() => {
    void remoteStatus().then((s) => {
      setRemote(s.running);
      setUrls(s.urls);
    });
  }, []);

  return (
    <Panel id="output" title="Output">
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
        <span
          className="nf-label"
          title={
            isDesktop
              ? 'Serve a phone-sized remote to this machine’s network'
              : 'Desktop build only'
          }
        >
          LAN remote
        </span>
        <Toggle
          checked={remote}
          onChange={(v) => {
            setRemote(v);
            void setRemoteEnabled(v).then(setUrls);
          }}
        />
      </div>
      {remote && urls.length > 0 && (
        <div className="remote-urls">
          {urls.map((u) => (
            <div key={u} className="mono remote-url" title="Open this on a phone on the same network">
              {u}
            </div>
          ))}
        </div>
      )}
      {remote && urls.length === 0 && (
        <div className="panel-hint">
          {isDesktop
            ? 'Could not start — port 9270 may already be in use.'
            : 'The LAN remote needs the desktop build.'}
        </div>
      )}
    </Panel>
  );
}
