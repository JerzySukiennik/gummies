// Gummies: viscous height-field fluid (mass, chocolate) with pinned contact lines and a two-pass renderer.
import * as THREE from 'three';
import { N, DX, HALF, smooth } from './config.js';
import { T } from './world.js';
import { CANDY, LIGHT } from './candy.js';

const NN = N * N;
const CONTACT = 0.15;
const K_VISC = 22;
const SUBSTEPS = 8;
const ACT_THR = 0.0016;
const M = N / 2;
export const SET_TIME = 2.8;
export const H_MIN = 0.045;

const h = new Float32Array(NN);
const ar = new Float32Array(NN);
const ag = new Float32Array(NN);
const ab = new Float32Array(NN);
const op = new Float32Array(NN);
const t0 = new Float32Array(NN);
const t1 = new Float32Array(NN);
const calm = new Float32Array(NN);
const act = new Float32Array(NN);
const sr = new Float32Array(NN).fill(-1);
const tmp = new Float32Array(NN);
const flag = new Uint8Array(NN);
const stack = new Int32Array(NN);
const cn = new Float32Array(NN);
{
  for (let i = 0; i < NN; i++) cn[i] = Math.random();
  for (let p = 0; p < 6; p++) {
    for (let k = N + 1; k < NN - N - 1; k++) tmp[k] = (cn[k] * 2 + cn[k - 1] + cn[k + 1] + cn[k - N] + cn[k + N]) / 6;
    cn.set(tmp);
  }
  let lo = 1;
  let hi = 0;
  for (let k = N + 1; k < NN - N - 1; k++) {
    if (cn[k] < lo) lo = cn[k];
    if (cn[k] > hi) hi = cn[k];
  }
  for (let i = 0; i < NN; i++) cn[i] = CONTACT * (0.72 + 0.56 * Math.min(1, Math.max(0, (cn[i] - lo) / (hi - lo))));
  tmp.fill(0);
}
const surfData = new Uint16Array(NN * 4);
const colData = new Uint8Array(NN * 4);

export const F = { h, ar, ag, ab, op, t0, t1, calm, sr, i0: N, i1: -1, j0: N, j1: -1, dirty: false, moving: false, u: [N, -1, N, -1], mesh: null, onLand: null };

const half = v => THREE.DataUtils.toHalfFloat(v);
{
  const neg = half(-1);
  for (let i = 0; i < NN; i++) surfData[i * 4] = neg;
}

function grow(i, j) {
  if (i < F.i0) F.i0 = i;
  if (i > F.i1) F.i1 = i;
  if (j < F.j0) F.j0 = j;
  if (j > F.j1) F.j1 = j;
}

function add(k, d, m) {
  if (d <= 0) return;
  const h1 = h[k] + d;
  const w = d / h1;
  ar[k] += (m.a[0] - ar[k]) * w;
  ag[k] += (m.a[1] - ag[k]) * w;
  ab[k] += (m.a[2] - ab[k]) * w;
  op[k] += (m.op - op[k]) * w;
  t0[k] *= 1 - w;
  t1[k] *= 1 - w;
  h[k] = h1;
  calm[k] = 0;
}

export function deposit(x, z, vol, m) {
  const u = (x + HALF) / DX - 0.5;
  const v = (z + HALF) / DX - 0.5;
  const i = Math.floor(u);
  const j = Math.floor(v);
  if (i < 2 || j < 2 || i >= N - 3 || j >= N - 3) return false;
  const fu = u - i;
  const fv = v - j;
  const d = vol / (DX * DX);
  const k = j * N + i;
  add(k, d * (1 - fu) * (1 - fv), m);
  add(k + 1, d * fu * (1 - fv), m);
  add(k + N, d * (1 - fu) * fv, m);
  add(k + N + 1, d * fu * fv, m);
  grow(i - 1, j - 1);
  grow(i + 2, j + 2);
  F.dirty = true;
  return true;
}

