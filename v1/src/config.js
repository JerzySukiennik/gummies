// Gummies: shared constants (1 world unit = 1 cm).
export const N = 256;
export const DX = 0.25;
export const HALF = (N * DX) / 2;
export const TX = DX / 4;
export const GRAV = 820;
export const BG = 0xf6f6f7;
export const LIGHT_DIR = [-0.42, 0.8, -0.43];
export const IS_TOUCH = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;
export const TEST = typeof location !== 'undefined' && new URLSearchParams(location.search).has('test');

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (a, b, v) => {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
export const cellX = i => -HALF + (i + 0.5) * DX;
export const gridU = x => (x + HALF) / DX - 0.5;
