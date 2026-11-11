// Gummies: main loop, input, mold and pouch flows, glue between simulation and interface.
import * as THREE from 'three';
import { N, DX, HALF, TX, IS_TOUCH, TEST, clamp } from './config.js';
import { Stage } from './scene.js';
import { buildField, buildMoldMesh, releaseField, FW, FH, PAD, CW, CH } from './mold.js';
import { T, setMold, clearMold, rebuildFills, inDomain } from './world.js';
import { F, createFluid, stepFluid, buildSurface, syncFluidUniforms, findSettable, clearFluid, hasFluid, surfaceAt } from './fluid.js';
import { S as STREAM, createStreams, stepStreams, buildStreams, streamsActive, emit, Emitter } from './stream.js';
import { makeMat, hexToRgb } from './candy.js';
import { bodies, events, colliders, stepBodies, rayPick, queryHit, flushBones, packMembership } from './soft.js';
import { initGummies, solidify, freeFill, destroyBody, coatBody, bodyFromField, serializeBody, bodyFromData } from './gummy.js';
import { createSugar, stepSugar, sugarActive, clearSugar, clearSugarRect } from './sugar.js';
import { Pitcher, Bottle, Shaker, Sealer } from './tools.js';
import { Pack, PACK } from './pack.js';
import { UI } from './ui.js';
import { t, nm, packName, FLAVORS } from './data.js';
import { load, addPack, putPayload, getPayload } from './store.js';
import { audio } from './audio.js';
import { rasterize } from './shapes.js';

const canvas = document.getElementById('c');
const stage = new Stage(canvas);
const scene = stage.scene;
const occ = new THREE.Mesh(new THREE.PlaneGeometry(900, 900), new THREE.MeshBasicMaterial({ colorWrite: false }));
occ.rotation.x = -Math.PI / 2;
occ.position.y = -0.02;
occ.renderOrder = -20;
scene.add(occ);

createFluid(scene);
createStreams(scene);
initGummies(scene);
const sugar = createSugar(scene);

const pitcher = new Pitcher();
const bottle = new Bottle();
const shaker = new Shaker();
const sealer = new Sealer();
const dockTools = [pitcher, bottle, shaker];
const tools = [pitcher, bottle, shaker, sealer];
for (const tl of tools) {
  tl.root.visible = false;
  scene.add(tl.root);
}
const pack = new Pack(stage);
pack.group.visible = false;
const dumpEm = new Emitter();
const emitters = [pitcher.em, bottle.em, dumpEm];

const st = { mode: 'title', sheet: false, tool: null, time: 0, idle: 0, tv: -1, scanT: 0, slowT: 0, packCount: 0, massSel: {}, firstMold: true, sealT: 0, design: false, px: 0, pz: 0, packMoved: false, drag: null, dragOff: [0, 0] };
const tweens = [];
const ptr = { x: 0, y: 0, down: false, mode: null, id: -1, x0: 0, y0: 0, t0: 0, has: false, touch: false };
let grab = null;
let mold = null;
let flyLast = 0;
let puffTex = null;
const v3 = new THREE.Vector3();
const v3b = new THREE.Vector3();
const hitOut = { body: null, i: 0, t: 0 };
const upv = [0, 0, 0];
const cen = [0, 0, 0];
const m4 = new THREE.Matrix4();
const m4b = new THREE.Matrix4();
const quat = new THREE.Quaternion();

const kick = () => {
  st.idle = 0;
};
const tween = (d, fn, done) => {
  tweens.push({ t: 0, d, fn, done });
  kick();
};
const after = (d, done) => tween(d, () => {}, done);
const easeOut = x => 1 - (1 - x) * (1 - x) * (1 - x);

const ui = new UI({
  click: () => {
    audio.unlock();
    audio.play('click', 0.5);
  },
  sound: on => audio.setEnabled(on),
  sheet: on => {
    st.sheet = on;
    if (on) putDown();
    refreshChips();
    kick();
  },
  start,
  molds: () => ui.molds(placeMold),
  clearTable,
  spill: spillPack,
});
audio.setEnabled(load().sound);

function refreshChips() {
  const play = st.mode === 'play' && !st.sheet;
  for (const tl of dockTools) {
    stage.toScreen(v3.set(tl.bx, 0, tl.bz + 2.9), v3b);
    let html;
    let fn;
    if (tl === pitcher) {
      const c = pitcher.mat.rgb.map(q => Math.round(q * 255)).join(',');
      html = pitcher.amount > 0 && pitcher.flavor ? `<i style="background:rgb(${c})"></i>${nm(pitcher.flavor)}` : `<i style="background:#d8d8dc"></i>${t('mass')}`;
      fn = openMass;
    } else if (tl === bottle) {
      html = `<i style="background:#${bottle.choc.hex.toString(16).padStart(6, '0')}"></i>${nm(bottle.choc)}`;
      fn = () =>
        ui.choc(bottle.choc, c => {
          bottle.setChoc(c);
          refreshChips();
        });
    } else {
      html = nm(shaker.top);
      fn = () =>
        ui.top(shaker.top, o => {
          shaker.setTop(o);
          refreshChips();
        });
    }
    ui.chip(tl.id, v3b.x, v3b.y, html, fn, play && !tl.inHand && !ptr.down);
  }
  const lm = stage.layout.mold;
  stage.toScreen(v3.set(lm[0], 0, lm[1]), v3b);
  ui.chip('mold', v3b.x, v3b.y - 18, t('pickMold'), () => ui.molds(placeMold), play && !mold);
  ui.chipEls.mold.classList.add('dark');
  const pp = pack.group.position;
  const idle = play && !pack.busy && !ptr.down && !st.drag;
  stage.toScreen(v3.set(pp.x, 0, pp.z + PACK.hd + 1.5), v3b);
  ui.chip('look', v3b.x, v3b.y, t('look'), openDesign, idle && !st.design);
  stage.toScreen(v3.set(pp.x, PACK.top + 1.2, pp.z), v3b);
  ui.chip('save', v3b.x, v3b.y - 30, t('toCollection'), collect, idle && pack.sealed && st.packCount > 0);
  ui.chipEls.save.classList.add('dark');
  if (ui.designSync) ui.designSync({ count: st.packCount, sealed: pack.sealed, name: pack.style.name });
}

