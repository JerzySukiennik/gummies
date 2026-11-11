// Gummies: soft bodies as particle clusters with shape matching, anchors, grabbing and collisions.
import { GRAV } from './config.js';
import { coarseAt, inDomain } from './world.js';

export const bodies = [];
export const events = [];
export const colliders = { pack: null, posts: [], bounds: [-60, 60, -50, 40] };

const DT = 1 / 120;
const HC = 1.5;
const HW = 112;
const HO = (HW * HC) / 2;
const cellStart = new Int32Array(HW * HW + 1);
const cellCur = new Int32Array(HW * HW + 1);
let cellItems = new Int32Array(4096);
const A = new Float64Array(9);
let acc = 0;
let hashValid = false;

export class Body {
  constructor(n) {
    this.n = n;
    const f = () => new Float32Array(n);
    this.x = f();
    this.y = f();
    this.z = f();
    this.px = f();
    this.py = f();
    this.pz = f();
    this.vx = f();
    this.vy = f();
    this.vz = f();
    this.rx = f();
    this.ry = f();
    this.rz = f();
    this.rad = f();
    this.ax = f();
    this.ay = f();
    this.az = f();
    this.gx = f();
    this.gy = f();
    this.gz = f();
    this.gn = f();
    this.anch = new Uint8Array(n);
    this.q = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) this.q[i * 4 + 3] = 1;
    this.gq = new Float32Array([0, 0, 0, 1]);
    this.ns = null;
    this.nb = null;
    this.c0 = new Float32Array(n * 3);
    this.g0 = new Float32Array(3);
    this.anchors = 0;
    this.asleep = false;
    this.active = true;
    this.still = 0;
    this.grab = -1;
    this.gt = [0, 0, 0];
    this.stretch = 1.5;
    this.breakD = 0.3;
    this.hit = false;
    this.dirty = false;
    this.alpha = 0.55;
    this.beta = 0.3;
    this.fric = 0.6;
    this.bounce = 0.3;
    this.thudT = 0;
    this.fill = null;
    this.mesh = null;
    this.bones = null;
    this.dead = false;
    this.carrier = null;
    this.age = 0;
    this.inPack = false;
    this.ghost = false;
    this.reach = 0.3;
  }

  finish(clusterR) {
    const n = this.n;
    const lists = [];
    let total = 0;
    const r2 = clusterR * clusterR;
    for (let i = 0; i < n; i++) {
      const l = [];
      for (let j = 0; j < n; j++) {
        const dx = this.rx[i] - this.rx[j];
        const dy = this.ry[i] - this.ry[j];
        const dz = this.rz[i] - this.rz[j];
        if (dx * dx + dy * dy + dz * dz <= r2) l.push(j);
      }
      lists.push(l);
      total += l.length;
    }
    this.ns = new Int32Array(n + 1);
    this.nb = new Int32Array(total);
    let o = 0;
    let gx = 0;
    let gy = 0;
    let gz = 0;
    for (let i = 0; i < n; i++) {
      this.ns[i] = o;
      let cx = 0;
      let cy = 0;
      let cz = 0;
      for (const j of lists[i]) {
        this.nb[o++] = j;
        cx += this.rx[j];
        cy += this.ry[j];
        cz += this.rz[j];
      }
      const m = lists[i].length;
      this.c0[i * 3] = cx / m;
      this.c0[i * 3 + 1] = cy / m;
      this.c0[i * 3 + 2] = cz / m;
      gx += this.rx[i];
      gy += this.ry[i];
      gz += this.rz[i];
    }
    this.ns[n] = o;
    this.g0[0] = gx / n;
    this.g0[1] = gy / n;
    this.g0[2] = gz / n;
  }

  place() {
    for (let i = 0; i < this.n; i++) {
      this.x[i] = this.px[i] = this.ax[i] = this.rx[i];
      this.y[i] = this.py[i] = this.ay[i] = this.ry[i];
      this.z[i] = this.pz[i] = this.az[i] = this.rz[i];
    }
  }

  anchorAll() {
    this.anch.fill(1);
    this.anchors = this.n;
    this.asleep = true;
  }

  releaseAll() {
    this.anch.fill(0);
    this.anchors = 0;
    this.wake();
  }

  wake() {
    this.asleep = false;
    this.still = 0;
  }

  center(out) {
    let cx = 0;
    let cy = 0;
    let cz = 0;
    for (let i = 0; i < this.n; i++) {
      cx += this.x[i];
      cy += this.y[i];
      cz += this.z[i];
    }
    out[0] = cx / this.n;
    out[1] = cy / this.n;
    out[2] = cz / this.n;
    return out;
  }

  transform(m) {
    const e = m.elements;
    for (let i = 0; i < this.n; i++) {
      const X = this.x[i];
      const Y = this.y[i];
      const Z = this.z[i];
      this.x[i] = this.px[i] = e[0] * X + e[4] * Y + e[8] * Z + e[12];
      this.y[i] = this.py[i] = e[1] * X + e[5] * Y + e[9] * Z + e[13];
      this.z[i] = this.pz[i] = e[2] * X + e[6] * Y + e[10] * Z + e[14];
    }
  }

  pose(m, q) {
    const e = m.elements;
    for (let i = 0; i < this.n; i++) {
      const X = this.rx[i];
      const Y = this.ry[i];
      const Z = this.rz[i];
      this.x[i] = this.px[i] = e[0] * X + e[4] * Y + e[8] * Z + e[12];
      this.y[i] = this.py[i] = e[1] * X + e[5] * Y + e[9] * Z + e[13];
      this.z[i] = this.pz[i] = e[2] * X + e[6] * Y + e[10] * Z + e[14];
      this.q[i * 4] = q.x;
      this.q[i * 4 + 1] = q.y;
      this.q[i * 4 + 2] = q.z;
      this.q[i * 4 + 3] = q.w;
    }
    this.gq[0] = q.x;
    this.gq[1] = q.y;
    this.gq[2] = q.z;
    this.gq[3] = q.w;
    this.dirty = true;
  }

  shift(dx, dy, dz) {
    for (let i = 0; i < this.n; i++) {
      this.x[i] += dx;
      this.y[i] += dy;
      this.z[i] += dz;
      this.px[i] += dx;
      this.py[i] += dy;
      this.pz[i] += dz;
    }
    this.dirty = true;
  }

  up(out) {
    const q = this.n > 2 && this.beta > 0 ? this.gq : this.q;
    out[0] = 2 * (q[0] * q[1] - q[3] * q[2]);
    out[1] = 1 - 2 * (q[0] * q[0] + q[2] * q[2]);
    out[2] = 2 * (q[1] * q[2] + q[3] * q[0]);
    return out;
  }

  impulse(vx, vy, vz) {
    for (let i = 0; i < this.n; i++) {
      this.vx[i] += vx;
      this.vy[i] += vy;
      this.vz[i] += vz;
    }
    this.wake();
  }

  spin(ax, ay, az, w) {
    const c = [0, 0, 0];
    this.center(c);
    for (let i = 0; i < this.n; i++) {
      const dx = this.x[i] - c[0];
      const dy = this.y[i] - c[1];
      const dz = this.z[i] - c[2];
      this.vx[i] += (ay * dz - az * dy) * w;
      this.vy[i] += (az * dx - ax * dz) * w;
      this.vz[i] += (ax * dy - ay * dx) * w;
    }
    this.wake();
  }
}

