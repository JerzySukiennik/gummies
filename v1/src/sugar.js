// Gummies: sour sugar and sprinkles as falling grains that stick to candy or rest on the table.
import * as THREE from 'three';
import { GRAV, HALF } from './config.js';
import { coarseAt, inDomain } from './world.js';
import { surfaceAt, sprinkle } from './fluid.js';
import { queryHit, bodies } from './soft.js';
import { topBody } from './gummy.js';

const FALL = 900;
const REST = 7000;
const TOTAL = FALL + REST;
const pos = new Float32Array(TOTAL * 3).fill(-999);
const col = new Float32Array(TOTAL * 3);
const siz = new Float32Array(TOTAL);
const vel = new Float32Array(FALL * 3);
const live = new Uint8Array(FALL);
const kindF = new Uint8Array(FALL);
const kindR = new Uint8Array(REST);
const bucketOf = new Int32Array(REST).fill(-1);
const BW = 128;
const buckets = Array.from({ length: BW * BW }, () => []);
const hit = { body: null, i: 0 };
let falling = 0;
let restCur = 0;
let fallCur = 0;
let points = null;
let dirty = false;

export const sugarState = { landed: 0 };

function hue(h, out, o) {
  const f = n => {
    const k = (n + h * 6) % 6;
    return 1 - 0.82 * Math.max(0, Math.min(k, 4 - k, 1));
  };
  out[o] = f(5);
  out[o + 1] = f(3);
  out[o + 2] = f(1);
}

export function spawnGrain(x, y, z, vx, vy, vz, kind) {
  for (let n = 0; n < FALL; n++) {
    fallCur = (fallCur + 1) % FALL;
    if (!live[fallCur]) break;
  }
  const i = fallCur;
  if (live[i]) return;
  live[i] = 1;
  kindF[i] = kind;
  pos[i * 3] = x;
  pos[i * 3 + 1] = y;
  pos[i * 3 + 2] = z;
  vel[i * 3] = vx;
  vel[i * 3 + 1] = vy;
  vel[i * 3 + 2] = vz;
  if (kind) hue(Math.random(), col, i * 3);
  else col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = 0.9 + Math.random() * 0.1;
  siz[i] = kind ? 0.15 : 0.1;
  falling++;
}

function unbucket(r) {
  const b = bucketOf[r];
  if (b < 0) return;
  const l = buckets[b];
  const q = l.indexOf(r);
  if (q >= 0) {
    l[q] = l[l.length - 1];
    l.pop();
  }
  bucketOf[r] = -1;
}

function rest(i, x, y, z) {
  const r = restCur;
  restCur = (restCur + 1) % REST;
  unbucket(r);
  const o = (FALL + r) * 3;
  pos[o] = x;
  pos[o + 1] = y;
  pos[o + 2] = z;
  col[o] = col[i * 3];
  col[o + 1] = col[i * 3 + 1];
  col[o + 2] = col[i * 3 + 2];
  siz[FALL + r] = siz[i];
  kindR[r] = kindF[i];
  const bi = Math.floor(x + BW / 2);
  const bj = Math.floor(z + BW / 2);
  if (bi >= 0 && bj >= 0 && bi < BW && bj < BW) {
    const b = bj * BW + bi;
    buckets[b].push(r);
    bucketOf[r] = b;
  }
}