function applyPosts() {
  colliders.posts = st.mode === 'play' ? dockTools.filter(tl => !tl.inHand).map(tl => ({ x: tl.bx, z: tl.bz, r: 2.3, h: 6.5 })) : [];
}

function applyLayout() {
  const L = stage.layout;
  dockTools.forEach((tl, i) => tl.setHome(L.dock[i][0], L.dock[i][1]));
  if (!st.packMoved) {
    st.px = L.bag[0];
    st.pz = L.bag[1];
  }
  if (!pack.busy && !st.drag) pack.group.position.set(st.px, 0, st.pz);
  sealer.setHome(st.px - 6, st.pz + 6.6);
  applyPosts();
  const bl = stage.ground(0, stage.h, 0, v3).clone();
  const br = stage.ground(stage.w, stage.h, 0, v3).clone();
  const tp = stage.ground(stage.w / 2, 0, 0, v3).clone();
  colliders.bounds = [bl.x + 1.5, br.x - 1.5, Math.max(tp.z + 3, -46), bl.z - 1.5];
  sugar.resize(stage);
  stage.toScreen(v3.set(L.title[0], 0, L.title[1] + L.title[2] * 0.11 + 2.5), v3b);
  ui.placeTitle(v3b.y);
  refreshChips();
  kick();
}

function openMass() {
  ui.mass(st.massSel, sel => {
    st.massSel = sel;
    pitcher.fill(makeMat(sel.rgb, sel.op, 'mass'), sel.flavor);
    audio.play('fill', 0.8);
    refreshChips();
    if (!st.tool) ui.hintOnce('pour', t(IS_TOUCH ? 'hintPourTouch' : 'hintPour'), 6000);
    kick();
  });
}

function shapeAt(x, z) {
  const m = T.mold;
  if (!m || !mold) return 'blob';
  const c = Math.floor((x - m.x0 - PAD * TX) / (CW * TX));
  const r = Math.floor((z - m.z0 - PAD * TX) / (CH * TX));
  if (c < 0 || c > 2 || r < 0 || r > 1) return 'blob';
  return mold.ids[r * 3 + c];
}

function titleLetters() {
  const L = stage.layout.title;
  const word = 'GUMMIES';
  const cols = [0xe8192c, 0xff7a00, 0xf5c400, 0x4fc21c, 0x12c7a0, 0x2f55e8, 0x8a33f2];
  const font = px => `900 ${px}px "Arial Rounded MT Bold", ui-rounded, "SF Pro Rounded", "Arial Black", Arial, sans-serif`;
  const mc = document.createElement('canvas').getContext('2d');
  mc.font = font(100);
  const ws = [...word].map(ch => mc.measureText(ch).width / 100);
  const total = ws.reduce((a, b) => a + b, 0) + 0.1 * (word.length - 1);
  const capCm = Math.min(7.4, (L[2] / total) * 0.72);
  const texel = capCm > 5 ? 0.08 : 0.06;
  const px = capCm / 0.72 / texel;
  let x = L[0] - (total * px * texel) / 2;
  [...word].forEach((ch, i) => {
    const W = Math.ceil(ws[i] * px + 18);
    const H = Math.ceil(px * 0.92 + 18);
    const { sd } = rasterize(W, H, 3, c => {
      c.font = font(px);
      c.textAlign = 'center';
      c.textBaseline = 'alphabetic';
      c.lineJoin = 'round';
      c.lineWidth = px * 0.05;
      c.fillText(ch, W / 2, H - 9 - px * 0.1);
      c.strokeText(ch, W / 2, H - 9 - px * 0.1);
    });
    const cx = x + (ws[i] * px * texel) / 2;
    const B = bodyFromField(sd, W, H, texel, { x: cx, z: L[1], rgb: hexToRgb(cols[i]), thick: Math.min(1.15, capCm * 0.19), fillet: Math.min(0.5, capCm * 0.085), g: texel * 1.1, meta: { title: true } });
    if (B) {
      B.face = 1;
      B.shift(0, 3 + i * 3.2, 0);
    }
    x += (ws[i] + 0.1) * px * texel;
  });
  flushBones();
}

function start() {
  if (st.mode !== 'title') return;
  st.mode = 'play';
  ui.showTitle(false);
  applyPosts();
  let k = 0;
  for (const B of bodies) {
    if (!B.meta.title) continue;
    const d = k++ * 0.045;
    after(d, () => {
      B.wake();
      B.impulse((Math.random() - 0.5) * 40, 190 + Math.random() * 40, (Math.random() - 0.5) * 30);
      B.spin(1, 0, 0, (Math.random() - 0.5) * 8);
      audio.play('pop', 0.5, 0.9 + k * 0.03);
      after(0.3, () => {
        B.ghost = true;
        B.wake();
      });
    });
  }
  tools.forEach((tl, i) => {
    after(0.35 + i * 0.09, () => {
      tl.root.visible = true;
      tl.root.position.y = tl.home.y + 34;
      after(0.42, () => audio.play('thud', 0.5, 0.8));
    });
  });
  after(0.6, () => {
    pack.group.visible = true;
    tween(0.5, q => {
      pack.group.position.y = 30 * (1 - q) * (1 - q);
    });
  });
  after(0.95, () => {
    if (st.firstMold) ui.molds(placeMold);
    refreshChips();
  });
  refreshChips();
  kick();
}

function moldRect() {
  const m = T.mold;
  return m ? [m.x0, m.x0 + FW * TX, m.z0, m.z0 + FH * TX] : null;
}

