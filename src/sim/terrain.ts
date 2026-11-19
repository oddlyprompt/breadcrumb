import { Rng, stream } from './rng';
import { Noise, clamp, smooth } from './noise';

export const N = 200;            // grid is N x N cells
export const CELL = 250;         // metres per cell
export const SIZE = N * CELL;    // 50 km square = 2,500 km2
export const DX = [1, 1, 0, -1, -1, -1, 0, 1];
export const DY = [0, 1, 1, 1, 0, -1, -1, -1];
export const DDIST = DX.map((dx, i) => Math.hypot(dx, DY[i]) * CELL);
export const idx = (x: number, y: number) => y * N + x;
export const inb = (x: number, y: number) => x >= 0 && y >= 0 && x < N && y < N;

export interface Traits {
  relief: number;        // 0.5..1.3 mountain height factor
  coastAngles: number[]; // directions (rad) in which sea lies
  waterFrac: number;
  rangeAngle: number; rangeOffset: number;
  windAngle: number;
  baseTemp: number;      // sea-level mean annual temperature C
  aridity: number;       // multiplies precipitation
  glaciated: boolean;    // Pleistocene ice covered the region: till, erratics, lakes
  iceFlow: number;       // ice flow direction rad (if glaciated)
  volcanic: number;      // 0..1 volcanic arc strength
  emphasis: 'mining' | 'fossil' | 'agrarian' | 'coastal' | 'mixed';
}

export function makeTraits(seed: string): Traits {
  const r = stream(seed, 'traits');
  const nSeas = r.chance(0.3) ? 2 : 1;
  const a0 = r.float(0, Math.PI * 2);
  const coastAngles = [a0];
  if (nSeas === 2) coastAngles.push(a0 + r.float(1.6, 3.2));
  return {
    relief: r.float(0.5, 1.3),
    coastAngles,
    waterFrac: r.float(0.1, 0.3),
    rangeAngle: r.float(0, Math.PI), rangeOffset: r.float(-0.2, 0.2),
    windAngle: r.float(0, Math.PI * 2),
    baseTemp: r.float(5, 17),
    aridity: r.float(0.55, 1.35),
    glaciated: r.chance(0.4), iceFlow: r.float(0, Math.PI * 2),
    volcanic: r.chance(0.5) ? r.float(0.3, 1) : r.float(0, 0.25),
    emphasis: r.pick(['mining', 'fossil', 'agrarian', 'coastal', 'mixed'] as const),
  };
}

export interface Lake { id: number; cells: number[]; level: number; area: number; name?: string; outlet?: number; }
export interface Terrain {
  traits: Traits;
  elev: Float32Array; filled: Float32Array; flow: Int8Array; Q: Float32Array;
  precip: Float32Array; temp: Float32Array; slope: Float32Array;
  sea: Uint8Array; lake: Int16Array; lakes: Lake[]; seaLevelRaw: number;
  coastDist: Float32Array; // metres to the sea (0 in sea)
  upstream: Int32Array;    // number of upstream cells
}

class MinHeap {
  keys: number[] = []; vals: number[] = [];
  get size() { return this.keys.length; }
  push(k: number, v: number) {
    const K = this.keys, V = this.vals; let i = K.length; K.push(k); V.push(v);
    while (i > 0) { const p = (i - 1) >> 1; if (K[p] <= K[i]) break; [K[p], K[i]] = [K[i], K[p]]; [V[p], V[i]] = [V[i], V[p]]; i = p; }
  }
  pop(): [number, number] {
    const K = this.keys, V = this.vals; const k = K[0], v = V[0];
    const lk = K.pop()!, lv = V.pop()!;
    if (K.length) {
      K[0] = lk; V[0] = lv; let i = 0; const n = K.length;
      for (;;) { let l = 2 * i + 1, rr = l + 1, m = i;
        if (l < n && K[l] < K[m]) m = l; if (rr < n && K[rr] < K[m]) m = rr; if (m === i) break;
        [K[m], K[i]] = [K[i], K[m]]; [V[m], V[i]] = [V[i], V[m]]; i = m; }
    }
    return [k, v];
  }
}

