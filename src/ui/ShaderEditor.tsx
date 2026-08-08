import { useEffect, useRef, useState } from 'react';
import { parseParamSpecs, specDefaults } from '../model/annotations';
import { useAppStore } from '../store/store';
import { getRenderer } from '../runtime';

/**
 * Inline GLSL editing with live recompile on a 300ms debounce. A compile
 * failure keeps the last good program on the wall and surfaces the raw
 * compiler error (with line numbers aligned to this text) here.
 */
export function ShaderEditor(): React.ReactElement | null {
  const sourceId = useAppStore((s) => s.shaderEditorId);
  const source = useAppStore((s) =>
    s.shaderEditorId ? s.project.sources.find((x) => x.id === s.shaderEditorId) : undefined,
  );
  const updateSourceGlsl = useAppStore((s) => s.updateSourceGlsl);
  const setShaderEditor = useAppStore((s) => s.setShaderEditor);

  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const debounce = useRef<number | undefined>(undefined);
  const editedId = useRef<string | null>(null);

  // Load the source text when the editor opens or targets a new source.
  useEffect(() => {
    if (source && editedId.current !== source.id) {
      editedId.current = source.id;
      setText(source.glsl ?? '');
    }
    if (!source) editedId.current = null;
  }, [source]);

  // Poll the renderer for this source's compile status.
  useEffect(() => {
    if (!sourceId) return;
    const id = window.setInterval(() => {
      setError(getRenderer()?.getSourceError(sourceId) ?? null);
    }, 400);
    return () => window.clearInterval(id);
  }, [sourceId]);

  if (!source || source.type !== 'shader') return null;

  const commit = (value: string): void => {
    const specs = parseParamSpecs(value);
    const defaults = specDefaults(specs);
    // Keep existing values for params that survive the edit.
    const merged = { ...defaults };
    for (const key of Object.keys(defaults)) {
      const prev = source.uniforms?.[key];
      if (prev !== undefined) merged[key] = prev;
    }
    updateSourceGlsl(source.id, value, merged);
  };

  const onChange = (value: string): void => {
    setText(value);
    window.clearTimeout(debounce.current);
    debounce.current = window.setTimeout(() => commit(value), 300);
  };

  return (
    <section className="panel shader-editor">
      <div className="editor-head">
        <h2 className="section-title">{source.name}</h2>
        <button type="button" className="btn mini" onClick={() => setShaderEditor(null)}>
          Close
        </button>
      </div>
      <textarea
        className="glsl-text mono"
        spellCheck={false}
        value={text}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => e.stopPropagation()}
      />
      <div className={error ? 'compile-bar error' : 'compile-bar'}>
        {error ? error.split('\n')[0] : 'Compiled'}
      </div>
    </section>
  );
}
