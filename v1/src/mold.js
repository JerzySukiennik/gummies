// Gummies: silicone mold height field, mesh and thumbnails built from shape distance fields.
import * as THREE from 'three';
import { TX, smooth } from './config.js';
import { SHAPES, rasterize, drawShapeIn, blur } from './shapes.js';

export const FW = 256;
export const FH = 228;
export const PAD = 14;
export const CW = 76;
export const CH = 100;
export const TOPR = 1.52;
export const CROWN = 0.08;
export const DEPTH = 1.12;
const FILLET = 0.36;
const RE = 0.35;

export const SETS = [
  { id: 'bears', pl: 'Misie', en: 'Bears', shapes: ['bear', 'bear', 'bear', 'bear', 'bear', 'bear'] },
  { id: 'classic', pl: 'Klasyki', en: 'Classics', shapes: ['bear', 'worm', 'cola', 'ring', 'egg', 'frog'] },
  { id: 'sweet', pl: 'Słodkie', en: 'Sweets', shapes: ['heart', 'star', 'cherry', 'drop', 'flower', 'strawberry'] },
  { id: 'gzowo', pl: 'Gzowo', en: 'Gzowo', shapes: ['rocket', 'duck', 'logo', 'fish', 'flame', 'letterG'] },
  { id: 'animals', pl: 'Zwierzaki', en: 'Animals', shapes: ['dino', 'cat', 'shark', 'butterfly', 'snail', 'turtle'] },
];

function rrDist(px, py) {
  const r = 18;
  const qx = Math.abs(px - FW / 2) - (FW / 2 - 2 - r);
  const qy = Math.abs(py - FH / 2) - (FH / 2 - 2 - r);
  return r - (Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0));
}

export function resolveShapes(list) {
  return list.map(s => (typeof s === 'string' ? SHAPES[s] : s));
}

function heightAt(de, s, d) {
  if (de <= 0) return 0;
  const edge = de < RE ? Math.sqrt(1 - (1 - de / RE) * (1 - de / RE)) : 1;
  let v;
  if (s > 0) {
    const u = Math.min(s / FILLET, 1);
    v = TOPR - (DEPTH - 0.1) * (1 - Math.pow(1 - u, 2.3)) - 0.1 * smooth(0.25, 1.0, s) - d * 0.17 * smooth(0.04, 0.3, s);
  } else v = TOPR + CROWN * smooth(0, 0.45, -s);
  return v * edge;
}

