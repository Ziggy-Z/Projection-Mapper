import { useState } from 'react';
import { useAppStore } from '../store/store';
import { Panel } from './controls/Panel';
import {
  IconButton,
  IconChevronDown,
  IconChevronUp,
  IconCross,
  IconDuplicate,
  IconPlus,
} from './controls/common';

export function SurfaceListPanel(): React.ReactElement {
  const surfaces = useAppStore((s) => s.project.surfaces);
  const selectedId = useAppStore((s) => s.selectedSurfaceId);
  const selectSurface = useAppStore((s) => s.selectSurface);
  const addSurface = useAppStore((s) => s.addSurface);
  const duplicateSurface = useAppStore((s) => s.duplicateSurface);
  const deleteSurface = useAppStore((s) => s.deleteSurface);
  const moveSurface = useAppStore((s) => s.moveSurface);
  const renameSurface = useAppStore((s) => s.renameSurface);
  const setSurfaceEnabled = useAppStore((s) => s.setSurfaceEnabled);
  const toggleSolo = useAppStore((s) => s.toggleSolo);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [draft, setDraft] = useState('');

  return (
    <Panel id="surfaces" title="Surfaces" note={surfaces.length || undefined}>
      {surfaces.length === 0 && (
        <div className="panel-hint">No surfaces yet — press N to add one.</div>
      )}
      <div className="surface-list">
        {surfaces.map((srf, i) => (
          <div
            key={srf.id}
            className={srf.id === selectedId ? 'surface-row selected' : 'surface-row'}
            onClick={() => selectSurface(srf.id)}
          >
            <span className="mono surface-index">{i + 1}</span>
            <button
              type="button"
              className={srf.enabled ? 'chan-btn on' : 'chan-btn'}
              title={srf.enabled ? 'Disable' : 'Enable'}
              onClick={(e) => {
                e.stopPropagation();
                setSurfaceEnabled(srf.id, !srf.enabled);
              }}
            >
              <svg width="8" height="8" viewBox="0 0 8 8">
                <circle cx="4" cy="4" r="3" fill="currentColor" />
              </svg>
            </button>
            {renaming === srf.id ? (
              <input
                className="text-input row-rename"
                autoFocus
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onFocus={(e) => e.currentTarget.select()}
                onBlur={() => {
                  if (draft.trim()) renameSurface(srf.id, draft.trim());
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
                  setRenaming(srf.id);
                  setDraft(srf.name);
                }}
              >
                {srf.name}
              </span>
            )}
            <button
              type="button"
              className={srf.solo ? 'chan-btn solo on' : 'chan-btn solo'}
              title="Solo (F)"
              onClick={(e) => {
                e.stopPropagation();
                toggleSolo(srf.id);
              }}
            >
              S
            </button>
            <span className="row-actions">
              <IconButton title="Move up" disabled={i === 0} onClick={() => moveSurface(srf.id, -1)}>
                <IconChevronUp />
              </IconButton>
              <IconButton
                title="Move down"
                disabled={i === surfaces.length - 1}
                onClick={() => moveSurface(srf.id, 1)}
              >
                <IconChevronDown />
              </IconButton>
              <IconButton title="Duplicate (Ctrl+D)" onClick={() => duplicateSurface(srf.id)}>
                <IconDuplicate />
              </IconButton>
              <IconButton title="Delete" danger onClick={() => deleteSurface(srf.id)}>
                <IconCross />
              </IconButton>
            </span>
          </div>
        ))}
      </div>
      <button type="button" className="btn add-btn" onClick={addSurface}>
        <IconPlus /> New surface
      </button>
    </Panel>
  );
}