function extract(q, o, iters) {
  let qx = q[o];
  let qy = q[o + 1];
  let qz = q[o + 2];
  let qw = q[o + 3];
  const a00 = A[0];
  const a01 = A[1];
  const a02 = A[2];
  const a10 = A[3];
  const a11 = A[4];
  const a12 = A[5];
  const a20 = A[6];
  const a21 = A[7];
  const a22 = A[8];
  for (let it = 0; it < iters; it++) {
    const xx = qx * qx;
    const yy = qy * qy;
    const zz = qz * qz;
    const xy = qx * qy;
    const xz = qx * qz;
    const yz = qy * qz;
    const wx = qw * qx;
    const wy = qw * qy;
    const wz = qw * qz;
    const r00 = 1 - 2 * (yy + zz);
    const r01 = 2 * (xy - wz);
    const r02 = 2 * (xz + wy);
    const r10 = 2 * (xy + wz);
    const r11 = 1 - 2 * (xx + zz);
    const r12 = 2 * (yz - wx);
    const r20 = 2 * (xz - wy);
    const r21 = 2 * (yz + wx);
    const r22 = 1 - 2 * (xx + yy);
    let ox = r10 * a20 - r20 * a10 + (r11 * a21 - r21 * a11) + (r12 * a22 - r22 * a12);
    let oy = r20 * a00 - r00 * a20 + (r21 * a01 - r01 * a21) + (r22 * a02 - r02 * a22);
    let oz = r00 * a10 - r10 * a00 + (r01 * a11 - r11 * a01) + (r02 * a12 - r12 * a02);
    const den = Math.abs(r00 * a00 + r10 * a10 + r20 * a20 + r01 * a01 + r11 * a11 + r21 * a21 + r02 * a02 + r12 * a12 + r22 * a22) + 1e-9;
    ox /= den;
    oy /= den;
    oz /= den;
    const w = Math.hypot(ox, oy, oz);
    if (w < 1e-7) break;
    const s = Math.sin(w * 0.5) / w;
    const c = Math.cos(w * 0.5);
    const dx = ox * s;
    const dy = oy * s;
    const dz = oz * s;
    const nx = c * qx + dx * qw + dy * qz - dz * qy;
    const ny = c * qy - dx * qz + dy * qw + dz * qx;
    const nz = c * qz + dx * qy - dy * qx + dz * qw;
    const nw = c * qw - dx * qx - dy * qy - dz * qz;
    const il = 1 / Math.hypot(nx, ny, nz, nw);
    qx = nx * il;
    qy = ny * il;
    qz = nz * il;
    qw = nw * il;
  }
  q[o] = qx;
  q[o + 1] = qy;
  q[o + 2] = qz;
  q[o + 3] = qw;
}