function placeMold(shapeList, id) {
  if (mold) {
    if (mold.state === 'set') dumpMold(() => placeMold(shapeList, id));
    return;
  }
  st.firstMold = false;
  const field = buildField(shapeList, 4);
  const [cx, cz] = stage.layout.mold;
  const mesh = buildMoldMesh(field);
  const w = FW * TX;
  const d = FH * TX;
  const i0 = Math.round((cx - w / 2 + HALF) / DX);
  const j0 = Math.round((cz - d / 2 + HALF) / DX);
  const x0 = -HALF + i0 * DX;
  const z0 = -HALF + j0 * DX;
  const group = new THREE.Group();
  group.position.set(x0 + w / 2, 0.8, z0 + d / 2);
  mesh.position.set(-w / 2, -0.8, -d / 2);
  group.add(mesh);
  scene.add(group);
  mold = { group, mesh, field, ids: shapeList.map(s => (typeof s === 'string' ? s : 'custom')), state: 'drop', cx: x0 + w / 2, cz: z0 + d / 2, w, d };
  for (const B of bodies) {
    if (B.anchors > 0 || B.carrier || B.inPack) continue;
    B.center(cen);
    const dx = cen[0] - mold.cx;
    const dz = cen[2] - mold.cz;
    if (Math.abs(dx) < w / 2 + B.size * 0.5 && Math.abs(dz) < d / 2 + B.size * 0.5) {
      const l = Math.hypot(dx, dz) || 1;
      B.impulse((dx / l) * 150, 150, (dz / l) * 150 + 30);
    }
  }
  refreshChips();
  tween(
    0.4,
    k => {
      group.position.y = 0.8 + 18 * (1 - k * k);
      group.rotation.z = 0.12 * (1 - k);
    },
    () => {
      group.position.y = 0.8;
      group.rotation.z = 0;
      setMold(field, mold.cx, mold.cz);
      const r = moldRect();
      clearFluid(Math.floor((r[0] + HALF) / DX), Math.ceil((r[1] + HALF) / DX), Math.floor((r[2] + HALF) / DX), Math.ceil((r[3] + HALF) / DX));
      clearSugarRect(r[0], r[1], r[2], r[3]);
      rebuildFills(bodies);
      syncFluidUniforms();
      for (const B of bodies) if (B.anchors === 0) B.wake();
      mold.state = 'set';
      audio.play('flop', 0.9);
      tween(0.5, k => {
        const s = 1 - 0.13 * Math.exp(-k * 5) * Math.cos(k * 16);
        group.scale.set(2 - s, s, 2 - s);
      });
      if (pitcher.amount <= 0 && !st.sheet) after(0.35, () => !st.sheet && !ui.open && openMass());
    }
  );
}

function dumpMold(then) {
  if (!mold || mold.state !== 'set') return;
  mold.state = 'dump';
  putDown();
  const m = T.mold;
  const carried = bodies.filter(B => B.fill && B.fill.moldRef === m && B.anchors > 0);
  for (const B of carried) {
    B.fill = null;
    B.carrier = mold;
    B.asleep = true;
    B.grab = -1;
  }
  const i0 = m.i0;
  const j0 = m.j0;
  let drops = 0;
  for (let j = j0; j < j0 + FH / 4; j++) {
    for (let i = i0; i < i0 + FW / 4; i++) {
      const k = j * N + i;
      if (F.h[k] < 0.03 || (i + j) % 2 || drops > 260) continue;
      dumpEm.mat = makeMat([Math.exp(-F.ar[k]), Math.exp(-F.ag[k]), Math.exp(-F.ab[k])], F.op[k], F.op[k] > 0.95 ? 'choc' : 'mass');
      dumpEm.last = -1;
      emit(dumpEm, -HALF + (i + 0.5) * DX, T.b[k] + F.h[k] + 0.3, -HALF + (j + 0.5) * DX, (Math.random() - 0.5) * 20, 40 + Math.random() * 50, (Math.random() - 0.5) * 20, F.h[k] * DX * DX * 2, 2);
      drops++;
    }
  }
  clearFluid(i0, i0 + FW / 4, j0, j0 + FH / 4);
  clearMold();
  rebuildFills(bodies);
  syncFluidUniforms();
  for (const B of bodies) if (!B.carrier && B.anchors === 0) B.wake();
  audio.play('whoosh', 0.7);
  const g = mold.group;
  const pose = () => {
    g.updateMatrix();
    m4.copy(g.matrix);
    m4b.makeTranslation(-mold.cx, -0.8, -mold.cz);
    m4.multiply(m4b);
    quat.copy(g.quaternion);
    for (const B of carried) if (B.carrier) B.pose(m4, quat);
  };
  refreshChips();
  tween(
    0.42,
    k => {
      const e = easeOut(k);
      g.position.y = 0.8 + 9.5 * e;
      g.rotation.x = Math.PI * e;
      pose();
    },
    () => {
      const order = carried.slice().sort(() => Math.random() - 0.5);
      order.forEach((B, q) => {
        after(0.05 + q * 0.085, () => {
          if (B.dead) return;
          pose();
          B.carrier = null;
          B.releaseAll();
          B.fresh = false;
          B.impulse((Math.random() - 0.5) * 16, -70, (Math.random() - 0.5) * 16);
          audio.play('pop', 0.8, 0.9 + Math.random() * 0.3);
        });
      });
      tween(
        0.3 + order.length * 0.085,
        k => {
          g.position.y = 10.3 + Math.sin(k * 30) * 0.22 * (1 - k);
          pose();
        },
        () => {
          tween(
            0.4,
            k => {
              g.position.y = 10.3 + 50 * k * k;
              g.scale.setScalar(1 - 0.3 * k);
            },
            () => {
              scene.remove(g);
              mold.mesh.geometry.dispose();
              mold.field.gone = true;
              releaseField(mold.field);
              mold = null;
              refreshChips();
              if (then) then();
            }
          );
        }
      );
    }
  );
}

function clearTable() {
  for (const B of bodies.slice()) if (!B.carrier) destroyBody(B);
  clearFluid(0, N - 1, 0, N - 1);
  clearSugar();
  rebuildFills(bodies);
  st.packCount = 0;
  if (pack.sealed) unseal();
  refreshChips();
  kick();
}

