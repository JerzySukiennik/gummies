// Gummies: candy packaging (stand-up pouch, glass jar, gift box) with printed designs, sealing and thumbnails.
import * as THREE from 'three';
import { BG, smooth } from './config.js';
import { bodies, colliders } from './soft.js';
import { SHAPES, DW, DH } from './shapes.js';

export const PACK = { hw: 4.3, hd: 1.45, h: 10.3, floor: 0.12, top: 12, seam: 11.1, H: 10.8 };
export const PACK_COLORS = ['#ffffff', '#1d1d1f', '#ffc9d9', '#ff7d8f', '#ffa94d', '#ffe066', '#8ce99a', '#5fdcc0', '#74b8ff', '#b79bff'];
export const PATTERNS = [
  { id: 'plain', pl: 'Gładki', en: 'Plain' },
  { id: 'stripes', pl: 'Paski', en: 'Stripes' },
  { id: 'dots', pl: 'Kropki', en: 'Dots' },
  { id: 'check', pl: 'Kratka', en: 'Gingham' },
  { id: 'confetti', pl: 'Konfetti', en: 'Confetti' },
];
export const STICKERS = ['none', 'bear', 'heart', 'star', 'flower', 'cherry', 'strawberry', 'rocket', 'duck', 'cat', 'logo'];
const FONT = '-apple-system, "SF Pro Display", "Helvetica Neue", Arial, sans-serif';

function lum(hex) {
  const n = parseInt(hex.slice(1), 16);
  return (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
}
export const inkFor = hex => (lum(hex) > 0.62 ? '#1d1d1f' : '#ffffff');

export function paintPattern(c, x, y, w, h, color, pattern, s = 1) {
  c.save();
  c.beginPath();
  c.rect(x, y, w, h);
  c.clip();
  c.fillStyle = color;
  c.fillRect(x, y, w, h);
  const l = lum(color);
  const over = l > 0.93 ? 'rgba(255,125,160,0.5)' : l < 0.2 ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.36)';
  c.fillStyle = c.strokeStyle = over;
  if (pattern === 'stripes') {
    c.lineWidth = 22 * s;
    for (let k = -h; k < w + h; k += 56 * s) {
      c.beginPath();
      c.moveTo(x + k, y + h);
      c.lineTo(x + k + h, y);
      c.stroke();
    }
  } else if (pattern === 'dots') {
    let r = 0;
    for (let yy = y + 20 * s; yy < y + h + 20 * s; yy += 38 * s, r++) {
      for (let xx = x + (r % 2 ? 24 * s : 0); xx < x + w + 20 * s; xx += 48 * s) {
        c.beginPath();
        c.arc(xx, yy, 9.5 * s, 0, 7);
        c.fill();
      }
    }
  } else if (pattern === 'check') {
    for (let xx = x; xx < x + w; xx += 64 * s) c.fillRect(xx, y, 32 * s, h);
    for (let yy = y; yy < y + h; yy += 64 * s) c.fillRect(x, yy, w, 32 * s);
  } else if (pattern === 'confetti') {
    let seed = 7;
    const rnd = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    const cols = ['#ff5d73', '#ffc928', '#37b6ff', '#53d769', '#a66bff', '#ffffff'];
    const n = Math.round((w * h) / (2600 * s * s));
    for (let i = 0; i < n; i++) {
      c.save();
      c.translate(x + rnd() * w, y + rnd() * h);
      c.rotate(rnd() * 6.3);
      c.fillStyle = cols[(rnd() * cols.length) | 0];
      c.globalAlpha = 0.92;
      c.beginPath();
      c.roundRect ? c.roundRect(-11 * s, -4 * s, 22 * s, 8 * s, 4 * s) : c.rect(-11 * s, -4 * s, 22 * s, 8 * s);
      c.fill();
      c.restore();
    }
  }
  c.restore();
}

export function drawSticker(c, id, cx, cy, size, color) {
  if (!id || id === 'none' || !SHAPES[id]) return;
  c.save();
  c.translate(cx - (size * DW) / DH / 2, cy - size / 2);
  c.scale(size / DH, size / DH);
  c.fillStyle = c.strokeStyle = color;
  SHAPES[id].draw(c);
  c.restore();
}

function fitText(c, text, maxW, size, weight = 700) {
  let s = size;
  c.font = `${weight} ${s}px ${FONT}`;
  while (c.measureText(text).width > maxW && s > 14) {
    s -= 2;
    c.font = `${weight} ${s}px ${FONT}`;
  }
  return s;
}