const R = new Float64Array(9);
function rot(q, o) {
  const qx = q[o];
  const qy = q[o + 1];
  const qz = q[o + 2];
  const qw = q[o + 3];
  R[0] = 1 - 2 * (qy * qy + qz * qz);
  R[1] = 2 * (qx * qy - qw * qz);
  R[2] = 2 * (qx * qz + qw * qy);
  R[3] = 2 * (qx * qy + qw * qz);
  R[4] = 1 - 2 * (qx * qx + qz * qz);
  R[5] = 2 * (qy * qz - qw * qx);
  R[6] = 2 * (qx * qz - qw * qy);
  R[7] = 2 * (qy * qz + qw * qx);
  R[8] = 1 - 2 * (qx * qx + qy * qy);
}

function matchShape(B, iters) {
  const n = B.n;
  const { x, y, z, rx, ry, rz, gx, gy, gz, gn, ns, nb, c0, q } = B;
  gx.fill(0);
  gy.fill(0);
  gz.fill(0);
  gn.fill(0);
  for (let i = 0; i < n; i++) {
    const s = ns[i];
    const e = ns[i + 1];
    const m = e - s;
    if (m < 2) continue;
    let cx = 0;
    let cy = 0;
    let cz = 0;
    for (let k = s; k < e; k++) {
      const j = nb[k];
      cx += x[j];
      cy += y[j];
      cz += z[j];
    }
    cx /= m;
    cy /= m;
    cz /= m;
    const o3 = i * 3;
    const r0x = c0[o3];
    const r0y = c0[o3 + 1];
    const r0z = c0[o3 + 2];
    A.fill(0);
    for (let k = s; k < e; k++) {
      const j = nb[k];
      const dx = x[j] - cx;
      const dy = y[j] - cy;
      const dz = z[j] - cz;
      const ex = rx[j] - r0x;
      const ey = ry[j] - r0y;
      const ez = rz[j] - r0z;
      A[0] += dx * ex;
      A[1] += dx * ey;
      A[2] += dx * ez;
      A[3] += dy * ex;
      A[4] += dy * ey;
      A[5] += dy * ez;
      A[6] += dz * ex;
      A[7] += dz * ey;
      A[8] += dz * ez;
    }
    extract(q, i * 4, iters);
    rot(q, i * 4);
    for (let k = s; k < e; k++) {
      const j = nb[k];
      const ex = rx[j] - r0x;
      const ey = ry[j] - r0y;
      const ez = rz[j] - r0z;
      gx[j] += cx + R[0] * ex + R[1] * ey + R[2] * ez;
      gy[j] += cy + R[3] * ex + R[4] * ey + R[5] * ez;
      gz[j] += cz + R[6] * ex + R[7] * ey + R[8] * ez;
      gn[j] += 1;
    }
  }
  let bx = 0;
  let by = 0;
  let bz = 0;
  const beta = B.beta;
  if (beta > 0 && n > 2) {
    for (let i = 0; i < n; i++) {
      bx += x[i];
      by += y[i];
      bz += z[i];
    }
    bx /= n;
    by /= n;
    bz /= n;
    A.fill(0);
    for (let j = 0; j < n; j++) {
      const dx = x[j] - bx;
      const dy = y[j] - by;
      const dz = z[j] - bz;
      const ex = rx[j] - B.g0[0];
      const ey = ry[j] - B.g0[1];
      const ez = rz[j] - B.g0[2];
      A[0] += dx * ex;
      A[1] += dx * ey;
      A[2] += dx * ez;
      A[3] += dy * ex;
      A[4] += dy * ey;
      A[5] += dy * ez;
      A[6] += dz * ex;
      A[7] += dz * ey;
      A[8] += dz * ez;
    }
    extract(B.gq, 0, iters);
    rot(B.gq, 0);
  }
  const alpha = B.alpha;
  const grab = B.grab;
  for (let j = 0; j < n; j++) {
    if (gn[j] === 0) continue;
    let tx = gx[j] / gn[j];
    let ty = gy[j] / gn[j];
    let tz = gz[j] / gn[j];
    if (beta > 0 && n > 2) {
      const ex = rx[j] - B.g0[0];
      const ey = ry[j] - B.g0[1];
      const ez = rz[j] - B.g0[2];
      tx += (bx + R[0] * ex + R[1] * ey + R[2] * ez - tx) * beta;
      ty += (by + R[3] * ex + R[4] * ey + R[5] * ez - ty) * beta;
      tz += (bz + R[6] * ex + R[7] * ey + R[8] * ez - tz) * beta;
    }
    gx[j] = tx;
    gy[j] = ty;
    gz[j] = tz;
    if (B.anch[j]) {
      const dx = tx - B.ax[j];
      const dy = ty - B.ay[j];
      const dz = tz - B.az[j];
      if (dx * dx + dy * dy + dz * dz > B.breakD * B.breakD) {
        B.anch[j] = 0;
        B.anchors--;
        events.push({ t: 'peel', x: x[j], y: y[j], z: z[j], last: B.anchors === 0, body: B });
      }
      continue;
    }
    if (j === grab) continue;
    x[j] += (tx - x[j]) * alpha;
    y[j] += (ty - y[j]) * alpha;
    z[j] += (tz - z[j]) * alpha;
  }
}

