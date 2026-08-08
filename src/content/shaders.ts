/**
 * Built-in content shaders. These are shader *bodies*: the GL runtime prepends
 * the version/precision header and the built-in uniform declarations
 * (u_time, u_resolution, u_frame, u_random, v_uv).
 *
 * The @param/@color annotations are the Phase 2 auto-control format; they are
 * inert comments until then.
 */

export const SLOW_DRIFT = `uniform float u_speed;  // @param  speed 0.0 3.0 0.4  "Speed"
uniform float u_level;  // @param  level 0.0 1.0 0.55 "Level"
uniform vec3  u_tint;   // @color  tint  #F2A93B      "Tint"
uniform vec3  u_base;   // @color  base  #0F1826      "Base"

float hash21(vec2 p) {
  p = fract(p * vec2(234.34, 435.345));
  p += dot(p, p + 34.23);
  return fract(p.x * p.y);
}

float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash21(i), hash21(i + vec2(1.0, 0.0)), u.x),
    mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), u.x),
    u.y);
}

float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  mat2 rot = mat2(0.8, -0.6, 0.6, 0.8);
  for (int i = 0; i < 5; i++) {
    v += a * vnoise(p);
    p = rot * p * 2.03;
    a *= 0.5;
  }
  return v;
}

void main() {
  vec2 uv = v_uv;
  vec2 p = uv * vec2(u_resolution.x / max(u_resolution.y, 1.0), 1.0) * 2.2
         + u_random.xy * 37.0;
  float t = u_time * 0.03 * u_speed;

  vec2 q = vec2(fbm(p + vec2(0.0, t)),
                fbm(p + vec2(5.2, 1.3) - 0.7 * t));
  vec2 r = vec2(fbm(p + 2.4 * q + vec2(1.7, 9.2) + 0.15 * t),
                fbm(p + 2.4 * q + vec2(8.3, 2.8) - 0.12 * t));
  float f = fbm(p + 2.0 * r);

  float glow = smoothstep(0.2, 0.95, f);
  vec3 col = mix(u_base, u_tint, glow);
  col *= 0.35 + 0.65 * glow;

  float vig = smoothstep(1.1, 0.35, distance(uv, vec2(0.5)));
  col *= mix(0.7, 1.0, vig);

  outColor = vec4(col * u_level, 1.0);
}
`;
