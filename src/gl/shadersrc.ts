/** Internal pipeline shaders. Content shaders live in src/content. */

export const MAX_MASK_POINTS = 64;
export const MAX_MASK_POLYS = 8;

export const FULLSCREEN_VS = `#version 300 es
layout(location = 0) in vec2 a_pos;
out vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}
`;

export const WARP_VS = `#version 300 es
layout(location = 0) in vec2 a_pos;
layout(location = 1) in vec3 a_tc;
out vec3 v_tc;
void main() {
  v_tc = a_tc;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}
`;

/**
 * Corner-pin composite with mask and blend preparation.
 *
 * v_tc is (u/w, v/w, 1/w); dividing by z reconstructs projectively correct
 * UVs across both triangles — this is what prevents the diagonal seam.
 *
 * The mask is evaluated here in surface UV space as a signed-distance
 * falloff (cheaper and crisper than a blur pass). Non-inverted polygons
 * union; inverted polygons then cut.
 *
 * Output is premultiplied alpha, except in multiply-prep mode where the
 * color is mixed toward white so (DST_COLOR, ZERO) blending is correct.
 */
export const WARP_FS = `#version 300 es
precision highp float;
uniform sampler2D u_tex;
uniform float u_opacity;
uniform int u_blendPrep;                       // 0 premultiply, 1 multiply-prep
uniform int u_maskCount;
uniform ivec2 u_maskRange[${MAX_MASK_POLYS}];  // start, count into u_maskPts
uniform int u_maskInvert[${MAX_MASK_POLYS}];
uniform vec2 u_maskPts[${MAX_MASK_POINTS}];
uniform float u_maskFeather;
in vec3 v_tc;
out vec4 outColor;

float polyAlpha(int start, int count, vec2 p) {
  float dmin = 1e9;
  bool inside = false;
  for (int i = 0; i < count; i++) {
    vec2 a = u_maskPts[start + i];
    vec2 b = u_maskPts[start + (i + 1) % count];
    vec2 e = b - a;
    vec2 w = p - a;
    float t = clamp(dot(w, e) / max(dot(e, e), 1e-12), 0.0, 1.0);
    dmin = min(dmin, length(w - e * t));
    if ((a.y > p.y) != (b.y > p.y)) {
      float x = a.x + (p.y - a.y) * (b.x - a.x) / (b.y - a.y);
      if (x > p.x) inside = !inside;
    }
  }
  float sd = inside ? dmin : -dmin;
  float f = max(u_maskFeather, 1e-4);
  return smoothstep(-0.5 * f, 0.5 * f, sd);
}

void main() {
  vec2 uv = v_tc.xy / v_tc.z;
  vec4 c = texture(u_tex, vec2(uv.x, 1.0 - uv.y));
  float alpha = c.a * u_opacity;
  if (u_maskCount > 0) {
    float m = 0.0;
    bool anyUnion = false;
    for (int k = 0; k < u_maskCount; k++) {
      if (u_maskInvert[k] == 0) {
        m = max(m, polyAlpha(u_maskRange[k].x, u_maskRange[k].y, uv));
        anyUnion = true;
      }
    }
    if (!anyUnion) m = 1.0;
    for (int k = 0; k < u_maskCount; k++) {
      if (u_maskInvert[k] == 1) {
        m *= 1.0 - polyAlpha(u_maskRange[k].x, u_maskRange[k].y, uv);
      }
    }
    alpha *= m;
  }
  if (u_blendPrep == 1) {
    outColor = vec4(mix(vec3(1.0), c.rgb, alpha), 1.0);
  } else {
    outColor = vec4(c.rgb * alpha, alpha);
  }
}
`;

/** Master pass: black lift, temperature, gamma, then grand master brightness. */
export const MASTER_FS = `#version 300 es
precision highp float;
uniform sampler2D u_tex;
uniform float u_blackLift;
uniform float u_temperature; // -1..1, cool..warm
uniform float u_gammaExp;    // 2.2 / gamma, 1.0 is neutral
uniform float u_brightness;  // grand master x blackout fade
in vec2 v_uv;
out vec4 outColor;
void main() {
  vec3 c = texture(u_tex, v_uv).rgb;
  c = u_blackLift + c * (1.0 - u_blackLift);
  vec3 warm = vec3(1.00, 0.89, 0.76);
  vec3 cool = vec3(0.78, 0.90, 1.00);
  vec3 tint = u_temperature >= 0.0
    ? mix(vec3(1.0), warm, u_temperature)
    : mix(vec3(1.0), cool, -u_temperature);
  c *= tint;
  c = pow(max(c, vec3(0.0)), vec3(u_gammaExp));
  outColor = vec4(c * u_brightness, 1.0);
}
`;

