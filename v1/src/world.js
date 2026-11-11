// Gummies: shared terrain state (table, mold and set pieces still stuck in place).
import * as THREE from 'three';
import { N, DX, HALF, TX, clamp } from './config.js';
import { FW, FH } from './mold.js';

export const T = {
  bBase: new Float32Array(N * N),
  b: new Float32Array(N * N),
  onMold: new Uint8Array(N * N),
  mold: null,
  tex: null,
  texData: new Uint16Array(FW * FH),
  rect: new THREE.Vector4(0, 0, 1, 1),
  moldOn: 0,
  version: 0,
};

T.tex = new THREE.DataTexture(T.texData, FW, FH, THREE.RedFormat, THREE.HalfFloatType);
T.tex.minFilter = T.tex.magFilter = THREE.LinearFilter;
T.tex.wrapS = T.tex.wrapT = THREE.ClampToEdgeWrapping;
T.tex.needsUpdate = true;

export function setMold(field, cx, cz) {
  const i0 = Math.round((cx - (FW * TX) / 2 + HALF) / DX);
  const j0 = Math.round((cz - (FH * TX) / 2 + HALF) / DX);
  const x0 = -HALF + i0 * DX;
  const z0 = -HALF + j0 * DX;
  T.mold = { field, base: field.hi, cur: new Float32Array(field.hi), i0, j0, x0, z0, cw: FW / 4, ch: FH / 4 };
  T.rect.set(x0, z0, FW * TX, FH * TX);
  T.moldOn = 1;
  T.bBase.fill(0);
  T.onMold.fill(0);
  for (let cj = 0; cj < FH / 4; cj++) {
    for (let ci = 0; ci < FW / 4; ci++) {
      let acc = 0;
      for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) acc += field.hi[(cj * 4 + y) * FW + ci * 4 + x];
      const k = (j0 + cj) * N + i0 + ci;
      T.bBase[k] = acc / 16;
      T.onMold[k] = acc / 16 > 0.3 ? 1 : 0;
    }
  }
  return T.mold;
}

export function clearMold() {
  T.mold = null;
  T.moldOn = 0;
  T.bBase.fill(0);
  T.onMold.fill(0);
}

export function rebuildFills(bodies) {
  T.version++;
  T.b.set(T.bBase);
  const m = T.mold;
  if (m) m.cur.set(m.base);
  for (const body of bodies) {
    const f = body.fill;
    if (!f) continue;
    for (let q = 0; q < f.cells.length; q++) {
      const k = f.cells[q];
      if (f.cellS[q] > T.b[k]) T.b[k] = f.cellS[q];
    }
    if (m && f.hi && f.moldRef === m) {
      const p = f.hi;
      for (let y = 0; y < p.h; y++) {
        for (let x = 0; x < p.w; x++) {
          const v = p.vals[y * p.w + x];
          const k = (p.y0 + y) * FW + p.x0 + x;
          if (v > m.cur[k]) m.cur[k] = v;
        }
      }
    }
  }
  if (m) {
    const d = T.texData;
    for (let i = 0; i < d.length; i++) d[i] = THREE.DataUtils.toHalfFloat(m.cur[i]);
    T.tex.needsUpdate = true;
  }
}

export function coarseAt(x, z) {
  const u = clamp((x + HALF) / DX - 0.5, 0, N - 1.001);
  const v = clamp((z + HALF) / DX - 0.5, 0, N - 1.001);
  const i = u | 0;
  const j = v | 0;
  const fu = u - i;
  const fv = v - j;
  const k = j * N + i;
  const b = T.b;
  return (b[k] * (1 - fu) + b[k + 1] * fu) * (1 - fv) + (b[k + N] * (1 - fu) + b[k + N + 1] * fu) * fv;
}

export function inDomain(x, z, m = 0) {
  return x > -HALF + m && x < HALF - m && z > -HALF + m && z < HALF - m;
}

export function hiAt(x, z) {
  const m = T.mold;
  if (m) {
    const u = (x - m.x0) / TX - 0.5;
    const v = (z - m.z0) / TX - 0.5;
    if (u >= 0 && v >= 0 && u < FW - 1 && v < FH - 1) {
      const i = u | 0;
      const j = v | 0;
      const fu = u - i;
      const fv = v - j;
      const k = j * FW + i;
      const c = m.cur;
      return (c[k] * (1 - fu) + c[k + 1] * fu) * (1 - fv) + (c[k + FW] * (1 - fu) + c[k + FW + 1] * fu) * fv;
    }
  }
  if (!inDomain(x, z)) return 0;
  return coarseAt(x, z);
}

export function detailAt(x, z) {
  const m = T.mold;
  if (!m || !m.field.fine) return hiAt(x, z);
  const u = (x - m.x0) / TX;
  const v = (z - m.z0) / TX;
  if (u < 1 || v < 1 || u >= FW - 1 || v >= FH - 1) return hiAt(x, z);
  const k = (v | 0) * FW + (u | 0);
  if (m.cur[k] !== m.base[k]) return hiAt(x, z);
  const f = m.field;
  const fu = u * f.ss - 0.5;
  const fv = v * f.ss - 0.5;
  const i = fu | 0;
  const j = fv | 0;
  const a = fu - i;
  const b = fv - j;
  const q = j * f.fw + i;
  const c = f.fine;
  return (c[q] * (1 - a) + c[q + 1] * a) * (1 - b) + (c[q + f.fw] * (1 - a) + c[q + f.fw + 1] * a) * b;
}
