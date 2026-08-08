import type { SourceParamValue } from './types';

/**
 * Shader parameter annotations, parsed from uniform declaration comments:
 *
 *   uniform float u_speed;  // @param  speed  0.0 3.0 0.4  "Speed"
 *   uniform vec3  u_tint;   // @color  tint   #F2A93B      "Tint"
 *   uniform bool  u_invert; // @toggle invert false        "Invert"
 *
 * These drive the auto-generated control panel and the uniform defaults.
 */
export type ParamSpec =
  | { kind: 'number'; name: string; min: number; max: number; def: number; label: string }
  | { kind: 'color'; name: string; def: string; label: string }
  | { kind: 'toggle'; name: string; def: boolean; label: string };

const RE_PARAM = /\/\/\s*@param\s+(\w+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s+"([^"]*)"/;
const RE_COLOR = /\/\/\s*@color\s+(\w+)\s+(#[0-9a-fA-F]{6})\s+"([^"]*)"/;
const RE_TOGGLE = /\/\/\s*@toggle\s+(\w+)\s+(true|false)\s+"([^"]*)"/;

export function parseParamSpecs(glsl: string): ParamSpec[] {
  const specs: ParamSpec[] = [];
  for (const line of glsl.split('\n')) {
    let m = RE_PARAM.exec(line);
    if (m) {
      specs.push({
        kind: 'number',
        name: m[1],
        min: Number(m[2]),
        max: Number(m[3]),
        def: Number(m[4]),
        label: m[5] || m[1],
      });
      continue;
    }
    m = RE_COLOR.exec(line);
    if (m) {
      specs.push({ kind: 'color', name: m[1], def: m[2].toUpperCase(), label: m[3] || m[1] });
      continue;
    }
    m = RE_TOGGLE.exec(line);
    if (m) {
      specs.push({ kind: 'toggle', name: m[1], def: m[2] === 'true', label: m[3] || m[1] });
    }
  }
  return specs;
}

export function specDefaults(specs: ParamSpec[]): Record<string, SourceParamValue> {
  const out: Record<string, SourceParamValue> = {};
  for (const s of specs) out[s.name] = s.def;
  return out;
}
