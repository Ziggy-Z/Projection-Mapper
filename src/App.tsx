import { useEffect } from 'react';
import { useAppStore } from './store/store';
import { CanvasHost } from './ui/CanvasHost';
import { HandlesLayer } from './ui/HandlesLayer';
import { ProjectPanel } from './ui/ProjectPanel';
import { SurfacePanel } from './ui/SurfacePanel';
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
        className={`chrome${mode === 'show' ? ' hidden' : ''}${dim ? ' dim' : ''}`}
      >
        <HandlesLayer />
        <ProjectPanel />
        <SurfacePanel />
        <FaderRail />
        <Countdown />
        <Notice />
        <HelpOverlay />
      </div>
      {recovery != null && <RecoveryScreen raw={recovery} />}
    </>
  );
}