function openDesign() {
  if (pack.busy) return;
  putDown();
  ui.design(
    pack.style,
    { count: st.packCount, sealed: pack.sealed, name: pack.style.name },
    {
      style: s => {
        pack.setStyle(s);
        kick();
      },
      pour: () => {
        ui.close();
        pourOut();
      },
      open: unseal,
      save: () => {
        ui.close();
        collect();
      },
    }
  );
  st.design = true;
  ui.onClose = () => {
    st.design = false;
    refreshChips();
  };
  refreshChips();
  kick();
}

function puff(x, y, z) {
  if (!puffTex) {
    const cv = document.createElement('canvas');
    cv.width = cv.height = 64;
    const c = cv.getContext('2d');
    const g = c.createRadialGradient(32, 32, 2, 32, 32, 30);
    g.addColorStop(0, 'rgba(150,156,170,0.55)');
    g.addColorStop(1, 'rgba(150,156,170,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, 64, 64);
    puffTex = new THREE.CanvasTexture(cv);
  }
  for (let i = 0; i < 7; i++) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: puffTex, transparent: true, depthWrite: false }));
    const ox = (i / 6 - 0.5) * 8;
    const vy = 5 + Math.random() * 5;
    const dr = (Math.random() - 0.5) * 2;
    sp.renderOrder = 40;
    scene.add(sp);
    tween(
      0.7 + Math.random() * 0.4,
      k => {
        sp.position.set(x + ox + dr * k, y + 0.4 + vy * k, z + 0.6);
        sp.scale.setScalar(1 + 3.2 * k);
        sp.material.opacity = (1 - k) * 0.9;
      },
      () => {
        scene.remove(sp);
        sp.material.dispose();
      }
    );
  }
}

function unseal() {
  if (!pack.sealed || pack.busy) return;
  pack.sealed = false;
  audio.play('bag', 0.8);
  const k0 = pack.seal;
  tween(0.35, k => pack.setSeal(k0 * (1 - easeOut(k))), refreshChips);
  refreshChips();
}

function pourOut() {
  const list = pack.contents();
  if (!list.length || pack.busy) return;
  pack.busy = true;
  pack.sealed = false;
  pack.collide(false);
  refreshChips();
  const p = pack.group.position;
  const sgn = p.x > 0 ? 1 : -1;
  const x0 = p.x;
  const k0 = pack.seal;
  audio.play('whoosh', 0.6);
  list.forEach((B, i) => {
    after(0.16 + i * 0.07, () => {
      if (B.dead) return;
      B.inPack = false;
      B.wake();
      B.impulse(-sgn * (60 + Math.random() * 70), 150 + Math.random() * 70, (Math.random() - 0.3) * 60);
      B.spin(0, 0, 1, sgn * (3 + Math.random() * 4));
      audio.play('bag', 0.5, 1 + Math.random() * 0.3, 0.05);
    });
  });
  tween(
    0.4,
    k => {
      const e = easeOut(k);
      p.y = 5 * e;
      p.x = x0 - sgn * 2.5 * e;
      pack.group.rotation.z = sgn * 2.2 * e;
      pack.setSeal(k0 * (1 - e));
    },
    () => {
      after(0.25 + list.length * 0.07, () => {
        tween(
          0.4,
          k => {
            const e = 1 - easeOut(k);
            p.y = 5 * e;
            p.x = x0 - sgn * 2.5 * e;
            pack.group.rotation.z = sgn * 2.2 * e;
          },
          () => {
            pack.busy = false;
            st.packCount = 0;
            refreshChips();
          }
        );
      });
    }
  );
}

function collect() {
  const list = pack.contents();
  if (!list.length || pack.busy || !pack.sealed) return;
  putDown();
  const items = list.map(B => ({ shape: B.meta.shape || 'blob', flavor: B.meta.flavor || null, sour: B.topped[0] > 0.7, sprinkles: B.topped[1] > 0.7, choc: B.coated > 1.2 || B.kind === 'choc' }));
  if (!pack.style.name) pack.setStyle({ name: packName(items) });
  const name = pack.style.name;
  pack.busy = true;
  pack.collide(false);
  for (const B of list) B.asleep = true;
  refreshChips();
  const d = load();
  const p = pack.group.position;
  audio.play('pick', 0.7);
  flyLast = 0;
  tween(
    0.3,
    k => {
      const y = Math.sin(k * Math.PI) * 1.6;
      p.y = y;
      for (const B of list) if (!B.dead) B.shift(0, y - flyLast, 0);
      flyLast = y;
    },
    () => {
      flushBones();
      const hid = tools.map(q => q.root).concat(mold ? [mold.group] : []).filter(o => o.visible);
      for (const o of hid) o.visible = false;
      const thumb = pack.thumbnail();
      for (const o of hid) o.visible = true;
      const id = Date.now().toString(36) + (d.seq++).toString(36);
      putPayload(id, { style: { ...pack.style }, bodies: list.map(serializeBody).filter(Boolean) });
      addPack({ id, name, date: Date.now(), thumb, count: list.length, items, style: { ...pack.style } });
      flyLast = 0;
      after(0.25, () => {
        audio.play('whoosh', 0.6);
        tween(
          0.5,
          k => {
            const y = 60 * k * k * k;
            p.y = y;
            for (const B of list) if (!B.dead) B.shift(0, y - flyLast, 0);
            flyLast = y;
          },
          () => {
            for (const B of list) destroyBody(B);
            pack.sealed = false;
            pack.setSeal(0);
            pack.setStyle({ name: '' });
            st.packCount = 0;
            ui.hint(t('packSaved'), 2600);
            tween(
              0.45,
              k => {
                p.y = 16 * (1 - Math.min(1, k * 2.2));
                pack.group.scale.set(1, 0.9 + 0.1 * (1 - Math.exp(-k * 6) * Math.cos(k * 11)), 1);
              },
              () => {
                pack.busy = false;
                refreshChips();
              }
            );
          }
        );
      });
    }
  );
}

