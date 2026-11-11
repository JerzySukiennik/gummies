// Gummies: shape silhouettes drawn on canvas, signed distance fields and relief maps.
const TAU = Math.PI * 2;
const INF = 1e20;
export const DW = 96;
export const DH = 128;

function circ(c, x, y, r) {
  c.beginPath();
  c.arc(x, y, r, 0, TAU);
  c.fill();
}
function ell(c, x, y, rx, ry, rot = 0) {
  c.beginPath();
  c.ellipse(x, y, rx, ry, rot, 0, TAU);
  c.fill();
}
function line(c, pts, w) {
  c.lineWidth = w;
  c.lineCap = 'round';
  c.lineJoin = 'round';
  c.beginPath();
  c.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) c.lineTo(pts[i], pts[i + 1]);
  c.stroke();
}
function poly(c, pts, round = 0) {
  c.beginPath();
  c.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) c.lineTo(pts[i], pts[i + 1]);
  c.closePath();
  c.fill();
  if (round > 0) {
    c.lineWidth = round * 2;
    c.lineJoin = 'round';
    c.stroke();
  }
}
function rrect(c, x, y, w, h, r) {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
  c.fill();
}
function path(c, d) {
  c.fill(new Path2D(d));
}
function arcStroke(c, x, y, r, a0, a1, w) {
  c.lineWidth = w;
  c.lineCap = 'round';
  c.beginPath();
  c.arc(x, y, r, a0, a1);
  c.stroke();
}
const up = (c, a = 1) => {
  c.fillStyle = c.strokeStyle = `rgba(255,255,255,${a})`;
};
const dn = (c, a = 1) => {
  c.fillStyle = c.strokeStyle = `rgba(0,0,0,${a})`;
};

function wormPts() {
  const p = [];
  for (let i = 0; i <= 40; i++) {
    const t = i / 40;
    p.push(48 + 19 * Math.sin(t * TAU * 0.92 + 0.3), 18 + 92 * t);
  }
  return p;
}
function eggBlob(c) {
  c.beginPath();
  for (let i = 0; i <= 72; i++) {
    const a = (i / 72) * TAU;
    const r = 33 + 4.5 * Math.sin(3 * a + 0.5) + 2.5 * Math.sin(5 * a + 1.7);
    const x = 48 + r * Math.cos(a);
    const y = 64 + r * Math.sin(a) * 1.28;
    if (i === 0) c.moveTo(x, y);
    else c.lineTo(x, y);
  }
  c.closePath();
  c.fill();
}
function starPts(cx, cy, ro, ri) {
  const p = [];
  for (let k = 0; k < 10; k++) {
    const r = k % 2 ? ri : ro;
    const a = -Math.PI / 2 + (k * Math.PI) / 5;
    p.push(cx + r * Math.cos(a), cy + r * Math.sin(a));
  }
  return p;
}
const FLAME = 'M48 8C56 30 82 50 82 84C82 106 66 120 48 120C30 120 14 106 14 84C14 66 26 58 30 42C36 52 40 54 42 46C44 34 44 20 48 8Z';
function sharkT(c, f) {
  c.save();
  c.translate(48, 64);
  c.rotate(-0.95);
  c.scale(0.82, 0.82);
  f();
  c.restore();
}

