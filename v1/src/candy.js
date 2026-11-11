// Gummies: shared GLSL for the translucent candy look (mass, gummies, chocolate, toppings).
import { LIGHT_DIR } from './config.js';

const l = Math.hypot(...LIGHT_DIR);
export const LIGHT = LIGHT_DIR.map(v => v / l);

export const CANDY = /* glsl */ `
uniform vec3 uLight;
vec4 outColor(vec3 c) {
  c = clamp(c, 0.0, 1.0);
  return vec4(mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c)), 1.0);
}
vec3 candyClear(vec3 pig, float th, vec3 N) {
  float ndl = dot(N, uLight);
  vec3 T = pow(pig, vec3(th * 1.05 + 0.3 * smoothstep(0.0, 0.12, th)));
  return T * (0.88 + 0.16 * clamp(ndl * 0.3 + 0.7, 0.0, 1.0));
}
vec3 candyGlow(vec3 pig, vec3 N, vec3 V) {
  float f = pow(1.0 - max(dot(N, V), 0.0), 3.0);
  vec3 back = normalize(vec3(-uLight.x, -0.3, -uLight.z));
  return pow(pig, vec3(0.45)) * f * 0.2 + pow(pig, vec3(0.6)) * pow(max(dot(N, back), 0.0), 2.5) * 0.22;
}
vec3 candyOpaque(vec3 pig, vec3 N) {
  float ndl = dot(N, uLight);
  return pig * (0.55 + 0.55 * clamp(ndl * 0.55 + 0.45, 0.0, 1.0));
}
float candySpec(vec3 N, vec3 V, float gloss) {
  vec3 H = normalize(uLight + V);
  float nh = max(dot(N, H), 0.0);
  float fres = 0.04 + 0.96 * pow(1.0 - max(dot(N, V), 0.0), 5.0);
  vec3 R = reflect(-V, N);
  float box = smoothstep(0.5, 0.95, R.y);
  vec3 q = R - vec3(-0.2, 0.8, -0.57);
  float soft = (1.0 - smoothstep(0.1, 0.34, abs(q.x))) * (1.0 - smoothstep(0.02, 0.1, length(q.yz)));
  return (pow(nh, 300.0) * 2.6 + pow(nh, 48.0) * 0.14 + soft * 0.24) * gloss + fres * (0.28 + 0.42 * box) * gloss;
}
float hash31(vec3 p) {
  p = fract(p * vec3(0.1031, 0.1030, 0.0973));
  p += dot(p, p.yxz + 33.33);
  return fract((p.x + p.y) * p.z);
}
vec3 hueColor(float h) {
  vec3 c = clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
  return mix(vec3(1.0), c, 0.82);
}
vec4 candyTop(vec3 rp, vec2 top, vec3 N, vec3 V) {
  vec4 o = vec4(0.0);
  if (top.x > 0.01) {
    vec3 gp = rp / 0.05;
    vec3 c = floor(gp);
    vec3 j = vec3(hash31(c + 1.7), hash31(c + 4.1), hash31(c + 7.3)) - 0.5;
    float d = length(fract(gp) - 0.5 - j * 0.45);
    if (hash31(c) < top.x * 0.82 && d < 0.46) {
      float sp = pow(max(dot(normalize(N + j * 1.5), normalize(uLight + V)), 0.0), 36.0);
      float sh = 0.86 + 0.14 * (j.x + 0.5) - smoothstep(0.3, 0.46, d) * 0.12;
      o = vec4(vec3(sh) + sp * 1.3, 1.0);
    }
  }
  if (top.y > 0.01) {
    vec3 c = floor(rp / 0.13);
    float h = hash31(c + 11.0);
    vec3 f = fract(rp / 0.13) - 0.5;
    if (h < top.y * 0.75 && dot(f, f) < 0.2) {
      vec3 col = hueColor(hash31(c + 3.0));
      float sh = 0.75 + 0.35 * max(dot(normalize(f + N * 0.6), uLight), 0.0);
      o = vec4(col * sh, 1.0);
    }
  }
  return o;
}
`;

export function hexToRgb(hex) {
  return [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255];
}

export function makeMat(rgb, op, kind = 'mass') {
  const c = rgb.map(v => Math.min(Math.max(v, 0.02), 0.985));
  return { rgb: c, a: c.map(v => -Math.log(v)), op, kind };
}
