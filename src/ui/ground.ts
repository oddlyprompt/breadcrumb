import { N, CELL, SIZE, cellOf, cellCenter, elevAt, idx, inb, DX, DY, CREEK_Q, RIVER_Q, riverWidth } from '../sim/terrain';
import { Sed, Veg } from '../sim/landscape';
import { hash01, hash32 } from '../sim/rng';
import { clamp } from '../sim/noise';
import type { World } from '../sim/worldtypes';
import { isWater } from '../sim/game';
import { CH, chunkKey } from '../sim/sites';
const PARKS = new Set(['town_common', 'schoolyard', 'picnic', 'fairground']);
export function parkAt(w: World, x: number, y: number): boolean { for (const i of w.sites.chunks.get(chunkKey(Math.floor(x / CH), Math.floor(y / CH))) ?? []) { const s = w.sites.sites[i]; if (PARKS.has(s.kind) && Math.hypot(s.x - x, s.y - y) < s.r * 0.92) return true; } return false; }

export const TILE_M = 32;
export type RGB = [number, number, number];
const hexRGB = (h: string): RGB => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const GROUND: Record<number, RGB> = { [Sed.Bedrock]: hexRGB('#8c867a'), [Sed.Residual]: hexRGB('#7e7552'), [Sed.Colluvium]: hexRGB('#857a5a'), [Sed.Alluvium]: hexRGB('#7d6f4c'), [Sed.Till]: hexRGB('#867b60'), [Sed.MarineSand]: hexRGB('#b9a878'), [Sed.Beach]: hexRGB('#cdbd8d'), [Sed.Peat]: hexRGB('#5d5140'), [Sed.Lacustrine]: hexRGB('#8c826a') };
const VEGC: Record<number, RGB> = { [Veg.Barren]: hexRGB('#8c867a'), [Veg.Alpine]: hexRGB('#8c9168'), [Veg.Conifer]: hexRGB('#4a5a38'), [Veg.Mixed]: hexRGB('#58693d'), [Veg.Broadleaf]: hexRGB('#62743e'), [Veg.Grass]: hexRGB('#80944f'), [Veg.Shrub]: hexRGB('#8b8a52'), [Veg.Wetland]: hexRGB('#667a52'), [Veg.Heath]: hexRGB('#7c6d58'), [Veg.DuneScrub]: hexRGB('#a9a46b') };

// a small tileable noise texture for fast pixel detail
const NT = 128; const noiseTex = new Float32Array(NT * NT);
(() => { for (let i = 0; i < noiseTex.length; i++) noiseTex[i] = hash01(i * 7919, 13, 5) - 0.5; for (let p = 0; p < 2; p++) { const c = noiseTex.slice(); for (let y = 0; y < NT; y++) for (let x = 0; x < NT; x++) noiseTex[y * NT + x] = 0.5 * c[y * NT + x] + 0.125 * (c[y * NT + (x + 1) % NT] + c[y * NT + (x + NT - 1) % NT] + c[((y + 1) % NT) * NT + x] + c[((y + NT - 1) % NT) * NT + x]); } })();
const nt = (u: number, v: number) => noiseTex[((v | 0) & (NT - 1)) * NT + ((u | 0) & (NT - 1))];

