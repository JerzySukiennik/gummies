// Gummies: the three hand tools (mass pitcher, chocolate bottle, topping shaker) and their pouring behavior.
import * as THREE from 'three';
import { clamp, smooth, IS_TOUCH } from './config.js';
import { CANDY, LIGHT, makeMat, hexToRgb } from './candy.js';
import { Emitter, emit, breakStream } from './stream.js';
import { spawnGrain } from './sugar.js';

const glass = new THREE.MeshPhysicalMaterial({ color: 0xffffff, transparent: true, opacity: 0.2, roughness: 0.04, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.05, envMapIntensity: 2.2, side: THREE.DoubleSide, depthWrite: false });
const steel = new THREE.MeshStandardMaterial({ color: 0xd9dbe0, roughness: 0.28, metalness: 0.9, envMapIntensity: 2.4 });

function liquidMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { uLight: { value: new THREE.Vector3(...LIGHT) }, uPig: { value: new THREE.Vector4(1, 0, 0, 0) }, uClipY: { value: 100 } },
    vertexShader: /* glsl */ `
      varying vec3 vN;
      varying vec3 vW;
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        vW = w.xyz;
        vN = mat3(modelMatrix) * normal;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */ `
      precision highp float;
      uniform vec4 uPig;
      uniform float uClipY;
      varying vec3 vN;
      varying vec3 vW;
      ${CANDY}
      void main() {
        if (vW.y > uClipY) discard;
        vec3 V = normalize(cameraPosition - vW);
        vec3 N = normalize(vN);
        bool back = dot(N, V) < 0.0;
        if (back) N = vec3(0.0, 1.0, 0.0);
        vec3 p = max(uPig.rgb, vec3(0.02));
        vec3 col = mix(candyClear(p, back ? 0.9 : 1.5, N) + candyGlow(p, N, V), candyOpaque(p, N), uPig.a);
        col += candySpec(N, V, back ? 0.7 : 0.35);
        gl_FragColor = outColor(col);
        #include <colorspace_fragment>
      }`,
    side: THREE.DoubleSide,
  });
}

class Tool {
  constructor(id, spout) {
    this.id = id;
    this.root = new THREE.Group();
    this.inner = new THREE.Group();
    this.inner.position.copy(spout).multiplyScalar(-1);
    this.root.add(this.inner);
    this.spout = spout;
    this.home = new THREE.Vector3();
    this.target = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.tilt = 0;
    this.inHand = false;
    this.pressing = false;
    this.flow = 0;
    this.em = new Emitter();
    this.hover = 7.6;
    this.lift = 0;
    this.t = 0;
    this.moving = false;
  }

  setHome(x, z) {
    this.bx = x;
    this.bz = z;
    this.home.set(x + this.spout.x, this.spout.y, z + this.spout.z);
    if (!this.inHand) this.root.position.copy(this.home);
  }

  aim(p) {
    this.target.copy(p);
  }

  follow(dt) {
    const r = this.root;
    const goal = this.inHand ? this.target : this.home;
    const k = this.inHand ? 16 : 11;
    const px = r.position.x;
    const pz = r.position.z;
    const f = 1 - Math.exp(-dt * k);
    r.position.x += (goal.x - px) * f;
    r.position.y += (goal.y - r.position.y) * f;
    r.position.z += (goal.z - pz) * f;
    const vx = (r.position.x - px) / Math.max(dt, 1e-4);
    const vz = (r.position.z - pz) / Math.max(dt, 1e-4);
    this.vel.x += (vx - this.vel.x) * Math.min(1, dt * 10);
    this.vel.z += (vz - this.vel.z) * Math.min(1, dt * 10);
    this.moving = Math.abs(goal.x - r.position.x) + Math.abs(goal.y - r.position.y) + Math.abs(goal.z - r.position.z) > 0.01 || Math.abs(this.vel.x) + Math.abs(this.vel.z) > 0.5;
  }
}

export class Pitcher extends Tool {
  constructor() {
    super('pitcher', new THREE.Vector3(-3.0, 6.25, 0));
    this.cap = 130;
    this.amount = 0;
    this.shown = 0;
    this.mat = makeMat([0.9, 0.1, 0.15], 0);
    this.flavor = null;
    this.q = 9.5;
    const prof = [
      [0.01, 0],
      [1.9, 0],
      [2.18, 0.22],
      [2.25, 0.8],
      [2.25, 5.7],
      [2.36, 6.1],
    ].map(p => new THREE.Vector2(p[0], p[1]));
    const g = new THREE.LatheGeometry(prof, 44);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i);
      const y = p.getY(i);
      const z = p.getZ(i);
      const a = Math.atan2(z, -x);
      const w = Math.pow(Math.max(0, Math.cos(a)), 7) * smooth(4.4, 6.1, y);
      p.setX(i, x - w * 0.75);
      p.setY(i, y + w * 0.16);
    }
    g.computeVertexNormals();
    const body = new THREE.Mesh(g, glass);
    body.renderOrder = 20;
    const handle = new THREE.Mesh(new THREE.TorusGeometry(1.55, 0.2, 8, 22, Math.PI), glass);
    handle.rotation.z = -Math.PI / 2;
    handle.position.set(2.2, 3.2, 0);
    handle.renderOrder = 20;
    const lp = [
      [0.01, 0.16],
      [1.86, 0.16],
      [2.1, 0.4],
      [2.14, 0.9],
      [2.14, 6.0],
      [0.01, 6.0],
    ].map(q => new THREE.Vector2(q[0], q[1]));
    this.liqMat = liquidMaterial();
    this.liquid = new THREE.Mesh(new THREE.LatheGeometry(lp, 36), this.liqMat);
    this.liquid.visible = false;
    this.inner.add(this.liquid, body, handle);
    body.castShadow = true;
    this.hover = 7.8;
  }

  fill(mat, flavor) {
    this.mat = mat;
    this.flavor = flavor;
    this.amount = this.cap;
    breakStream(this.em);
  }

  update(dt) {
    this.t += dt;
    this.follow(dt);
    const frac = this.amount / this.cap;
    this.shown += (frac - this.shown) * Math.min(1, dt * 5);
    const hc = 0.3 + this.shown * 5.3;
    const need = Math.atan2(6.25 - hc, 3.0) + 0.1;
    const want = this.inHand ? (this.pressing && this.amount > 0 ? need + 0.2 : Math.min(0.22, need * 0.5)) : 0;
    this.tilt += (want - this.tilt) * (1 - Math.exp(-dt * (want > this.tilt ? 7 : 9)));
    const lean = this.inHand ? clamp(-this.vel.x * 0.0035, -0.18, 0.18) : 0;
    this.root.rotation.z = this.tilt + lean;
    this.root.rotation.x = this.inHand ? clamp(this.vel.z * 0.003, -0.15, 0.15) : 0;
    const f = this.amount > 0 ? smooth(need - 0.04, need + 0.14, this.tilt) : 0;
    this.flow += (f - this.flow) * Math.min(1, dt * 14);
    this.liquid.visible = this.shown > 0.004;
    const u = this.liqMat.uniforms;
    u.uPig.value.set(this.mat.rgb[0], this.mat.rgb[1], this.mat.rgb[2], this.mat.op);
    const c = Math.cos(this.root.rotation.z);
    const s = Math.sin(this.root.rotation.z);
    const lx = 3.0;
    const ly = hc - 6.25;
    u.uClipY.value = this.root.position.y + lx * s + ly * c + (this.flow > 0.02 ? 0.05 : 0);
    const em = this.em;
    if (this.flow > 0.03) {
      em.on = true;
      em.mat = this.mat;
      const rp = this.root.position;
      em.sx = rp.x;
      em.sy = rp.y;
      em.sz = rp.z;
      const q = this.q * this.flow;
      em.r0 = Math.sqrt(q / (Math.PI * 34));
      em.acc += 95 * dt;
      while (em.acc >= 1) {
        em.acc -= 1;
        const v = q / 95;
        if (this.amount <= 0) break;
        this.amount = Math.max(0, this.amount - v);
        emit(em, rp.x, rp.y, rp.z, -15 * c + this.vel.x * 0.35, -22, this.vel.z * 0.35, v, q);
      }
    } else em.on = false;
  }

  landOffset(out) {
    return out.set(1.5, 0, 0);
  }
}

export const CHOCS = [
  { id: 'milk', pl: 'Mleczna', en: 'Milk', hex: 0x6f3a1c },
  { id: 'dark', pl: 'Gorzka', en: 'Dark', hex: 0x35190c },
  { id: 'white', pl: 'Biała', en: 'White', hex: 0xf4e6c8 },
  { id: 'ruby', pl: 'Ruby', en: 'Ruby', hex: 0xd4587f },
];

export class Bottle extends Tool {
  constructor() {
    super('bottle', new THREE.Vector3(0, 8.3, 0));
    this.bodyMat = new THREE.MeshStandardMaterial({ color: 0x6f3a1c, roughness: 0.32, metalness: 0, envMapIntensity: 1.3 });
    const prof = [
      [0.01, 0],
      [1.45, 0],
      [1.62, 0.2],
      [1.62, 5.0],
      [1.45, 5.6],
      [0.9, 6.1],
      [0.9, 6.5],
    ].map(p => new THREE.Vector2(p[0], p[1]));
    const body = new THREE.Mesh(new THREE.LatheGeometry(prof, 32), this.bodyMat);
    body.castShadow = true;
    const capM = new THREE.MeshStandardMaterial({ color: 0xf2f2f4, roughness: 0.4, envMapIntensity: 1.1 });
    const collar = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.0, 0.55, 28), capM);
    collar.position.y = 6.6;
    const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.72, 1.5, 24), capM);
    nozzle.position.y = 7.55;
    nozzle.castShadow = true;
    this.inner.add(body, collar, nozzle);
    this.choc = CHOCS[0];
    this.mat = makeMat(hexToRgb(this.choc.hex), 1, 'choc');
    this.mat.label = this.choc.id;
    this.q = 2.3;
    this.hover = 6.4;
  }

  setChoc(c) {
    this.choc = c;
    this.bodyMat.color.setHex(c.hex);
    this.mat = makeMat(hexToRgb(c.hex), 1, 'choc');
    this.mat.label = c.id;
    breakStream(this.em);
  }

  update(dt) {
    this.t += dt;
    this.follow(dt);
    const want = this.inHand ? (this.pressing ? 2.55 : 0.5) : 0;
    this.tilt += (want - this.tilt) * (1 - Math.exp(-dt * 9));
    const lean = this.inHand ? clamp(-this.vel.x * 0.003, -0.2, 0.2) : 0;
    this.root.rotation.z = this.tilt + lean;
    this.root.rotation.x = this.inHand ? clamp(this.vel.z * 0.003, -0.2, 0.2) : 0;
    const squeeze = this.pressing && this.inHand ? 1 - 0.07 * smooth(2.0, 2.5, this.tilt) : 1;
    this.inner.scale.x += (squeeze - this.inner.scale.x) * Math.min(1, dt * 12);
    const f = smooth(2.1, 2.5, this.tilt);
    this.flow += (f - this.flow) * Math.min(1, dt * 12);
    const em = this.em;
    if (this.flow > 0.05 && this.pressing) {
      em.on = true;
      em.mat = this.mat;
      const rp = this.root.position;
      em.sx = rp.x;
      em.sy = rp.y;
      em.sz = rp.z;
      const q = this.q * this.flow;
      em.r0 = 0.13;
      em.acc += 110 * dt;
      const s = Math.sin(this.root.rotation.z);
      const c = Math.cos(this.root.rotation.z);
      while (em.acc >= 1) {
        em.acc -= 1;
        emit(em, rp.x, rp.y, rp.z, -s * 16 + this.vel.x * 0.5, c * 26, this.vel.z * 0.5, q / 110, q);
      }
    } else em.on = false;
  }

  landOffset(out) {
    return out.set(0.6, 0, 0);
  }
}

export const TOPS = [
  { id: 'sour', pl: 'Kwaśny cukier', en: 'Sour sugar', kind: 0 },
  { id: 'rainbow', pl: 'Kolorowa posypka', en: 'Sprinkles', kind: 1 },
];

export class Shaker extends Tool {
  constructor() {
    super('shaker', new THREE.Vector3(0, 6.5, 0));
    const prof = [
      [0.01, 0],
      [1.5, 0],
      [1.72, 0.25],
      [1.72, 4.3],
      [1.5, 4.9],
    ].map(p => new THREE.Vector2(p[0], p[1]));
    const body = new THREE.Mesh(new THREE.LatheGeometry(prof, 32), glass);
    body.renderOrder = 20;
    body.castShadow = true;
    const cap = new THREE.Mesh(new THREE.SphereGeometry(1.6, 28, 12, 0, Math.PI * 2, 0, Math.PI / 2), steel);
    cap.position.y = 4.9;
    cap.scale.y = 1.0;
    cap.castShadow = true;
    const band = new THREE.Mesh(new THREE.CylinderGeometry(1.62, 1.62, 0.5, 28), steel);
    band.position.y = 4.9;
    this.fillTex = this.makeTex(0);
    this.fillMat = new THREE.MeshStandardMaterial({ map: this.fillTex, roughness: 0.9, envMapIntensity: 0.4 });
    this.fillMesh = new THREE.Mesh(new THREE.CylinderGeometry(1.55, 1.4, 3.3, 28), this.fillMat);
    this.fillMesh.position.y = 1.9;
    this.inner.add(this.fillMesh, body, band, cap);
    this.top = TOPS[0];
    this.hover = 7.2;
    this.shake = 0;
    this.acc = 0;
  }

  makeTex(kind) {
    const cv = document.createElement('canvas');
    cv.width = cv.height = 128;
    const c = cv.getContext('2d');
    c.fillStyle = kind ? '#fbfbfb' : '#f4f4f1';
    c.fillRect(0, 0, 128, 128);
    for (let i = 0; i < (kind ? 520 : 2600); i++) {
      if (kind) c.fillStyle = `hsl(${(Math.random() * 360) | 0},85%,62%)`;
      else c.fillStyle = `rgba(${Math.random() < 0.5 ? '255,255,255' : '196,198,204'},0.9)`;
      const s = kind ? 5 : 2;
      c.beginPath();
      c.arc(Math.random() * 128, Math.random() * 128, s * (0.5 + Math.random() * 0.5), 0, 7);
      c.fill();
    }
    const t = new THREE.CanvasTexture(cv);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  }

  setTop(t) {
    this.top = t;
    this.fillTex.dispose();
    this.fillTex = this.makeTex(t.kind);
    this.fillMat.map = this.fillTex;
    this.fillMat.needsUpdate = true;
  }

  update(dt) {
    this.t += dt;
    this.follow(dt);
    const want = this.inHand ? (this.pressing ? 2.7 : 0.45) : 0;
    this.tilt += (want - this.tilt) * (1 - Math.exp(-dt * 10));
    const active = this.pressing && this.inHand && this.tilt > 2.2;
    this.shake += ((active ? 1 : 0) - this.shake) * Math.min(1, dt * 10);
    const ph = Math.sin(this.t * 52);
    const lean = this.inHand ? clamp(-this.vel.x * 0.003, -0.2, 0.2) : 0;
    this.root.rotation.z = this.tilt + lean + ph * 0.05 * this.shake;
    this.root.rotation.x = this.inHand ? clamp(this.vel.z * 0.003, -0.2, 0.2) : 0;
    this.inner.position.y = -this.spout.y + ph * 0.28 * this.shake;
    this.flow = this.shake;
    if (active) {
      this.acc += dt * (IS_TOUCH ? 150 : 210) * (0.55 + 0.45 * Math.max(0, ph));
      const rp = this.root.position;
      while (this.acc >= 1) {
        this.acc -= 1;
        const a = Math.random() * 6.283;
        const r = Math.sqrt(Math.random()) * 1.3;
        spawnGrain(rp.x + Math.cos(a) * r * 0.8 - 0.6, rp.y - 0.4 - Math.random() * 0.6, rp.z + Math.sin(a) * r, Math.cos(a) * r * 9 + this.vel.x * 0.5 - 6, -30 - Math.random() * 40, Math.sin(a) * r * 9 + this.vel.z * 0.5, this.top.kind);
      }
    }
  }

  landOffset(out) {
    return out.set(0.9, 0, 0);
  }
}

export class Sealer extends Tool {
  constructor() {
    super('sealer', new THREE.Vector3(0, 0.56, 0));
    const dark = new THREE.MeshStandardMaterial({ color: 0x2c2c2e, roughness: 0.42, envMapIntensity: 1.1 });
    const white = new THREE.MeshStandardMaterial({ color: 0xf4f4f6, roughness: 0.38, envMapIntensity: 1 });
    this.heatM = new THREE.MeshStandardMaterial({ color: 0xffb340, emissive: 0xff8a00, emissiveIntensity: 0.15, roughness: 0.5 });
    this.ledM = new THREE.MeshStandardMaterial({ color: 0x34c759, emissive: 0x34c759, emissiveIntensity: 0.9, roughness: 0.4 });
    this.jaws = [];
    for (const sgn of [1, -1]) {
      const j = new THREE.Group();
      const bar = new THREE.Mesh(new THREE.BoxGeometry(10.6, 1.0, 0.62), dark);
      bar.castShadow = true;
      const strip = new THREE.Mesh(new THREE.BoxGeometry(9.8, 0.36, 0.1), this.heatM);
      strip.position.z = -sgn * 0.33;
      const arm = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.9, 0.5), dark);
      arm.position.x = 6.3;
      j.add(bar, strip, arm);
      this.inner.add(j);
      this.jaws.push(j);
    }
    const hinge = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.75, 1.25, 20), white);
    hinge.position.set(7.7, 0, 0);
    hinge.castShadow = true;
    const grip = new THREE.Mesh(new THREE.CapsuleGeometry(0.72, 4.2, 6, 16), white);
    grip.rotation.z = Math.PI / 2;
    grip.position.set(10.9, 0, 0);
    grip.castShadow = true;
    const led = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 8), this.ledM);
    led.position.set(8.9, 0.68, 0);
    this.inner.add(hinge, grip, led);
    this.gap = 0.5;
    this.closed = 0;
    this.heat = 0;
    this.hover = 6;
    this.onPack = false;
  }

  update(dt) {
    this.t += dt;
    this.follow(dt);
    const want = this.inHand ? (this.pressing ? 0.1 : 1.3) : 0.45;
    this.gap += (want - this.gap) * (1 - Math.exp(-dt * (want < this.gap ? 20 : 10)));
    this.closed = 1 - Math.min(1, Math.max(0, (this.gap - 0.1) / 1.2));
    this.jaws[0].position.z = this.gap + 0.31;
    this.jaws[1].position.z = -(this.gap + 0.31);
    this.root.rotation.z = this.inHand && !this.onPack ? Math.min(0.2, Math.max(-0.2, -this.vel.x * 0.003)) : 0;
    this.root.rotation.x = 0;
    this.heatM.emissiveIntensity = 0.15 + this.heat * 2.4;
    this.ledM.color.setHex(this.heat > 0.05 ? 0xff9f0a : 0x34c759);
    this.ledM.emissive.setHex(this.heat > 0.05 ? 0xff9f0a : 0x34c759);
    this.flow = 0;
  }

  landOffset(out) {
    return out.set(0, 0, 0);
  }
}
