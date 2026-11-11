// Gummies: sample-based audio (real recordings), one-shots with variants and flow-driven loops.
const FILES = {
  pour: ['pour.mp3'],
  drizzle: ['drizzle.mp3'],
  shake: ['shake.mp3'],
  hiss: ['hiss.mp3'],
  pop: ['pop1.mp3', 'pop2.mp3', 'pop3.mp3', 'pop4.mp3'],
  peel: ['peel1.mp3', 'peel2.mp3', 'peel3.mp3'],
  thud: ['thud1.mp3', 'thud2.mp3', 'thud3.mp3', 'thud4.mp3'],
  flop: ['flop.mp3'],
  set: ['set.mp3'],
  click: ['click.mp3'],
  pick: ['pick.mp3'],
  bag: ['bag1.mp3', 'bag2.mp3', 'bag3.mp3'],
  seal: ['seal.mp3'],
  whoosh: ['whoosh.mp3'],
  fill: ['fill.mp3'],
};

let ctx = null;
let master = null;
let enabled = true;
let loading = false;
const LOOPS = { pour: [0.12, 2.97], drizzle: [0.12, 2.77], shake: [0.12, 2.22], hiss: [0.12, 2.22] };
const buffers = {};
const loops = {};
const last = {};

async function loadAll() {
  if (loading) return;
  loading = true;
  await Promise.all(
    Object.entries(FILES).map(async ([name, files]) => {
      buffers[name] = [];
      await Promise.all(
        files.map(async (f, i) => {
          try {
            const r = await fetch('assets/audio/' + f);
            if (!r.ok) return;
            buffers[name][i] = await ctx.decodeAudioData(await r.arrayBuffer());
          } catch (e) {}
        })
      );
      buffers[name] = buffers[name].filter(Boolean);
    })
  );
}

export const audio = {
  unlock() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = enabled ? 0.9 : 0;
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.ratio.value = 3;
      master.connect(comp);
      comp.connect(ctx.destination);
      loadAll();
    }
    if (ctx.state === 'suspended') ctx.resume();
  },
  setEnabled(on) {
    enabled = on;
    if (master) master.gain.setTargetAtTime(on ? 0.9 : 0, ctx.currentTime, 0.03);
  },
  play(name, vol = 1, rate = 1, minGap = 0.03) {
    if (!ctx || !enabled) return;
    const list = buffers[name];
    if (!list || !list.length) return;
    const now = ctx.currentTime;
    if (last[name] && now - last[name] < minGap) return;
    last[name] = now;
    const src = ctx.createBufferSource();
    src.buffer = list[(Math.random() * list.length) | 0];
    src.playbackRate.value = rate * (0.94 + Math.random() * 0.12);
    const g = ctx.createGain();
    g.gain.value = Math.min(1.4, vol);
    src.connect(g);
    g.connect(master);
    src.start();
  },
  loop(name, level, rate = 1) {
    if (!ctx) return;
    let l = loops[name];
    if (!l) {
      const list = buffers[name];
      if (!list || !list.length) return;
      if (level < 0.01) return;
      const src = ctx.createBufferSource();
      src.buffer = list[0];
      src.loop = true;
      const lp = LOOPS[name];
      if (lp) {
        src.loopStart = lp[0];
        src.loopEnd = lp[1];
      }
      const g = ctx.createGain();
      g.gain.value = 0;
      src.connect(g);
      g.connect(master);
      src.start(0, lp ? lp[0] + Math.random() * (lp[1] - lp[0]) : 0);
      l = loops[name] = { src, g, level: 0 };
    }
    l.g.gain.setTargetAtTime(enabled ? level : 0, ctx.currentTime, 0.05);
    l.src.playbackRate.setTargetAtTime(rate, ctx.currentTime, 0.08);
    l.level = level;
    if (level < 0.005) {
      clearTimeout(l.stopT);
      l.stopT = setTimeout(() => {
        if (l.level < 0.005 && loops[name] === l) {
          try {
            l.src.stop();
          } catch (e) {}
          delete loops[name];
        }
      }, 600);
    }
  },
};