export function sprinkle(x, z, kind, amt) {
  const i = Math.floor((x + HALF) / DX);
  const j = Math.floor((z + HALF) / DX);
  if (i < 1 || j < 1 || i >= N - 1 || j >= N - 1) return false;
  const k = j * N + i;
  if (h[k] < 0.01) return false;
  const a = kind ? t1 : t0;
  a[k] = Math.min(1, a[k] + amt);
  F.dirty = true;
  return true;
}

export function surfaceAt(x, z) {
  const i = Math.floor((x + HALF) / DX);
  const j = Math.floor((z + HALF) / DX);
  if (i < 0 || j < 0 || i >= N || j >= N) return -1e9;
  const k = j * N + i;
  return h[k] > 0.004 ? T.b[k] + h[k] : -1e9;
}

function flow(a, c, g) {
  const ha = h[a];
  const hc = h[c];
  if (ha < 1e-5 && hc < 1e-5) return;
  const b = T.b;
  const ba = b[a];
  const bc = b[c];
  const sa = ba + ha;
  const sc = bc + hc;
  let u, d, hu, hd, bu, bd, dS;
  if (sa > sc) {
    u = a;
    d = c;
    hu = ha;
    hd = hc;
    bu = ba;
    bd = bc;
    dS = sa - sc;
  } else {
    u = c;
    d = a;
    hu = hc;
    hd = ha;
    bu = bc;
    bd = ba;
    dS = sc - sa;
  }
  if (hu < 1e-5) return;
  const film = bu + hu - (bu > bd ? bu : bd);
  if (film <= 0) return;
  const thick = op[u];
  const th = T.onMold[d] ? 0.02 : cn[d] * (1 + 0.9 * thick);
  if (hd < 2 * th) {
    dS -= th * (1 - hd / (2 * th));
    if (dS <= 0) return;
  }
  let mob = K_VISC * film * film * film;
  if (mob > 1) mob = 1;
  mob *= 1 - 0.5 * thick;
  const cu = calm[u];
  if (cu > 1) mob *= cu > 2.6 ? 0.06 : 1 - 0.94 * ((cu - 1) / 1.6);
  let q = g * dS * mob;
  if (q > film) q = film;
  if (q > hu) q = hu;
  if (q < 1e-7) return;
  const hn = hd + q;
  const w = q / hn;
  ar[d] += (ar[u] - ar[d]) * w;
  ag[d] += (ag[u] - ag[d]) * w;
  ab[d] += (ab[u] - ab[d]) * w;
  op[d] += (op[u] - op[d]) * w;
  t0[d] += (t0[u] - t0[d]) * w;
  t1[d] += (t1[u] - t1[d]) * w;
  h[u] = hu - q;
  h[d] = hn;
  act[u] += q;
  act[d] += q;
}

function sweep(order, i0, i1, j0, j1) {
  const fwd = (order & 1) === 0;
  for (let pass = 0; pass < 2; pass++) {
    if ((pass === 0) === ((order & 2) === 0)) {
      for (let j = j0; j <= j1; j++) {
        const row = j * N;
        if (fwd) for (let i = i0; i < i1; i++) flow(row + i, row + i + 1, 0.4);
        else for (let i = i1 - 1; i >= i0; i--) flow(row + i, row + i + 1, 0.4);
      }
    } else if (fwd) {
      for (let j = j0; j < j1; j++) {
        const row = j * N;
        for (let i = i0; i <= i1; i++) flow(row + i, row + i + N, 0.4);
      }
    } else {
      for (let j = j1 - 1; j >= j0; j--) {
        const row = j * N;
        for (let i = i0; i <= i1; i++) flow(row + i, row + i + N, 0.4);
      }
    }
  }
  if (fwd) {
    for (let j = j0; j < j1; j++) {
      const row = j * N;
      for (let i = i0; i < i1; i++) {
        flow(row + i, row + i + N + 1, 0.2);
        flow(row + i + 1, row + i + N, 0.2);
      }
    }
  } else {
    for (let j = j1 - 1; j >= j0; j--) {
      const row = j * N;
      for (let i = i1 - 1; i >= i0; i--) {
        flow(row + i, row + i + N + 1, 0.2);
        flow(row + i + 1, row + i + N, 0.2);
      }
    }
  }
}

