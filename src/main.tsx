import { createRoot } from 'react-dom/client';
import '@fontsource/archivo/400.css';
import '@fontsource/archivo/500.css';
import '@fontsource/archivo/600.css';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/500.css';
import './styles/tokens.css';
import './styles/app.css';
import { App } from './App';
import { isDesktop } from './model/desktop';
import { useAppStore } from './store/store';
import { initAutosave, migrateBrowserStorage, readStored } from './store/persistence';
import { initScheduler } from './store/scheduler';
import { initRemote } from './remote';

/**
 * Restore the autosaved project before first render: the piece boots straight
 * into Show mode with the prior state, or into the recovery screen — never a
 * crash, never a white page. Reading is async on the desktop (the project is
 * a file, not localStorage), so the first paint is a black frame rather than
 * a blank one — which on a projector is simply an unlit wall.
 */
async function boot(): Promise<void> {
  try {
    await migrateBrowserStorage();
    const stored = await readStored();
    if (stored) {
      if (stored.ok) useAppStore.getState().loadProject(stored.project);
      else useAppStore.getState().setRecovery(stored.raw);
    }
  } catch (e) {
    // A failure here must not cost us the app; start clean and say so.
    console.error('boot: could not restore the stored project', e);
    useAppStore.getState().setNotice('Could not read the stored project.');
  }

  initAutosave();
  initScheduler();
  initRemote();

  document.body.classList.toggle('is-desktop', isDesktop);
  createRoot(document.getElementById('root') as HTMLElement).render(<App />);
}

void boot();