function cellOf(X, Z) {
  let ci = ((X + HO) / HC) | 0;
  let cj = ((Z + HO) / HC) | 0;
  if (ci < 0) ci = 0;
  else if (ci >= HW) ci = HW - 1;
  if (cj < 0) cj = 0;
  else if (cj >= HW) cj = HW - 1;
  return cj * HW + ci;
}

export function buildHash() {
  cellStart.fill(0);
  let total = 0;
  for (let bi = 0; bi < bodies.length; bi++) {
    const B = bodies[bi];
    if (B.carrier) continue;
    for (let i = 0; i < B.n; i++) cellStart[cellOf(B.x[i], B.z[i]) + 1]++;
    total += B.n;
  }
  for (let c = 0; c < HW * HW; c++) cellStart[c + 1] += cellStart[c];
  if (cellItems.length < total) cellItems = new Int32Array(total * 2);
  cellCur.set(cellStart);
  for (let bi = 0; bi < bodies.length; bi++) {
    const B = bodies[bi];
    if (B.carrier) continue;
    for (let i = 0; i < B.n; i++) cellItems[cellCur[cellOf(B.x[i], B.z[i])]++] = (bi << 12) | i;
  }
  hashValid = true;
}

export function queryHit(X, Y, Z, pad, out) {
  if (!hashValid) buildHash();
  const ci = Math.min(HW - 2, Math.max(1, ((X + HO) / HC) | 0));
  const cj = Math.min(HW - 2, Math.max(1, ((Z + HO) / HC) | 0));
  let best = 1e9;
  let found = false;
  for (let dj = -1; dj <= 1; dj++) {
    for (let di = -1; di <= 1; di++) {
      const c = (cj + dj) * HW + ci + di;
      for (let k = cellStart[c]; k < cellStart[c + 1]; k++) {
        const id = cellItems[k];
        const B = bodies[id >> 12];
        const i = id & 4095;
        if (!B || i >= B.n) continue;
        const dx = X - B.x[i];
        const dy = Y - B.y[i];
        const dz = Z - B.z[i];
        const rr = B.rad[i] + pad;
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 < rr * rr && d2 < best) {
          best = d2;
          out.body = B;
          out.i = i;
          found = true;
        }
      }
    }
  }
  return found;
}

