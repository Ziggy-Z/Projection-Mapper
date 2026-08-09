import { useAppStore } from '../store/store';
import { downloadText, openProjectFromFile } from '../store/persistence';
import { defaultProject } from '../model/defaults';

/**
 * Shown when the autosaved project fails to parse at boot. The damaged text
 * is preserved and offered back; autosave stays off until the user decides.
 */
export function RecoveryScreen(props: { raw: string }): React.ReactElement {
  const loadProject = useAppStore((s) => s.loadProject);
  return (
    <div className="recovery">
      <section className="panel floating recovery-panel">
        <div className="panel-body">
          <h2 className="section-title alarm">Stored project unreadable</h2>
          <p>
            The autosaved project could not be parsed. Nothing has been
            overwritten.
          </p>
          <div className="btn-row">
            <button
              type="button"
              className="btn"
              onClick={() => downloadText('project-damaged.json', props.raw)}
            >
              Save damaged copy
            </button>
            <button type="button" className="btn" onClick={openProjectFromFile}>
              Load a file
            </button>
            <button
              type="button"
              className="btn accent"
              onClick={() => loadProject(defaultProject())}
            >
              Start fresh
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
