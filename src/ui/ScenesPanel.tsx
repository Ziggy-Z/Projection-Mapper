import { useState } from 'react';
import { useAppStore } from '../store/store';
import { startSceneTransition } from '../store/transitions';
import { NumberField } from './controls/NumberField';
import { Panel } from './controls/Panel';
import { IconButton, IconCross, IconPlus } from './controls/common';

/** Named looks with timed crossfades — cues, in desk terms. */
export function ScenesPanel(): React.ReactElement {
  const scenes = useAppStore((s) => s.project.scenes);
  const captureScene = useAppStore((s) => s.captureScene);
  const updateScene = useAppStore((s) => s.updateScene);
  const deleteScene = useAppStore((s) => s.deleteScene);
  const renameScene = useAppStore((s) => s.renameScene);
  const [fadeSec, setFadeSec] = useState(4);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [draft, setDraft] = useState('');

  return (
    <Panel id="scenes" title="Scenes" note={scenes.length || undefined}>
      {scenes.length === 0 && (
        <div className="panel-hint">
          No scenes yet — set the look you want, then capture it.
        </div>
      )}
      <div className="surface-list">
        {scenes.map((scene) => (
          <div key={scene.id} className="surface-row">
            {renaming === scene.id ? (
              <input
                className="text-input row-rename"
                autoFocus
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onFocus={(e) => e.currentTarget.select()}
                onBlur={() => {
                  if (draft.trim()) renameScene(scene.id, draft.trim());
                  setRenaming(null);
                }}
                onKeyDown={(e) => {
                  e.stopPropagation();
                  if (e.key === 'Enter') e.currentTarget.blur();
                  if (e.key === 'Escape') setRenaming(null);
                }}
              />
            ) : (
              <span
                className="surface-name"
                title="Double-click to rename"
                onDoubleClick={() => {
                  setRenaming(scene.id);
                  setDraft(scene.name);
                }}
              >
                {scene.name}
              </span>
            )}
            <button
              type="button"
              className="btn mini"
              title={`Crossfade over ${fadeSec}s`}
              onClick={() => startSceneTransition(scene.id, fadeSec)}
            >
              Go
            </button>
            <button
              type="button"
              className="btn mini"
              title="Overwrite this scene with the current look"
              onClick={() => updateScene(scene.id)}
            >
              Set
            </button>
            <IconButton title="Delete scene" danger onClick={() => deleteScene(scene.id)}>
              <IconCross />
            </IconButton>
          </div>
        ))}
      </div>
      <NumberField
        label="Fade"
        value={fadeSec}
        min={0}
        max={600}
        step={0.25}
        keyStep={1}
        decimals={1}
        defaultValue={4}
        suffix=" s"
        onChange={setFadeSec}
      />
      <button
        type="button"
        className="btn add-btn"
        onClick={() => captureScene(`Scene ${scenes.length + 1}`)}
      >
        <IconPlus /> Capture scene
      </button>
    </Panel>
  );
}