export function generateTerrain(seed: string): Terrain {
  const traits = makeTraits(seed);
  const nz = new Noise(seed + '|terrain');
  const nz2 = new Noise(seed + '|terrain2');
  const raw = new Float32Array(N * N);
  const cx = 0.5 + Math.cos(traits.rangeAngle + Math.PI / 2) * traits.rangeOffset;
  const cy = 0.5 + Math.sin(traits.rangeAngle + Math.PI / 2) * traits.rangeOffset;
  const rdx = Math.cos(traits.rangeAngle), rdy = Math.sin(traits.rangeAngle);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const u = x / N, v = y / N;
    const wx = u + 0.13 * nz.fbm(u * 2.2 + 5, v * 2.2, 3), wy = v + 0.13 * nz.fbm(u * 2.2, v * 2.2 + 9, 3);
    const base = nz.fbm(wx * 3.2, wy * 3.2, 5) * 0.62;
    const rg = nz2.ridge(wx * 2.4 + 3, wy * 2.4 + 1, 5) - 0.5;
    const d = Math.abs((u - cx) * rdy - (v - cy) * rdx);
    const belt = Math.exp(-((d / 0.2) ** 2)) * (0.45 + 0.45 * nz2.fbm(u * 5, v * 5, 3));
    let h = base + belt * 0.9 * traits.relief + rg * 0.45 * traits.relief;
    // sea(s): fall-off along coast directions, with ragged bays
    for (const ca of traits.coastAngles) {
      const p = (u - 0.5) * Math.cos(ca) + (v - 0.5) * Math.sin(ca);
      const rag = nz.fbm(u * 4 + 11, v * 4 + 3, 4) * 0.22;
      h -= smooth(0.12, 0.5, p + rag) * 1.8;
    }
    raw[idx(x, y)] = h;
  }
  // sea level at the quantile giving the wanted ocean fraction
  const sorted = Float32Array.from(raw).sort();
  const seaLevelRaw = sorted[Math.floor(traits.waterFrac * sorted.length)];
  let hmax = -1e9;
  for (let i = 0; i < raw.length; i++) hmax = Math.max(hmax, raw[i]);
  const elev = new Float32Array(N * N);
  const maxElev = 700 + 1500 * traits.relief;
  for (let i = 0; i < raw.length; i++) {
    const h = raw[i] - seaLevelRaw;
    elev[i] = h >= 0 ? Math.pow(h / (hmax - seaLevelRaw), 1.35) * maxElev + 0.5 + h * 6
                     : h * 90;
  }
  // gentle coastal plain so the shore has a usable beach slope
  const sea = new Uint8Array(N * N);
  for (let i = 0; i < sea.length; i++) sea[i] = elev[i] <= 0 ? 1 : 0;

  const coastDist = distanceToSea(sea);
  hydrology(traits, elev, sea, coastDist, seed);
  return finishTerrain(traits, elev, sea, coastDist, seaLevelRaw, seed);
}

function distanceToSea(sea: Uint8Array): Float32Array {
  const d = new Float32Array(N * N).fill(1e9);
  const q: number[] = [];
  for (let i = 0; i < sea.length; i++) if (sea[i]) { d[i] = 0; q.push(i); }
  if (!q.length) { // no sea: distance to edge
    for (let i = 0; i < N * N; i++) { const x = i % N, y = (i / N) | 0; d[i] = Math.min(x, y, N - 1 - x, N - 1 - y) * CELL + CELL * 20; }
    return d;
  }
  for (let h = 0; h < q.length; h++) {
    const c = q[h], cx = c % N, cy = (c / N) | 0;
    for (let k = 0; k < 8; k++) {
      const nx = cx + DX[k], ny = cy + DY[k]; if (!inb(nx, ny)) continue;
      const ni = idx(nx, ny), nd = d[c] + DDIST[k];
      if (nd < d[ni]) { d[ni] = nd; q.push(ni); }
    }
  }
  return d;
}

// placeholder hook so generateTerrain reads clearly; real work is in finishTerrain
function hydrology(_t: Traits, _e: Float32Array, _s: Uint8Array, _c: Float32Array, _seed: string) {}