/**
 * Calibration checker, rendered as the surface source so it goes through the
 * warp — the whole point is verifying the warp itself.
 */
export const CHECKER_FS = `#version 300 es
precision highp float;
uniform vec2 u_squares;
in vec2 v_uv;
out vec4 outColor;
void main() {
  vec2 g = floor(v_uv * u_squares);
  float c = mod(g.x + g.y, 2.0);
  vec3 col = mix(vec3(0.05, 0.06, 0.08), vec3(0.88), c);
  vec2 b = min(v_uv, 1.0 - v_uv);
  float edge = 1.0 - step(0.006, min(b.x, b.y));
  col = mix(col, vec3(0.949, 0.663, 0.231), edge);
  outColor = vec4(col, 1.0);
}
`;

/** Per-surface identification fill: flat color, brighter UV border. */
export const FILL_FS = `#version 300 es
precision highp float;
uniform vec3 u_color;
in vec2 v_uv;
out vec4 outColor;
void main() {
  vec2 b = min(v_uv, 1.0 - v_uv);
  float edge = 1.0 - step(0.008, min(b.x, b.y));
  outColor = vec4(mix(u_color * 0.55, vec3(0.95), edge), 1.0);
}
`;

/** Surface outline only: transparent interior, hairline UV border. */
export const OUTLINE_SRC_FS = `#version 300 es
precision highp float;
uniform vec3 u_color;
in vec2 v_uv;
out vec4 outColor;
void main() {
  vec2 b = min(v_uv, 1.0 - v_uv);
  float edge = 1.0 - step(0.004, min(b.x, b.y));
  outColor = vec4(u_color, edge);
}
`;

/** Straight texture blit for image/video sources. */
export const BLIT_FS = `#version 300 es
precision highp float;
uniform sampler2D u_tex;
in vec2 v_uv;
out vec4 outColor;
void main() {
  outColor = texture(u_tex, vec2(v_uv.x, 1.0 - v_uv.y));
}
`;

/** Output-space alignment grid: 64px minor, 256px major, center cross, border. */
export const GRID_FS = `#version 300 es
precision highp float;
uniform vec2 u_resolution;
out vec4 outColor;
float gridLine(float coord, float spacing, float halfWidth) {
  float d = abs(mod(coord + spacing * 0.5, spacing) - spacing * 0.5);
  return 1.0 - step(halfWidth, d);
}
void main() {
  vec2 px = gl_FragCoord.xy;
  vec2 center = u_resolution * 0.5;
  float minor = max(gridLine(px.x, 64.0, 0.5), gridLine(px.y, 64.0, 0.5));
  float major = max(gridLine(px.x, 256.0, 0.75), gridLine(px.y, 256.0, 0.75));
  float cross_ = max(1.0 - step(0.75, abs(px.x - center.x)),
                     1.0 - step(0.75, abs(px.y - center.y)));
  vec2 be = min(px, u_resolution - px);
  float border = 1.0 - step(2.0, min(be.x, be.y));
  vec3 cyan = vec3(0.310, 0.820, 0.878);
  float a = max(max(minor * 0.30, major * 0.50), max(cross_ * 0.85, border));
  vec3 col = mix(cyan, vec3(0.92), border);
  outColor = vec4(col, a);
}
`;

/** Safe-area border at 5% inset, drawn output-space in outline overlay mode. */
export const SAFE_FS = `#version 300 es
precision highp float;
uniform vec2 u_resolution;
out vec4 outColor;
void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution;
  vec2 d = abs(uv - 0.5);
  float inBand = step(max(d.x - 0.45, d.y - 0.45), 0.0);
  float nearEdge = step(0.448, max(d.x, d.y));
  float line = inBand * nearEdge;
  outColor = vec4(vec3(0.92), line * 0.8);
}
`;

/**
 * Header prepended to every content shader body. #line 0 keeps compiler
 * error line numbers aligned with the body the user edits.
 */
export const SOURCE_HEADER = `#version 300 es
precision highp float;
uniform float u_time;
uniform vec2  u_resolution;
uniform int   u_frame;
uniform vec4  u_random;
in vec2 v_uv;
out vec4 outColor;
#line 0
`;