let orderTick = 0;

export function stepFluid(dt) {
  if (F.i1 < 0) {
    F.moving = false;
    return;
  }
  const i0 = Math.max(1, F.i0 - 1);
  const i1 = Math.min(N - 2, F.i1 + 1);
  const j0 = Math.max(1, F.j0 - 1);
  const j1 = Math.min(N - 2, F.j1 + 1);
  for (let s = 0; s < SUBSTEPS; s++) sweep(orderTick++, i0, i1, j0, j1);
  let n0 = N;
  let n1 = -1;
  let m0 = N;
  let m1 = -1;
  let moving = false;
  for (let j = j0; j <= j1; j++) {
    for (let i = i0; i <= i1; i++) {
      const k = j * N + i;
      let hk = h[k];
      if (hk <= 0) {
        act[k] = 0;
        continue;
      }
      if (i < 3 || j < 3 || i > N - 4 || j > N - 4) {
        h[k] = 0;
        continue;
      }
      if (act[k] > ACT_THR) {
        calm[k] = 0;
        moving = true;
      } else calm[k] += dt;
      act[k] = 0;
      if (hk < 0.03 && calm[k] > 0.35 && h[k - 1] < 0.06 && h[k + 1] < 0.06 && h[k - N] < 0.06 && h[k + N] < 0.06) {
        hk -= dt * (T.onMold[k] ? 0.12 : 0.03);
        h[k] = hk > 0 ? hk : 0;
        moving = true;
        if (hk <= 0) continue;
      }
      if (i < n0) n0 = i;
      if (i > n1) n1 = i;
      if (j < m0) m0 = j;
      if (j > m1) m1 = j;
    }
  }
  F.i0 = n0;
  F.i1 = n1;
  F.j0 = m0;
  F.j1 = m1;
  if (moving || F.moving) F.dirty = true;
  F.moving = moving;
}

export function findSettable() {
  const out = [];
  if (F.i1 < 0) return out;
  const i0 = F.i0;
  const i1 = F.i1;
  const j0 = F.j0;
  const j1 = F.j1;
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) flag[j * N + i] = 0;
  for (let j = j0; j <= j1; j++) {
    for (let i = i0; i <= i1; i++) {
      const k0 = j * N + i;
      if (flag[k0] || h[k0] <= H_MIN) continue;
      let sp = 0;
      let n = 0;
      let minCalm = 1e9;
      let vol = 0;
      let peak = 0;
      const cells = [];
      stack[sp++] = k0;
      flag[k0] = 1;
      let a0 = N;
      let a1 = -1;
      let c0 = N;
      let c1 = -1;
      while (sp > 0) {
        const k = stack[--sp];
        cells.push(k);
        n++;
        const hk = h[k];
        vol += hk;
        if (hk > peak) peak = hk;
        if (calm[k] < minCalm) minCalm = calm[k];
        const ci = k % N;
        const cj = (k / N) | 0;
        if (ci < a0) a0 = ci;
        if (ci > a1) a1 = ci;
        if (cj < c0) c0 = cj;
        if (cj > c1) c1 = cj;
        if (ci > i0 && !flag[k - 1] && h[k - 1] > H_MIN) {
          flag[k - 1] = 1;
          stack[sp++] = k - 1;
        }
        if (ci < i1 && !flag[k + 1] && h[k + 1] > H_MIN) {
          flag[k + 1] = 1;
          stack[sp++] = k + 1;
        }
        if (cj > j0 && !flag[k - N] && h[k - N] > H_MIN) {
          flag[k - N] = 1;
          stack[sp++] = k - N;
        }
        if (cj < j1 && !flag[k + N] && h[k + N] > H_MIN) {
          flag[k + N] = 1;
          stack[sp++] = k + N;
        }
      }
      if (minCalm > SET_TIME) out.push({ cells, i0: a0, i1: a1, j0: c0, j1: c1, vol: vol * DX * DX, peak, n });
    }
  }
  return out;
}

