import type { BlendMode, WarpType } from '../model/types';
import { exportSurfaceSnippet } from '../store/persistence';
import { parseParamSpecs } from '../model/annotations';
import { GRADIENT_BODY, SOLID_BODY } from '../content/shaders';
import { useAppStore } from '../store/store';
import { NumberField } from './controls/NumberField';
import { ParamControls } from './controls/ParamControls';
import { Panel } from './controls/Panel';
import { IconButton, IconCross, IconPlus, SelectField, Toggle } from './controls/common';

const CORNER_NAMES = ['Top left', 'Top right', 'Bottom right', 'Bottom left'];
const BLEND_OPTIONS: { value: BlendMode; label: string }[] = [
  { value: 'normal', label: 'Normal' },
  { value: 'add', label: 'Add' },
  { value: 'screen', label: 'Screen' },
  { value: 'multiply', label: 'Multiply' },
];

export function SurfacePanel(): React.ReactElement | null {
  const surface = useAppStore((s) =>
    s.project.surfaces.find((x) => x.id === s.selectedSurfaceId),
  );
  const source = useAppStore((s) => {
    const srf = s.project.surfaces.find((x) => x.id === s.selectedSurfaceId);
    return srf?.sourceId ? s.project.sources.find((x) => x.id === srf.sourceId) : undefined;
  });
  const selectedHandle = useAppStore((s) => s.selectedHandle);
  const maskEdit = useAppStore((s) => s.maskEdit);
  const outW = useAppStore((s) => s.project.meta.outputWidth);
  const outH = useAppStore((s) => s.project.meta.outputHeight);
  const setCorner = useAppStore((s) => s.setCorner);
  const setWarpType = useAppStore((s) => s.setWarpType);
  const setMeshGrid = useAppStore((s) => s.setMeshGrid);
  const setSurfaceOpacity = useAppStore((s) => s.setSurfaceOpacity);
  const setSurfaceBlend = useAppStore((s) => s.setSurfaceBlend);
  const setSourceParam = useAppStore((s) => s.setSourceParam);
  const setMaskEnabled = useAppStore((s) => s.setMaskEnabled);
  const setMaskFeather = useAppStore((s) => s.setMaskFeather);
  const setMaskInvert = useAppStore((s) => s.setMaskInvert);
  const addMaskPolygon = useAppStore((s) => s.addMaskPolygon);
  const deleteMaskPolygon = useAppStore((s) => s.deleteMaskPolygon);
  const enterMaskEdit = useAppStore((s) => s.enterMaskEdit);
  const exitMaskEdit = useAppStore((s) => s.exitMaskEdit);
  const beginGesture = useAppStore((s) => s.beginGesture);
  const endGesture = useAppStore((s) => s.endGesture);

  if (!surface) return null;
  const corner = selectedHandle != null ? surface.warp.corners[selectedHandle] : null;

  const paramGlsl =
    source?.type === 'shader'
      ? source.glsl ?? ''
      : source?.type === 'solid'
        ? SOLID_BODY
        : source?.type === 'gradient'
          ? GRADIENT_BODY
          : null;
  const specs = paramGlsl != null ? parseParamSpecs(paramGlsl) : [];
  const mergedParams = { ...source?.uniforms, ...surface.sourceParams };

  return (
    <Panel id="surface" title="Surface" note={surface.name}>
      <NumberField
        label="Opacity"
        value={surface.opacity * 100}
        min={0}
        max={100}
        step={0.5}
        keyStep={1}
        decimals={0}
        defaultValue={100}
        suffix=" %"
        onGestureStart={beginGesture}
        onGestureEnd={endGesture}
        onChange={(v) => setSurfaceOpacity(surface.id, v / 100)}
      />
      <SelectField
        label="Blend"
        value={surface.blendMode}
        options={BLEND_OPTIONS}
        onChange={(v) => setSurfaceBlend(surface.id, v)}
      />

      <div className="subsection-title">Warp</div>
      <SelectField
        label="Type"
        value={surface.warp.type}
        options={[
          { value: 'cornerPin' as WarpType, label: 'Corner pin' },
          { value: 'mesh' as WarpType, label: 'Mesh' },
        ]}
        onChange={(v) => setWarpType(surface.id, v)}
      />
      {surface.warp.type === 'mesh' && surface.warp.mesh && (
        <SelectField
          label="Grid"
          value={`${surface.warp.mesh.cols}`}
          options={[
            { value: '2', label: '2 × 2' },
            { value: '3', label: '3 × 3' },
            { value: '4', label: '4 × 4' },
            { value: '6', label: '6 × 6' },
            { value: '8', label: '8 × 8' },
          ]}
          onChange={(v) => setMeshGrid(surface.id, Number(v), Number(v))}
        />
      )}

      {surface.warp.type === 'cornerPin' && corner && selectedHandle != null && (
        <>
          <div className="subsection-title">{CORNER_NAMES[selectedHandle]}</div>
          <NumberField
            label="X"
            value={corner[0] * outW}
            min={-0.5 * outW}
            max={1.5 * outW}
            step={1}
            keyStep={1}
            decimals={1}
            suffix=" px"
            onGestureStart={beginGesture}
            onGestureEnd={endGesture}
            onChange={(v) => setCorner(surface.id, selectedHandle, [v / outW, corner[1]])}
          />
          <NumberField
            label="Y"
            value={corner[1] * outH}
            min={-0.5 * outH}
            max={1.5 * outH}
            step={1}
            keyStep={1}
            decimals={1}
            suffix=" px"
            onGestureStart={beginGesture}
            onGestureEnd={endGesture}
            onChange={(v) => setCorner(surface.id, selectedHandle, [corner[0], v / outH])}
          />
        </>
      )}

      <div className="subsection-title">Mask</div>
      <div className="numfield">
        <span className="nf-label">Enabled</span>
        <Toggle
          checked={surface.mask.enabled}
          onChange={(v) => setMaskEnabled(surface.id, v)}
        />
      </div>
      <NumberField
        label="Feather"
        value={surface.mask.feather * 100}
        min={0}
        max={20}
        step={0.05}
        keyStep={0.1}
        decimals={1}
        defaultValue={2}
        suffix=" %"
        onGestureStart={beginGesture}
        onGestureEnd={endGesture}
        onChange={(v) => setMaskFeather(surface.id, v / 100)}
      />
      {surface.mask.polygons.map((poly, i) => (
        <div className="mask-poly-row" key={i}>
          <button
            type="button"
            className={
              maskEdit?.surfaceId === surface.id && maskEdit.polygonIndex === i
                ? 'btn mini active'
                : 'btn mini'
            }
            onClick={() =>
              maskEdit?.surfaceId === surface.id && maskEdit.polygonIndex === i
                ? exitMaskEdit()
                : enterMaskEdit(surface.id, i)
            }
          >
            Poly {i + 1} · {poly.points.length} pts
          </button>
          <Toggle
            label="Invert"
            checked={poly.invert}
            onChange={(v) => setMaskInvert(surface.id, i, v)}
          />
          <IconButton title="Delete polygon" danger onClick={() => deleteMaskPolygon(surface.id, i)}>
            <IconCross />
          </IconButton>
        </div>
      ))}
      <button type="button" className="btn add-btn" onClick={() => addMaskPolygon(surface.id)}>
        <IconPlus /> Mask polygon (M)
      </button>

      {source && (
        <>
          <div className="subsection-title">{source.name}</div>
          <ParamControls
            specs={specs}
            values={mergedParams}
            onGestureStart={beginGesture}
            onGestureEnd={endGesture}
            onChange={(key, value) => setSourceParam(surface.id, key, value)}
          />
        </>
      )}

      <button
        type="button"
        className="btn add-btn export-btn"
        title="Save this surface (and its source) as a shareable snippet"
        onClick={() => exportSurfaceSnippet(useAppStore.getState().project, surface.id)}
      >
        Export surface
      </button>
    </Panel>
  );
}
