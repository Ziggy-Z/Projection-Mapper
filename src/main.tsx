import { createRoot } from 'react-dom/client';
import '@fontsource/archivo/400.css';
import '@fontsource/archivo/500.css';
import '@fontsource/archivo/600.css';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/500.css';
import './styles/tokens.css';
import './styles/app.css';
import { App } from './App';
import { useAppStore } from './store/store';
import { initAutosave, readStored } from './store/persistence';
import { initScheduler } from './store/scheduler';
import { initRemote } from './remote';

// Restore the autosaved project before first render: the piece boots straight
// into Show mode with the prior state, or into the recovery screen — never a
// crash, never a white page.
const stored = readStored();
if (stored) {
  if (stored.ok) useAppStore.getState().loadProject(stored.project);
  else useAppStore.getState().setRecovery(stored.raw);
}
initAutosave();
initScheduler();
initRemote();

createRoot(document.getElementById('root') as HTMLElement).render(<App />);