export function removeCells(cells) {
  for (const k of cells) {
    h[k] = 0;
    for (const o of [-1, 1, -N, N, -N - 1, -N + 1, N - 1, N + 1]) if (h[k + o] <= H_MIN) h[k + o] = 0;
  }
  F.dirty = true;
}

export function clearFluid(i0, i1, j0, j1) {
  for (let j = Math.max(0, j0); j <= Math.min(N - 1, j1); j++) for (let i = Math.max(0, i0); i <= Math.min(N - 1, i1); i++) h[j * N + i] = 0;
  F.dirty = true;
}

export function surfSmooth(u, v) {
  const i = Math.min(N - 3, Math.max(1, Math.floor(u)));
  const j = Math.min(N - 3, Math.max(1, Math.floor(v)));
  const f = Math.min(1, Math.max(0, u - i));
  const g = Math.min(1, Math.max(0, v - j));
  const f2 = f * f;
  const f3 = f2 * f;
  const g2 = g * g;
  const g3 = g2 * g;
  const a0 = (1 - 3 * f + 3 * f2 - f3) / 6;
  const a1 = (3 * f3 - 6 * f2 + 4) / 6;
  const a2 = (-3 * f3 + 3 * f2 + 3 * f + 1) / 6;
  const a3 = f3 / 6;
  const k = j * N + i;
  const r0 = a0 * sr[k - N - 1] + a1 * sr[k - N] + a2 * sr[k - N + 1] + a3 * sr[k - N + 2];
  const r1 = a0 * sr[k - 1] + a1 * sr[k] + a2 * sr[k + 1] + a3 * sr[k + 2];
  const r2 = a0 * sr[k + N - 1] + a1 * sr[k + N] + a2 * sr[k + N + 1] + a3 * sr[k + N + 2];
  const r3 = a0 * sr[k + 2 * N - 1] + a1 * sr[k + 2 * N] + a2 * sr[k + 2 * N + 1] + a3 * sr[k + 2 * N + 2];
  return ((1 - 3 * g + 3 * g2 - g3) / 6) * r0 + ((3 * g3 - 6 * g2 + 4) / 6) * r1 + ((-3 * g3 + 3 * g2 + 3 * g + 1) / 6) * r2 + (g3 / 6) * r3;
}

export function hasFluid() {
  return F.i1 >= 0;
}

