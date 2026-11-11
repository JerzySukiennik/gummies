// Gummies: renderer, white studio lighting, camera fit and screen/world helpers.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { BG, LIGHT_DIR, IS_TOUCH } from './config.js';

const ELEV = (54 * Math.PI) / 180;

export class Stage {
  constructor(canvas) {
    this.canvas = canvas;
    const r = (this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' }));
    r.setClearColor(BG, 1);
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.NoToneMapping;
    r.localClippingEnabled = true;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(17, 1, 10, 500);
    this.target = new THREE.Vector3(0, 0.5, 0);

    const pm = new THREE.PMREMGenerator(r);
    this.scene.environment = pm.fromScene(new RoomEnvironment(), 0.03).texture;
    pm.dispose();
    this.scene.environmentIntensity = 0.3;

    this.scene.add(new THREE.HemisphereLight(0xffffff, 0xd6d6dc, 0.7));
    const key = (this.key = new THREE.DirectionalLight(0xffffff, 1.5));
    const ld = new THREE.Vector3(...LIGHT_DIR).normalize();
    key.position.copy(ld).multiplyScalar(140);
    key.castShadow = true;
    const s = key.shadow;
    s.mapSize.set(IS_TOUCH ? 1024 : 2048, IS_TOUCH ? 1024 : 2048);
    s.camera.left = -46;
    s.camera.right = 46;
    s.camera.top = 46;
    s.camera.bottom = -46;
    s.camera.near = 40;
    s.camera.far = 260;
    s.bias = -0.0004;
    s.normalBias = 0.06;
    s.radius = 5;
    s.blurSamples = 12;
    this.scene.add(key, key.target);

    const floor = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), new THREE.ShadowMaterial({ opacity: 0.17, color: 0x2a2e38 }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    floor.renderOrder = -1;
    this.scene.add(floor);

    this.raycaster = new THREE.Raycaster();
    this.ndc = new THREE.Vector2();
    this.portrait = false;
    this.layout = { mold: [0, 3.5], dock: [], bag: [23, 6] };
    this.resize();
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.w = w;
    this.h = h;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h, false);
    const aspect = w / h;
    this.portrait = aspect < 1.45;
    const cam = this.camera;
    cam.aspect = aspect;
    cam.fov = 17;
    const needH = this.portrait ? Math.max(47, 31 / aspect) : 32.4;
    const hw = (needH * aspect) / 2;
    this.target.z = this.portrait ? -1.5 : 0;
    const dist = needH / 2 / Math.tan((cam.fov * Math.PI) / 360);
    cam.near = dist * 0.4;
    cam.far = dist * 2.4;
    cam.position.set(this.target.x, this.target.y + dist * Math.sin(ELEV), this.target.z + dist * Math.cos(ELEV));
    cam.lookAt(this.target);
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld(true);
    this.layout = this.portrait
      ? { mold: [0, -7], dock: [[-9.5, -24], [0, -24], [9.5, -24]], bag: [Math.min(hw - 7.5, 12), 19], title: [0, -9, Math.min(2 * hw - 2.5, 56)] }
      : { mold: [0, 1.5], dock: [[-hw + 5.5, -9], [-hw + 5.5, -0.5], [-hw + 5.5, 8]], bag: [hw - 9, 3], title: [0, -4, Math.min(2 * hw - 7, 58)] };
  }

  setRay(cx, cy) {
    this.ndc.set((cx / this.w) * 2 - 1, -(cy / this.h) * 2 + 1);
    this.raycaster.setFromCamera(this.ndc, this.camera);
    return this.raycaster.ray;
  }

  ground(cx, cy, y, out) {
    const ray = this.setRay(cx, cy);
    const t = (y - ray.origin.y) / ray.direction.y;
    return out.copy(ray.direction).multiplyScalar(t).add(ray.origin);
  }

  toScreen(v, out) {
    out.copy(v).project(this.camera);
    out.x = (out.x * 0.5 + 0.5) * this.w;
    out.y = (-out.y * 0.5 + 0.5) * this.h;
    return out;
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }
}
