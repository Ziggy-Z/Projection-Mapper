/**
 * Built-in content shaders. These are shader *bodies*: the GL runtime prepends
 * the version/precision header and the built-in uniform declarations
 * (u_time, u_resolution, u_frame, u_random, v_uv).
 *
 * All defaults are tuned for a wall at night: very slow, very dim. The
 * @param/@color/@toggle annotations drive the auto-generated controls.
 */

const NOISE_LIB = `float hash21(vec2 p) {
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
`;

export const SLOW_DRIFT = `uniform float u_speed;  // @param  speed 0.0 3.0 0.4  "Speed"
uniform float u_level;  // @param  level 0.0 1.0 0.55 "Level"
uniform vec3  u_tint;   // @color  tint  #F2A93B      "Tint"
uniform vec3  u_base;   // @color  base  #0F1826      "Base"

${NOISE_LIB}
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

export const EMBER_FIELD = `uniform float u_speed;  // @param speed 0.0 3.0 0.3  "Speed"
uniform float u_level;  // @param level 0.0 1.0 0.5  "Level"
uniform float u_spread; // @param spread 0.3 2.0 1.0 "Spread"
uniform vec3  u_warm;   // @color warm #E2803B       "Warm"
uniform vec3  u_cool;   // @color cool #26364F       "Cool"

vec2 orbit(float seed, float t) {
  return 0.5 + 0.38 * vec2(sin(t * 0.31 + seed * 17.0), cos(t * 0.23 + seed * 9.0));
}

void main() {
  vec2 uv = v_uv;
  float t = u_time * 0.1 * u_speed + u_random.z * 100.0;
  vec3 col = u_cool * 0.35;
  for (int i = 0; i < 4; i++) {
    float s = float(i) + 1.0;
    vec2 c = orbit(s + u_random.x, t * (0.6 + 0.17 * s));
    float d = distance(uv, c) / u_spread;
    float g = exp(-d * d * 6.0);
    col += mix(u_cool, u_warm, 0.4 + 0.6 * sin(s * 2.1) * 0.5 + 0.5) * g * 0.35;
  }
  outColor = vec4(col * u_level, 1.0);
}
`;

export const CAUSTICS = `uniform float u_speed;  // @param speed 0.0 3.0 0.25 "Speed"
uniform float u_level;  // @param level 0.0 1.0 0.45 "Level"
uniform float u_scale;  // @param scale 0.5 8.0 3.0  "Scale"
uniform vec3  u_tint;   // @color tint #3FA8B8       "Tint"
uniform vec3  u_deep;   // @color deep #0F1A22       "Deep"

void main() {
  vec2 uv = v_uv * u_scale;
  float t = u_time * 0.12 * u_speed + u_random.w * 50.0;
  vec2 p = uv;
  float c = 0.0;
  float inten = 0.006;
  for (int n = 0; n < 4; n++) {
    float fn = float(n) + 1.0;
    t += 0.05;
    p = uv + vec2(
      cos(t - p.x * fn) + sin(t + p.y),
      sin(t - p.y) + cos(t + p.x * fn));
    c += 1.0 / length(vec2(
      uv.x / (sin(p.x + t) + 2.5),
      uv.y / (cos(p.y + t) + 2.5)));
  }
  c = c / 4.0;
  c = 1.17 - pow(c, 1.4);
  float bright = pow(abs(c), 8.0);
  vec3 col = u_deep + u_tint * min(bright, 1.4) * inten * 120.0;
  outColor = vec4(col * u_level, 1.0);
}
`;

export const DRIFT_MOTES = `uniform float u_speed;   // @param speed 0.0 3.0 0.3  "Speed"
uniform float u_level;   // @param level 0.0 1.0 0.5  "Level"
uniform float u_density; // @param density 2.0 14.0 7.0 "Density"
uniform float u_size;    // @param size 0.2 2.0 0.8   "Size"
uniform vec3  u_tint;    // @color tint #D8C9A3       "Tint"

float hash21(vec2 p) {
  p = fract(p * vec2(234.34, 435.345));
  p += dot(p, p + 34.23);
  return fract(p.x * p.y);
}

