// Gummies: turns set fluid regions and shape masks into skinned soft-body candy.
import * as THREE from 'three';
import { N, DX, HALF, TX, clamp, IS_TOUCH } from './config.js';
import { T, detailAt, rebuildFills } from './world.js';
import { F, removeCells, buildSurface, surfSmooth } from './fluid.js';
import { Body, addBody, removeBody, bodies, toRest, updateBones } from './soft.js';
import { CANDY, LIGHT } from './candy.js';
import { edt2d } from './shapes.js';
import { FW, FH, releaseField } from './mold.js';

const NN = N * N;
const memb = new Uint8Array(NN);
const tmp3 = [0, 0, 0];

const VERT = /* glsl */ `
#include <common>
#include <skinning_pars_vertex>
attribute vec4 aPig;
attribute float aThick;
attribute vec4 aCoat;
attribute vec2 aTop;
attribute float aSide;
varying float vSide;
varying vec3 vN0;
varying mat3 vSkin;
varying vec4 vPig;
varying float vThick;
varying vec4 vCoat;
varying vec2 vTop;
varying vec3 vN;
varying vec3 vW;
varying vec3 vRest;
void main() {
  vPig = aPig;
  vThick = aThick;
  vCoat = aCoat;
  vTop = aTop;
  vRest = position;
  vSide = aSide;
  vN0 = normal;
  #include <beginnormal_vertex>
  #include <skinbase_vertex>
  #include <skinnormal_vertex>
  #ifdef USE_SKINNING
  vSkin = mat3(skinMatrix);
  #else
  vSkin = mat3(1.0);
  #endif
  #include <begin_vertex>
  transformed += normal * (smoothstep(0.3, 1.0, aCoat.a) * 0.045 + min(aTop.x + aTop.y, 1.0) * 0.02);
  #include <skinning_vertex>
  vec4 w = modelMatrix * vec4(transformed, 1.0);
  vW = w.xyz;
  vN = mat3(modelMatrix) * objectNormal;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

const FRAG = /* glsl */ `
precision highp float;
uniform float uFlash;
uniform float uDetail;
uniform sampler2D uNrm;
uniform vec4 uRect;
varying float vSide;
varying vec3 vN0;
varying mat3 vSkin;
varying vec4 vPig;
varying float vThick;
varying vec4 vCoat;
varying vec2 vTop;
varying vec3 vN;
varying vec3 vW;
varying vec3 vRest;
${CANDY}
void main() {
  vec3 N = normalize(vN);
  vec3 V = normalize(cameraPosition - vW);
  if (uDetail > 0.5 && vSide > 0.02) {
    vec2 q = (vRest.xz - uRect.xy) / uRect.zw;
    vec3 dn = -(texture2D(uNrm, q).xyz * 2.0 - 1.0);
    N = normalize(N + vSkin * (dn - normalize(vN0)) * min(1.0, vSide * 1.25));
  }
  if (dot(N, V) < 0.0) N = -N;
  vec3 p = max(vPig.rgb, vec3(0.02));
  float th = vThick * 0.85 + 0.22;
  vec3 col = mix(candyClear(p, th, N) + candyGlow(p, N, V), candyOpaque(p, N), vPig.a);
  float gloss = 1.0;
  float ca = smoothstep(0.32, 0.6, vCoat.a);
  col = mix(col, candyOpaque(max(vCoat.rgb, vec3(0.02)), N), ca);
  gloss = mix(gloss, 0.7, ca);
  vec4 top = candyTop(vRest, vTop, N, V);
  col = mix(col, top.rgb, top.a);
  gloss = mix(gloss, 0.12, top.a);
  col += candySpec(N, V, gloss) + uFlash;
  gl_FragColor = outColor(col);
  #include <colorspace_fragment>
}`;

export const gummyMat = new THREE.ShaderMaterial({
  uniforms: { uLight: { value: new THREE.Vector3(...LIGHT) }, uFlash: { value: 0 }, uDetail: { value: 0 }, uNrm: { value: null }, uRect: { value: new THREE.Vector4(0, 0, 1, 1) } },
  vertexShader: VERT,
  fragmentShader: FRAG,
  side: THREE.DoubleSide,
});

const dummyBone = new THREE.Bone();
let sceneRef = null;
export function initGummies(scene) {
  sceneRef = scene;
}

function meshRegion(G) {
  const { nx, nz, g, x0, z0, top, bot, col, tp } = G;
  const nn = nx * nz;
  const phi = new Float32Array(nn);
  for (let k = 0; k < nn; k++) phi[k] = top[k] - bot[k];
  const vt = new Int32Array(nn).fill(-1);
  const vb = new Int32Array(nn).fill(-1);
  const ex = new Int32Array(nn).fill(-1);
  const ez = new Int32Array(nn).fill(-1);
  const P = [];
  const C = [];
  const TH = [];
  const TP = [];
  const SD = [];
  let nvx = 0;
  const addV = (x, y, z, k, th, t0, t1, side) => {
    SD.push(side);
    P.push(x, y, z);
    C.push(col[k * 4], col[k * 4 + 1], col[k * 4 + 2], col[k * 4 + 3]);
    TH.push(th);
    TP.push(t0, t1);
    return nvx++;
  };
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const k = j * nx + i;
      if (phi[k] <= 0) continue;
      const x = x0 + i * g;
      const z = z0 + j * g;
      vt[k] = addV(x, top[k], z, k, phi[k], tp[k * 2], tp[k * 2 + 1], 0);
      vb[k] = addV(x, bot[k], z, k, phi[k], 0, 0, 1);
    }
  }
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const k = j * nx + i;
      const a = phi[k] > 0;
      if (i < nx - 1) {
        const b = phi[k + 1] > 0;
        if (a !== b) {
          const t = clamp(phi[k] / (phi[k] - phi[k + 1]), 0.04, 0.96);
          const y = 0.5 * (top[k] + t * (top[k + 1] - top[k]) + bot[k] + t * (bot[k + 1] - bot[k]));
          ex[k] = addV(x0 + (i + t) * g, y, z0 + j * g, a ? k : k + 1, 0, 0, 0, 0.3);
        }
      }
      if (j < nz - 1) {
        const b = phi[k + nx] > 0;
        if (a !== b) {
          const t = clamp(phi[k] / (phi[k] - phi[k + nx]), 0.04, 0.96);
          const y = 0.5 * (top[k] + t * (top[k + nx] - top[k]) + bot[k] + t * (bot[k + nx] - bot[k]));
          ez[k] = addV(x0 + i * g, y, z0 + (j + t) * g, a ? k : k + nx, 0, 0, 0, 0.3);
        }
      }
    }
  }
  const I = [];
  const pt = [];
  const pb = [];
  for (let j = 0; j < nz - 1; j++) {
    for (let i = 0; i < nx - 1; i++) {
      const k0 = j * nx + i;
      const k1 = k0 + 1;
      const k2 = k0 + nx + 1;
      const k3 = k0 + nx;
      const i0 = phi[k0] > 0;
      const i1 = phi[k1] > 0;
      const i2 = phi[k2] > 0;
      const i3 = phi[k3] > 0;
      if (!i0 && !i1 && !i2 && !i3) continue;
      pt.length = 0;
      pb.length = 0;
      if (i0) {
        pt.push(vt[k0]);
        pb.push(vb[k0]);
      }
      if (i0 !== i1) {
        pt.push(ex[k0]);
        pb.push(ex[k0]);
      }
      if (i1) {
        pt.push(vt[k1]);
        pb.push(vb[k1]);
      }
      if (i1 !== i2) {
        pt.push(ez[k1]);
        pb.push(ez[k1]);
      }
      if (i2) {
        pt.push(vt[k2]);
        pb.push(vb[k2]);
      }
      if (i2 !== i3) {
        pt.push(ex[k3]);
        pb.push(ex[k3]);
      }
      if (i3) {
        pt.push(vt[k3]);
        pb.push(vb[k3]);
      }
      if (i3 !== i0) {
        pt.push(ez[k0]);
        pb.push(ez[k0]);
      }
      for (let t = 1; t < pt.length - 1; t++) {
        I.push(pt[0], pt[t + 1], pt[t]);
        I.push(pb[0], pb[t], pb[t + 1]);
      }
    }
  }
  return { phi, pos: new Float32Array(P), pig: new Float32Array(C), thick: new Float32Array(TH), tops: new Float32Array(TP), side: new Float32Array(SD), idx: nvx > 65535 ? new Uint32Array(I) : new Uint16Array(I), nv: nvx };
}

function sampleParticles(G, phi) {
  const { nx, nz, g, x0, z0, top, bot } = G;
  const nn = nx * nz;
  const f = new Float64Array(nn);
  let area = 0;
  let peak = 0;
  let ax0 = 1e9;
  let ax1 = -1e9;
  let az0 = 1e9;
  let az1 = -1e9;
  for (let k = 0; k < nn; k++) {
    if (phi[k] > 0) {
      f[k] = 1e20;
      area += g * g;
      if (phi[k] > peak) peak = phi[k];
      const i = k % nx;
      const j = (k / nx) | 0;
      if (i < ax0) ax0 = i;
      if (i > ax1) ax1 = i;
      if (j < az0) az0 = j;
      if (j > az1) az1 = j;
    }
  }
  edt2d(f, nx, nz);
  let maxD = 0;
  for (let k = 0; k < nn; k++) {
    f[k] = Math.min(Math.sqrt(f[k]), 1e4) * g;
    if (f[k] > maxD) maxD = f[k];
  }
  let sp = clamp(maxD * 0.9, 0.42, 1.0);
  if (area / (sp * sp * 0.866) > 150) sp = Math.sqrt(area / (150 * 0.866));
  let minEdge = Math.min(0.3 * sp, 0.5 * maxD);
  let pts = [];
  for (let attempt = 0; attempt < 4; attempt++) {
    pts = [];
    const rowH = sp * 0.866;
    let r = 0;
    for (let z = z0 + rowH * 0.5; z < z0 + (nz - 1) * g; z += rowH, r++) {
      for (let x = x0 + (r & 1 ? sp * 0.75 : sp * 0.25); x < x0 + (nx - 1) * g; x += sp) {
        const i = Math.round((x - x0) / g);
        const j = Math.round((z - z0) / g);
        const k = j * nx + i;
        if (phi[k] <= 0 || f[k] < minEdge) continue;
        pts.push(x, (top[k] + bot[k]) * 0.5, z, clamp(Math.min(phi[k] * 0.5, f[k] + 0.06), 0.18, 0.75));
      }
    }
    if (pts.length >= 12) break;
    sp *= 0.62;
    minEdge *= 0.62;
  }
  if (pts.length === 0) {
    let best = 0;
    for (let k = 0; k < nn; k++) if (phi[k] > 0 && f[k] > f[best]) best = k;
    pts.push(x0 + (best % nx) * g, (top[best] + bot[best]) * 0.5, z0 + ((best / nx) | 0) * g, clamp(phi[best] * 0.5, 0.2, 0.75));
  }
  const L = Math.max((ax1 - ax0) * g, (az1 - az0) * g, 0.5);
  return { pts, sp, maxD, area, peak, L };
}

export function buildBody(G, opts = {}) {
  const M = meshRegion(G);
  if (M.nv < 6 || M.idx.length < 12) return null;
  const S = sampleParticles(G, M.phi);
  const n = S.pts.length / 4;
  const B = new Body(n);
  for (let i = 0; i < n; i++) {
    B.rx[i] = S.pts[i * 4];
    B.ry[i] = S.pts[i * 4 + 1];
    B.rz[i] = S.pts[i * 4 + 2];
    B.rad[i] = S.pts[i * 4 + 3];
  }
  B.finish(S.sp * 2.25);
  B.place();
  const choc = opts.kind === 'choc';
  const slim = (2 * S.maxD) / S.L;
  B.kind = choc ? 'choc' : 'mass';
  B.alpha = choc ? 0.85 : 0.5;
  B.beta = choc ? 0.6 : clamp(1.6 * slim - 0.25, 0.03, 0.5) * clamp(6 / S.L, 0.2, 1);
  B.stretch = choc ? 0.4 : 1.6;
  B.breakD = choc ? 0.1 : 0.26;
  B.fric = choc ? 0.5 : 0.7;
  B.bounce = choc ? 0.12 : 0.34;
  B.size = S.L;
  B.area = S.area;
  B.peak = S.peak;
  B.sp = S.sp;
  B.reach = Math.min(0.9, S.sp * 0.5);

  const nv = M.nv;
  const si = new Uint16Array(nv * 4);
  const sw = new Float32Array(nv * 4);
  const Rr = S.sp * 2.1;
  const R2 = Rr * Rr;
  const bi = [0, 0, 0, 0];
  const bw = [0, 0, 0, 0];
  for (let v = 0; v < nv; v++) {
    const X = M.pos[v * 3];
    const Y = M.pos[v * 3 + 1];
    const Z = M.pos[v * 3 + 2];
    bw[0] = bw[1] = bw[2] = bw[3] = 0;
    bi[0] = bi[1] = bi[2] = bi[3] = 0;
    let nearest = 0;
    let nd = 1e9;
    for (let i = 0; i < n; i++) {
      const dx = X - B.rx[i];
      const dy = Y - B.ry[i];
      const dz = Z - B.rz[i];
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 < nd) {
        nd = d2;
        nearest = i;
      }
      if (d2 >= R2) continue;
      const u = 1 - d2 / R2;
      const w = u * u * u + 1e-4;
      let m = 0;
      if (bw[1] < bw[m]) m = 1;
      if (bw[2] < bw[m]) m = 2;
      if (bw[3] < bw[m]) m = 3;
      if (w > bw[m]) {
        bw[m] = w;
        bi[m] = i;
      }
    }
    let sum = bw[0] + bw[1] + bw[2] + bw[3];
    if (sum <= 0) {
      bi[0] = nearest;
      bw[0] = 1;
      sum = 1;
    }
    for (let m = 0; m < 4; m++) {
      si[v * 4 + m] = bi[m];
      sw[v * 4 + m] = bw[m] / sum;
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(M.pos, 3));
  geo.setAttribute('aPig', new THREE.BufferAttribute(M.pig, 4));
  geo.setAttribute('aThick', new THREE.BufferAttribute(M.thick, 1));
  geo.setAttribute('aCoat', new THREE.BufferAttribute(new Float32Array(nv * 4), 4));
  geo.setAttribute('aTop', new THREE.BufferAttribute(M.tops, 2));
  geo.setAttribute('aSide', new THREE.BufferAttribute(M.side, 1));
  geo.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4));
  geo.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
  geo.setIndex(new THREE.BufferAttribute(M.idx, 1));
  geo.computeVertexNormals();
  const mesh = new THREE.SkinnedMesh(geo, gummyMat);
  const skel = new THREE.Skeleton(new Array(n).fill(dummyBone));
  skel.update = () => {};
  mesh.bind(skel, new THREE.Matrix4());
  skel.computeBoneTexture();
  mesh.frustumCulled = false;
  mesh.castShadow = true;
  B.mesh = mesh;
  B.skel = skel;
  B.bones = skel.boneMatrices;
  B.boneTex = skel.boneTexture;
  B.flash = 0;
  B.detail = null;
  B.src = G;
  mesh.onBeforeRender = () => {
    const u = gummyMat.uniforms;
    u.uFlash.value = B.flash;
    const d = B.detail && B.detail.field.nrm ? B.detail : null;
    u.uDetail.value = d ? 1 : 0;
    if (d) {
      u.uNrm.value = d.field.nrm;
      u.uRect.value.set(d.rect[0], d.rect[1], d.rect[2], d.rect[3]);
    }
    gummyMat.uniformsNeedUpdate = true;
  };

  const cell = 0.5;
  let bx0 = 1e9;
  let bz0 = 1e9;
  let bx1 = -1e9;
  let bz1 = -1e9;
  for (let v = 0; v < nv; v++) {
    const X = M.pos[v * 3];
    const Z = M.pos[v * 3 + 2];
    if (X < bx0) bx0 = X;
    if (X > bx1) bx1 = X;
    if (Z < bz0) bz0 = Z;
    if (Z > bz1) bz1 = Z;
  }
  const cw = Math.max(1, Math.ceil((bx1 - bx0) / cell) + 1);
  const ch = Math.max(1, Math.ceil((bz1 - bz0) / cell) + 1);
  const start = new Int32Array(cw * ch + 1);
  for (let v = 0; v < nv; v++) start[(((M.pos[v * 3 + 2] - bz0) / cell) | 0) * cw + (((M.pos[v * 3] - bx0) / cell) | 0) + 1]++;
  for (let c = 0; c < cw * ch; c++) start[c + 1] += start[c];
  const cur = new Int32Array(start);
  const items = new Int32Array(nv);
  for (let v = 0; v < nv; v++) items[cur[(((M.pos[v * 3 + 2] - bz0) / cell) | 0) * cw + (((M.pos[v * 3] - bx0) / cell) | 0)]++] = v;
  B.bin = { x0: bx0, z0: bz0, cw, ch, cell, start, items };
  B.coated = 0;
  B.topped = [0, 0];
  B.tint = opts.tint || [M.pig[0], M.pig[1], M.pig[2]];
  B.meta = opts.meta || {};

  if (opts.anchored) B.anchorAll();
  updateBones(B);
  sceneRef.add(mesh);
  addBody(B);
  return B;
}

function nearVerts(B, rp, rad, fn, ys = 0.6) {
  const b = B.bin;
  const pos = B.mesh.geometry.attributes.position.array;
  const i0 = Math.max(0, ((rp[0] - rad - b.x0) / b.cell) | 0);
  const i1 = Math.min(b.cw - 1, ((rp[0] + rad - b.x0) / b.cell) | 0);
  const j0 = Math.max(0, ((rp[2] - rad - b.z0) / b.cell) | 0);
  const j1 = Math.min(b.ch - 1, ((rp[2] + rad - b.z0) / b.cell) | 0);
  const r2 = rad * rad;
  for (let j = j0; j <= j1; j++) {
    for (let i = i0; i <= i1; i++) {
      const c = j * b.cw + i;
      for (let k = b.start[c]; k < b.start[c + 1]; k++) {
        const v = b.items[k];
        const dx = pos[v * 3] - rp[0];
        const dy = (pos[v * 3 + 1] - rp[1]) * ys;
        const dz = pos[v * 3 + 2] - rp[2];
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 < r2) fn(v, d2);
      }
    }
  }
}

export function coatBody(B, pi, wx, wy, wz, mat, amount, rad) {
  toRest(B, pi, wx, wy, wz, tmp3);
  const a = B.mesh.geometry.attributes.aCoat;
  const c = a.array;
  const r2 = rad * rad;
  nearVerts(B, tmp3, rad * 1.9, (v, d2) => {
    const o = v * 4;
    if (c[o + 3] < 0.05) {
      c[o] = mat.rgb[0];
      c[o + 1] = mat.rgb[1];
      c[o + 2] = mat.rgb[2];
    } else if (d2 < r2) {
      c[o] += (mat.rgb[0] - c[o]) * 0.35;
      c[o + 1] += (mat.rgb[1] - c[o + 1]) * 0.35;
      c[o + 2] += (mat.rgb[2] - c[o + 2]) * 0.35;
    }
    if (d2 < r2) c[o + 3] = Math.min(1.5, c[o + 3] + amount * (1 - (d2 / r2) * 0.75));
  });
  a.needsUpdate = true;
  B.coated += amount;
  B.coatKind = mat.label || B.coatKind;
}

export function topBody(B, pi, wx, wy, wz, kind, amount, rad) {
  toRest(B, pi, wx, wy, wz, tmp3);
  const a = B.mesh.geometry.attributes.aTop;
  const c = a.array;
  const r2 = rad * rad;
  nearVerts(B, tmp3, rad, (v, d2) => {
    const o = v * 2 + kind;
    c[o] = Math.min(1, c[o] + amount * (1 - (d2 / r2) * 0.6));
  });
  a.needsUpdate = true;
  B.topped[kind] += amount;
}

function trimAt(x, z) {
  const m = T.mold;
  if (!m) return 0;
  const i = Math.floor((x - m.x0) / TX);
  const j = Math.floor((z - m.z0) / TX);
  if (i < 0 || j < 0 || i >= FW || j >= FH) return 0;
  const k = j * FW + i;
  return m.base[k] > 0.3 && m.field.sd[k] <= 0 ? 0.1 : 0;
}

function bil(a, u, v) {
  const i = clamp(Math.floor(u), 0, N - 2);
  const j = clamp(Math.floor(v), 0, N - 2);
  const fu = clamp(u - i, 0, 1);
  const fv = clamp(v - j, 0, 1);
  const k = j * N + i;
  return (a[k] * (1 - fu) + a[k + 1] * fu) * (1 - fv) + (a[k + N] * (1 - fu) + a[k + N + 1] * fu) * fv;
}

export function solidify(comp) {
  if (F.dirty) buildSurface();
  const cells = comp.cells;
  let opSum = 0;
  for (const k of cells) {
    memb[k] = 1;
    opSum += F.op[k];
    for (const o of [-1, 1, -N, N, -N - 1, -N + 1, N - 1, N + 1]) if (!memb[k + o]) memb[k + o] = 2;
  }
  const kind = opSum / cells.length > 0.95 ? 'choc' : 'mass';
  const area = comp.n * DX * DX;
  const g = clamp(Math.sqrt(area / 3000), IS_TOUCH ? 0.075 : 0.062, 0.25);
  const wx0 = -HALF + (comp.i0 - 1) * DX;
  const wz0 = -HALF + (comp.j0 - 1) * DX;
  const wx1 = -HALF + (comp.i1 + 2) * DX;
  const wz1 = -HALF + (comp.j1 + 2) * DX;
  const nx = Math.ceil((wx1 - wx0) / g) + 1;
  const nz = Math.ceil((wz1 - wz0) / g) + 1;
  const nn = nx * nz;
  const G = { nx, nz, g, x0: wx0, z0: wz0, top: new Float32Array(nn), bot: new Float32Array(nn), col: new Float32Array(nn * 4), tp: new Float32Array(nn * 2) };
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const k = j * nx + i;
      const x = wx0 + i * g;
      const z = wz0 + j * g;
      const u = (x + HALF) / DX - 0.5;
      const v = (z + HALF) / DX - 0.5;
      const t = detailAt(x, z);
      const ck = clamp(Math.round(v), 0, N - 1) * N + clamp(Math.round(u), 0, N - 1);
      G.bot[k] = t;
      G.top[k] = memb[ck] ? surfSmooth(u, v) - trimAt(x, z) : t - 0.2;
      G.col[k * 4] = Math.exp(-bil(F.ar, u, v));
      G.col[k * 4 + 1] = Math.exp(-bil(F.ag, u, v));
      G.col[k * 4 + 2] = Math.exp(-bil(F.ab, u, v));
      G.col[k * 4 + 3] = bil(F.op, u, v);
      G.tp[k * 2] = bil(F.t0, u, v);
      G.tp[k * 2 + 1] = bil(F.t1, u, v);
    }
  }
  const B = buildBody(G, { kind, anchored: true });
  if (B) {
    const cellS = new Float32Array(cells.length);
    for (let q = 0; q < cells.length; q++) cellS[q] = T.b[cells[q]] + F.h[cells[q]];
    const fill = { cells: Int32Array.from(cells), cellS, hi: null, moldRef: T.mold };
    const m = T.mold;
    if (m) {
      const px0 = Math.max(0, Math.floor((wx0 - m.x0) / TX));
      const py0 = Math.max(0, Math.floor((wz0 - m.z0) / TX));
      const px1 = Math.min(FW - 1, Math.ceil((wx1 - m.x0) / TX));
      const py1 = Math.min(FH - 1, Math.ceil((wz1 - m.z0) / TX));
      if (px1 >= px0 && py1 >= py0) {
        const w = px1 - px0 + 1;
        const hgt = py1 - py0 + 1;
        const vals = new Float32Array(w * hgt).fill(-1e9);
        let any = false;
        for (let y = 0; y < hgt; y++) {
          for (let x = 0; x < w; x++) {
            const X = m.x0 + (px0 + x + 0.5) * TX;
            const Z = m.z0 + (py0 + y + 0.5) * TX;
            const u = (X + HALF) / DX - 0.5;
            const v = (Z + HALF) / DX - 0.5;
            const ck = clamp(Math.round(v), 0, N - 1) * N + clamp(Math.round(u), 0, N - 1);
            if (!memb[ck]) continue;
            const s = surfSmooth(u, v) - trimAt(X, Z);
            if (s - m.cur[(py0 + y) * FW + px0 + x] > 0) {
              vals[y * w + x] = s;
              any = true;
            }
          }
        }
        if (any) fill.hi = { x0: px0, y0: py0, w, h: hgt, vals };
      }
    }
    B.fill = fill;
    B.inMold = !!(m && fill.hi);
    if (B.inMold && m.field.nrm) {
      B.detail = { field: m.field, rect: [m.x0, m.z0, FW * TX, FH * TX] };
      m.field.refs++;
    }
  }
  for (const k of cells) {
    memb[k] = 0;
    for (const o of [-1, 1, -N, N, -N - 1, -N + 1, N - 1, N + 1]) {
      memb[k + o] = 0;
      for (const p of [-1, 1, -N, N]) if (F.h[k + o + p] < 0.09) F.h[k + o + p] = 0;
    }
  }
  removeCells(cells);
  rebuildFills(bodies);
  return B;
}

export function freeFill(B) {
  if (!B.fill) return;
  B.fill = null;
  B.inMold = false;
  rebuildFills(bodies);
}

export function destroyBody(B) {
  if (B.dead) return;
  const hadFill = !!B.fill;
  B.fill = null;
  removeBody(B);
  if (B.detail) {
    B.detail.field.refs--;
    releaseField(B.detail.field);
    B.detail = null;
  }
  if (B.mesh) {
    sceneRef.remove(B.mesh);
    B.mesh.geometry.dispose();
    B.skel.boneTexture.dispose();
  }
  if (hadFill) rebuildFills(bodies);
}

export function bodyFromField(sd, w, h, texel, opts) {
  const g = opts.g || 0.1;
  const nx = Math.ceil((w * texel) / g) + 3;
  const nz = Math.ceil((h * texel) / g) + 3;
  const nn = nx * nz;
  const thick = opts.thick || 1;
  const fil = opts.fillet || 0.45;
  const G = { nx, nz, g, x0: opts.x - (w * texel) / 2 - g, z0: opts.z - (h * texel) / 2 - g, top: new Float32Array(nn), bot: new Float32Array(nn), col: new Float32Array(nn * 4), tp: new Float32Array(nn * 2) };
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const k = j * nx + i;
      const u = clamp(((i - 1) * g) / texel - 0.5, 0, w - 1.001);
      const v = clamp(((j - 1) * g) / texel - 0.5, 0, h - 1.001);
      const iu = u | 0;
      const iv = v | 0;
      const fu = u - iu;
      const fv = v - iv;
      const q = iv * w + iu;
      let s = ((sd[q] * (1 - fu) + sd[q + 1] * fu) * (1 - fv) + (sd[q + w] * (1 - fu) + sd[q + w + 1] * fu) * fv) * texel;
      if (i < 1 || j < 1 || i > nx - 2 || j > nz - 2) s = -1;
      const uu = Math.min(Math.max(s, 0) / fil, 1);
      const d = opts.detail ? opts.detail[q] * 0.15 : 0;
      G.bot[k] = opts.y || 0;
      G.top[k] = s > 0 ? (opts.y || 0) + thick * (1 - Math.pow(1 - uu, 2.4)) + d * Math.min(1, s / 0.3) : (opts.y || 0) - 0.3;
      G.col[k * 4] = opts.rgb[0];
      G.col[k * 4 + 1] = opts.rgb[1];
      G.col[k * 4 + 2] = opts.rgb[2];
      G.col[k * 4 + 3] = opts.op || 0;
    }
  }
  return buildBody(G, { kind: opts.kind || 'mass', anchored: false, meta: opts.meta });
}

export function serializeBody(B) {
  const G = B.src;
  if (!G) return null;
  const nn = G.nx * G.nz;
  let lo = 1e9;
  let mp = 1e-4;
  let hi = -1e9;
  for (let k = 0; k < nn; k++) {
    const p = G.top[k] - G.bot[k];
    if (p > 0) {
      if (G.bot[k] < lo) lo = G.bot[k];
      if (G.bot[k] > hi) hi = G.bot[k];
    }
    if (Math.abs(p) > mp) mp = Math.abs(p);
  }
  const sc = Math.max(1e-5, (hi - lo) / 65000);
  const ps = mp / 32000;
  const bot = new Uint16Array(nn);
  const phi = new Int16Array(nn);
  const col = new Uint8Array(nn * 4);
  const tp = new Uint8Array(nn * 2);
  for (let k = 0; k < nn; k++) {
    bot[k] = clamp(Math.round((G.bot[k] - lo) / sc), 0, 65535);
    let q = Math.round((G.top[k] - G.bot[k]) / ps);
    if (q === 0) q = G.top[k] > G.bot[k] ? 1 : -1;
    phi[k] = clamp(q, -32767, 32767);
    for (let c = 0; c < 4; c++) col[k * 4 + c] = clamp(Math.round(G.col[k * 4 + c] * 255), 0, 255);
    tp[k * 2] = clamp(Math.round(G.tp[k * 2] * 255), 0, 255);
    tp[k * 2 + 1] = clamp(Math.round(G.tp[k * 2 + 1] * 255), 0, 255);
  }
  const ca = B.mesh.geometry.attributes.aCoat.array;
  const ta = B.mesh.geometry.attributes.aTop.array;
  const coat = new Uint8Array(ca.length);
  for (let i = 0; i < ca.length; i++) coat[i] = clamp(Math.round((i % 4 === 3 ? ca[i] / 1.5 : ca[i]) * 255), 0, 255);
  const top = new Uint8Array(ta.length);
  for (let i = 0; i < ta.length; i++) top[i] = clamp(Math.round(ta[i] * 255), 0, 255);
  return { nx: G.nx, nz: G.nz, g: G.g, sc, ps, bot, phi, col, tp, coat, top, kind: B.kind, face: B.face || -1, meta: B.meta, coated: B.coated, topped: B.topped };
}

export function bodyFromData(d, cx, cz) {
  const nn = d.nx * d.nz;
  const G = { nx: d.nx, nz: d.nz, g: d.g, x0: cx - ((d.nx - 1) * d.g) / 2, z0: cz - ((d.nz - 1) * d.g) / 2, top: new Float32Array(nn), bot: new Float32Array(nn), col: new Float32Array(nn * 4), tp: new Float32Array(nn * 2) };
  for (let k = 0; k < nn; k++) {
    G.bot[k] = d.bot[k] * d.sc;
    G.top[k] = G.bot[k] + d.phi[k] * d.ps;
    for (let c = 0; c < 4; c++) G.col[k * 4 + c] = d.col[k * 4 + c] / 255;
    G.tp[k * 2] = d.tp[k * 2] / 255;
    G.tp[k * 2 + 1] = d.tp[k * 2 + 1] / 255;
  }
  const B = buildBody(G, { kind: d.kind, anchored: false, meta: d.meta });
  if (!B) return null;
  const ca = B.mesh.geometry.attributes.aCoat;
  const ta = B.mesh.geometry.attributes.aTop;
  if (ca.array.length === d.coat.length) {
    for (let i = 0; i < d.coat.length; i++) ca.array[i] = (d.coat[i] / 255) * (i % 4 === 3 ? 1.5 : 1);
    ca.needsUpdate = true;
  }
  if (ta.array.length === d.top.length) {
    for (let i = 0; i < d.top.length; i++) ta.array[i] = d.top[i] / 255;
    ta.needsUpdate = true;
  }
  B.face = d.face;
  B.coated = d.coated || 0;
  B.topped = d.topped || [0, 0];
  return B;
}
