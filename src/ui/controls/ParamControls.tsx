import type { SourceParamValue } from '../../model/types';
import type { ParamSpec } from '../../model/annotations';
import { NumberField } from './NumberField';
import { ColorField, Toggle } from './common';

/**
 * The auto-generated control panel for a source's annotated parameters.
 * Values are the merged (defaults + per-surface override) set; edits write
 * per-surface overrides.
 */
export function ParamControls(props: {
  specs: ParamSpec[];
  values: Record<string, SourceParamValue>;
  onChange: (key: string, value: SourceParamValue) => void;
  onGestureStart?: () => void;
  onGestureEnd?: () => void;
}): React.ReactElement | null {
  if (props.specs.length === 0) return null;
  return (
    <>
      {props.specs.map((spec) => {
        if (spec.kind === 'number') {
          const v = props.values[spec.name];
          const range = spec.max - spec.min;
          return (
            <NumberField
              key={spec.name}
              label={spec.label}
              value={typeof v === 'number' ? v : spec.def}
              min={spec.min}
              max={spec.max}
              step={range / 220}
              keyStep={range / 100}
              decimals={range > 20 ? 0 : 2}
              defaultValue={spec.def}
              onGestureStart={props.onGestureStart}
              onGestureEnd={props.onGestureEnd}
              onChange={(x) => props.onChange(spec.name, x)}
            />
          );
        }
        if (spec.kind === 'color') {
          const v = props.values[spec.name];
          return (
            <ColorField
              key={spec.name}
              label={spec.label}
              value={typeof v === 'string' ? v : spec.def}
              onChange={(hex) => props.onChange(spec.name, hex)}
            />
          );
        }
        const v = props.values[spec.name];
        return (
          <div className="numfield" key={spec.name}>
            <span className="nf-label">{spec.label}</span>
            <Toggle
              checked={typeof v === 'boolean' ? v : spec.def}
              onChange={(x) => props.onChange(spec.name, x)}
            />
          </div>
        );
      })}
    </>
  );
}