export const SHAPES = {
  bear: {
    pl: 'Miś',
    en: 'Bear',
    draw(c) {
      circ(c, 48, 36, 18);
      circ(c, 31, 21, 8.5);
      circ(c, 65, 21, 8.5);
      ell(c, 48, 80, 21, 27);
      ell(c, 25, 68, 8.5, 12.5, 0.5);
      ell(c, 71, 68, 8.5, 12.5, -0.5);
      ell(c, 33, 107, 10.5, 12, 0.15);
      ell(c, 63, 107, 10.5, 12, -0.15);
    },
    detail(c) {
      up(c, 0.9);
      ell(c, 48, 82, 12, 16);
      circ(c, 48, 42, 7);
      up(c, 0.5);
      ell(c, 25, 68, 4.5, 8, 0.5);
      ell(c, 71, 68, 4.5, 8, -0.5);
      ell(c, 33, 108, 5.5, 7);
      ell(c, 63, 108, 5.5, 7);
      dn(c, 0.95);
      circ(c, 41, 31, 2.7);
      circ(c, 55, 31, 2.7);
      circ(c, 31, 21, 3.6);
      circ(c, 65, 21, 3.6);
      dn(c, 0.6);
      circ(c, 48, 40, 2);
    },
  },
  worm: {
    pl: 'Robak',
    en: 'Worm',
    draw(c) {
      line(c, wormPts(), 21);
    },
    detail(c) {
      const p = wormPts();
      up(c, 0.4);
      line(c, p, 8);
      dn(c, 0.6);
      for (let i = 2; i < 39; i += 3) {
        const tx = p[i * 2 + 2] - p[i * 2 - 2];
        const ty = p[i * 2 + 3] - p[i * 2 - 1];
        const l = Math.hypot(tx, ty);
        const nx = -ty / l;
        const ny = tx / l;
        line(c, [p[i * 2] - nx * 9, p[i * 2 + 1] - ny * 9, p[i * 2] + nx * 9, p[i * 2 + 1] + ny * 9], 1.7);
      }
    },
  },
  cola: {
    pl: 'Butelka coli',
    en: 'Cola bottle',
    draw(c) {
      rrect(c, 31, 52, 34, 66, 11);
      path(c, 'M39 22L57 22L57 34C57 44 65 46 65 60L31 60C31 46 39 44 39 34Z');
      rrect(c, 37, 10, 22, 15, 4);
    },
    detail(c) {
      up(c, 0.6);
      rrect(c, 34, 72, 28, 24, 5);
      rrect(c, 40, 12, 16, 9, 3);
      dn(c, 0.55);
      line(c, [33, 66, 63, 66], 1.7);
      line(c, [33, 102, 63, 102], 1.7);
      line(c, [39, 27, 57, 27], 1.7);
    },
  },
  ring: {
    pl: 'Pierścień',
    en: 'Ring',
    draw(c) {
      c.beginPath();
      c.arc(48, 64, 37, 0, TAU);
      c.arc(48, 64, 15, 0, TAU, true);
      c.fill('evenodd');
    },
    detail(c) {
      up(c, 0.7);
      for (let k = 0; k < 10; k++) {
        const a = (k / 10) * TAU;
        circ(c, 48 + 26 * Math.cos(a), 64 + 26 * Math.sin(a), 6.5);
      }
    },
  },
  egg: {
    pl: 'Jajko sadzone',
    en: 'Fried egg',
    draw(c) {
      eggBlob(c);
    },
    detail(c) {
      up(c, 1);
      circ(c, 50, 60, 15);
      up(c, 0.7);
      circ(c, 50, 60, 10);
    },
  },
  frog: {
    pl: 'Żabka',
    en: 'Frog',
    draw(c) {
      ell(c, 48, 76, 33, 36);
      circ(c, 29, 36, 13.5);
      circ(c, 67, 36, 13.5);
      ell(c, 17, 106, 11, 8.5, -0.3);
      ell(c, 79, 106, 11, 8.5, 0.3);
    },
    detail(c) {
      up(c, 0.8);
      circ(c, 29, 36, 8);
      circ(c, 67, 36, 8);
      up(c, 0.5);
      ell(c, 48, 92, 16, 13);
      dn(c, 0.95);
      circ(c, 29, 36, 3.6);
      circ(c, 67, 36, 3.6);
      dn(c, 0.6);
      arcStroke(c, 48, 62, 20, 0.15 * Math.PI, 0.85 * Math.PI, 2.2);
    },
  },
  heart: {
    pl: 'Serce',
    en: 'Heart',
    draw(c) {
      path(c, 'M48 116C12 86 6 54 14 38C22 20 42 20 48 40C54 20 74 20 82 38C90 54 84 86 48 116Z');
    },
    detail(c) {
      up(c, 0.4);
      ell(c, 48, 66, 20, 22);
      up(c, 0.6);
      ell(c, 30, 46, 6, 10, 0.5);
    },
  },
  star: {
    pl: 'Gwiazdka',
    en: 'Star',
    draw(c) {
      poly(c, starPts(48, 66, 38, 17), 5);
    },
    detail(c) {
      up(c, 0.6);
      circ(c, 48, 66, 13);
    },
  },
  cherry: {
    pl: 'Wiśnie',
    en: 'Cherries',
    draw(c) {
      circ(c, 29, 95, 19);
      circ(c, 68, 99, 19);
      line(c, [29, 80, 40, 44, 54, 18], 8.5);
      line(c, [68, 84, 62, 48, 54, 18], 8.5);
      ell(c, 69, 23, 14, 7.5, 0.35);
    },
    detail(c) {
      up(c, 0.6);
      circ(c, 24, 89, 6);
      circ(c, 63, 93, 6);
      dn(c, 0.5);
      line(c, [59, 20, 79, 27], 1.6);
    },
  },
  drop: {
    pl: 'Kropla',
    en: 'Drop',
    draw(c) {
      path(c, 'M48 10C48 10 84 60 84 84A36 36 0 1 1 12 84C12 60 48 10 48 10Z');
    },
    detail(c) {
      up(c, 0.6);
      ell(c, 34, 84, 7, 12, 0.4);
    },
  },
  flower: {
    pl: 'Kwiatek',
    en: 'Flower',
    draw(c) {
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * TAU - Math.PI / 2;
        circ(c, 48 + 25 * Math.cos(a), 64 + 25 * Math.sin(a), 15.5);
      }
      circ(c, 48, 64, 17);
    },
    detail(c) {
      up(c, 0.9);
      circ(c, 48, 64, 11);
      dn(c, 0.4);
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * TAU - Math.PI / 2 + Math.PI / 6;
        line(c, [48 + 15 * Math.cos(a), 64 + 15 * Math.sin(a), 48 + 30 * Math.cos(a), 64 + 30 * Math.sin(a)], 1.6);
      }
    },
  },
  strawberry: {
    pl: 'Truskawka',
    en: 'Strawberry',
    draw(c) {
      path(c, 'M48 120C22 104 8 72 14 50C18 36 34 32 48 36C62 32 78 36 82 50C88 72 74 104 48 120Z');
      for (const a of [-0.9, -0.45, 0, 0.45, 0.9]) ell(c, 48 + Math.sin(a) * 20, 32 - Math.cos(a) * 4, 6.5, 13, a);
      line(c, [48, 28, 50, 13], 7.5);
    },
    detail(c) {
      up(c, 0.5);
      ell(c, 48, 31, 18, 6);
      dn(c, 0.75);
      const seeds = [30, 56, 48, 54, 66, 56, 24, 72, 40, 71, 56, 71, 72, 72, 33, 88, 48, 87, 63, 88, 41, 102, 55, 102];
      for (let i = 0; i < seeds.length; i += 2) ell(c, seeds[i], seeds[i + 1], 1.9, 2.9);
    },
  },
  rocket: {
    pl: 'Rakieta',
    en: 'Rocket',
    draw(c) {
      path(c, 'M48 8C62 22 66 44 66 62L66 98L30 98L30 62C30 44 34 22 48 8Z');
      poly(c, [30, 72, 13, 104, 13, 116, 30, 102], 2);
      poly(c, [66, 72, 83, 104, 83, 116, 66, 102], 2);
      rrect(c, 39, 96, 18, 15, 4);
    },
    detail(c) {
      dn(c, 0.8);
      circ(c, 48, 48, 9.5);
      up(c, 0.9);
      circ(c, 48, 48, 6);
      dn(c, 0.5);
      line(c, [32, 66, 64, 66], 1.8);
      line(c, [32, 90, 64, 90], 1.8);
      up(c, 0.4);
      line(c, [48, 72, 48, 86], 6);
    },
  },
  duck: {
    pl: 'Kaczka',
    en: 'Duck',
    draw(c) {
      ell(c, 42, 86, 30, 24);
      circ(c, 58, 48, 19);
      ell(c, 79, 52, 9, 6);
      poly(c, [16, 80, 9, 60, 26, 72], 3);
    },
    detail(c) {
      up(c, 0.7);
      ell(c, 38, 88, 16, 11, -0.2);
      dn(c, 0.95);
      circ(c, 62, 44, 2.8);
      dn(c, 0.5);
      line(c, [72, 52, 87, 52], 1.4);
    },
  },
  logo: {
    pl: 'Wschód',
    en: 'Sunrise',
    draw(c) {
      c.lineWidth = 11;
      c.lineCap = 'butt';
      c.beginPath();
      c.arc(36.5, 76, 22, Math.PI, 0);
      c.stroke();
      c.beginPath();
      c.arc(59.5, 76, 22, Math.PI, 0);
      c.stroke();
      rrect(c, 8, 70, 80, 12, 4.5);
    },
    detail(c) {
      up(c, 0.4);
      rrect(c, 12, 73, 72, 6, 3);
    },
  },
  fish: {
    pl: 'Ryba',
    en: 'Fish',
    draw(c) {
      ell(c, 48, 54, 23, 36);
      poly(c, [48, 86, 29, 115, 67, 115], 4);
      ell(c, 22, 60, 8, 5, 0.9);
      ell(c, 74, 60, 8, 5, -0.9);
    },
    detail(c) {
      up(c, 0.5);
      ell(c, 48, 56, 12, 24);
      dn(c, 0.95);
      circ(c, 40, 34, 3);
      dn(c, 0.45);
      arcStroke(c, 48, 30, 22, 0.2 * Math.PI, 0.8 * Math.PI, 1.6);
      for (const [x, y] of [[40, 58], [56, 58], [48, 68], [40, 78], [56, 78]]) arcStroke(c, x, y, 7, 0.1 * Math.PI, 0.9 * Math.PI, 1.5);
      line(c, [48, 96, 40, 112], 1.5);
      line(c, [48, 96, 56, 112], 1.5);
    },
  },
  flame: {
    pl: 'Płomień',
    en: 'Flame',
    draw(c) {
      path(c, FLAME);
    },
    detail(c) {
      up(c, 0.8);
      c.save();
      c.translate(48, 96);
      c.scale(0.48, 0.48);
      c.translate(-48, -92);
      path(c, FLAME);
      c.restore();
    },
  },
  letterG: {
    pl: 'Litera G',
    en: 'Letter G',
    draw(c) {
      c.font = 'bold 104px "Arial Rounded MT Bold","Arial Black",Arial,sans-serif';
      c.textAlign = 'center';
      c.textBaseline = 'alphabetic';
      c.lineWidth = 5;
      c.lineJoin = 'round';
      c.fillText('G', 48, 101);
      c.strokeText('G', 48, 101);
    },
  },
  dino: {
    pl: 'Dinozaur',
    en: 'Dino',
    draw(c) {
      ell(c, 44, 88, 27, 19);
      line(c, [60, 80, 70, 58, 72, 38], 15);
      ell(c, 76, 30, 13, 9, -0.15);
      line(c, [22, 88, 13, 102], 11);
      rrect(c, 28, 98, 12, 22, 5.5);
      rrect(c, 50, 98, 12, 22, 5.5);
    },
    detail(c) {
      dn(c, 0.95);
      circ(c, 80, 27, 2.2);
      up(c, 0.6);
      circ(c, 36, 84, 5);
      circ(c, 50, 90, 4);
      circ(c, 44, 78, 3.5);
    },
  },
  cat: {
    pl: 'Kot',
    en: 'Cat',
    draw(c) {
      circ(c, 48, 76, 35);
      poly(c, [17, 62, 19, 26, 44, 46], 5);
      poly(c, [79, 62, 77, 26, 52, 46], 5);
    },
    detail(c) {
      up(c, 0.5);
      ell(c, 38, 90, 8, 6);
      ell(c, 58, 90, 8, 6);
      dn(c, 0.95);
      ell(c, 34, 70, 4, 6.5);
      ell(c, 62, 70, 4, 6.5);
      dn(c, 0.8);
      poly(c, [44, 83, 52, 83, 48, 88]);
      dn(c, 0.45);
      line(c, [20, 86, 34, 89], 1.4);
      line(c, [20, 95, 34, 93], 1.4);
      line(c, [76, 86, 62, 89], 1.4);
      line(c, [76, 95, 62, 93], 1.4);
      dn(c, 0.4);
      poly(c, [23, 54, 24, 36, 36, 46]);
      poly(c, [73, 54, 72, 36, 60, 46]);
    },
  },
  shark: {
    pl: 'Rekin',
    en: 'Shark',
    draw(c) {
      sharkT(c, () => {
        path(c, 'M-56 2C-34 -22 22 -20 50 -2C22 14 -32 18 -56 2Z');
        poly(c, [-10, -14, 8, -36, 14, -12], 2);
        poly(c, [44, -2, 60, -24, 54, 0, 60, 18], 2);
        poly(c, [-14, 10, -4, 30, 6, 10], 2);
      });
    },
    detail(c) {
      sharkT(c, () => {
        dn(c, 0.95);
        circ(c, -38, -3, 2.4);
        dn(c, 0.5);
        line(c, [-24, -8, -22, 6], 1.6);
        line(c, [-18, -9, -16, 6], 1.6);
        line(c, [-12, -10, -10, 6], 1.6);
        arcStroke(c, -44, 2, 8, 0.1 * Math.PI, 0.7 * Math.PI, 1.6);
      });
    },
  },
  butterfly: {
    pl: 'Motyl',
    en: 'Butterfly',
    draw(c) {
      ell(c, 29, 46, 19, 26, -0.35);
      ell(c, 67, 46, 19, 26, 0.35);
      ell(c, 32, 92, 15, 19, 0.35);
      ell(c, 64, 92, 15, 19, -0.35);
      line(c, [48, 34, 48, 104], 9);
    },
    detail(c) {
      up(c, 0.6);
      ell(c, 29, 46, 9, 13, -0.35);
      ell(c, 67, 46, 9, 13, 0.35);
      circ(c, 32, 92, 6);
      circ(c, 64, 92, 6);
      dn(c, 0.4);
      line(c, [43, 38, 43, 100], 1.4);
      line(c, [53, 38, 53, 100], 1.4);
    },
  },
  snail: {
    pl: 'Ślimak',
    en: 'Snail',
    draw(c) {
      circ(c, 57, 58, 30);
      line(c, [18, 106, 84, 106], 19);
      line(c, [18, 104, 18, 78], 15);
      line(c, [14, 76, 10, 58], 5.5);
      line(c, [22, 76, 28, 58], 5.5);
      circ(c, 10, 56, 4.5);
      circ(c, 28, 56, 4.5);
    },
    detail(c) {
      dn(c, 0.6);
      const p = [];
      for (let i = 0; i <= 60; i++) {
        const t = i / 60;
        const a = t * TAU * 2.3 + 1;
        const r = 25 * (1 - t);
        p.push(57 + r * Math.cos(a), 58 + r * Math.sin(a));
      }
      line(c, p, 2.4);
    },
  },
  turtle: {
    pl: 'Żółw',
    en: 'Turtle',
    draw(c) {
      ell(c, 48, 68, 29, 35);
      circ(c, 48, 24, 12);
      ell(c, 18, 46, 10.5, 8, 0.6);
      ell(c, 78, 46, 10.5, 8, -0.6);
      ell(c, 18, 94, 10.5, 8, -0.6);
      ell(c, 78, 94, 10.5, 8, 0.6);
      poly(c, [44, 100, 52, 100, 48, 118], 2);
    },
    detail(c) {
      up(c, 0.8);
      ell(c, 48, 68, 22, 28);
      dn(c, 0.55);
      const h = [48, 52, 60, 60, 60, 76, 48, 84, 36, 76, 36, 60];
      c.lineWidth = 1.8;
      c.lineJoin = 'round';
      c.beginPath();
      c.moveTo(h[0], h[1]);
      for (let i = 2; i < 12; i += 2) c.lineTo(h[i], h[i + 1]);
      c.closePath();
      c.stroke();
      const o = [48, 36, 72, 52, 72, 84, 48, 100, 24, 84, 24, 52];
      for (let i = 0; i < 12; i += 2) line(c, [h[i], h[i + 1], o[i], o[i + 1]], 1.8);
      dn(c, 0.95);
      circ(c, 43, 20, 1.8);
      circ(c, 53, 20, 1.8);
    },
  },
};