function spillPack(p) {
  getPayload(p.id).then(pl => {
    if (!pl || !pl.bodies || !pl.bodies.length) return;
    const L = stage.layout;
    const cx = stage.portrait ? 0 : mold ? -13.5 : 0;
    const cz = stage.portrait ? (mold ? 9 : 2) : mold ? L.mold[1] + 2 : 2;
    pl.bodies.forEach((d, i) => {
      after(0.12 * i, () => {
        if (bodies.length > 50) return;
        const B = bodyFromData(d, cx + (Math.random() - 0.5) * 7, cz + (Math.random() - 0.5) * 7);
        if (!B) return;
        if (B.face < 0) {
          m4.makeTranslation(B.g0[0], B.g0[1], B.g0[2]);
          m4b.makeRotationX(Math.PI);
          m4.multiply(m4b);
          m4b.makeTranslation(-B.g0[0], -B.g0[1], -B.g0[2]);
          m4.multiply(m4b);
          quat.setFromAxisAngle(v3.set(1, 0, 0), Math.PI);
          B.pose(m4, quat);
        }
        B.shift(0, 9 + Math.random() * 3, 0);
        B.fresh = false;
        B.wake();
        B.spin(0, 1, 0, (Math.random() - 0.5) * 3);
        audio.play('pop', 0.45, 1 + Math.random() * 0.3, 0.04);
      });
    });
    kick();
  });
}

function pickUp(tl) {
  if (st.tool === tl) return;
  putDown();
  if (ui.docked) ui.close();
  st.tool = tl;
  tl.inHand = true;
  audio.play('pick', 0.6);
  canvas.style.cursor = 'crosshair';
  applyPosts();
  aimTool();
  refreshChips();
  ui.hintOnce('putdown', t(IS_TOUCH ? 'hintPutDownTouch' : 'hintPutDown'), 5200);
}

function putDown() {
  const tl = st.tool;
  if (!tl) return;
  tl.inHand = false;
  tl.pressing = false;
  tl.onPack = false;
  st.tool = null;
  canvas.style.cursor = '';
  audio.play('pick', 0.4, 0.8);
  after(0.3, applyPosts);
  refreshChips();
}

function overPack(x, y, m = 2.2, up = 8) {
  const ray = stage.setRay(x, y);
  const o = ray.origin;
  const d = ray.direction;
  const p = pack.group.position;
  let t0 = -1e9;
  let t1 = 1e9;
  const mn = [p.x - PACK.hw - m, p.y, p.z - PACK.hd - m];
  const mx = [p.x + PACK.hw + m, p.y + PACK.h + up, p.z + PACK.hd + m];
  const oo = [o.x, o.y, o.z];
  const dd = [d.x, d.y, d.z];
  for (let a = 0; a < 3; a++) {
    const inv = 1 / (dd[a] || 1e-9);
    let a0 = (mn[a] - oo[a]) * inv;
    let a1 = (mx[a] - oo[a]) * inv;
    if (a0 > a1) [a0, a1] = [a1, a0];
    if (a0 > t0) t0 = a0;
    if (a1 < t1) t1 = a1;
  }
  return t1 >= t0;
}

function aimTool() {
  const tl = st.tool;
  if (!tl || !ptr.has) return;
  const off = ptr.touch ? 54 : 0;
  if (tl === sealer) {
    const p = pack.group.position;
    if (!pack.busy && overPack(ptr.x, ptr.y - off, 2.6, 6)) {
      tl.onPack = true;
      tl.aim(v3.set(p.x, p.y + PACK.seam, p.z));
    } else {
      tl.onPack = false;
      stage.ground(ptr.x, ptr.y - off, 5.5, v3);
      tl.aim(v3);
    }
    return;
  }
  stage.ground(ptr.x, ptr.y - off, 0, v3);
  if (mold && mold.state === 'set' && Math.abs(v3.x - mold.cx) < mold.w / 2 + 0.6 && Math.abs(v3.z - mold.cz) < mold.d / 2 + 0.6) stage.ground(ptr.x, ptr.y - off, 1.5, v3);
  v3.x = clamp(v3.x, -HALF + 3, HALF - 3);
  v3.z = clamp(v3.z, -HALF + 3, HALF - 3);
  tl.landOffset(v3b);
  tl.aim(v3.set(v3.x + v3b.x, tl.hover, v3.z));
}

function toolAt(x, y) {
  stage.ground(x, y, 0, v3);
  for (const tl of tools) {
    if (tl !== sealer && !tl.inHand && Math.hypot(v3.x - tl.bx, v3.z - tl.bz) < 3.1) return tl;
    stage.setRay(x, y);
    if (stage.raycaster.intersectObject(tl.root, true).length) return tl;
  }
  return null;
}

function homeSpot(x, y) {
  stage.ground(x, y, 0, v3);
  for (const tl of tools) {
    const r = tl === sealer ? 5.5 : 3.4;
    if (Math.abs(v3.x - tl.bx) < r && Math.abs(v3.z - tl.bz) < 3.4) return tl;
  }
  return null;
}

function startGrab(B, i) {
  B.wake();
  if (B.fill) freeFill(B);
  if (B.anch[i]) {
    B.anch[i] = 0;
    B.anchors--;
  }
  B.grab = i;
  B.gt[0] = B.x[i];
  B.gt[1] = B.y[i];
  B.gt[2] = B.z[i];
  grab = { B, i, hold: B.y[i], base: B.breakD, t: 0, mag: 0 };
  canvas.style.cursor = 'grabbing';
  if (B.anchors > 0) audio.play('peel', 0.5);
  else if (st.mode === 'play' && !B.inPack) ui.hintOnce('pack', t('hintPack'), 5000);
}