export function rayPick(ox, oy, oz, dx, dy, dz, pad, out) {
  let best = 1e9;
  let hit = false;
  for (const B of bodies) {
    if (B.carrier || B.dead) continue;
    for (let i = 0; i < B.n; i++) {
      const mx = B.x[i] - ox;
      const my = B.y[i] - oy;
      const mz = B.z[i] - oz;
      const t = mx * dx + my * dy + mz * dz;
      if (t < 0 || t > best) continue;
      const d2 = mx * mx + my * my + mz * mz - t * t;
      const r = B.rad[i] + pad;
      if (d2 < r * r) {
        best = t - Math.sqrt(r * r - d2);
        out.body = B;
        out.i = i;
        out.t = best;
        hit = true;
      }
    }
  }
  return hit;
}

function collide(B, bi) {
  if (B.ghost) return;
  const { x, y, z, px, pz, rad, anch } = B;
  const n = B.n;
  const pk = colliders.pack;
  const bd = colliders.bounds;
  for (let i = 0; i < n; i++) {
    if (anch[i]) continue;
    let X = x[i];
    let Y = y[i];
    let Z = z[i];
    const r = rad[i];
    if (X < bd[0]) X = bd[0];
    else if (X > bd[1]) X = bd[1];
    if (Z < bd[2]) Z = bd[2];
    else if (Z > bd[3]) Z = bd[3];
    const dom = inDomain(X, Z, 0.6);
    const g = dom ? coarseAt(X, Z) : 0;
    let pen = g + r - Y;
    if (pen > 0) {
      let nx = 0;
      let ny = 1;
      let nz = 0;
      if (dom && g > 0.03) {
        const sx = (coarseAt(X + 0.2, Z) - coarseAt(X - 0.2, Z)) * 2.5;
        const sz = (coarseAt(X, Z + 0.2) - coarseAt(X, Z - 0.2)) * 2.5;
        const il = 1 / Math.hypot(sx, 1, sz);
        nx = -sx * il;
        ny = il;
        nz = -sz * il;
      }
      const d = pen * ny;
      X += nx * d;
      Y += ny * d;
      Z += nz * d;
      const tx = X - px[i];
      const tz = Z - pz[i];
      const tl = Math.hypot(tx, tz);
      const lim = B.fric * d;
      if (tl < lim) {
        X = px[i];
        Z = pz[i];
      } else if (tl > 0) {
        X -= (tx / tl) * lim;
        Z -= (tz / tl) * lim;
      }
      B.hit = true;
    }
    if (pk) {
      const dx = X - pk.x;
      const dz = Z - pk.z;
      if (B.inPack) {
        const lx = Math.max(0.25, pk.hw - r * 0.7 - B.reach);
        let nx = dx / lx;
        if (nx > 1) nx = 1;
        else if (nx < -1) nx = -1;
        const soft = Y > pk.y + pk.h ? 0.16 : 1;
        X += (pk.x + nx * lx - X) * soft;
        let hy = (Y - pk.y) / (pk.h * 0.6);
        if (hy < 0) hy = 0;
        else if (hy > 1) hy = 1;
        const dep = pk.hd0 + (pk.hd - pk.hd0) * hy * hy * (3 - 2 * hy);
        const lz = Math.max(0.12, (dep - r * 0.8 - B.reach * 0.55) * Math.pow(1 - nx * nx * 0.9, 0.5));
        if (dz > lz) Z += (pk.z + lz - Z) * soft;
        else if (dz < -lz) Z += (pk.z - lz - Z) * soft;
        const fy = pk.y + pk.floor + r;
        if (Y < fy) {
          Y = fy;
          B.hit = true;
        }
        if (pk.lid) {
          const cy = pk.y + pk.h - r - 0.6;
          if (Y > cy) Y = Math.max(fy, cy);
        }
      } else if (Math.abs(dx) < pk.hw + r && Math.abs(dz) < pk.hd0 * 0.8 + r && Y > pk.y - r && Y < pk.y + pk.h + r * 0.5) {
        const ox = pk.hw + r - Math.abs(dx);
        const oz = pk.hd0 * 0.8 + r - Math.abs(dz);
        if (ox < oz) X += dx > 0 ? ox : -ox;
        else Z += dz > 0 ? oz : -oz;
      }
    }
    for (const p of colliders.posts) {
      if (Y > p.h + r) continue;
      const dx = X - p.x;
      const dz = Z - p.z;
      const d2 = dx * dx + dz * dz;
      const rr = p.r + r;
      if (d2 < rr * rr && d2 > 1e-6) {
        const d = Math.sqrt(d2);
        X += (dx / d) * (rr - d);
        Z += (dz / d) * (rr - d);
      }
    }
    const ci = Math.min(HW - 2, Math.max(1, ((X + HO) / HC) | 0));
    const cj = Math.min(HW - 2, Math.max(1, ((Z + HO) / HC) | 0));
    for (let dj = -1; dj <= 1; dj++) {
      for (let di = -1; di <= 1; di++) {
        const c = (cj + dj) * HW + ci + di;
        for (let k = cellStart[c]; k < cellStart[c + 1]; k++) {
          const id = cellItems[k];
          const bj = id >> 12;
          if (bj === bi) continue;
          const O = bodies[bj];
          const j = id & 4095;
          if (O.active && bj < bi && !O.anch[j]) continue;
          const dx = X - O.x[j];
          const dy = Y - O.y[j];
          const dz = Z - O.z[j];
          const rr = r + O.rad[j];
          const d2 = dx * dx + dy * dy + dz * dz;
          if (d2 >= rr * rr || d2 < 1e-8) continue;
          const d = Math.sqrt(d2);
          const ov = rr - d;
          let fixed = O.anch[j] === 1;
          if (!fixed && O.asleep) {
            if (ov > 0.04) O.wake();
            else fixed = true;
          }
          const w = fixed ? 1 : 0.5;
          const cx = (dx / d) * ov;
          const cy = (dy / d) * ov;
          const cz = (dz / d) * ov;
          X += cx * w;
          Y += cy * w;
          Z += cz * w;
          if (!fixed) {
            O.x[j] -= cx * 0.5;
            O.y[j] -= cy * 0.5;
            O.z[j] -= cz * 0.5;
          }
        }
      }
    }
    x[i] = X;
    y[i] = Y;
    z[i] = Z;
  }
}

