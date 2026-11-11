// Gummies: interface layer (title, sheets, pickers, chips, hints).
import { t, nm, FLAVORS, LANG } from './data.js';
import { SETS, buildField, fieldCanvas } from './mold.js';
import { SHAPES, customShape, DW, DH } from './shapes.js';
import { CHOCS, TOPS } from './tools.js';
import { PACK_COLORS, PATTERNS, STICKERS, paintPattern, drawSticker } from './pack.js';
import { load, save, removePack } from './store.js';

const root = document.getElementById('ui');
const ICON = {
  menu: '<svg viewBox="0 0 24 24"><circle cx="5" cy="12" r="1.9"/><circle cx="12" cy="12" r="1.9"/><circle cx="19" cy="12" r="1.9"/></svg>',
  close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  soundOn: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9.5v5h3.5L12 18V6L7.5 9.5z" fill="currentColor"/><path d="M15.5 9a4 4 0 010 6M18 6.5a7.5 7.5 0 010 11"/></svg>',
  soundOff: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9.5v5h3.5L12 18V6L7.5 9.5z" fill="currentColor"/><path d="M16 9.5l5 5M21 9.5l-5 5"/></svg>',
  pencil: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20l1-4.5L16.5 4a2 2 0 013 0l.5.5a2 2 0 010 3L8.5 19z"/><path d="M14.5 6l3.5 3.5"/></svg>',
};

function el(tag, cls, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
}
const hex = h => '#' + h.toString(16).padStart(6, '0');