function updateGrab(dt) {
  if (!grab) return;
  const B = grab.B;
  if (B.dead) {
    grab = null;
    return;
  }
  grab.t += dt;
  const near = st.mode === 'play' && !pack.busy && !pack.sealed && B.anchors === 0 && overPack(ptr.x, ptr.y);
  const want = near ? PACK.h + Math.min(6, B.size * 0.8 + 1.5) : 3.9;
  grab.hold += (want - grab.hold) * (1 - Math.exp(-dt * 9));
  grab.mag += ((near ? 1 : 0) - grab.mag) * (1 - Math.exp(-dt * 10));
  stage.ground(ptr.x, ptr.y, grab.hold, v3);
  const p = pack.group.position;
  const m = grab.mag;
  B.gt[0] = v3.x + (clamp(v3.x, p.x - 2, p.x + 2) - v3.x) * m;
  B.gt[1] = v3.y;
  B.gt[2] = v3.z + (p.z - v3.z) * m;
  if (B.anchors > 0) B.breakD = grab.base * clamp(1 - (grab.t - 0.1) * 1.6, 0.16, 1);
  B.wake();
}

function flip(B, vy) {
  B.impulse((Math.random() - 0.5) * 14, vy, (Math.random() - 0.5) * 14);
  const air = (2 * vy) / 820;
  B.spin(1, 0, 0, (Math.random() < 0.5 ? 1 : -1) * (Math.PI / air) * 1.02);
}

function endGrab(tap) {
  if (!grab) return;
  const B = grab.B;
  B.grab = -1;
  B.breakD = grab.base;
  canvas.style.cursor = '';
  if (!B.dead) {
    if (grab.mag > 0.6 && !pack.sealed && !pack.busy && !tap) {
      B.inPack = true;
      B.fresh = false;
      ui.hintOnce('seal', t('hintSeal'), 6500);
    } else if (tap) {
      if (B.anchors > 0) {
        B.releaseAll();
        B.fresh = false;
        flip(B, 205);
        audio.play('pop', 0.9);
      } else if (!B.inPack) {
        flip(B, 150);
        audio.play('peel', 0.35, 1.3);
      }
    } else if (B.anchors === 0 && B.fresh) {
      B.fresh = false;
      B.up(upv);
      if (upv[1] * (B.face || -1) < 0.15) flip(B, 120);
    }
  }
  grab = null;
}

function onDown(x, y, touch, id) {
  audio.unlock();
  kick();
  ptr.x = ptr.x0 = x;
  ptr.y = ptr.y0 = y;
  ptr.touch = touch;
  ptr.has = true;
  ptr.t0 = st.time;
  ptr.id = id;
  if (st.sheet) return;
  ptr.down = true;
  ptr.mode = 'none';
  const tl = st.tool;
  if (st.mode === 'play') {
    if (tl) {
      const spot = homeSpot(x, y);
      stage.setRay(x, y);
      const onSelf = touch && stage.raycaster.intersectObject(tl.root, true).length > 0;
      if (spot === tl || onSelf) {
        putDown();
        ptr.mode = 'ui';
        return;
      }
      const other = toolAt(x, y);
      if (other && other !== tl) {
        if (other === pitcher && pitcher.amount <= 0) {
          putDown();
          openMass();
        } else pickUp(other);
        ptr.mode = 'ui';
        return;
      }
      aimTool();
      if (tl === pitcher && pitcher.amount <= 0) {
        ui.hint(t('hintEmpty'), 1800);
        putDown();
        openMass();
        ptr.mode = 'ui';
        return;
      }
      if (tl === sealer && tl.onPack && st.packCount === 0 && !pack.sealed) ui.hint(t('hintSealEmpty'), 2200);
      tl.pressing = true;
      ptr.mode = 'pour';
      refreshChips();
      return;
    }
    const pk = toolAt(x, y);
    if (pk) {
      if (pk === pitcher && pitcher.amount <= 0) openMass();
      else pickUp(pk);
      ptr.mode = 'ui';
      return;
    }
  }
  const ray = stage.setRay(x, y);
  if (rayPick(ray.origin.x, ray.origin.y, ray.origin.z, ray.direction.x, ray.direction.y, ray.direction.z, touch ? 0.55 : 0.12, hitOut) && !(hitOut.body.inPack && (pack.sealed || pack.busy))) {
    startGrab(hitOut.body, hitOut.i);
    ptr.mode = 'grab';
    refreshChips();
    return;
  }
  if (st.mode !== 'play') return;
  if (!pack.busy && overPack(x, y, 0.2, 0.6)) {
    ptr.mode = 'pack';
    stage.ground(x, y, 0, v3);
    st.dragOff = [pack.group.position.x - v3.x, pack.group.position.z - v3.z];
    return;
  }
  if (mold && mold.state === 'set') {
    stage.ground(x, y, 1.5, v3);
    if (Math.abs(v3.x - mold.cx) < mold.w / 2 && Math.abs(v3.z - mold.cz) < mold.d / 2) ptr.mode = 'mold';
  }
}

function onMove(x, y, touch) {
  ptr.x = x;
  ptr.y = y;
  ptr.has = true;
  ptr.touch = touch;
  if (st.tool || ptr.down) kick();
  if (ptr.mode === 'mold' && ptr.down && ptr.y0 - y > 34) {
    ptr.mode = 'none';
    dumpMold();
  }
  if (ptr.mode === 'pack' && ptr.down && !st.drag && Math.hypot(x - ptr.x0, y - ptr.y0) > 9) {
    st.drag = { vx: 0 };
    if (ui.docked) ui.close();
    audio.play('bag', 0.5);
    refreshChips();
  }
  if (!ptr.down && !st.tool && !touch && !st.sheet) {
    const ray = stage.setRay(x, y);
    const over = rayPick(ray.origin.x, ray.origin.y, ray.origin.z, ray.direction.x, ray.direction.y, ray.direction.z, 0.1, hitOut) || (st.mode === 'play' && (toolAt(x, y) || overPack(x, y, 0.2, 0.6)));
    canvas.style.cursor = over ? 'grab' : '';
  }
}

