// Gummies: pouring streams as falling particle chains rendered as tapering tubes and drops.
import * as THREE from 'three';
import { GRAV, HALF } from './config.js';
import { CANDY, LIGHT } from './candy.js';
import { deposit, surfaceAt } from './fluid.js';
import { coarseAt, inDomain } from './world.js';

const CAP = 640;
const RING = 7;
const MAXV = 9000;

const st = new Uint8Array(CAP);
const px = new Float32Array(CAP);
const py = new Float32Array(CAP);
const pz = new Float32Array(CAP);
const vx = new Float32Array(CAP);
const vy = new Float32Array(CAP);
const vz = new Float32Array(CAP);
const vol = new Float32Array(CAP);
const rate = new Float32Array(CAP);
const link = new Int16Array(CAP).fill(-1);
const newer = new Int16Array(CAP).fill(-1);
const matOf = new Array(CAP).fill(null);
let cursor = 0;

export const S = { count: 0, mesh: null, hit: null, landed: 0, landX: 0, landZ: 0, landKind: null };

const pos = new Float32Array(MAXV * 3);
const nor = new Float32Array(MAXV * 3);
const pig = new Float32Array(MAXV * 4);
const thk = new Float32Array(MAXV);
const idx = new Uint16Array(MAXV * 6);
let nv = 0;
let ni = 0;

export class Emitter {
  constructor() {
    this.last = -1;
    this.mat = null;
    this.acc = 0;
    this.on = false;
    this.sx = 0;
    this.sy = 0;
    this.sz = 0;
    this.r0 = 0.2;
  }
}

function alloc() {
  for (let n = 0; n < CAP; n++) {
    cursor = (cursor + 1) % CAP;
    if (st[cursor] === 0) return cursor;
  }
  return -1;
}

export function emit(em, x, y, z, ux, uy, uz, v, q) {
  const i = alloc();
  if (i < 0) return;
  st[i] = 1;
  px[i] = x;
  py[i] = y;
  pz[i] = z;
  vx[i] = ux;
  vy[i] = uy;
  vz[i] = uz;
  vol[i] = v;
  rate[i] = q;
  matOf[i] = em.mat;
  link[i] = em.last >= 0 && st[em.last] === 1 && matOf[em.last] === em.mat ? em.last : -1;
  em.last = i;
  S.count++;
}

export function breakStream(em) {
  em.last = -1;
}

function kill(i) {
  st[i] = 0;
  link[i] = -1;
  S.count--;
}

export function stepStreams(dt) {
  S.landed = 0;
  if (S.count <= 0) return;
  for (let i = 0; i < CAP; i++) {
    if (st[i] !== 1) continue;
    vy[i] -= GRAV * dt;
    const sp = Math.hypot(vx[i], vy[i], vz[i]);
    const nsub = S.hit ? Math.min(7, Math.max(1, Math.ceil((sp * dt) / 0.45))) : 1;
    const hs = dt / nsub;
    let nx = px[i];
    let ny = py[i];
    let nz = pz[i];
    let gone = false;
    for (let q = 0; q < nsub; q++) {
      nx += vx[i] * hs;
      ny += vy[i] * hs;
      nz += vz[i] * hs;
      if (!S.hit || ny > 14) continue;
      const r = S.hit(nx, ny, nz, i, matOf[i], vol[i]);
      if (r === 0) continue;
      if (r === 2) {
        gone = true;
        break;
      }
      link[i] = -1;
      vol[i] *= 0.5;
      vy[i] = Math.abs(vy[i]) * 0.12;
      vx[i] = vx[i] * 0.3 + (Math.random() - 0.5) * 34;
      vz[i] = vz[i] * 0.3 + (Math.random() - 0.5) * 34;
      rate[i] *= 0.4;
      ny += 0.25;
      if (vol[i] < 0.012) gone = true;
      break;
    }
    if (gone) {
      kill(i);
      continue;
    }
    px[i] = nx;
    pz[i] = nz;
    const inside = inDomain(nx, nz, 1);
    let ground = inside ? coarseAt(nx, nz) : 0;
    const fs = inside ? surfaceAt(nx, nz) : -1e9;
    if (fs > ground) ground = fs;
    if (ny <= ground) {
      ny = ground;
      py[i] = ny;
      if (inside) {
        deposit(nx, nz, vol[i], matOf[i]);
        S.landed += vol[i];
        S.landX = nx;
        S.landZ = nz;
        S.landKind = matOf[i].kind;
      }
      st[i] = 2;
      vol[i] = 0.07;
      continue;
    }
    py[i] = ny;
    if (ny < -5 || Math.abs(nx) > HALF * 3 || Math.abs(nz) > HALF * 3) kill(i);
  }
  for (let i = 0; i < CAP; i++) {
    if (st[i] !== 2) continue;
    vol[i] -= dt;
    if (vol[i] <= 0) kill(i);
  }
}

