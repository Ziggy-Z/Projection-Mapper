import { useAppStore } from '../store/store';
import {
  importSnippetFromFile,
  openProjectFromFile,
  saveProjectToFile,
} from '../store/persistence';
import { defaultProject } from '../model/defaults';
import {
  IconButton,
  IconDim,
  IconFile,
  IconGrid,
  IconHandles,
  IconHelp,
  IconOpen,
  IconSave,
} from './controls/common';

const OVERLAY_LABEL: Record<string, string> = {
  off: 'Overlays off',
  grid: 'Overlay: grid',
  checker: 'Overlay: checker',
  fill: 'Overlay: fill',
  outline: 'Overlay: outlines',
};

/**
 * The command bar: project identity, file actions, the Edit/Show switch and
 * the calibration overlay toggles. Everything global lives here so the rails
 * are free to be about the show itself.
 */
export function TopBar(): React.ReactElement {
  const name = useAppStore((s) => s.project.meta.name);
  const outW = useAppStore((s) => s.project.meta.outputWidth);
  const outH = useAppStore((s) => s.project.meta.outputHeight);
  const mode = useAppStore((s) => s.mode);
  const overlay = useAppStore((s) => s.overlay);
  const handlesVisible = useAppStore((s) => s.handlesVisible);
  const dim = useAppStore((s) => s.dimChrome);
  const setProjectName = useAppStore((s) => s.setProjectName);
  const loadProject = useAppStore((s) => s.loadProject);
  const setMode = useAppStore((s) => s.setMode);
  const cycleOverlay = useAppStore((s) => s.cycleOverlay);
  const toggleHandles = useAppStore((s) => s.toggleHandles);
  const toggleDimChrome = useAppStore((s) => s.toggleDimChrome);
  const setHelpOpen = useAppStore((s) => s.setHelpOpen);

  return (
    <header className="topbar">
      <span className="app-mark" aria-hidden="true">
        <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round">
          <path d="M2 4.2l6-2.4 6 2.4-6 3.1z" />
          <path d="M2 4.2v7.6l6 2.4V7.3M14 4.2v7.6l-6 2.4" />
        </svg>
      </span>
      <input
        className="project-name"
        value={name}
        aria-label="Project name"
        spellCheck={false}
        onChange={(e) => setProjectName(e.target.value)}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Enter' || e.key === 'Escape') e.currentTarget.blur();
        }}
      />

      <span className="bar-sep" />

      <IconButton
        title="Save project (Ctrl+S)"
        onClick={() => void saveProjectToFile(useAppStore.getState().project)}
      >
        <IconSave />
      </IconButton>
      <IconButton title="Load project" onClick={openProjectFromFile}>
        <IconOpen />
      </IconButton>
      <IconButton
        title="New project"
        onClick={() => {
          if (window.confirm('Replace the current project with a blank one?')) {
            loadProject(defaultProject());
          }
        }}
      >
        <IconFile />
      </IconButton>
      <button type="button" className="btn mini" onClick={importSnippetFromFile}>
        Import snippet
      </button>

      <span className="topbar-spacer" />

      <div className="segmented" role="group" aria-label="Mode">
        <button type="button" aria-pressed={mode === 'edit'} onClick={() => setMode('edit')}>
          Edit
        </button>
        <button
          type="button"
          className="live"
          aria-pressed={mode === 'show'}
          onClick={() => setMode('show')}
        >
          Show
        </button>
      </div>

      <span className="topbar-spacer" />

      <span className="chip" title="Output resolution">
        <span className="chip-key">Out</span>
        {outW} × {outH}
      </span>

      <span className="bar-sep" />

      <IconButton
        title={`${OVERLAY_LABEL[overlay] ?? 'Overlays'} — cycle (G)`}
        pressed={overlay !== 'off'}
        onClick={cycleOverlay}
      >
        <IconGrid />
      </IconButton>
      <IconButton title="Handle visibility (H)" pressed={handlesVisible} onClick={toggleHandles}>
        <IconHandles />
      </IconButton>
      <IconButton title="Dim chrome (\)" pressed={dim} onClick={toggleDimChrome}>
        <IconDim />
      </IconButton>
      <IconButton title="Keyboard reference (?)" onClick={() => setHelpOpen(true)}>
        <IconHelp />
      </IconButton>
    </header>
  );
}