function onUp() {
  if (!ptr.down) return;
  ptr.down = false;
  kick();
  const tap = st.time - ptr.t0 < 0.26 && Math.hypot(ptr.x - ptr.x0, ptr.y - ptr.y0) < 10;
  if (ptr.mode === 'pour' && st.tool) st.tool.pressing = false;
  if (ptr.mode === 'grab') endGrab(tap);
  if (ptr.mode === 'pack') {
    if (st.drag) {
      st.drag = null;
      st.px = pack.group.position.x;
      st.pz = pack.group.position.z;
      st.packMoved = true;
      audio.play('thud', 0.4, 0.9);
    } else if (st.design) ui.close();
    else openDesign();
  }
  ptr.mode = null;
  refreshChips();
}

canvas.addEventListener('pointerdown', e => {
  if (e.button > 0) {
    putDown();
    return;
  }
  canvas.setPointerCapture(e.pointerId);
  onDown(e.clientX, e.clientY, e.pointerType === 'touch', e.pointerId);
});
canvas.addEventListener('pointermove', e => {
  if (ptr.down && e.pointerId !== ptr.id) return;
  onMove(e.clientX, e.clientY, e.pointerType === 'touch');
});
const up = e => {
  if (e.pointerId === ptr.id) onUp();
};
canvas.addEventListener('pointerup', up);
canvas.addEventListener('pointercancel', up);
canvas.addEventListener('contextmenu', e => e.preventDefault());
window.addEventListener('keydown', e => {
  if (e.key === 'Escape' && !st.sheet) putDown();
  if (st.sheet || st.mode !== 'play' || (e.target && e.target.tagName === 'INPUT')) return;
  if (e.key === '1') pitcher.amount > 0 ? pickUp(pitcher) : openMass();
  if (e.key === '2') pickUp(bottle);
  if (e.key === '3') pickUp(shaker);
  if (e.key === '4') pickUp(sealer);
});
window.addEventListener('resize', () => {
  stage.resize();
  applyLayout();
});
window.addEventListener('blur', () => {
  if (ptr.down) onUp();
});

STREAM.hit = (x, y, z, i, mat) => {
  if (!queryHit(x, y, z, 0.22, hitOut)) return 0;
  const B = hitOut.body;
  if (B.carrier || B.ghost) return 0;
  const choc = mat.kind === 'choc';
  const j = hitOut.i;
  const dx = x - B.x[j];
  const dy = y - B.y[j];
  const dz = z - B.z[j];
  const sc = B.rad[j] / (Math.hypot(dx, dy, dz) || 1);
  coatBody(B, j, B.x[j] + dx * sc, B.y[j] + dy * sc, B.z[j] + dz * sc, mat, choc ? 0.5 : 0.36, choc ? 0.44 : 0.55);
  return 1;
};

function dipCoat() {
  if (!hasFluid()) return;
  for (const B of bodies) {
    if (B.carrier || B.fill || B.ghost || B.anchors > 0 || (B.asleep && !F.moving)) continue;
    for (let i = 0; i < B.n; i++) {
      const x = B.x[i];
      const z = B.z[i];
      if (!inDomain(x, z, 1)) continue;
      const fs = surfaceAt(x, z);
      const low = B.y[i] - B.rad[i];
      if (fs < low + 0.02) continue;
      const k = Math.floor((z + HALF) / DX) * N + Math.floor((x + HALF) / DX);
      const o = F.op[k];
      coatBody(B, i, x, low, z, { rgb: [Math.exp(-F.ar[k]), Math.exp(-F.ag[k]), Math.exp(-F.ab[k])], kind: o > 0.95 ? 'choc' : 'mass' }, 0.16, B.rad[i] + 0.3);
      F.h[k] = Math.max(0, F.h[k] - 0.01);
      F.calm[k] = 0;
      F.dirty = true;
    }
  }
}

function stepPack(dt) {
  const p = pack.group.position;
  if (st.drag) {
    stage.ground(ptr.x, ptr.y, 0, v3);
    const b = colliders.bounds;
    const tx = clamp(v3.x + st.dragOff[0], b[0] + PACK.hw, b[1] - PACK.hw);
    const tz = clamp(v3.z + st.dragOff[1], b[2] + 4, b[3] - 3);
    const f = 1 - Math.exp(-dt * 13);
    const ox = p.x;
    p.x += (tx - p.x) * f;
    p.z += (tz - p.z) * f;
    p.y += (1.3 - p.y) * (1 - Math.exp(-dt * 10));
    st.drag.vx += ((p.x - ox) / Math.max(dt, 1e-4) - st.drag.vx) * Math.min(1, dt * 12);
    pack.group.rotation.z = clamp(-st.drag.vx * 0.0035, -0.22, 0.22);
    for (const B of bodies) if (B.inPack) B.wake();
  } else if (!pack.busy && (p.y > 0.001 || Math.abs(pack.group.rotation.z) > 0.001)) {
    p.y += (0 - p.y) * (1 - Math.exp(-dt * 14));
    pack.group.rotation.z *= Math.exp(-dt * 12);
    if (p.y < 0.002) p.y = 0;
    for (const B of bodies) if (B.inPack) B.wake();
    kick();
  }
  if (!pack.busy) pack.collide(st.mode === 'play' && pack.group.visible);
  packMembership();
  let heat = 0;
  if (st.tool === sealer && sealer.pressing && sealer.onPack && !pack.sealed && !pack.busy && st.packCount > 0) {
    const rp = sealer.root.position;
    if (Math.hypot(rp.x - p.x, rp.y - (p.y + PACK.seam), rp.z - p.z) < 1.2) {
      if (pack.seal < sealer.closed * 0.97) pack.setSeal(sealer.closed * 0.97);
      if (sealer.closed > 0.9) {
        st.sealT += dt;
        heat = Math.min(1, st.sealT / 0.75);
        if (st.sealT > 0.75) {
          pack.sealed = true;
          pack.setSeal(1);
          st.sealT = 0;
          audio.play('seal', 1);
          puff(p.x, p.y + PACK.seam + 0.4, p.z);
          ui.hintOnce('sealed', t('hintSealed'), 6000);
          for (const B of bodies) if (B.inPack) B.wake();
          refreshChips();
        }
      }
    }
  } else {
    st.sealT = 0;
    if (!pack.sealed && !pack.busy && pack.seal > 0) pack.setSeal(Math.max(0, pack.seal - dt * 4.5));
  }
  sealer.heat += (heat - sealer.heat) * Math.min(1, dt * 10);
  audio.loop('hiss', heat > 0 ? 0.25 + heat * 0.5 : 0, 1);
}