void main() {
  vec2 uv = v_uv;
  float t = u_time * 0.01 * u_speed + u_random.y * 30.0;
  float acc = 0.0;
  for (int layer = 0; layer < 3; layer++) {
    float ls = 1.0 + float(layer) * 0.7;
    vec2 p = uv * u_density * ls + vec2(0.0, t * ls * 3.0);
    vec2 cell = floor(p);
    for (int dy = -1; dy <= 1; dy++)
    for (int dx = -1; dx <= 1; dx++) {
      vec2 g = cell + vec2(float(dx), float(dy));
      float h = hash21(g + float(layer) * 91.7);
      vec2 center = g + 0.5 + 0.35 * vec2(sin(h * 40.0 + t * 2.0), cos(h * 60.0 + t * 1.4));
      float d = length(p - center);
      float r = (0.03 + 0.05 * h) * u_size * ls;
      acc += exp(-d * d / (r * r)) * (0.25 + 0.4 * h) / ls;
    }
  }
  vec3 col = u_tint * acc * 0.35;
  outColor = vec4(col * u_level, 1.0);
}
`;

export const LIGHT_WASH = `uniform float u_speed;  // @param speed 0.0 3.0 0.3  "Speed"
uniform float u_level;  // @param level 0.0 1.0 0.5  "Level"
uniform float u_height; // @param height 0.2 1.5 0.8 "Height"
uniform vec3  u_tint;   // @color tint #E8B45C       "Tint"
uniform bool  u_fromTop;// @toggle fromTop false     "From top"

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

void main() {
  vec2 uv = v_uv;
  float y = u_fromTop ? uv.y : 1.0 - uv.y;
  float t = u_time * 0.05 * u_speed;
  float breathe = 0.92 + 0.08 * sin(t * 0.7 + u_random.x * 6.28);
  float ripple = vnoise(vec2(uv.x * 3.0 + t * 0.2, t * 0.15)) * 0.15;
  float wash = smoothstep(u_height + ripple, 0.0, y);
  wash = pow(wash, 1.6) * breathe;
  outColor = vec4(u_tint * wash * u_level, 1.0);
}
`;

export const GRAIN_FIELD = `uniform float u_speed;    // @param speed 0.0 2.0 0.2   "Speed"
uniform float u_level;    // @param level 0.0 1.0 0.4   "Level"
uniform float u_grain;    // @param grain 40.0 400.0 160.0 "Grain"
uniform float u_contrast; // @param contrast 0.0 1.0 0.25  "Contrast"
uniform vec3  u_tint;     // @color tint #B8AF9E        "Tint"

float hash31(vec3 p) {
  p = fract(p * vec3(443.897, 441.423, 437.195));
  p += dot(p, p.yzx + 19.19);
  return fract((p.x + p.y) * p.z);
}

void main() {
  vec2 uv = v_uv;
  // The seed advances in coarse steps: the field is near-static, shifting
  // perceptibly only over minutes.
  float epoch = floor(u_time * 0.02 * u_speed);
  float blendT = smoothstep(0.7, 1.0, fract(u_time * 0.02 * u_speed));
  vec2 g = floor(uv * u_grain);
  float a = hash31(vec3(g, epoch));
  float b = hash31(vec3(g, epoch + 1.0));
  float v = mix(a, b, blendT);
  float base = 0.5 + (v - 0.5) * u_contrast;
  float vig = smoothstep(1.15, 0.3, distance(uv, vec2(0.5)));
  outColor = vec4(u_tint * base * vig * u_level, 1.0);
}
`;

/** Internal body for solid sources — same pipeline as shaders. */
export const SOLID_BODY = `uniform vec3 u_color; // @color color #F2A93B "Color"
uniform float u_level; // @param level 0.0 1.0 1.0 "Level"
void main() { outColor = vec4(u_color * u_level, 1.0); }
`;

/** Internal body for gradient sources. */
export const GRADIENT_BODY = `uniform vec3  u_colorA; // @color colorA #F2A93B  "Color A"
uniform vec3  u_colorB; // @color colorB #0B0D12  "Color B"
uniform float u_angle;  // @param angle 0.0 360.0 90.0 "Angle"
uniform float u_middle; // @param middle 0.1 0.9 0.5   "Midpoint"
uniform bool  u_radial; // @toggle radial false        "Radial"

void main() {
  vec2 uv = v_uv;
  float t;
  if (u_radial) {
    t = distance(uv, vec2(0.5)) * 1.4142;
  } else {
    float rad = radians(u_angle);
    vec2 dir = vec2(cos(rad), sin(rad));
    t = dot(uv - 0.5, dir) + 0.5;
  }
  float m = clamp(u_middle, 0.05, 0.95);
  float x = t < m ? 0.5 * t / m : 0.5 + 0.5 * (t - m) / (1.0 - m);
  outColor = vec4(mix(u_colorA, u_colorB, clamp(x, 0.0, 1.0)), 1.0);
}
`;

export interface BuiltinShader {
  name: string;
  glsl: string;
}

export const BUILTIN_SHADERS: BuiltinShader[] = [
  { name: 'Slow drift', glsl: SLOW_DRIFT },
  { name: 'Ember field', glsl: EMBER_FIELD },
  { name: 'Caustics', glsl: CAUSTICS },
  { name: 'Drift motes', glsl: DRIFT_MOTES },
  { name: 'Light wash', glsl: LIGHT_WASH },
  { name: 'Grain field', glsl: GRAIN_FIELD },
];