function substep() {
  buildHash();
  for (const B of bodies) B.active = !B.asleep && !B.carrier;
  for (let bi = 0; bi < bodies.length; bi++) {
    const B = bodies[bi];
    if (!B.active) continue;
    const { x, y, z, px, py, pz, vx, vy, vz, anch } = B;
    const n = B.n;
    for (let i = 0; i < n; i++) {
      px[i] = x[i];
      py[i] = y[i];
      pz[i] = z[i];
      if (anch[i]) {
        x[i] = B.ax[i];
        y[i] = B.ay[i];
        z[i] = B.az[i];
        vx[i] = vy[i] = vz[i] = 0;
        continue;
      }
      vy[i] -= GRAV * DT;
      x[i] += vx[i] * DT;
      y[i] += vy[i] * DT;
      z[i] += vz[i] * DT;
    }
    B.hit = false;
    const g = B.grab;
    for (let it = 0; it < 2; it++) {
      if (g >= 0) {
        let dx = B.gt[0] - B.gx[g];
        let dy = B.gt[1] - B.gy[g];
        let dz = B.gt[2] - B.gz[g];
        const l = Math.hypot(dx, dy, dz);
        const lim = B.anchors > 0 ? B.stretch : B.stretch * 3;
        if (l > lim && B.gn[g] > 0) {
          const s = lim / l;
          dx *= s;
          dy *= s;
          dz *= s;
          x[g] = B.gx[g] + dx;
          y[g] = B.gy[g] + dy;
          z[g] = B.gz[g] + dz;
        } else {
          x[g] = B.gt[0];
          y[g] = B.gt[1];
          z[g] = B.gt[2];
        }
      }
      matchShape(B, 2);
      collide(B, bi);
    }
    let maxV = 0;
    const inv = 1 / DT;
    for (let i = 0; i < n; i++) {
      if (anch[i]) continue;
      const oy = vy[i];
      let ux = (x[i] - px[i]) * inv;
      let uy = (y[i] - py[i]) * inv;
      let uz = (z[i] - pz[i]) * inv;
      if (B.hit && oy < -70 && uy > oy * 0.5 && uy < -oy * B.bounce) {
        uy = -oy * B.bounce;
        if (B.thudT <= 0) {
          events.push({ t: 'thud', x: x[i], y: y[i], z: z[i], v: -oy, body: B });
          B.thudT = 0.14;
        }
      }
      const s2 = ux * ux + uy * uy + uz * uz;
      if (s2 > 640000) {
        const s = 800 / Math.sqrt(s2);
        ux *= s;
        uy *= s;
        uz *= s;
      }
      vx[i] = ux * 0.996;
      vy[i] = uy * 0.996;
      vz[i] = uz * 0.996;
      if (s2 > maxV) maxV = s2;
    }
    B.thudT -= DT;
    B.age += DT;
    if (g < 0 && maxV < 16) {
      B.still += DT;
      if (B.still > 0.45) {
        B.asleep = true;
        for (let i = 0; i < n; i++) vx[i] = vy[i] = vz[i] = 0;
      }
    } else B.still = 0;
    B.dirty = true;
  }
}