function ring(x, y, z, tx, ty, tz, r, m, th) {
  let ax = 1;
  let az = 0;
  if (Math.abs(tx) > 0.9) {
    ax = 0;
    az = 1;
  }
  let n1x = ty * az - tz * 0;
  let n1y = tz * ax - tx * az;
  let n1z = tx * 0 - ty * ax;
  const l = Math.hypot(n1x, n1y, n1z) || 1;
  n1x /= l;
  n1y /= l;
  n1z /= l;
  const n2x = ty * n1z - tz * n1y;
  const n2y = tz * n1x - tx * n1z;
  const n2z = tx * n1y - ty * n1x;
  for (let k = 0; k < RING; k++) {
    const a = (k / RING) * Math.PI * 2;
    const c = Math.cos(a);
    const s = Math.sin(a);
    const ex = c * n1x + s * n2x;
    const ey = c * n1y + s * n2y;
    const ez = c * n1z + s * n2z;
    const o = nv * 3;
    pos[o] = x + ex * r;
    pos[o + 1] = y + ey * r;
    pos[o + 2] = z + ez * r;
    nor[o] = ex;
    nor[o + 1] = ey;
    nor[o + 2] = ez;
    const p = nv * 4;
    pig[p] = m.rgb[0];
    pig[p + 1] = m.rgb[1];
    pig[p + 2] = m.rgb[2];
    pig[p + 3] = m.op;
    thk[nv] = th;
    nv++;
  }
}

function tip(x, y, z, nx, ny, nz, m, th) {
  const o = nv * 3;
  pos[o] = x;
  pos[o + 1] = y;
  pos[o + 2] = z;
  nor[o] = nx;
  nor[o + 1] = ny;
  nor[o + 2] = nz;
  const p = nv * 4;
  pig[p] = m.rgb[0];
  pig[p + 1] = m.rgb[1];
  pig[p + 2] = m.rgb[2];
  pig[p + 3] = m.op;
  thk[nv] = th;
  return nv++;
}

function bridge(a, b) {
  for (let k = 0; k < RING; k++) {
    const k1 = (k + 1) % RING;
    idx[ni++] = a + k;
    idx[ni++] = b + k;
    idx[ni++] = a + k1;
    idx[ni++] = a + k1;
    idx[ni++] = b + k;
    idx[ni++] = b + k1;
  }
}

function fan(c, r, flip) {
  for (let k = 0; k < RING; k++) {
    const k1 = (k + 1) % RING;
    idx[ni++] = c;
    idx[ni++] = flip ? r + k1 : r + k;
    idx[ni++] = flip ? r + k : r + k1;
  }
}

function radius(i) {
  const sp = Math.hypot(vx[i], vy[i], vz[i]) + 12;
  const r = Math.sqrt(rate[i] / (Math.PI * sp));
  return r < 0.07 ? 0.07 : r > 0.42 ? 0.42 : r;
}

function drop(i) {
  const m = matOf[i];
  const r = Math.min(0.32, Math.cbrt(vol[i] * 0.24) + 0.05);
  const sp = Math.hypot(vx[i], vy[i], vz[i]) || 1;
  const tx = vx[i] / sp;
  const ty = vy[i] / sp;
  const tz = vz[i] / sp;
  const st0 = Math.min(1.9, 1 + sp * 0.004);
  const a = tip(px[i] - tx * r * st0, py[i] - ty * r * st0, pz[i] - tz * r * st0, -tx, -ty, -tz, m, r * 2);
  const r1 = nv;
  ring(px[i] - tx * r * 0.3, py[i] - ty * r * 0.3, pz[i] - tz * r * 0.3, tx, ty, tz, r * 0.8, m, r * 2);
  const r2 = nv;
  ring(px[i] + tx * r * 0.45, py[i] + ty * r * 0.45, pz[i] + tz * r * 0.45, tx, ty, tz, r * 0.85, m, r * 2);
  const b = tip(px[i] + tx * r, py[i] + ty * r, pz[i] + tz * r, tx, ty, tz, m, r * 2);
  fan(a, r1, true);
  bridge(r1, r2);
  fan(b, r2, false);
}

const chain = new Int16Array(CAP);