export function customShape(strokes) {
  return {
    pl: 'Własna',
    en: 'Custom',
    strokes,
    draw(c) {
      for (const s of strokes) {
        if (s.closed) poly(c, s.pts, 3);
        else line(c, s.pts, s.w || 16);
      }
    },
  };
}

function dt1(f, d, v, z, n) {
  let k = 0;
  v[0] = 0;
  z[0] = -INF;
  z[1] = INF;
  for (let q = 1; q < n; q++) {
    let s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    while (s <= z[k]) {
      k--;
      s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    }
    k++;
    v[k] = q;
    z[k] = s;
    z[k + 1] = INF;
  }
  k = 0;
  for (let q = 0; q < n; q++) {
    while (z[k + 1] < q) k++;
    const p = v[k];
    d[q] = (q - p) * (q - p) + f[p];
  }
}

export function edt2d(f, w, h) {
  const m = Math.max(w, h);
  const col = new Float64Array(m);
  const d = new Float64Array(m);
  const v = new Int32Array(m);
  const z = new Float64Array(m + 1);
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) col[y] = f[y * w + x];
    dt1(col, d, v, z, h);
    for (let y = 0; y < h; y++) f[y * w + x] = d[y];
  }
  for (let y = 0; y < h; y++) {
    const o = y * w;
    for (let x = 0; x < w; x++) col[x] = f[o + x];
    dt1(col, d, v, z, w);
    for (let x = 0; x < w; x++) f[o + x] = d[x];
  }
}