export function buildField(shapeList, ss = 4, fine = true) {
  const shapes = resolveShapes(shapeList);
  const cells = shapes.map((shape, k) => ({ shape, x: PAD + (k % 3) * CW, y: PAD + ((k / 3) | 0) * CH }));
  const R = rasterize(
    FW,
    FH,
    ss,
    c => {
      for (const q of cells) drawShapeIn(c, q.shape, q.x, q.y, CW, CH, false);
    },
    c => {
      for (const q of cells) drawShapeIn(c, q.shape, q.x, q.y, CW, CH, true);
    },
    fine
  );
  const hi = new Float32Array(FW * FH);
  const field = { hi, sd: R.sd, shapes, ss, fine: null, nrm: null, refs: 0, gone: false };
  if (!fine) {
    for (let y = 0; y < FH; y++) {
      for (let x = 0; x < FW; x++) {
        const k = y * FW + x;
        hi[k] = heightAt(rrDist(x + 0.5, y + 0.5) * TX, R.sd[k] * TX, R.detail[k]);
      }
    }
    return field;
  }
  const fw = FW * ss;
  const fh = FH * ss;
  blur(R.fsd, fw, fh, 3);
  const f = new Float32Array(fw * fh);
  for (let y = 0; y < fh; y++) {
    for (let x = 0; x < fw; x++) {
      const k = y * fw + x;
      f[k] = heightAt(rrDist((x + 0.5) / ss, (y + 0.5) / ss) * TX, R.fsd[k] * TX, R.fdetail[k]);
    }
  }
  blur(f, fw, fh, 1);
  const inv = 1 / (ss * ss);
  for (let y = 0; y < FH; y++) {
    for (let x = 0; x < FW; x++) {
      let acc = 0;
      for (let sy = 0; sy < ss; sy++) {
        const o = (y * ss + sy) * fw + x * ss;
        for (let sx = 0; sx < ss; sx++) acc += f[o + sx];
      }
      hi[y * FW + x] = acc * inv;
    }
  }
  const nd = new Uint8Array(fw * fh * 4);
  const st = (2 * TX) / ss;
  for (let y = 0; y < fh; y++) {
    for (let x = 0; x < fw; x++) {
      const k = y * fw + x;
      const hx = (f[k + (x < fw - 1 ? 1 : 0)] - f[k - (x > 0 ? 1 : 0)]) / st;
      const hz = (f[k + (y < fh - 1 ? fw : 0)] - f[k - (y > 0 ? fw : 0)]) / st;
      const il = 127.5 / Math.hypot(hx, 1, hz);
      nd[k * 4] = 127.5 - hx * il;
      nd[k * 4 + 1] = 127.5 + il;
      nd[k * 4 + 2] = 127.5 - hz * il;
      nd[k * 4 + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(nd, fw, fh, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  field.fine = f;
  field.fw = fw;
  field.fh = fh;
  field.nrm = tex;
  return field;
}

export function releaseField(field) {
  if (field && field.gone && field.refs <= 0 && field.nrm) {
    field.nrm.dispose();
    field.nrm = null;
    field.fine = null;
  }
}

export function fieldCanvas(field, tint = [228, 230, 235]) {
  const cv = document.createElement('canvas');
  cv.width = FW;
  cv.height = FH;
  const c = cv.getContext('2d');
  const img = c.createImageData(FW, FH);
  const h = field.hi;
  for (let y = 0; y < FH; y++) {
    for (let x = 0; x < FW; x++) {
      const k = y * FW + x;
      const o = k * 4;
      const v = h[k];
      if (v <= 0.02) continue;
      const hx = (h[k + (x < FW - 1 ? 1 : 0)] - h[k - (x > 0 ? 1 : 0)]) / (2 * TX);
      const hz = (h[k + (y < FH - 1 ? FW : 0)] - h[k - (y > 0 ? FW : 0)]) / (2 * TX);
      const il = 1 / Math.hypot(hx, 1, hz);
      const ndl = Math.max((0.45 * hx + 0.75 + 0.5 * hz) * il, 0);
      const ao = 1 - 0.3 * smooth(0, DEPTH, TOPR - v) * (field.sd[k] > 0 ? 1 : 0);
      const s = (0.62 + 0.42 * ndl) * ao;
      img.data[o] = Math.min(255, tint[0] * s);
      img.data[o + 1] = Math.min(255, tint[1] * s);
      img.data[o + 2] = Math.min(255, tint[2] * s);
      img.data[o + 3] = 255 * smooth(0.02, 0.5, v);
    }
  }
  c.putImageData(img, 0, 0);
  return cv;
}

export function buildMoldMesh(field) {
  const h = field.hi;
  const n = FW * FH;
  const pos = new Float32Array(n * 3);
  const nor = new Float32Array(n * 3);
  const col = new Float32Array(n * 3);
  for (let y = 0; y < FH; y++) {
    for (let x = 0; x < FW; x++) {
      const k = y * FW + x;
      const o = k * 3;
      const v = h[k];
      let sx = 0;
      let sz = 0;
      let vy = v;
      const de = rrDist(x + 0.5, y + 0.5);
      if (de > -1.6 && de < 1) {
        const gx = rrDist(x + 0.6, y + 0.5) - rrDist(x + 0.4, y + 0.5);
        const gz = rrDist(x + 0.5, y + 0.6) - rrDist(x + 0.5, y + 0.4);
        const gl = Math.hypot(gx, gz) || 1;
        const to = de <= 0 ? 0 : 1;
        sx = (gx / gl) * (to - de);
        sz = (gz / gl) * (to - de);
        vy = heightAt(to * TX, -1, 0);
      }
      pos[o] = (x + 0.5 + sx) * TX;
      pos[o + 1] = vy;
      pos[o + 2] = (y + 0.5 + sz) * TX;
      const hx = (h[k + (x < FW - 1 ? 1 : 0)] - h[k - (x > 0 ? 1 : 0)]) / (2 * TX);
      const hz = (h[k + (y < FH - 1 ? FW : 0)] - h[k - (y > 0 ? FW : 0)]) / (2 * TX);
      const il = 1 / Math.hypot(hx, 1, hz);
      nor[o] = -hx * il;
      nor[o + 1] = il;
      nor[o + 2] = -hz * il;
      const ao = 1 - 0.26 * smooth(0, DEPTH, TOPR - v) * (field.sd[k] > 0 ? 1 : 0);
      col[o] = 0.86 * ao;
      col[o + 1] = 0.87 * ao;
      col[o + 2] = 0.9 * ao;
    }
  }
  const idx = new Uint32Array((FW - 1) * (FH - 1) * 6);
  let q = 0;
  for (let y = 0; y < FH - 1; y++) {
    for (let x = 0; x < FW - 1; x++) {
      const a = y * FW + x;
      const b = a + 1;
      const c = a + FW;
      const d = c + 1;
      if (h[a] <= 0 && h[b] <= 0 && h[c] <= 0 && h[d] <= 0) continue;
      idx[q++] = a;
      idx[q++] = c;
      idx[q++] = b;
      idx[q++] = b;
      idx[q++] = c;
      idx[q++] = d;
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const uv = new Float32Array(n * 2);
  for (let y = 0; y < FH; y++) {
    for (let x = 0; x < FW; x++) {
      uv[(y * FW + x) * 2] = pos[(y * FW + x) * 3] / (FW * TX);
      uv[(y * FW + x) * 2 + 1] = pos[(y * FW + x) * 3 + 2] / (FH * TX);
    }
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(new THREE.BufferAttribute(idx.subarray(0, q), 1));
  g.computeBoundingSphere();
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.52, metalness: 0, envMapIntensity: 1, side: THREE.DoubleSide });
  if (field.nrm) {
    m.normalMap = field.nrm;
    m.normalMapType = THREE.ObjectSpaceNormalMap;
  }
  const mesh = new THREE.Mesh(g, m);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}
