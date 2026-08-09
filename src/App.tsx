import { useEffect } from 'react';
import { useAppStore } from './store/store';
import { CanvasHost } from './ui/CanvasHost';
import { HandlesLayer } from './ui/HandlesLayer';
import { MaskLayer } from './ui/MaskLayer';
import { TopBar } from './ui/TopBar';
import { StatusBar } from './ui/StatusBar';
import { SurfaceListPanel } from './ui/SurfaceListPanel';
import { SurfacePanel } from './ui/SurfacePanel';
import { SourcesPanel } from './ui/SourcesPanel';
import { OutputPanel } from './ui/OutputPanel';
import { ScenesPanel } from './ui/ScenesPanel';
import { SchedulePanel } from './ui/SchedulePanel';
import { ShaderEditor } from './ui/ShaderEditor';
import { FaderRail } from './ui/FaderRail';
import { HelpOverlay } from './ui/HelpOverlay';
import { Countdown } from './ui/Countdown';
import { Notice } from './ui/Notice';
import { RecoveryScreen } from './ui/RecoveryScreen';
import { useKeyboard } from './ui/useKeyboard';
import { useModeMachine } from './ui/useModeMachine';
import { useWakeLock } from './ui/useWakeLock';

export function App(): React.ReactElement {
  useKeyboard();
  useModeMachine();
  useWakeLock();

  const mode = useAppStore((s) => s.mode);
  const recovery = useAppStore((s) => s.recoveryRaw);
  const dim = useAppStore((s) => s.dimChrome);

  useEffect(() => {
    document.body.classList.toggle('mode-show', mode === 'show' && recovery == null);
  }, [mode, recovery]);

  return (
    <>
      <CanvasHost />
      <div
        id="chrome"
        className={`chrome${mode === 'show' ? ' hidden' : ''}${dim ? ' dim' : ''}`}
      >
        <HandlesLayer />
        <MaskLayer />
        <TopBar />
        <aside className="rail rail-left">
          <div className="rail-scroll">
            <SurfaceListPanel />
            <SurfacePanel />
          </div>
        </aside>
        <aside className="rail rail-right">
          <div className="rail-scroll">
            <SourcesPanel />
            <ScenesPanel />
            <SchedulePanel />
            <OutputPanel />
          </div>
          <div className="rail-foot">
            <FaderRail />
          </div>
        </aside>
        <ShaderEditor />
        <StatusBar />
        <Countdown />
        <Notice />
        <HelpOverlay />
      </div>
      {recovery != null && <RecoveryScreen raw={recovery} />}
    </>
  );
}