function film() {
  return new THREE.MeshPhysicalMaterial({ color: 0xffffff, transparent: true, roughness: 0.22, metalness: 0, clearcoat: 0.6, clearcoatRoughness: 0.25, envMapIntensity: 1.1, depthWrite: false });
}

export class Pack {
  constructor(stage) {
    this.stage = stage;
    this.group = new THREE.Group();
    this.vis = new THREE.Group();
    this.group.add(this.vis);
    stage.scene.add(this.group);
    this.style = { color: '#ffc9d9', pattern: 'stripes', sticker: 'bear', name: '' };
    this.seal = 0;
    this.sealed = false;
    this.busy = false;
    this.cv = document.createElement('canvas');
    this.cv.width = 1024;
    this.cv.height = 512;
    this.tex = new THREE.CanvasTexture(this.cv);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.tex.wrapS = THREE.RepeatWrapping;
    this.tex.anisotropy = 8;
    const NU = 60;
    const NV = 28;
    const HD = 4;
    const rows = NV + 1 + HD;
    const n = rows * (NU + 1) + 1;
    const uv = new Float32Array(n * 2);
    const idx = [];
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i <= NU; i++) {
        const k = j * (NU + 1) + i;
        uv[k * 2] = i / NU;
        uv[k * 2 + 1] = j <= NV ? (j / NV) * 0.86 : 0.86 + ((j - NV) / HD) * 0.14;
        if (j < rows - 1 && i < NU) idx.push(k, k + 1, k + NU + 1, k + 1, k + NU + 2, k + NU + 1);
      }
    }
    const cc = n - 1;
    uv[cc * 2] = 0.25;
    uv[cc * 2 + 1] = 0.02;
    for (let i = 0; i < NU; i++) idx.push(cc, i + 1, i);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setIndex(idx);
    const mb = film();
    mb.map = this.tex;
    mb.side = THREE.BackSide;
    const mf = film();
    mf.map = this.tex;
    mf.side = THREE.FrontSide;
    const back = new THREE.Mesh(g, mb);
    back.renderOrder = 28;
    const front = new THREE.Mesh(g, mf);
    front.renderOrder = 30;
    this.films = [mb, mf];
    const sh = new THREE.Mesh(new THREE.BoxGeometry(PACK.hw * 2, PACK.h * 0.8, PACK.hd * 1.5), new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false }));
    sh.position.y = PACK.h * 0.4;
    sh.castShadow = true;
    this.vis.add(back, front, sh);
    this.parts = { geo: g, NU, NV, HD };
    this.paint();
    this.setSeal(0);
  }

  setStyle(s) {
    Object.assign(this.style, s);
    this.paint();
  }

  setSeal(k) {
    this.seal = k;
    const e = k * k * (3 - 2 * k);
    const { geo, NU, NV, HD } = this.parts;
    const p = geo.attributes.position.array;
    const H = PACK.H;
    const rows = NV + 1 + HD;
    for (let j = 0; j < rows; j++) {
      const v = Math.min(1, j / NV);
      const hv = j > NV ? (j - NV) / HD : 0;
      const pinch = e * smooth(0.5, 0.97, v);
      const a = 4.5 + 0.2 * Math.sin(Math.PI * v) + 0.3 * pinch;
      const b = (3.0 - 1.6 * smooth(0, 0.62, v) + 0.25 * smooth(0.7, 1, v) * (1 - e)) * (1 - 0.985 * pinch);
      const ex = 1 + 0.7 * smooth(0.05, 0.5, v);
      const s = 0.86 + 0.14 * smooth(0, 0.06, v);
      const y = H * v + hv * 1.3 * e;
      for (let i = 0; i <= NU; i++) {
        const th = Math.PI - (i / NU) * Math.PI * 2;
        const sn = Math.sin(th);
        const o = (j * (NU + 1) + i) * 3;
        p[o] = a * s * Math.cos(th);
        p[o + 1] = y;
        p[o + 2] = b * s * Math.sign(sn) * Math.pow(Math.abs(sn), ex);
      }
    }
    const cc = rows * (NU + 1) * 3;
    p[cc] = 0;
    p[cc + 1] = 0.02;
    p[cc + 2] = 0;
    geo.attributes.position.needsUpdate = true;
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
  }

  paint() {
    const st = this.style;
    const c = this.cv.getContext('2d');
    const ink = inkFor(st.color);
    c.clearRect(0, 0, 1024, 512);
    c.fillStyle = 'rgba(255,255,255,0.12)';
    c.fillRect(0, 0, 1024, 512);
    for (let half = 0; half < 2; half++) {
      const ox = half * 512;
      const gl = c.createLinearGradient(ox, 0, ox + 512, 0);
      gl.addColorStop(0.1, 'rgba(255,255,255,0)');
      gl.addColorStop(0.17, 'rgba(255,255,255,0.3)');
      gl.addColorStop(0.24, 'rgba(255,255,255,0)');
      gl.addColorStop(0.8, 'rgba(255,255,255,0)');
      gl.addColorStop(0.86, 'rgba(255,255,255,0.2)');
      gl.addColorStop(0.9, 'rgba(255,255,255,0)');
      c.fillStyle = gl;
      c.fillRect(ox, 0, 512, 512);
      c.save();
      c.beginPath();
      c.moveTo(ox, 100);
      c.lineTo(ox, 244);
      c.quadraticCurveTo(ox + 256, 296, ox + 512, 244);
      c.lineTo(ox + 512, 100);
      c.closePath();
      c.clip();
      paintPattern(c, ox, 100, 512, 200, st.color, st.pattern);
      c.restore();
      c.fillStyle = st.color;
      c.fillRect(ox, 0, 512, 112);
      c.fillRect(ox, 484, 512, 28);
      c.fillStyle = lum(st.color) > 0.62 ? 'rgba(0,0,0,0.07)' : 'rgba(255,255,255,0.16)';
      for (let x = ox; x < ox + 512; x += 9) c.fillRect(x, 0, 4, 72);
      c.fillStyle = ink;
      c.globalAlpha = 0.55;
      c.font = `700 17px ${FONT}`;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText('G U M M I E S', ox + 256, 93);
      c.globalAlpha = 1;
    }
    const has = st.sticker && st.sticker !== 'none';
    c.fillStyle = st.color;
    c.beginPath();
    if (c.roundRect) c.roundRect(256 - 168, 122, 336, 136, 24);
    else c.rect(256 - 168, 122, 336, 136);
    c.fill();
    if (has) drawSticker(c, st.sticker, 256, 164, 74, ink);
    c.fillStyle = ink;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    fitText(c, st.name || 'Gummies', 300, has ? 34 : 44);
    c.fillText(st.name || 'Gummies', 256, has ? 228 : 190);
    this.tex.needsUpdate = true;
  }

  collide(on) {
    if (!on) {
      colliders.pack = null;
      return;
    }
    const p = this.group.position;
    colliders.pack = { x: p.x, y: p.y, z: p.z, hw: PACK.hw, hd: PACK.hd, hd0: 2.75, h: PACK.h, floor: PACK.floor, lid: this.sealed };
  }

  contents() {
    return bodies.filter(B => B.inPack && !B.dead);
  }

  thumbnail() {
    const r = this.stage.renderer;
    const W = 360;
    const H = 440;
    const rt = new THREE.WebGLRenderTarget(W, H, { samples: 4, colorSpace: THREE.SRGBColorSpace });
    const cam = new THREE.PerspectiveCamera(20, W / H, 5, 300);
    const p = this.group.position;
    cam.position.set(p.x - 5, p.y + 20, p.z + 56);
    cam.lookAt(p.x, p.y + 5.9, p.z);
    const prev = r.getRenderTarget();
    r.setRenderTarget(rt);
    r.setClearColor(BG, 1);
    r.clear();
    for (const m of this.films) {
      m.envMapIntensity = 0.3;
      m.clearcoat = 0;
    }
    r.render(this.stage.scene, cam);
    for (const m of this.films) {
      m.envMapIntensity = 1.1;
      m.clearcoat = 0.6;
    }
    const px = new Uint8Array(W * H * 4);
    r.readRenderTargetPixels(rt, 0, 0, W, H, px);
    r.setRenderTarget(prev);
    rt.dispose();
    const cv = document.createElement('canvas');
    cv.width = W;
    cv.height = H;
    const c = cv.getContext('2d');
    const img = c.createImageData(W, H);
    for (let y = 0; y < H; y++) img.data.set(px.subarray((H - 1 - y) * W * 4, (H - y) * W * 4), y * W * 4);
    c.putImageData(img, 0, 0);
    return cv.toDataURL('image/jpeg', 0.84);
  }
}
