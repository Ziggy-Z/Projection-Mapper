import { useState } from 'react';
import type { Source } from '../model/types';
import { useAppStore } from '../store/store';
import { newId } from '../model/defaults';
import { createShaderSource } from '../model/defaults';
import { parseParamSpecs, specDefaults } from '../model/annotations';
import { BUILTIN_SHADERS, GRADIENT_BODY, SOLID_BODY } from '../content/shaders';
import { putMedia } from '../store/media';
import { exportSourceSnippet } from '../store/persistence';
import { IconButton, IconCross } from './controls/common';

function pickFile(accept: string, onFile: (f: File) => void): void {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = accept;
  input.onchange = () => {
    const f = input.files?.[0];
    if (f) onFile(f);
  };
  input.click();
}

export function SourcesPanel(): React.ReactElement {
  const sources = useAppStore((s) => s.project.sources);
  const selectedSurface = useAppStore((s) =>
    s.project.surfaces.find((x) => x.id === s.selectedSurfaceId),
  );
  const addSource = useAppStore((s) => s.addSource);
  const deleteSource = useAppStore((s) => s.deleteSource);
  const assignSource = useAppStore((s) => s.assignSource);
  const setNotice = useAppStore((s) => s.setNotice);
  const setShaderEditor = useAppStore((s) => s.setShaderEditor);
  const shaderEditorId = useAppStore((s) => s.shaderEditorId);
  const [menuOpen, setMenuOpen] = useState(false);

  const addMedia = (type: 'image' | 'video'): void => {
    pickFile(type === 'image' ? 'image/*' : 'video/*', (file) => {
      const mediaId = newId('med');
      putMedia(mediaId, file)
        .then(() => {
          const source: Source = {
            id: newId('src'),
            type,
            name: file.name.replace(/\.[^.]+$/, ''),
            mediaId,
          };
          addSource(source, { assignToSelected: true });
        })
        .catch(() => setNotice('Could not store the media file.'));
    });
    setMenuOpen(false);
  };

  const addShader = (name: string, glsl: string): void => {
    addSource(createShaderSource(name, glsl), { assignToSelected: true });
    setMenuOpen(false);
  };

  const addSimple = (type: 'solid' | 'gradient'): void => {
    const body = type === 'solid' ? SOLID_BODY : GRADIENT_BODY;
    const source: Source = {
      id: newId('src'),
      type,
      name: type === 'solid' ? 'Solid' : 'Gradient',
      uniforms: specDefaults(parseParamSpecs(body)),
    };
    addSource(source, { assignToSelected: true });
    setMenuOpen(false);
  };

  return (
    <section className="panel panel-sources">
      <h2 className="section-title">Sources</h2>
      {sources.length === 0 && (
        <div className="panel-hint">No sources yet — add one below.</div>
      )}
      <div className="surface-list">
        {sources.map((src) => (
          <div
            key={src.id}
            className={
              selectedSurface?.sourceId === src.id ? 'surface-row selected' : 'surface-row'
            }
            title={selectedSurface ? `Assign to ${selectedSurface.name}` : undefined}
            onClick={() => selectedSurface && assignSource(selectedSurface.id, src.id)}
          >
            <span className="mono source-type">{src.type.slice(0, 3)}</span>
            <span className="surface-name">{src.name}</span>
            <span className="row-actions">
              {src.type === 'shader' && (
                <button
                  type="button"
                  className={shaderEditorId === src.id ? 'btn mini active' : 'btn mini'}
                  onClick={(e) => {
                    e.stopPropagation();
                    setShaderEditor(shaderEditorId === src.id ? null : src.id);
                  }}
                >
                  GLSL
                </button>
              )}
              <button
                type="button"
                className="btn mini"
                title="Save as a shareable snippet"
                onClick={(e) => {
                  e.stopPropagation();
                  exportSourceSnippet(useAppStore.getState().project, src.id);
                }}
              >
                Exp
              </button>
              <IconButton
                title="Delete"
                danger
                onClick={() => deleteSource(src.id)}
              >
                <IconCross />
              </IconButton>
            </span>
          </div>
        ))}
      </div>
      <div className="add-menu-host">
        <button type="button" className="btn add-btn" onClick={() => setMenuOpen(!menuOpen)}>
          Add source
        </button>
        {menuOpen && (
          <div className="add-menu">
            <div className="add-menu-group">Shaders</div>
            {BUILTIN_SHADERS.map((b) => (
              <button
                key={b.name}
                type="button"
                className="add-menu-item"
                onClick={() => addShader(b.name, b.glsl)}
              >
                {b.name}
              </button>
            ))}
            <div className="add-menu-group">Media</div>
            <button type="button" className="add-menu-item" onClick={() => addMedia('image')}>
              Image…
            </button>
            <button type="button" className="add-menu-item" onClick={() => addMedia('video')}>
              Video (loop)…
            </button>
            <div className="add-menu-group">Flat</div>
            <button type="button" className="add-menu-item" onClick={() => addSimple('solid')}>
              Solid
            </button>
            <button type="button" className="add-menu-item" onClick={() => addSimple('gradient')}>
              Gradient
            </button>
          </div>
        )}
      </div>
      <div className="panel-hint">Click a source to assign it to the selected surface.</div>
    </section>
  );
}
