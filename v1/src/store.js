// Gummies: local persistence for packs, custom molds, settings and seen hints.
const KEY = 'gummies.v1';
const def = { packs: [], custom: [], sound: true, hints: {}, seq: 1 };
let data = null;

export function load() {
  if (data) return data;
  try {
    data = Object.assign({}, def, JSON.parse(localStorage.getItem(KEY) || '{}'));
  } catch (e) {
    data = Object.assign({}, def);
  }
  return data;
}

export function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
    return true;
  } catch (e) {
    if (data.packs.length > 4) {
      data.packs.splice(0, 2);
      return save();
    }
    return false;
  }
}

export function addPack(p) {
  load().packs.push(p);
  while (data.packs.length > 36) data.packs.shift();
  save();
}

export function removePack(id) {
  load().packs = data.packs.filter(p => p.id !== id);
  save();
  delPayload(id);
}

let dbp = null;
function db() {
  if (!dbp) {
    dbp = new Promise((res, rej) => {
      const r = indexedDB.open('gummies', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('packs');
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
  }
  return dbp;
}

function tx(mode, fn) {
  return db().then(
    d =>
      new Promise((res, rej) => {
        const t = d.transaction('packs', mode);
        const q = fn(t.objectStore('packs'));
        t.oncomplete = () => res(q && q.result);
        t.onerror = () => rej(t.error);
      })
  );
}

export function putPayload(id, payload) {
  return tx('readwrite', s => s.put(payload, id)).then(() => true, () => false);
}

export function getPayload(id) {
  return tx('readonly', s => s.get(id)).catch(() => null);
}

export function delPayload(id) {
  return tx('readwrite', s => s.delete(id)).catch(() => null);
}