export function stepSugar(dt) {
  sugarState.landed = 0;
  if (falling > 0) {
    dirty = true;
    for (let i = 0; i < FALL; i++) {
      if (!live[i]) continue;
      const o = i * 3;
      vel[o + 1] -= GRAV * dt;
      vel[o] *= 0.985;
      vel[o + 2] *= 0.985;
      const nsub = Math.min(6, Math.max(1, Math.ceil((Math.abs(vel[o + 1]) * dt) / 0.4)));
      let x = pos[o];
      let y = pos[o + 1];
      let z = pos[o + 2];
      let struck = false;
      for (let q = 0; q < nsub; q++) {
        x += (vel[o] * dt) / nsub;
        y += (vel[o + 1] * dt) / nsub;
        z += (vel[o + 2] * dt) / nsub;
        if (y < 12 && queryHit(x, y, z, 0.12, hit) && !hit.body.ghost && !hit.body.carrier) {
          struck = true;
          break;
        }
      }
      pos[o] = x;
      pos[o + 1] = y;
      pos[o + 2] = z;
      let done = false;
      if (struck) {
        if (Math.random() < 0.85) {
          const B = hit.body;
          const j = hit.i;
          const dx = x - B.x[j];
          const dy = y - B.y[j];
          const dz = z - B.z[j];
          const sc = B.rad[j] / (Math.hypot(dx, dy, dz) || 1);
          topBody(B, j, B.x[j] + dx * sc, B.y[j] + dy * sc, B.z[j] + dz * sc, kindF[i], 0.3, 0.62);
          done = true;
          sugarState.landed++;
        } else {
          vel[o + 1] = Math.abs(vel[o + 1]) * 0.2;
          vel[o] += (Math.random() - 0.5) * 60;
          vel[o + 2] += (Math.random() - 0.5) * 60;
          pos[o + 1] = y + 0.3;
        }
      } else {
        const dom = inDomain(x, z, 1);
        const g = dom ? coarseAt(x, z) : 0;
        const fs = dom ? surfaceAt(x, z) : -1e9;
        if (fs > g && y <= fs) {
          sprinkle(x, z, kindF[i], 0.3);
          done = true;
          sugarState.landed++;
        } else if (y <= g + 0.04) {
          if (vel[o + 1] < -90 && Math.random() < 0.45) {
            vel[o + 1] *= -0.22;
            vel[o] += (Math.random() - 0.5) * 30;
            vel[o + 2] += (Math.random() - 0.5) * 30;
            pos[o + 1] = g + 0.05;
          } else {
            rest(i, x, g + 0.04, z);
            done = true;
            sugarState.landed++;
          }
        }
      }
      if (done || y < -5 || Math.abs(x) > HALF * 3) {
        live[i] = 0;
        pos[o + 1] = -999;
        falling--;
      }
    }
  }
  for (const B of bodies) {
    if (B.asleep || B.carrier || B.anchors > 0) continue;
    for (let i = 0; i < B.n; i++) {
      if (B.y[i] - B.rad[i] > 0.3) continue;
      const bi = Math.floor(B.x[i] + BW / 2);
      const bj = Math.floor(B.z[i] + BW / 2);
      if (bi < 0 || bj < 0 || bi >= BW || bj >= BW) continue;
      const l = buckets[bj * BW + bi];
      if (!l.length) continue;
      const rr = (B.rad[i] + 0.1) * (B.rad[i] + 0.1);
      for (let q = l.length - 1; q >= 0; q--) {
        const r = l[q];
        const o = (FALL + r) * 3;
        const dx = pos[o] - B.x[i];
        const dz = pos[o + 2] - B.z[i];
        if (dx * dx + dz * dz < rr) {
          topBody(B, i, pos[o], pos[o + 1], pos[o + 2], kindR[r], 0.16, 0.45);
          pos[o + 1] = -999;
          l[q] = l[l.length - 1];
          l.pop();
          bucketOf[r] = -1;
          dirty = true;
        }
      }
    }
  }
  if (dirty) {
    const g = points.geometry;
    g.attributes.position.needsUpdate = true;
    g.attributes.color.needsUpdate = true;
    g.attributes.aSize.needsUpdate = true;
    dirty = false;
  }
}

export function clearSugar() {
  pos.fill(-999);
  live.fill(0);
  falling = 0;
  for (const b of buckets) b.length = 0;
  bucketOf.fill(-1);
  dirty = true;
}

export function clearSugarRect(x0, x1, z0, z1) {
  for (let r = 0; r < REST; r++) {
    const o = (FALL + r) * 3;
    if (pos[o + 1] < -100) continue;
    if (pos[o] > x0 && pos[o] < x1 && pos[o + 2] > z0 && pos[o + 2] < z1) {
      pos[o + 1] = -999;
      unbucket(r);
    }
  }
  dirty = true;
}

export function sugarActive() {
  return falling > 0;
}

export function createSugar(scene, renderer) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute('aSize', new THREE.BufferAttribute(siz, 1).setUsage(THREE.DynamicDrawUsage));
  const m = new THREE.ShaderMaterial({
    uniforms: { uScale: { value: 1 } },
    vertexShader: /* glsl */ `
      attribute float aSize;
      attribute vec3 color;
      uniform float uScale;
      varying vec3 vC;
      void main() {
        vC = color;
        vec4 mv = viewMatrix * vec4(position, 1.0);
        gl_PointSize = max(1.5, aSize * uScale / -mv.z);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      precision highp float;
      varying vec3 vC;
      void main() {
        vec2 p = gl_PointCoord - 0.5;
        float d = dot(p, p);
        if (d > 0.25) discard;
        float sh = 0.72 + 0.34 * smoothstep(0.25, 0.0, dot(p - vec2(-0.12, -0.12), p - vec2(-0.12, -0.12)) * 1.6);
        vec3 c = clamp(vC * sh, 0.0, 1.0);
        gl_FragColor = vec4(mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c)), 1.0);
        #include <colorspace_fragment>
      }`,
  });
  points = new THREE.Points(g, m);
  points.frustumCulled = false;
  scene.add(points);
  return {
    resize(stage) {
      m.uniforms.uScale.value = (stage.h * stage.renderer.getPixelRatio()) / (2 * Math.tan((stage.camera.fov * Math.PI) / 360));
    },
  };
}
