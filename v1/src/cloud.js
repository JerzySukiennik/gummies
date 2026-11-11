// Gummies: public gallery backend (Firebase Realtime Database over REST, no SDK and no login).
const DB = 'https://ghostbusters-gzowo-default-rtdb.firebaseio.com/gummies';
const TYPES = { Uint8Array: 1, Uint16Array: 2, Int16Array: 3, Float32Array: 4 };
const CTOR = { 1: Uint8Array, 2: Uint16Array, 3: Int16Array, 4: Float32Array };
const PAGE = 24;

export const cloudReady = typeof CompressionStream !== 'undefined' && typeof DecompressionStream !== 'undefined';

function encode(obj) {
  const chunks = [];
  let off = 0;
  const head = JSON.stringify(obj, (k, v) => {
    if (!ArrayBuffer.isView(v)) return v;
    const b = new Uint8Array(v.buffer, v.byteOffset, v.byteLength);
    const e = { $t: TYPES[v.constructor.name], o: off, n: v.length };
    chunks.push(b);
    off += b.byteLength;
    return e;
  });
  const hb = new TextEncoder().encode(head);
  const out = new Uint8Array(4 + hb.length + off);
  new DataView(out.buffer).setUint32(0, hb.length, true);
  out.set(hb, 4);
  let p = 4 + hb.length;
  for (const c of chunks) {
    out.set(c, p);
    p += c.length;
  }
  return out;
}

function decode(u8) {
  const n = new DataView(u8.buffer, u8.byteOffset).getUint32(0, true);
  const base = 4 + n;
  return JSON.parse(new TextDecoder().decode(u8.subarray(4, base)), (k, v) => {
    if (!v || typeof v !== 'object' || !v.$t) return v;
    const C = CTOR[v.$t];
    if (!C || !(v.n >= 0) || base + v.o + v.n * C.BYTES_PER_ELEMENT > u8.length) throw new Error('bad data');
    return new C(u8.slice(base + v.o, base + v.o + v.n * C.BYTES_PER_ELEMENT).buffer);
  });
}

async function pipe(u8, stream) {
  return new Uint8Array(await new Response(new Blob([u8]).stream().pipeThrough(stream)).arrayBuffer());
}

function b64(u8) {
  let s = '';
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
  return btoa(s);
}

function unb64(str) {
  const bin = atob(str);
  const u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return u8;
}

function rid(n) {
  const a = crypto.getRandomValues(new Uint8Array(n));
  let s = '';
  for (let i = 0; i < n; i++) s += 'abcdefghijklmnopqrstuvwxyz0123456789'[a[i] % 36];
  return s;
}

function valid(pl) {
  if (!pl || !Array.isArray(pl.bodies) || !pl.bodies.length || pl.bodies.length > 40) return false;
  for (const d of pl.bodies) {
    const nn = d.nx * d.nz;
    if (!(d.nx >= 3 && d.nz >= 3 && nn <= 60000 && d.g >= 0.03 && d.g <= 0.4 && isFinite(d.sc) && isFinite(d.ps))) return false;
    if (!(d.bot instanceof Uint16Array && d.phi instanceof Int16Array && d.col instanceof Uint8Array && d.tp instanceof Uint8Array)) return false;
    if (d.bot.length !== nn || d.phi.length !== nn || d.col.length !== nn * 4 || d.tp.length !== nn * 2) return false;
    if (!(d.coat instanceof Uint8Array) || !(d.top instanceof Uint8Array)) return false;
    if (!d.meta || typeof d.meta !== 'object') d.meta = {};
    d.kind = d.kind === 'choc' ? 'choc' : 'mass';
    d.face = d.face > 0 ? 1 : -1;
  }
  return true;
}

export async function publishPack(meta, payload) {
  const id = rid(16);
  const key = rid(32);
  const data = b64(await pipe(encode(payload), new CompressionStream('gzip')));
  if (data.length > 1150000) throw new Error('too big');
  const st = meta.style || {};
  const body = {
    ['packs/' + id]: { n: String(meta.name || 'Gummies').slice(0, 40), c: meta.count, t: { '.sv': 'timestamp' }, th: meta.thumb, s: { color: String(st.color || '#ffffff').slice(0, 9), pattern: String(st.pattern || 'plain').slice(0, 12), sticker: String(st.sticker || 'none').slice(0, 14) } },
    ['data/' + id]: data,
    ['keys/' + id]: key,
  };
  const r = await fetch(DB + '.json', { method: 'PATCH', body: JSON.stringify(body) });
  if (!r.ok) throw new Error('http ' + r.status);
  return { id, key };
}

export async function unpublishPack(id, key) {
  const r = await fetch(DB + '.json', { method: 'PATCH', body: JSON.stringify({ ['packs/' + id]: null, ['data/' + id]: null, ['del/' + id]: key }) });
  return r.ok;
}

export async function listPacks(before) {
  let url = DB + '/packs.json?orderBy=%22t%22&limitToLast=' + PAGE;
  if (before) url += '&endAt=' + (before - 1);
  const r = await fetch(url);
  if (!r.ok) throw new Error('http ' + r.status);
  const o = (await r.json()) || {};
  const list = [];
  for (const [id, v] of Object.entries(o)) {
    if (!v || typeof v.th !== 'string' || !v.th.startsWith('data:image/jpeg;base64,')) continue;
    list.push({ id, name: String(v.n || ''), count: +v.c || 0, date: +v.t || 0, thumb: v.th, style: v.s || {}, remote: true });
  }
  list.sort((a, b) => b.date - a.date);
  return { list, more: Object.keys(o).length >= PAGE };
}

export async function fetchPack(id) {
  const r = await fetch(DB + '/data/' + encodeURIComponent(id) + '.json');
  if (!r.ok) throw new Error('http ' + r.status);
  const s = await r.json();
  if (typeof s !== 'string') return null;
  const pl = decode(await pipe(unb64(s), new DecompressionStream('gzip')));
  return valid(pl) ? pl : null;
}