export function buildStreams(emitters) {
  nv = 0;
  ni = 0;
  if (S.count > 0) {
    newer.fill(-1);
    for (let i = 0; i < CAP; i++) {
      if (st[i] === 0) continue;
      const l = link[i];
      if (l >= 0) {
        if (st[l] === 0) link[i] = -1;
        else newer[l] = i;
      }
    }
    for (let i = 0; i < CAP; i++) {
      if (st[i] === 0 || newer[i] >= 0) continue;
      if (nv > MAXV - 400) break;
      let n = 0;
      let c = i;
      while (c >= 0 && st[c] !== 0 && n < CAP) {
        chain[n++] = c;
        if (st[c] === 2) break;
        c = link[c];
      }
      let em = null;
      for (const e of emitters) if (e.on && e.last === i) em = e;
      if (n === 1 && !em) {
        if (st[i] === 1) drop(i);
        continue;
      }
      const m = matOf[i];
      let prev = -1;
      if (em) {
        const dx = px[i] - em.sx;
        const dy = py[i] - em.sy;
        const dz = pz[i] - em.sz;
        const l = Math.hypot(dx, dy, dz) || 1;
        prev = nv;
        ring(em.sx, em.sy, em.sz, dx / l, dy / l, dz / l, em.r0, m, em.r0 * 2);
      }
      for (let q = 0; q < n; q++) {
        const a = chain[q];
        const b0 = q > 0 ? chain[q - 1] : -1;
        const b1 = q < n - 1 ? chain[q + 1] : -1;
        const x0 = b0 >= 0 ? px[b0] : em ? em.sx : px[a];
        const y0 = b0 >= 0 ? py[b0] : em ? em.sy : py[a];
        const z0 = b0 >= 0 ? pz[b0] : em ? em.sz : pz[a];
        const x1 = b1 >= 0 ? px[b1] : px[a];
        const y1 = b1 >= 0 ? py[b1] : py[a];
        const z1 = b1 >= 0 ? pz[b1] : pz[a];
        let tx = x1 - x0;
        let ty = y1 - y0;
        let tz = z1 - z0;
        const l = Math.hypot(tx, ty, tz) || 1;
        tx /= l;
        ty /= l;
        tz /= l;
        let r = radius(a);
        if (st[a] === 2) r *= 1.5;
        const cur = nv;
        if (q === 0 && !em) {
          const t0 = tip(px[a] - tx * r, py[a] - ty * r, pz[a] - tz * r, -tx, -ty, -tz, m, r * 2);
          ring(px[a], py[a], pz[a], tx, ty, tz, r, m, r * 2);
          fan(t0, cur + 1, true);
          prev = cur + 1;
          continue;
        }
        ring(px[a], py[a], pz[a], tx, ty, tz, r, m, r * 2);
        if (prev >= 0) bridge(prev, cur);
        prev = cur;
        if (q === n - 1 && st[a] !== 2) {
          const t1 = tip(px[a] + tx * r, py[a] + ty * r, pz[a] + tz * r, tx, ty, tz, m, r * 2);
          fan(t1, cur, false);
        }
      }
    }
  }
  const g = S.mesh.geometry;
  g.attributes.position.needsUpdate = true;
  g.attributes.normal.needsUpdate = true;
  g.attributes.aPig.needsUpdate = true;
  g.attributes.aThick.needsUpdate = true;
  g.index.needsUpdate = true;
  g.setDrawRange(0, ni);
  S.mesh.visible = ni > 0;
}

const VERT = /* glsl */ `
attribute vec4 aPig;
attribute float aThick;
varying vec4 vPig;
varying float vThick;
varying vec3 vN;
varying vec3 vW;
void main() {
  vPig = aPig;
  vThick = aThick;
  vN = normal;
  vW = position;
  gl_Position = projectionMatrix * viewMatrix * vec4(position, 1.0);
}`;

const FRAG = /* glsl */ `
precision highp float;
varying vec4 vPig;
varying float vThick;
varying vec3 vN;
varying vec3 vW;
${CANDY}
void main() {
  vec3 N = normalize(vN);
  vec3 V = normalize(cameraPosition - vW);
  vec3 p = max(vPig.rgb, vec3(0.02));
  vec3 col = mix(candyClear(p, vThick * 1.6, N) + candyGlow(p, N, V), candyOpaque(p, N), vPig.a);
  col += candySpec(N, V, 1.0);
  gl_FragColor = outColor(col);
  #include <colorspace_fragment>
}`;

export function createStreams(scene) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute('aPig', new THREE.BufferAttribute(pig, 4).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute('aThick', new THREE.BufferAttribute(thk, 1).setUsage(THREE.DynamicDrawUsage));
  g.setIndex(new THREE.BufferAttribute(idx, 1).setUsage(THREE.DynamicDrawUsage));
  const m = new THREE.ShaderMaterial({ uniforms: { uLight: { value: new THREE.Vector3(...LIGHT) } }, vertexShader: VERT, fragmentShader: FRAG, side: THREE.DoubleSide });
  S.mesh = new THREE.Mesh(g, m);
  S.mesh.frustumCulled = false;
  S.mesh.castShadow = true;
  S.mesh.visible = false;
  scene.add(S.mesh);
}

export function streamsActive() {
  return S.count > 0;
}