function hsv2rgb(h, s, v) {
  const f = n => {
    const k = (n + h * 6) % 6;
    return v - v * s * Math.max(0, Math.min(k, 4 - k, 1));
  };
  return [f(5), f(3), f(1)];
}
function rgb2hsv(r, g, b) {
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  const d = mx - mn;
  let h = 0;
  if (d > 0) {
    if (mx === r) h = ((g - b) / d + 6) % 6;
    else if (mx === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h /= 6;
  }
  return [h, mx > 0 ? d / mx : 0, mx];
}

export class UI {
  constructor(cb) {
    this.cb = cb;
    this.open = null;
    this.thumbs = new Map();
    this.title = el('div', 'title hidden');
    this.title.innerHTML = `<div class="tagline">${t('tagline')}</div><button class="btn primary big" data-a="start">${t('start')}</button><button class="btn ghost" data-a="collection">${t('collection')}<span class="count"></span></button>`;
    this.hud = el('div', 'hud hidden');
    this.menuBtn = el('button', 'round', ICON.menu);
    this.soundBtn = el('button', 'round sound', ICON.soundOn);
    this.hud.append(this.menuBtn);
    this.chips = el('div', 'chips');
    this.hintEl = el('div', 'hint');
    this.credit = el('a', 'credit', 'Gzowo Labs');
    this.credit.href = 'https://gzowo.fun';
    this.credit.target = '_blank';
    this.credit.rel = 'noopener';
    this.back = el('div', 'backdrop');
    root.append(this.chips, this.hud, this.soundBtn, this.title, this.credit, this.hintEl, this.back);
    this.title.addEventListener('click', e => {
      const a = e.target.closest('[data-a]');
      if (!a) return;
      cb.click();
      if (a.dataset.a === 'start') cb.start();
      else this.collection();
    });
    this.menuBtn.addEventListener('click', () => {
      cb.click();
      this.menu();
    });
    this.soundBtn.addEventListener('click', () => {
      const d = load();
      d.sound = !d.sound;
      save();
      this.syncSound();
      cb.sound(d.sound);
      cb.click();
    });
    this.back.addEventListener('pointerdown', e => {
      if (e.target === this.back) this.close();
    });
    window.addEventListener('keydown', e => {
      if (e.key === 'Escape' && this.open) this.close();
    });
    this.syncSound();
    this.chipEls = {};
  }

  syncSound() {
    this.soundBtn.innerHTML = load().sound ? ICON.soundOn : ICON.soundOff;
  }

  showTitle(on) {
    this.title.classList.toggle('hidden', !on);
    this.credit.classList.toggle('hidden', !on);
    this.hud.classList.toggle('hidden', on);
    const n = load().packs.length;
    this.title.querySelector('.count').textContent = n ? n : '';
  }

  placeTitle(y) {
    this.title.style.top = Math.round(y) + 'px';
  }

  chip(id, x, y, html, onClick, visible = true) {
    let c = this.chipEls[id];
    if (!c) {
      c = this.chipEls[id] = el('button', 'chip-btn');
      this.chips.append(c);
      c.addEventListener('click', () => {
        this.cb.click();
        c._fn && c._fn();
      });
    }
    c._fn = onClick;
    if (c._html !== html) {
      c.innerHTML = html;
      c._html = html;
    }
    c.style.left = Math.round(x) + 'px';
    c.style.top = Math.round(y) + 'px';
    c.classList.toggle('off', !visible);
  }

  hint(text, ms = 4200) {
    clearTimeout(this.hintT);
    this.hintEl.textContent = text;
    this.hintEl.classList.add('on');
    this.hintT = setTimeout(() => this.hintEl.classList.remove('on'), ms);
  }

  hintOnce(key, text, ms) {
    const d = load();
    if (d.hints[key]) return false;
    d.hints[key] = 1;
    save();
    this.hint(text, ms);
    return true;
  }

  sheet(cls, title, body, dock = false) {
    this.close(true);
    const card = el('div', 'sheet ' + cls);
    card.innerHTML = `<div class="sheet-head"><h2>${title}</h2><button class="x" aria-label="close">${ICON.close}</button></div>`;
    card.append(body);
    card.querySelector('.x').addEventListener('click', () => {
      this.cb.click();
      this.close();
    });
    this.back.append(card);
    this.back.classList.toggle('dock', dock);
    this.back.classList.add('on');
    this.open = card;
    this.docked = dock;
    requestAnimationFrame(() => card.classList.add('in'));
    this.cb.sheet(!dock);
    return card;
  }

  close(silent) {
    if (!this.open) return;
    const c = this.open;
    this.open = null;
    this.docked = false;
    this.designSync = null;
    c.classList.remove('in');
    c.classList.add('out');
    setTimeout(() => c.remove(), 260);
    if (!silent) {
      this.back.classList.remove('on');
      this.cb.sheet(false);
    }
    if (this.onClose) {
      const f = this.onClose;
      this.onClose = null;
      f();
    }
  }

  design(style, state, cb) {
    const body = el('div', 'design');
    const sw = el('div', 'swatches');
    const pats = el('div', 'pats');
    const stk = el('div', 'stickers');
    const pick = (box, b) => {
      for (const q of box.children) q.classList.toggle('sel', q === b);
    };
    const paintPats = () => {
      for (const b of pats.children) {
        const c = b.firstChild.getContext('2d');
        c.clearRect(0, 0, 112, 72);
        paintPattern(c, 0, 0, 112, 72, style.color, b._id, 0.55);
      }
    };
    for (const col of PACK_COLORS) {
      const b = el('button', 'swatch' + (col === style.color ? ' sel' : ''));
      b.style.background = col;
      b.addEventListener('click', () => {
        this.cb.click();
        pick(sw, b);
        cb.style({ color: col });
        paintPats();
      });
      sw.append(b);
    }
    for (const p of PATTERNS) {
      const b = el('button', 'pat' + (p.id === style.pattern ? ' sel' : ''));
      const cv = document.createElement('canvas');
      cv.width = 112;
      cv.height = 72;
      b._id = p.id;
      b.append(cv, el('span', '', nm(p)));
      b.addEventListener('click', () => {
        this.cb.click();
        pick(pats, b);
        cb.style({ pattern: p.id });
      });
      pats.append(b);
    }
    for (const id of STICKERS) {
      const b = el('button', 'stk' + (id === style.sticker ? ' sel' : ''));
      const cv = document.createElement('canvas');
      cv.width = 72;
      cv.height = 96;
      if (id !== 'none') drawSticker(cv.getContext('2d'), id, 36, 48, 84, '#1d1d1f');
      else {
        const c = cv.getContext('2d');
        c.strokeStyle = '#b4b4b9';
        c.lineWidth = 5;
        c.lineCap = 'round';
        c.beginPath();
        c.arc(36, 48, 22, 0, 7);
        c.moveTo(21, 63);
        c.lineTo(51, 33);
        c.stroke();
      }
      b.append(cv);
      b.addEventListener('click', () => {
        this.cb.click();
        pick(stk, b);
        cb.style({ sticker: id });
      });
      stk.append(b);
    }
    const inp = document.createElement('input');
    inp.type = 'text';
    inp.maxLength = 22;
    inp.placeholder = t('printName');
    inp.value = style.name || '';
    inp.spellcheck = false;
    inp.addEventListener('input', () => cb.style({ name: inp.value.trim() }));
    inp.addEventListener('keydown', e => e.stopPropagation());
    const row = el('div', 'row');
    const b1 = el('button', 'btn ghost', t('pourOut'));
    const b2 = el('button', 'btn primary', t('toCollection'));
    let cur = state;
    b1.addEventListener('click', () => {
      this.cb.click();
      if (cur.sealed) cb.open();
      else cb.pour();
    });
    b2.addEventListener('click', () => {
      this.cb.click();
      cb.save();
    });
    row.append(b1, b2);
    body.append(el('div', 'label', t('color')), sw, el('div', 'label', t('pattern')), pats, el('div', 'label', t('sticker')), stk, inp, row);
    this.sheet('dockcard', t('pouch'), body, true);
    this.designSync = st => {
      cur = st;
      b1.textContent = st.sealed ? t('reopen') : t('pourOut');
      b1.disabled = !st.sealed && st.count === 0;
      b2.disabled = !(st.sealed && st.count > 0);
      if (st.name != null && document.activeElement !== inp) inp.value = st.name;
    };
    paintPats();
    this.designSync(state);
  }

  thumb(key, shapes) {
    if (!this.thumbs.has(key)) this.thumbs.set(key, fieldCanvas(buildField(shapes, 2, false)));
    const src = this.thumbs.get(key);
    const cv = document.createElement('canvas');
    cv.width = src.width;
    cv.height = src.height;
    cv.getContext('2d').drawImage(src, 0, 0);
    return cv;
  }

  molds(onPick) {
    const body = el('div', 'grid molds');
    const add = (label, node, fn, cls = '') => {
      const b = el('button', 'card ' + cls);
      b.append(node, el('span', 'card-name', label));
      b.addEventListener('click', () => {
        this.cb.click();
        fn();
      });
      body.append(b);
    };
    for (const s of SETS) add(nm(s), this.thumb(s.id, s.shapes), () => {
      this.close();
      onPick(s.shapes, s.id);
    });
    const d = load();
    d.custom.forEach((strokes, i) => {
      const sh = customShape(strokes);
      add(t('custom') + ' ' + (i + 1), this.thumb('c' + JSON.stringify(strokes).length + '_' + i + '_' + strokes[0].pts[0], [sh, sh, sh, sh, sh, sh]), () => {
        this.close();
        onPick([sh, sh, sh, sh, sh, sh], 'custom');
      });
    });
    const pen = el('div', 'pen', ICON.pencil);
    add(t('custom'), pen, () => this.draw(onPick), 'dashed');
    this.sheet('wide', t('pickMold'), body);
  }

  draw(onPick) {
    const body = el('div', 'draw');
    const S = 3;
    const cv = el('canvas', 'pad');
    cv.width = DW * S * 2;
    cv.height = DH * S * 2;
    cv.style.width = DW * S + 'px';
    cv.style.height = DH * S + 'px';
    const c = cv.getContext('2d');
    const strokes = [];
    let cur = null;
    const paint = () => {
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.clearRect(0, 0, cv.width, cv.height);
      c.setTransform(S * 2, 0, 0, S * 2, 0, 0);
      c.fillStyle = c.strokeStyle = '#1d1d1f';
      const all = cur ? strokes.concat([cur]) : strokes;
      if (all.length) customShape(all).draw(c);
      done.disabled = !strokes.length;
    };
    const pt = e => {
      const r = cv.getBoundingClientRect();
      return [Math.min(DW - 9, Math.max(9, ((e.clientX - r.left) / r.width) * DW)), Math.min(DH - 9, Math.max(9, ((e.clientY - r.top) / r.height) * DH))];
    };
    cv.addEventListener('pointerdown', e => {
      cv.setPointerCapture(e.pointerId);
      const p = pt(e);
      cur = { pts: [p[0], p[1]], closed: false, w: 15 };
      paint();
    });
    cv.addEventListener('pointermove', e => {
      if (!cur) return;
      const p = pt(e);
      const n = cur.pts.length;
      if (Math.hypot(p[0] - cur.pts[n - 2], p[1] - cur.pts[n - 1]) < 1.6) return;
      cur.pts.push(p[0], p[1]);
      paint();
    });
    const end = () => {
      if (!cur) return;
      const p = cur.pts;
      const n = p.length;
      if (n >= 2) {
        let len = 0;
        for (let i = 2; i < n; i += 2) len += Math.hypot(p[i] - p[i - 2], p[i + 1] - p[i - 1]);
        if (n === 2) p.push(p[0] + 0.5, p[1] + 0.5);
        cur.closed = len > 50 && Math.hypot(p[0] - p[n - 2], p[1] - p[n - 1]) < Math.max(16, len * 0.12);
        cur.pts = p.map(v => Math.round(v * 10) / 10);
        strokes.push(cur);
      }
      cur = null;
      paint();
    };
    cv.addEventListener('pointerup', end);
    cv.addEventListener('pointercancel', end);
    const row = el('div', 'row');
    const undo = el('button', 'btn ghost', t('undo'));
    const clear = el('button', 'btn ghost', t('clear'));
    const done = el('button', 'btn primary', t('done'));
    undo.addEventListener('click', () => {
      strokes.pop();
      paint();
    });
    clear.addEventListener('click', () => {
      strokes.length = 0;
      paint();
    });
    done.addEventListener('click', () => {
      if (!strokes.length) return;
      this.cb.click();
      const d = load();
      d.custom.unshift(strokes);
      d.custom.length = Math.min(d.custom.length, 5);
      save();
      const sh = customShape(strokes);
      this.close();
      onPick([sh, sh, sh, sh, sh, sh], 'custom');
    });
    row.append(undo, clear, done);
    body.append(el('p', 'sub', t('drawHint')), cv, row);
    this.sheet('narrow', t('drawTitle'), body);
    paint();
  }

  mass(cur, onFill) {
    const body = el('div', 'mass');
    let [h, s, v] = cur.hsv || rgb2hsv(0.91, 0.1, 0.17);
    let flavor = cur.flavor || FLAVORS[0];
    const top = el('div', 'mass-top');
    const wrap = el('div', 'wheel');
    const wheel = document.createElement('canvas');
    const WS = 400;
    wheel.width = wheel.height = WS;
    const knob = el('div', 'knob');
    wrap.append(wheel, knob);
    const side = el('div', 'mass-side');
    const prev = document.createElement('canvas');
    prev.width = 192;
    prev.height = 256;
    prev.className = 'prev';
    const name = el('div', 'prev-name');
    const lab = el('label', 'slider', `<span>${t('shade')}</span>`);
    const rng = document.createElement('input');
    rng.type = 'range';
    rng.min = '0.3';
    rng.max = '1';
    rng.step = '0.01';
    lab.append(rng);
    side.append(prev, name, lab);
    top.append(wrap, side);
    const chips = el('div', 'flavors');
    const go = el('button', 'btn primary big wide', t('fill'));
    body.append(top, el('div', 'label', t('flavor')), chips, go);

    const wc = wheel.getContext('2d');
    const drawWheel = () => {
      const img = wc.createImageData(WS, WS);
      const R = WS / 2;
      for (let y = 0; y < WS; y++) {
        for (let x = 0; x < WS; x++) {
          const dx = (x + 0.5 - R) / R;
          const dy = (y + 0.5 - R) / R;
          const r = Math.hypot(dx, dy);
          if (r > 1.01) continue;
          const c = hsv2rgb((Math.atan2(dy, dx) / (Math.PI * 2) + 1) % 1, Math.min(1, r), v);
          const o = (y * WS + x) * 4;
          img.data[o] = c[0] * 255;
          img.data[o + 1] = c[1] * 255;
          img.data[o + 2] = c[2] * 255;
          img.data[o + 3] = 255 * Math.min(1, (1.01 - r) * R * 0.5);
        }
      }
      wc.putImageData(img, 0, 0);
    };
    const color = () => {
      const c = hsv2rgb(h, s, v);
      const o = flavor.op;
      return o > 0 ? c.map(q => q + (1 - q) * 0.4 * o) : c;
    };
    const pc = prev.getContext('2d');
    const paint = () => {
      const c = color();
      const css = `rgb(${c.map(q => Math.round(q * 255)).join(',')})`;
      pc.setTransform(1, 0, 0, 1, 0, 0);
      pc.clearRect(0, 0, 192, 256);
      pc.setTransform(2, 0, 0, 2, 0, 0);
      pc.globalCompositeOperation = 'source-over';
      pc.fillStyle = pc.strokeStyle = css;
      SHAPES.bear.draw(pc);
      pc.globalCompositeOperation = 'source-atop';
      const g1 = pc.createRadialGradient(34, 30, 2, 40, 44, 70);
      g1.addColorStop(0, `rgba(255,255,255,${flavor.op > 0 ? 0.3 : 0.62})`);
      g1.addColorStop(0.5, 'rgba(255,255,255,0.05)');
      g1.addColorStop(1, 'rgba(0,0,0,0.16)');
      pc.fillStyle = g1;
      pc.fillRect(0, 0, 96, 128);
      pc.globalCompositeOperation = 'source-over';
      knob.style.left = 50 + Math.cos(h * Math.PI * 2) * s * 50 + '%';
      knob.style.top = 50 + Math.sin(h * Math.PI * 2) * s * 50 + '%';
      knob.style.background = css;
      name.textContent = nm(flavor);
      rng.value = v;
      for (const b of chips.children) b.classList.toggle('sel', b._f === flavor);
    };
    const pick = e => {
      const r = wheel.getBoundingClientRect();
      const dx = (e.clientX - r.left) / r.width - 0.5;
      const dy = (e.clientY - r.top) / r.height - 0.5;
      h = (Math.atan2(dy, dx) / (Math.PI * 2) + 1) % 1;
      s = Math.min(1, Math.hypot(dx, dy) * 2);
      paint();
    };
    let drag = false;
    wrap.addEventListener('pointerdown', e => {
      drag = true;
      wrap.setPointerCapture(e.pointerId);
      pick(e);
    });
    wrap.addEventListener('pointermove', e => drag && pick(e));
    wrap.addEventListener('pointerup', () => (drag = false));
    wrap.addEventListener('pointercancel', () => (drag = false));
    rng.addEventListener('input', () => {
      v = +rng.value;
      drawWheel();
      paint();
    });
    for (const f of FLAVORS) {
      const b = el('button', 'chip', `<i style="background:${hex(f.hex)}"></i>${nm(f)}`);
      b._f = f;
      b.addEventListener('click', () => {
        this.cb.click();
        flavor = f;
        [h, s, v] = rgb2hsv(((f.hex >> 16) & 255) / 255, ((f.hex >> 8) & 255) / 255, (f.hex & 255) / 255);
        drawWheel();
        paint();
      });
      chips.append(b);
    }
    go.addEventListener('click', () => {
      this.cb.click();
      this.close();
      onFill({ rgb: color(), op: flavor.op, flavor, hsv: [h, s, v] });
    });
    this.sheet('mass-sheet', t('mass'), body);
    drawWheel();
    paint();
  }

  options(title, list, cur, swatch, onPick) {
    const body = el('div', 'opts');
    for (const o of list) {
      const b = el('button', 'opt' + (o === cur ? ' sel' : ''));
      b.append(swatch(o), el('span', '', nm(o)));
      b.addEventListener('click', () => {
        this.cb.click();
        this.close();
        onPick(o);
      });
      body.append(b);
    }
    this.sheet('narrow', title, body);
  }

  choc(cur, onPick) {
    this.options(t('chocolate'), CHOCS, cur, o => {
      const i = el('i', 'sw');
      i.style.background = `radial-gradient(circle at 32% 28%, rgba(255,255,255,.55), rgba(255,255,255,0) 42%), ${hex(o.hex)}`;
      return i;
    }, onPick);
  }

  top(cur, onPick) {
    this.options(t('topping'), TOPS, cur, o => {
      const i = el('i', 'sw ' + (o.kind ? 'rainbow' : 'sugar'));
      return i;
    }, onPick);
  }

  menu() {
    const body = el('div', 'rows');
    const row = (label, fn, right = '') => {
      const b = el('button', 'rowbtn', `<span>${label}</span><em>${right}</em>`);
      b.addEventListener('click', () => {
        this.cb.click();
        fn(b);
      });
      body.append(b);
      return b;
    };
    row(t('molds'), () => this.cb.molds());
    row(t('collection'), () => this.collection(), String(load().packs.length || ''));
    row(t('clearTable'), () => {
      this.close();
      this.cb.clearTable();
    });
    if (document.documentElement.requestFullscreen) row(t('fullscreen'), () => {
      this.close();
      if (document.fullscreenElement) document.exitFullscreen();
      else document.documentElement.requestFullscreen().catch(() => {});
    });
    this.sheet('narrow', t('menu'), body);
  }

  collection(tab = 'mine') {
    const d = load();
    const wrap = el('div', 'coll');
    const seg = el('div', 'seg');
    for (const [id, label] of [['mine', t('mine')], ['all', t('everyone')]]) {
      const b = el('button', id === tab ? 'sel' : '', label);
      b.addEventListener('click', () => {
        if (id === tab) return;
        this.cb.click();
        this.collection(id);
      });
      seg.append(b);
    }
    const body = el('div', 'grid packs');
    wrap.append(seg, body);
    const fmt = ts => new Date(ts).toLocaleDateString(LANG === 'pl' ? 'pl-PL' : 'en-US', { day: 'numeric', month: 'short' });
    const card = p => {
      const c = el('button', 'card pack');
      const img = el('img');
      img.src = p.thumb;
      img.alt = '';
      img.loading = 'lazy';
      const meta = el('div', 'pack-meta');
      meta.append(el('span', '', `${p.count} ${t('pieces')} · ${fmt(p.date)}`));
      if (p.pub) meta.append(el('span', 'tag', t('published')));
      const nmEl = el('span', 'card-name');
      nmEl.textContent = p.name;
      c.append(img, nmEl, meta);
      c.addEventListener('click', () => {
        this.cb.click();
        this.packDetail(p, fmt(p.date));
      });
      return c;
    };
    const sheet = this.sheet('wide', t('collection'), wrap);
    if (tab === 'mine') {
      if (!d.packs.length) body.append(el('p', 'sub empty', t('emptyCollection')));
      for (const p of d.packs.slice().reverse()) body.append(card(p));
      return;
    }
    const note = el('p', 'sub empty', t('loading'));
    body.append(note);
    const more = el('button', 'btn ghost wide more', t('more'));
    let last = 0;
    const page = () => {
      more.disabled = true;
      this.cb
        .listPublic(last)
        .then(res => {
          if (this.open !== sheet) return;
          note.remove();
          for (const p of res.list) {
            body.append(card(p));
            last = last ? Math.min(last, p.date) : p.date;
          }
          more.disabled = false;
          if (res.more) wrap.append(more);
          else more.remove();
          if (!body.children.length) body.append(el('p', 'sub empty', t('emptyPublic')));
        })
        .catch(() => {
          if (this.open !== sheet) return;
          note.textContent = t('offline');
          if (!note.parentNode) body.append(note);
          more.remove();
        });
    };
    more.addEventListener('click', () => {
      this.cb.click();
      page();
    });
    page();
  }

  packDetail(p, date) {
    const body = el('div', 'detail');
    const img = el('img');
    img.src = p.thumb;
    img.alt = '';
    const info = el('div', 'detail-info');
    const h = el('h3');
    h.textContent = p.name;
    const local = !p.remote;
    const mine = local ? p : load().packs.find(q => q.pub && q.pub.id === p.id);
    info.append(h, el('p', 'sub', `${p.count} ${t('pieces')} · ${date}${local && p.pub ? ' · ' + t('published') : ''}`));
    const spill = el('button', 'btn primary wide', t('spill'));
    spill.addEventListener('click', () => {
      this.cb.click();
      this.close();
      this.cb.spill(p);
    });
    info.append(spill);
    const back = el('button', 'btn ghost', t('back'));
    back.addEventListener('click', () => {
      this.cb.click();
      this.collection(local ? 'mine' : 'all');
    });
    const row = el('div', 'row');
    row.append(back);
    if (mine && (mine.pub || this.cb.canPublish())) {
      const pub = el('button', 'btn ghost wide pubbtn', mine.pub ? t('unpublish') : t('publish'));
      pub.addEventListener('click', () => {
        this.cb.click();
        pub.disabled = true;
        pub.textContent = t('loading');
        const was = !!mine.pub;
        (was ? this.cb.unpublish(mine) : this.cb.publish(mine))
          .then(() => {
            this.hint(t(was ? 'unpubDone' : 'pubDone'), 2600);
            if (this.open && this.open.contains(pub)) local ? this.packDetail(p, date) : this.collection('all');
          })
          .catch(() => {
            this.hint(t('pubFail'), 2600);
            pub.disabled = false;
            pub.textContent = was ? t('unpublish') : t('publish');
          });
      });
      info.append(pub);
    }
    if (local) {
      const del = el('button', 'btn ghost', t('del'));
      del.addEventListener('click', () => {
        if (!del._armed) {
          del._armed = true;
          del.textContent = t('delAsk');
          setTimeout(() => {
            del._armed = false;
            del.textContent = t('del');
          }, 2400);
          return;
        }
        this.cb.click();
        del.disabled = true;
        Promise.resolve(p.pub ? this.cb.unpublish(p) : 0)
          .catch(() => 0)
          .then(() => {
            removePack(p.id);
            this.collection('mine');
          });
      });
      row.append(del);
    }
    info.append(row);
    body.append(img, info);
    this.sheet('wide', t('collection'), body);
  }
}