export function blur(a, w, h, passes = 2) {
  const t = new Float32Array(a.length);
  for (let p = 0; p < passes; p++) {
    for (let y = 0; y < h; y++) {
      const o = y * w;
      for (let x = 0; x < w; x++) {
        const l = a[o + (x > 0 ? x - 1 : x)];
        const r = a[o + (x < w - 1 ? x + 1 : x)];
        t[o + x] = (l + 2 * a[o + x] + r) * 0.25;
      }
    }
    for (let y = 0; y < h; y++) {
      const o = y * w;
      const ou = (y > 0 ? y - 1 : y) * w;
      const od = (y < h - 1 ? y + 1 : y) * w;
      for (let x = 0; x < w; x++) a[o + x] = (t[ou + x] + 2 * t[o + x] + t[od + x]) * 0.25;
    }
  }
  return a;
}

export function rasterize(W, H, ss, drawMask, drawDetail, fine = false) {
  const w = W * ss;
  const h = H * ss;
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const c = cv.getContext('2d', { willReadFrequently: true });
  c.scale(ss, ss);
  c.fillStyle = c.strokeStyle = '#fff';
  drawMask(c);
  let img = c.getImageData(0, 0, w, h).data;
  const n = w * h;
  const fin = new Float64Array(n);
  const fout = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const inside = img[i * 4 + 3] > 127;
    fin[i] = inside ? INF : 0;
    fout[i] = inside ? 0 : INF;
  }
  edt2d(fin, w, h);
  edt2d(fout, w, h);
  const fsd = fine ? new Float32Array(n) : null;
  const sd = new Float32Array(W * H);
  const inv = 1 / (ss * ss * ss);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let acc = 0;
      for (let sy = 0; sy < ss; sy++) {
        const o = (y * ss + sy) * w + x * ss;
        for (let sx = 0; sx < ss; sx++) {
          const a = fin[o + sx];
          const d = a > 0 ? Math.min(Math.sqrt(a), 1e4) - 0.5 : -(Math.min(Math.sqrt(fout[o + sx]), 1e4) - 0.5);
          if (fsd) fsd[o + sx] = d / ss;
          acc += d;
        }
      }
      sd[y * W + x] = acc * inv;
    }
  }
  let detail = null;
  let fdetail = null;
  if (drawDetail) {
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.fillStyle = 'rgb(128,128,128)';
    c.fillRect(0, 0, w, h);
    c.scale(ss, ss);
    drawDetail(c);
    img = c.getImageData(0, 0, w, h).data;
    fdetail = new Float32Array(n);
    for (let i = 0; i < n; i++) fdetail[i] = (img[i * 4] - 128) / 127.5;
    blur(fdetail, w, h, ss * 2 + 1);
    detail = new Float32Array(W * H);
    const inv2 = 1 / (ss * ss);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        let acc = 0;
        for (let sy = 0; sy < ss; sy++) {
          const o = (y * ss + sy) * w + x * ss;
          for (let sx = 0; sx < ss; sx++) acc += fdetail[o + sx];
        }
        detail[y * W + x] = acc * inv2;
      }
    }
    if (!fine) fdetail = null;
  }
  return { sd, detail, fsd, fdetail, ss };
}

export function drawShapeIn(c, shape, x, y, w, h, detail) {
  const f = detail ? shape.detail : shape.draw;
  if (!f) return;
  c.save();
  c.translate(x, y);
  c.scale(w / DW, h / DH);
  if (!detail) c.fillStyle = c.strokeStyle = '#fff';
  f(c);
  c.restore();
}