function finishTerrain(traits: Traits, elev: Float32Array, sea: Uint8Array, coastDist: Float32Array, seaLevelRaw: number, seed: string): Terrain {
  const nz = new Noise(seed + '|climate');
  // ---- precipitation by moisture advection with orographic uplift
  const wx = Math.cos(traits.windAngle), wy = Math.sin(traits.windAngle);
  const order = Array.from({ length: N * N }, (_, i) => i);
  const proj = (i: number) => (i % N) * wx + ((i / N) | 0) * wy;
  order.sort((a, b) => proj(a) - proj(b));
  const moist = new Float32Array(N * N), precip = new Float32Array(N * N);
  const sx = Math.abs(wx) > 0.38 ? Math.sign(wx) : 0, sy = Math.abs(wy) > 0.38 ? Math.sign(wy) : 0;
  for (const c of order) {
    const x = c % N, y = (c / N) | 0;
    const px = x - sx, py = y - sy;
    let m: number, pe = elev[c];
    if (!inb(px, py)) m = 0.55; else { m = moist[idx(px, py)]; pe = elev[idx(px, py)]; }
    let rain = 0;
    if (sea[c]) m = Math.min(1, m + 0.22);
    else {
      const up = Math.max(0, elev[c] - Math.max(pe, 0));
      rain = m * (0.035 + Math.min(0.5, up / 260) * 0.18) * (0.8 + 0.4 * (nz.fbm(x * 0.05, y * 0.05, 3) + 0.5));
      m = Math.max(0, m - rain);
      m = Math.min(1, m + 0.004); // recycled moisture
    }
    moist[c] = m; precip[c] = rain;
  }
  let pmax = 0; for (let i = 0; i < precip.length; i++) pmax = Math.max(pmax, precip[i]);
  // scale to mm/yr: median land near 900 * aridity
  const landP = Array.from(precip).filter((_, i) => !sea[i]).sort((a, b) => a - b);
  const med = landP[landP.length >> 1] || 1e-3;
  for (let i = 0; i < precip.length; i++) precip[i] = clamp(precip[i] / med * 850 * traits.aridity + 160 + (sea[i] ? 400 : 0), 150, 3200);

  const temp = new Float32Array(N * N);
  for (let i = 0; i < temp.length; i++) {
    const x = i % N, y = (i / N) | 0;
    temp[i] = traits.baseTemp - 6.5 * Math.max(0, elev[i]) / 1000 + 1.8 * nz.fbm(x * 0.03 + 40, y * 0.03, 3)
      + (coastDist[i] < 8000 ? 0.8 : 0) - Math.min(coastDist[i], 40000) / 40000 * (traits.baseTemp > 12 ? -0.8 : 0.4);
  }

  // ---- depression filling (priority flood), flow directions
  const filled = new Float32Array(N * N).fill(Infinity);
  const heap = new MinHeap(); const done = new Uint8Array(N * N);
  for (let i = 0; i < N * N; i++) {
    const x = i % N, y = (i / N) | 0;
    if (sea[i] || x === 0 || y === 0 || x === N - 1 || y === N - 1) {
      // edge cells drain off-map; treat as outlets only if land edge
      filled[i] = elev[i]; heap.push(elev[i], i); done[i] = 1;
    }
  }
  const eps = 0.01;
  while (heap.size) {
    const [k, c] = heap.pop(); const cx = c % N, cy = (c / N) | 0;
    for (let d = 0; d < 8; d++) {
      const nx = cx + DX[d], ny = cy + DY[d]; if (!inb(nx, ny)) continue;
      const ni = idx(nx, ny); if (done[ni]) continue; done[ni] = 1;
      filled[ni] = Math.max(elev[ni], k + eps); heap.push(filled[ni], ni);
    }
  }
  const flow = new Int8Array(N * N).fill(-1);
  for (let c = 0; c < N * N; c++) {
    if (sea[c]) continue; const cx = c % N, cy = (c / N) | 0;
    let best = -1, bs = 0;
    for (let d = 0; d < 8; d++) {
      const nx = cx + DX[d], ny = cy + DY[d]; if (!inb(nx, ny)) continue;
      const s = (filled[c] - filled[idx(nx, ny)]) / DDIST[d];
      if (s > bs) { bs = s; best = d; }
    }
    if (best < 0 && (cx === 0 || cy === 0 || cx === N - 1 || cy === N - 1)) best = -2; // off-map outlet
    flow[c] = best;
  }
  // flow accumulation -> discharge Q (m3/s) and upstream counts
  const land = order.slice().filter(i => !sea[i]).sort((a, b) => filled[b] - filled[a]);
  const Q = new Float32Array(N * N), upstream = new Int32Array(N * N);
  const K = CELL * CELL * 0.4 / 3.15e7 / 1000; // mm/yr per cell -> m3/s with 40% runoff
  for (const c of land) { Q[c] += precip[c] * K; upstream[c] += 1; }
  for (const c of land) {
    const d = flow[c]; if (d < 0) continue;
    const x = c % N + DX[d], y = ((c / N) | 0) + DY[d];
    const ni = idx(x, y); Q[ni] += Q[c]; upstream[ni] += upstream[c];
  }
  // lakes: filled depressions deeper than 1.2 m, grouped
  const lake = new Int16Array(N * N).fill(-1); const lakes: Lake[] = [];
  const isDep = (i: number) => !sea[i] && filled[i] - elev[i] > 2.5;
  for (let i = 0; i < N * N; i++) {
    if (!isDep(i) || lake[i] >= 0) continue;
    const cells = [i]; lake[i] = lakes.length;
    for (let h = 0; h < cells.length; h++) {
      const c = cells[h], cx = c % N, cy = (c / N) | 0;
      for (let d = 0; d < 8; d += 1) { const nx = cx + DX[d], ny = cy + DY[d]; if (!inb(nx, ny)) continue;
        const ni = idx(nx, ny); if (lake[ni] < 0 && isDep(ni) && Math.abs(filled[ni] - filled[i]) < 3) { lake[ni] = lakes.length; cells.push(ni); } }
    }
    lakes.push({ id: lakes.length, cells, level: filled[i], area: cells.length * CELL * CELL });
  }
  // lakes of fewer than 3 cells become marsh depressions, not lakes
  for (const L of lakes) if (L.cells.length < 4) { for (const c of L.cells) lake[c] = -1; L.cells = []; }

  const slope = new Float32Array(N * N);
  for (let c = 0; c < N * N; c++) {
    const x = c % N, y = (c / N) | 0;
    const gx = (elev[idx(Math.min(N - 1, x + 1), y)] - elev[idx(Math.max(0, x - 1), y)]) / (2 * CELL);
    const gy = (elev[idx(x, Math.min(N - 1, y + 1))] - elev[idx(x, Math.max(0, y - 1))]) / (2 * CELL);
    slope[c] = Math.atan(Math.hypot(gx, gy)) * 180 / Math.PI;
  }
  return { traits, elev, filled, flow, Q, precip, temp, slope, sea, lake, lakes: lakes.filter(l => l.cells.length), seaLevelRaw, coastDist, upstream };
}

/** bilinear elevation in metres at world coordinates */
export function elevAt(t: { elev: Float32Array }, x: number, y: number): number {
  const fx = clamp(x / CELL - 0.5, 0, N - 1.001), fy = clamp(y / CELL - 0.5, 0, N - 1.001);
  const ix = Math.floor(fx), iy = Math.floor(fy), tx = fx - ix, ty = fy - iy;
  const a = t.elev[iy * N + ix], b = t.elev[iy * N + ix + 1], c = t.elev[(iy + 1) * N + ix], d = t.elev[(iy + 1) * N + ix + 1];
  return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
}
export const cellOf = (x: number, y: number) => idx(clamp(Math.floor(x / CELL), 0, N - 1), clamp(Math.floor(y / CELL), 0, N - 1));
export const cellCenter = (c: number): [number, number] => [(c % N + 0.5) * CELL, (((c / N) | 0) + 0.5) * CELL];
export const riverWidth = (q: number) => 1.2 + 2.8 * Math.sqrt(q);   // metres, from discharge
export const RIVER_Q = 0.10, CREEK_Q = 0.018;