export interface Seg { ax: number; ay: number; bx: number; by: number; w: number; q: number }
const segCache = new WeakMap<World, Map<number, Seg[]>>();
export function streamSegs(w: World): Map<number, Seg[]> {
  let m = segCache.get(w); if (m) return m; m = new Map(); const T = w.T;
  for (let c = 0; c < N * N; c++) { if (T.sea[c] || T.Q[c] < CREEK_Q) continue; const d = T.flow[c]; if (d < 0) continue; const nx = (c % N) + DX[d], ny = ((c / N) | 0) + DY[d]; if (!inb(nx, ny)) continue; const [ax, ay] = cellCenter(c), [bx, by] = cellCenter(idx(nx, ny)); m.set(c, [{ ax, ay, bx, by, w: riverWidth(T.Q[c]), q: T.Q[c] }]); }
  segCache.set(w, m); return m;
}
export function segsNear(w: World, x0: number, y0: number, x1: number, y1: number): Seg[] {
  const m = streamSegs(w); const out: Seg[] = []; const cx0 = Math.floor(x0 / CELL) - 1, cx1 = Math.floor(x1 / CELL) + 1, cy0 = Math.floor(y0 / CELL) - 1, cy1 = Math.floor(y1 / CELL) + 1;
  for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) if (inb(cx, cy)) { const s = m.get(idx(cx, cy)); if (s) out.push(...s); }
  return out;
}
/** meander: a smooth lateral displacement of a stream segment, deterministic */
export function meander(s: Seg, t: number): number { return Math.sin(t * Math.PI * 3 + hash01(hash32(s.ax + ',' + s.ay), 3) * 6.28) * Math.min(35, 8 + s.w * 3) * Math.sin(t * Math.PI); }
export function riverDistAt(w: World, x: number, y: number): { d: number; width: number } | null {
  let best: { d: number; width: number } | null = null;
  for (const s of segsNear(w, x - 60, y - 60, x + 60, y + 60)) { const dx = s.bx - s.ax, dy = s.by - s.ay, L2 = dx * dx + dy * dy; let t = clamp(((x - s.ax) * dx + (y - s.ay) * dy) / L2, 0, 1); const nx = -dy / Math.sqrt(L2), ny = dx / Math.sqrt(L2); const m = meander(s, t); const px = s.ax + dx * t + nx * m, py = s.ay + dy * t + ny * m; const d = Math.hypot(px - x, py - y); if (!best || d - s.w / 2 < best.d - best.width / 2) best = { d, width: s.w }; }
  return best;
}
/** Colour of the ground at a point (land only), without water. */
export function groundRGB(w: World, x: number, y: number, ppmDetail: number): RGB {
  const c = cellOf(x, y); const L = w.L; const sed = L.sediment[c]; const veg = L.veg[c];
  let base = GROUND[sed]; const v = VEGC[veg];
  const sandy = sed === Sed.Beach || (sed === Sed.MarineSand && (veg === Veg.DuneScrub || veg === Veg.Barren));
  const wv = sandy || sed === Sed.Bedrock ? 0.2 : veg === Veg.Barren ? 0 : sed === Sed.MarineSand ? 0.9 : 0.8; // vegetation cover over the bare ground
  let r = base[0] * (1 - wv) + v[0] * wv, g = base[1] * (1 - wv) + v[1] * wv, b = base[2] * (1 - wv) + v[2] * wv;
  if (parkAt(w, x, y)) { r = r * 0.25 + 128 * 0.75; g = g * 0.25 + 156 * 0.75; b = b * 0.25 + 80 * 0.75; }
  const n1 = nt(x * 3.1, y * 3.1) * 2, n2 = nt(x * 0.37 + 40, y * 0.37 + 17) * 2.4;
  const k = 1 + n1 * 0.2 + n2 * 0.22; r *= k; g *= k; b *= k;
  if (sed === Sed.Bedrock || (sed === Sed.Colluvium && n1 > 0.2)) { const s = 0.8 + 0.4 * Math.abs(nt(x * 7, y * 7) * 2); r = r * 0.6 + 140 * 0.4 * s; g = g * 0.6 + 136 * 0.4 * s; b = b * 0.6 + 126 * 0.4 * s; }
  void ppmDetail; return [r, g, b];
}
export function tileKey(tx: number, ty: number) { return ty * 8192 + tx; }
/** Render one 32 m tile of dry ground to a canvas (no water, no features). */
export function renderTile(w: World, tx: number, ty: number, ppm: number): HTMLCanvasElement {
  const size = Math.round(TILE_M * ppm); const cv = document.createElement('canvas'); cv.width = size; cv.height = size; const cx = cv.getContext('2d')!;
  const img = cx.createImageData(size, size); const d = img.data; const x0 = tx * TILE_M, y0 = ty * TILE_M;
  // coarse colour grid every metre, interpolated; fine noise per pixel
  const G = TILE_M + 2; const grid = new Float32Array(G * G * 3);
  for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) { const c = groundRGB(w, x0 + i - 0.5, y0 + j - 0.5, ppm); grid[(j * G + i) * 3] = c[0]; grid[(j * G + i) * 3 + 1] = c[1]; grid[(j * G + i) * 3 + 2] = c[2]; }
  for (let py = 0; py < size; py++) for (let px = 0; px < size; px++) {
    const u = px / ppm + 0.5, v = py / ppm + 0.5; const i0 = Math.floor(u), j0 = Math.floor(v); const fu = u - i0, fv = v - j0;
    const o = (py * size + px) * 4; const wx = x0 + px / ppm, wy = y0 + py / ppm; const fine = nt(wx * 14, wy * 14) * 2 + nt(wx * 41, wy * 41) * 1.2;
    for (let ch = 0; ch < 3; ch++) { const a = grid[(j0 * G + i0) * 3 + ch], b = grid[(j0 * G + i0 + 1) * 3 + ch], c2 = grid[((j0 + 1) * G + i0) * 3 + ch], e = grid[((j0 + 1) * G + i0 + 1) * 3 + ch]; d[o + ch] = clamp((a * (1 - fu) + b * fu) * (1 - fv) + (c2 * (1 - fu) + e * fu) * fv + fine * 14, 0, 255); }
    d[o + 3] = 255;
  }
  cx.putImageData(img, 0, 0); return cv;
}
export function tideLevelAt(w: World, minutesSinceStart: number): number { const h = minutesSinceStart / 60; return (0.55 + 0.2 * Math.cos(h / 354.4 * Math.PI * 2)) * Math.cos(h / 12.42 * Math.PI * 2) + 0.12 * Math.cos(h / 12 * Math.PI * 2); }
export { isWater };
