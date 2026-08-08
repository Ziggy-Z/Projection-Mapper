/** Internal pipeline shaders. Content shaders live in src/content. */

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
 * Corner-pin composite. v_tc is (u*w, v*w, w); dividing by w in the fragment
 * shader gives projectively correct texture coordinates across both
 * triangles — this is what prevents the diagonal seam.
 */
export const WARP_FS = `#version 300 es
precision highp float;
uniform sampler2D u_tex;
uniform float u_opacity;
in vec3 v_tc;
out vec4 outColor;
void main() {
  vec2 uv = v_tc.xy / v_tc.z;
  vec4 c = texture(u_tex, vec2(uv.x, 1.0 - uv.y));
  outColor = vec4(c.rgb, c.a * u_opacity);
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

/**
 * Header prepended to every content shader body. #line 1 keeps compiler
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
#line 1
`;