export function updateBones(B) {
  const m = B.bones;
  if (!m) return;
  const { x, y, z, rx, ry, rz, q } = B;
  for (let i = 0; i < B.n; i++) {
    rot(q, i * 4);
    const o = i * 16;
    const ex = rx[i];
    const ey = ry[i];
    const ez = rz[i];
    m[o] = R[0];
    m[o + 1] = R[3];
    m[o + 2] = R[6];
    m[o + 3] = 0;
    m[o + 4] = R[1];
    m[o + 5] = R[4];
    m[o + 6] = R[7];
    m[o + 7] = 0;
    m[o + 8] = R[2];
    m[o + 9] = R[5];
    m[o + 10] = R[8];
    m[o + 11] = 0;
    m[o + 12] = x[i] - (R[0] * ex + R[1] * ey + R[2] * ez);
    m[o + 13] = y[i] - (R[3] * ex + R[4] * ey + R[5] * ez);
    m[o + 14] = z[i] - (R[6] * ex + R[7] * ey + R[8] * ez);
    m[o + 15] = 1;
  }
  B.boneTex.needsUpdate = true;
  B.dirty = false;
}

export function toRest(B, i, wx, wy, wz, out) {
  rot(B.q, i * 4);
  const dx = wx - B.x[i];
  const dy = wy - B.y[i];
  const dz = wz - B.z[i];
  out[0] = B.rx[i] + R[0] * dx + R[3] * dy + R[6] * dz;
  out[1] = B.ry[i] + R[1] * dx + R[4] * dy + R[7] * dz;
  out[2] = B.rz[i] + R[2] * dx + R[5] * dy + R[8] * dz;
  return out;
}

const pc = [0, 0, 0];
export function packMembership() {
  const pk = colliders.pack;
  if (!pk) return;
  for (const B of bodies) {
    if (B.carrier || B.ghost || B.anchors > 0) continue;
    B.center(pc);
    if (!B.inPack) {
      if (B.grab < 0 && Math.abs(pc[0] - pk.x) < pk.hw - 0.4 && Math.abs(pc[2] - pk.z) < pk.hd && pc[1] > pk.y + 0.25 && pc[1] < pk.y + pk.h + 0.5) B.inPack = true;
    } else if (!pk.lid && pc[1] > pk.y + pk.h + 1.8 && (B.grab >= 0 || pc[1] > pk.y + pk.h + 9)) B.inPack = false;
  }
}

export function flushBones() {
  for (const B of bodies) if (B.dirty) updateBones(B);
}

export function stepBodies(dt) {
  acc += dt;
  let steps = 0;
  let any = false;
  for (const B of bodies) if (!B.asleep && !B.carrier) any = true;
  if (!any) {
    acc = 0;
    return false;
  }
  while (acc >= DT && steps < 4) {
    substep();
    acc -= DT;
    steps++;
  }
  if (steps === 4) acc = 0;
  for (const B of bodies) if (B.dirty) updateBones(B);
  hashValid = false;
  return true;
}

export function anyAwake() {
  for (const B of bodies) if (!B.asleep) return true;
  return false;
}

export function removeBody(B) {
  const i = bodies.indexOf(B);
  if (i >= 0) bodies.splice(i, 1);
  B.dead = true;
  hashValid = false;
}

export function addBody(B) {
  bodies.push(B);
  hashValid = false;
}