function frame(dt) {
  st.time += dt;
  for (const w of tweens.slice()) {
    w.t += dt;
    const k = Math.min(1, w.t / w.d);
    w.fn(k);
    if (k >= 1) {
      tweens.splice(tweens.indexOf(w), 1);
      if (w.done) w.done();
    }
  }
  updateGrab(dt);
  aimTool();
  let toolBusy = false;
  for (const tl of tools) {
    tl.update(dt);
    if (tl.moving || tl.flow > 0.01 || (tl !== sealer && Math.abs(tl.tilt) > 0.003) || (tl === sealer && (tl.heat > 0.01 || tl.pressing))) toolBusy = true;
  }
  audio.loop('pour', pitcher.flow * 0.75, 0.85 + 0.3 * pitcher.flow);
  audio.loop('drizzle', bottle.em.on ? bottle.flow * 0.6 : 0, 1);
  audio.loop('shake', shaker.shake * 0.8, 1);
  stepPack(dt);
  stepStreams(dt);
  stepSugar(dt);
  stepFluid(dt);
  if (T.version !== st.tv) {
    st.tv = T.version;
    F.dirty = true;
  }
  st.scanT += dt;
  if (st.scanT > 0.2) {
    st.scanT = 0;
    for (const c of findSettable()) {
      if (c.vol < 0.12 || c.peak < 0.07) {
        for (const k of c.cells) F.h[k] = 0;
        F.dirty = true;
        continue;
      }
      const B = solidify(c);
      if (!B) continue;
      B.center(cen);
      B.meta.shape = B.inMold ? shapeAt(cen[0], cen[2]) : 'blob';
      B.meta.flavor = B.kind === 'choc' ? null : pitcher.flavor ? pitcher.flavor.id : null;
      B.fresh = true;
      B.face = -1;
      B.flash = 0.42;
      audio.play('set', 0.45, 0.9 + Math.random() * 0.25, 0.08);
      ui.hintOnce('set', t('hintSet'), 6500);
    }
    dipCoat();
  }
  const moved = stepBodies(dt);
  for (const e of events) {
    if (e.t === 'thud') audio.play('thud', clamp(e.v / 420, 0.12, 1), clamp(1.25 - e.body.size * 0.05, 0.75, 1.3) * (e.body.kind === 'choc' ? 1.5 : 1), 0.05);
    else if (e.last) {
      audio.play('pop', 0.9);
      e.body.impulse(0, 26, 0);
      ui.hintOnce('loose', t('hintLoose'), 6500);
    } else audio.play('peel', 0.4, 1 + Math.random() * 0.3, 0.06);
  }
  events.length = 0;
  let flashing = false;
  for (let i = bodies.length - 1; i >= 0; i--) {
    const B = bodies[i];
    if (B.flash > 0) {
      B.flash = Math.max(0, B.flash - dt * 1.3);
      flashing = true;
    }
    if (B.ghost && B.y[0] < -14) destroyBody(B);
  }
  flushBones();
  if (F.dirty) buildSurface();
  buildStreams(emitters);
  st.slowT += dt;
  if (st.slowT > 0.25) {
    st.slowT = 0;
    const n = st.mode === 'play' ? pack.contents().length : 0;
    if (n !== st.packCount) {
      if (n > st.packCount) audio.play('bag', 0.7);
      st.packCount = n;
      refreshChips();
    }
    if (bodies.length > 54) {
      const old = bodies.find(B => B.anchors === 0 && !B.carrier && B.grab < 0 && B.asleep && !B.inPack);
      if (old) destroyBody(old);
    }
  }
  const busy = ptr.down || toolBusy || moved || tweens.length > 0 || streamsActive() || sugarActive() || hasFluid() || flashing || (st.tool && st.tool.moving) || st.drag;
  if (busy) st.idle = 0;
  else st.idle++;
}

let lastT = 0;
function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min(1 / 30, Math.max(1 / 240, (now - lastT) / 1000));
  lastT = now;
  if (st.idle > 30) return;
  frame(dt);
  stage.render();
}

applyLayout();
titleLetters();
ui.showTitle(true);
applyLayout();

window.G = {
  ready: true,
  stage,
  st,
  F,
  T,
  bodies,
  tools,
  pack,
  ui,
  ptr,
  step(n, dt = 1 / 60) {
    const t0 = performance.now();
    for (let i = 0; i < n; i++) frame(dt);
    stage.render();
    return +((performance.now() - t0) / n).toFixed(2);
  },
  start,
  placeMold,
  dumpMold,
  snap(name) {
    stage.render();
    return fetch('/shot/' + name, { method: 'POST', body: canvas.toDataURL('image/png') });
  },
  down: (x, y, touch = false) => onDown(x, y, touch, 1),
  move: (x, y, touch = false) => onMove(x, y, touch),
  up: onUp,
  screen(x, y, z) {
    stage.toScreen(v3.set(x, y, z), v3b);
    return [v3b.x, v3b.y];
  },
  fill(hex, flavorIdx = 0, op = 0) {
    pitcher.fill(makeMat(hexToRgb(hex), op, 'mass'), FLAVORS[flavorIdx]);
    refreshChips();
  },
  pickUp,
  putDown,
  openDesign,
  collect,
  pourOut,
  spillPack,
  get mold() {
    return mold;
  },
};
if (!TEST) requestAnimationFrame(loop);
else {
  frame(1 / 60);
  stage.render();
}
