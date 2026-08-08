import { useAppStore } from '../store/store';
import { openProjectFromFile, saveProjectToFile } from '../store/persistence';
import { defaultProject } from '../model/defaults';

export function ProjectPanel(): React.ReactElement {
  const name = useAppStore((s) => s.project.meta.name);
  const outW = useAppStore((s) => s.project.meta.outputWidth);
  const outH = useAppStore((s) => s.project.meta.outputHeight);
  const setProjectName = useAppStore((s) => s.setProjectName);
  const loadProject = useAppStore((s) => s.loadProject);

  return (
    <section className="panel panel-project">
      <h2 className="section-title">Project</h2>
      <input
        className="text-input"
        value={name}
        aria-label="Project name"
        onChange={(e) => setProjectName(e.target.value)}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Enter' || e.key === 'Escape') e.currentTarget.blur();
        }}
      />
      <div className="meta-row">
        <span className="meta-label">Output</span>
        <span className="mono">{outW} × {outH}</span>
      </div>
      <div className="btn-row">
        <button
          type="button"
          className="btn"
          onClick={() => void saveProjectToFile(useAppStore.getState().project)}
        >
          Save
        </button>
        <button type="button" className="btn" onClick={openProjectFromFile}>
          Load
        </button>
        <button
          type="button"
          className="btn"
          onClick={() => {
            if (window.confirm('Replace the current project with a blank one?')) {
              loadProject(defaultProject());
            }
          }}
        >
          New
        </button>
      </div>
      <div className="panel-hint">Esc show · G overlays · ? keys</div>
    </section>
  );
}