export function buildSurface() {
  const b = T.b;
  const i0 = Math.max(1, Math.min(F.i0 - 3, F.u[0]));
  const i1 = Math.min(N - 2, Math.max(F.i1 + 3, F.u[1]));
  const j0 = Math.max(1, Math.min(F.j0 - 3, F.u[2]));
  const j1 = Math.min(N - 2, Math.max(F.j1 + 3, F.u[3]));
  if (i1 < i0 || j1 < j0) return;
  for (let j = j0; j <= j1; j++) {
    for (let i = i0; i <= i1; i++) {
      const k = j * N + i;
      if (h[k] > 1e-4) {
        sr[k] = b[k] + h[k];
        flag[k] = 1;
      } else {
        sr[k] = -1;
        flag[k] = 0;
      }
    }
  }
  for (let ring = 2; ring <= 3; ring++) {
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const k = j * N + i;
        if (flag[k]) continue;
        let n = 0;
        let s = 0;
        let cr = 0;
        let cg = 0;
        let cb = 0;
        let co = 0;
        let c0 = 0;
        let c1 = 0;
        for (let dj = -N; dj <= N; dj += N) {
          for (let di = -1; di <= 1; di++) {
            const q = k + dj + di;
            if (flag[q] === ring - 1) {
              n++;
              s += sr[q];
              cr += ar[q];
              cg += ag[q];
              cb += ab[q];
              co += op[q];
              c0 += t0[q];
              c1 += t1[q];
            }
          }
        }
        if (!n) continue;
        const avg = s / n;
        sr[k] = avg < b[k] ? avg : b[k] - 0.07;
        ar[k] = cr / n;
        ag[k] = cg / n;
        ab[k] = cb / n;
        op[k] = co / n;
        t0[k] = c0 / n;
        t1[k] = c1 / n;
        flag[k] = 8;
      }
    }
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) if (flag[j * N + i] === 8) flag[j * N + i] = ring;
  }
  for (let j = j0; j <= j1; j++) {
    for (let i = i0; i <= i1; i++) {
      const k = j * N + i;
      const o = k * 4;
      surfData[o] = half(sr[k]);
      if (flag[k]) {
        surfData[o + 1] = half(t0[k]);
        surfData[o + 2] = half(t1[k]);
        surfData[o + 3] = half(smooth(1.2, SET_TIME, calm[k]));
        colData[o] = 255 * Math.exp(-ar[k]);
        colData[o + 1] = 255 * Math.exp(-ag[k]);
        colData[o + 2] = 255 * Math.exp(-ab[k]);
        colData[o + 3] = 255 * op[k];
      }
    }
  }
  F.u = [F.i0 - 3, F.i1 + 3, F.j0 - 3, F.j1 + 3];
  if (F.i1 < 0) F.u = [N, -1, N, -1];
  F.surfTex.needsUpdate = true;
  F.colTex.needsUpdate = true;
  const q0 = Math.max(0, (i0 >> 1) - 1);
  const q1 = Math.min(M - 1, (i1 >> 1) + 1);
  const r0 = Math.max(0, (j0 >> 1) - 1);
  const r1 = Math.min(M - 1, (j1 >> 1) + 1);
  const idx = F.index;
  let n = 0;
  if (F.i1 >= 0) {
    for (let r = r0; r <= r1; r++) {
      for (let q = q0; q <= q1; q++) {
        const a = r * (M + 1) + q;
        idx[n++] = a;
        idx[n++] = a + M + 1;
        idx[n++] = a + 1;
        idx[n++] = a + 1;
        idx[n++] = a + M + 1;
        idx[n++] = a + M + 2;
      }
    }
  }
  F.geo.index.needsUpdate = true;
  F.geo.setDrawRange(0, n);
  F.dirty = false;
}

const VERT = /* glsl */ `
uniform sampler2D uSurf;
varying vec2 vUv;
varying vec3 vW;
void main() {
  vUv = uv;
  vW = vec3(position.x, texture2D(uSurf, uv).r, position.z);
  gl_Position = projectionMatrix * viewMatrix * vec4(vW, 1.0);
}`;

