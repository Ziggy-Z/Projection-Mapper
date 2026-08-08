import { useAppStore } from '../store/store';

const KEYS: [string, string][] = [
  ['Esc', 'Edit / Show mode (exits mask edit first)'],
  ['B', 'Blackout'],
  ['\\', 'Dim chrome'],
  ['Tab / Shift+Tab', 'Cycle surface'],
  ['1–9', 'Select surface by index'],
  ['N', 'New surface'],
  ['Ctrl+D', 'Duplicate surface'],
  ['Del', 'Delete surface / mask point'],
  ['F', 'Solo selected surface'],
  ['M', 'Mask edit for selected surface'],
  ['Enter', 'Close mask polygon and exit'],
  ['G', 'Overlays: grid / checker / fill / outlines'],
  ['H', 'Handle visibility'],
  ['Arrows', 'Nudge corner 1px'],
  ['Shift+Arrows', 'Nudge 10px'],
  ['Alt+Arrows', 'Nudge 0.1px'],
  ['Ctrl+S', 'Save project'],
  ['Ctrl+Z / Ctrl+Shift+Z', 'Undo / Redo'],
  ['?', 'This reference'],
];

export function HelpOverlay(): React.ReactElement | null {
  const open = useAppStore((s) => s.helpOpen);
  const setHelpOpen = useAppStore((s) => s.setHelpOpen);
  if (!open) return null;
  return (
    <div className="help-backdrop" onClick={() => setHelpOpen(false)}>
      <section className="panel help-panel" onClick={(e) => e.stopPropagation()}>
        <h2 className="section-title">Keyboard</h2>
        <table className="help-table">
          <tbody>
            {KEYS.map(([key, action]) => (
              <tr key={key}>
                <td className="mono help-key">{key}</td>
                <td>{action}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