const FRAG = /* glsl */ `
precision highp float;
uniform sampler2D uSurf;
uniform sampler2D uCol;
uniform sampler2D uMold;
uniform vec4 uRect;
uniform float uMoldOn;
varying vec2 vUv;
varying vec3 vW;
${CANDY}
float terrain(vec2 xz) {
  vec2 m = (xz - uRect.xy) / uRect.zw;
  if (uMoldOn < 0.5 || m.x < 0.0 || m.y < 0.0 || m.x > 1.0 || m.y > 1.0) return 0.0;
  return texture2D(uMold, m).r;
}
vec4 cubic(float v) {
  vec4 n = vec4(1.0, 2.0, 3.0, 4.0) - v;
  vec4 s = n * n * n;
  float x = s.x;
  float y = s.y - 4.0 * s.x;
  float z = s.z - 4.0 * s.y + 6.0 * s.x;
  return vec4(x, y, z, 6.0 - x - y - z) * (1.0 / 6.0);
}
float surfCubic(vec2 uv) {
  vec2 tc = uv * ${N}.0 - 0.5;
  vec2 f = fract(tc);
  tc -= f;
  vec4 xc = cubic(f.x);
  vec4 yc = cubic(f.y);
  vec4 c = tc.xxyy + vec2(-0.5, 1.5).xyxy;
  vec4 w = vec4(xc.xz + xc.yw, yc.xz + yc.yw);
  vec4 off = (c + vec4(xc.yw, yc.yw) / w) / ${N}.0;
  float s0 = texture2D(uSurf, off.xz).r;
  float s1 = texture2D(uSurf, off.yz).r;
  float s2 = texture2D(uSurf, off.xw).r;
  float s3 = texture2D(uSurf, off.yw).r;
  float sx = w.x / (w.x + w.y);
  float sy = w.z / (w.z + w.w);
  return mix(mix(s3, s2, sx), mix(s1, s0, sx), sy);
}
void main() {
  vec4 s = texture2D(uSurf, vUv);
  float d = surfCubic(vUv) - terrain(vW.xz);
  if (d < 0.004) discard;
  float a = smoothstep(0.004, 0.035, d);
  float e = 1.3 / ${N}.0;
  float sx = texture2D(uSurf, vUv + vec2(e, 0.0)).r - texture2D(uSurf, vUv - vec2(e, 0.0)).r;
  float sz = texture2D(uSurf, vUv + vec2(0.0, e)).r - texture2D(uSurf, vUv - vec2(0.0, e)).r;
  vec3 Nn = normalize(vec3(-sx, ${(2.6 * DX).toFixed(3)}, -sz));
  vec3 V = normalize(cameraPosition - vW);
  vec4 c = texture2D(uCol, vUv);
  vec3 pig = max(c.rgb, vec3(0.02));
  float o = c.a * (1.0 - exp(-d * 22.0));
  vec4 top = candyTop(vec3(vW.x, 0.0, vW.z), s.gb, Nn, V);
#ifdef PASS_MUL
  vec3 m = candyClear(pig, d, Nn) * (1.0 - o);
  m = mix(m, vec3(0.0), top.a);
  gl_FragColor = outColor(mix(vec3(1.0), m, a));
#else
  vec3 col = candyGlow(pig, Nn, V) * (1.0 - o) + candyOpaque(pig, Nn) * o;
  col = mix(col, top.rgb, top.a);
  col += candySpec(Nn, V, mix(1.0, 0.2, top.a) * (1.0 - 0.35 * s.a));
  gl_FragColor = outColor(col * a);
#endif
  #include <colorspace_fragment>
}`;

export function createFluid(scene) {
  F.surfTex = new THREE.DataTexture(surfData, N, N, THREE.RGBAFormat, THREE.HalfFloatType);
  F.colTex = new THREE.DataTexture(colData, N, N, THREE.RGBAFormat, THREE.UnsignedByteType);
  for (const t of [F.surfTex, F.colTex]) {
    t.minFilter = t.magFilter = THREE.LinearFilter;
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    t.needsUpdate = true;
  }
  const pos = new Float32Array((M + 1) * (M + 1) * 3);
  const uv = new Float32Array((M + 1) * (M + 1) * 2);
  for (let r = 0; r <= M; r++) {
    for (let q = 0; q <= M; q++) {
      const k = r * (M + 1) + q;
      pos[k * 3] = -HALF + (q / M) * 2 * HALF;
      pos[k * 3 + 2] = -HALF + (r / M) * 2 * HALF;
      uv[k * 2] = q / M;
      uv[k * 2 + 1] = r / M;
    }
  }
  F.index = new Uint16Array(M * M * 6);
  const geo = (F.geo = new THREE.BufferGeometry());
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setIndex(new THREE.BufferAttribute(F.index, 1));
  geo.setDrawRange(0, 0);
  const uniforms = {
    uSurf: { value: F.surfTex },
    uCol: { value: F.colTex },
    uMold: { value: T.tex },
    uRect: { value: T.rect },
    uMoldOn: { value: 0 },
    uLight: { value: new THREE.Vector3(...LIGHT) },
  };
  F.uniforms = uniforms;
  const mul = new THREE.ShaderMaterial({ uniforms, vertexShader: VERT, fragmentShader: FRAG, defines: { PASS_MUL: 1 }, transparent: true, depthWrite: false, blending: THREE.MultiplyBlending });
  const addM = new THREE.ShaderMaterial({ uniforms, vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor });
  const a = new THREE.Mesh(geo, mul);
  const c = new THREE.Mesh(geo, addM);
  a.frustumCulled = c.frustumCulled = false;
  a.renderOrder = 10;
  c.renderOrder = 11;
  scene.add(a, c);
  F.mesh = a;
}

export function syncFluidUniforms() {
  F.uniforms.uMoldOn.value = T.moldOn;
}
