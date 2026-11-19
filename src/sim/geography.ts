import { Rng, stream } from './rng';
import { N, CELL, DX, DY, idx, inb, Terrain, RIVER_Q, CREEK_Q, cellCenter } from './terrain';
import { Landscape, Veg } from './landscape';
import { Namer, Culture } from './names';

export type FeatureKind = 'river' | 'creek' | 'lake' | 'peak' | 'range' | 'bay' | 'headland' | 'forest' | 'valley' | 'island' | 'plateau' | 'marsh';
export interface GeoFeature { id: string; kind: FeatureKind; name: string; x: number; y: number; cells: number[]; size: number; }
export interface River { id: string; name: string; path: number[]; mouth: number; q: number; }
export interface Geography { features: GeoFeature[]; rivers: River[]; seaAccessCells: number[]; }

export function nameGeography(seed: string, T: Terrain, L: Landscape, culture: Culture): Geography {
  const namer = new Namer(culture, stream(seed, 'geography'));
  const r = stream(seed, 'geofeat');
  const features: GeoFeature[] = []; const rivers: River[] = [];
  const add = (kind: FeatureKind, name: string, cells: number[], size = cells.length) => {
    const mx = cells.reduce((a, c) => a + cellCenter(c)[0], 0) / cells.length, my = cells.reduce((a, c) => a + cellCenter(c)[1], 0) / cells.length;
    features.push({ id: `G${features.length + 1}`, kind, name, x: mx, y: my, cells, size });
  };
  // rivers: trace main stems upstream from each mouth
  const parent = new Int32Array(N * N).fill(-1); const parentQ = new Float32Array(N * N);
  for (let c = 0; c < N * N; c++) {
    const d = T.flow[c]; if (d < 0 || T.sea[c]) continue; const x = (c % N) + DX[d], y = ((c / N) | 0) + DY[d]; if (!inb(x, y)) continue;
    const ni = idx(x, y); if (T.Q[c] > parentQ[ni]) { parentQ[ni] = T.Q[c]; parent[ni] = c; }
  }
  const mouths: number[] = [];
  for (let c = 0; c < N * N; c++) {
    if (T.sea[c] || T.Q[c] < RIVER_Q) continue; const d = T.flow[c];
    let isMouth = d === -2;
    if (d >= 0) { const x = (c % N) + DX[d], y = ((c / N) | 0) + DY[d]; if (inb(x, y) && (T.sea[idx(x, y)])) isMouth = true; if (inb(x, y) && T.lake[idx(x, y)] >= 0 && T.lake[c] < 0 && T.Q[c] > RIVER_Q * 3) isMouth = true; }
    if (isMouth) mouths.push(c);
  }
  mouths.sort((a, b) => T.Q[b] - T.Q[a]);
  for (const m of mouths.slice(0, 14)) {
    const path: number[] = []; let c = m;
    while (c >= 0 && T.Q[c] >= CREEK_Q) { path.push(c); c = parent[c]; }
    if (path.length < 5) continue;
    const name = namer.river(); rivers.push({ id: `R${rivers.length + 1}`, name, path, mouth: m, q: T.Q[m] });
    add('river', name, path);
  }
  // lakes
  for (const L2 of T.lakes) if (L2.cells.length >= 4) { L2.name = namer.lake(); add('lake', L2.name, L2.cells); }
  // peaks: strict local maxima with prominence
  const peaks: number[] = [];
  for (let y = 3; y < N - 3; y++) for (let x = 3; x < N - 3; x++) {
    const c = idx(x, y); const e = T.elev[c]; if (e < 500 || T.sea[c]) continue;
    let ok = true; for (let dy = -4; dy <= 4 && ok; dy++) for (let dx = -4; dx <= 4; dx++) if ((dx || dy) && T.elev[idx(Math.max(0, Math.min(N - 1, x + dx)), Math.max(0, Math.min(N - 1, y + dy)))] > e) { ok = false; break; }
    if (ok) peaks.push(c);
  }
  peaks.sort((a, b) => T.elev[b] - T.elev[a]);
  const usedPeaks: number[] = [];
  for (const p of peaks) { if (usedPeaks.length >= 9) break; if (usedPeaks.some(u => Math.hypot((u % N) - (p % N), ((u / N) | 0) - ((p / N) | 0)) < 10)) continue; usedPeaks.push(p); add('peak', namer.peak(), [p]); }
  // ranges: group high ground
  const high = new Uint8Array(N * N); const hs = Array.from(T.elev).filter(e => e > 0).sort((a, b) => a - b); const thr = hs[Math.floor(hs.length * 0.86)] ?? 600;
  for (let c = 0; c < N * N; c++) if (T.elev[c] > thr) high[c] = 1;
  const seen = new Uint8Array(N * N);
  for (let c = 0; c < N * N; c++) {
    if (!high[c] || seen[c]) continue; const comp = [c]; seen[c] = 1;
    for (let h = 0; h < comp.length; h++) { const cx = comp[h] % N, cy = (comp[h] / N) | 0; for (let k = 0; k < 8; k++) { const nx = cx + DX[k], ny = cy + DY[k]; if (inb(nx, ny) && high[idx(nx, ny)] && !seen[idx(nx, ny)]) { seen[idx(nx, ny)] = 1; comp.push(idx(nx, ny)); } } }
    if (comp.length > 80) add('range', namer.range(), comp);
  }
  // bays and headlands: sample coast points by how enclosed they are
  const coast: number[] = [];
  for (let c = 0; c < N * N; c++) if (!T.sea[c]) { const cx = c % N, cy = (c / N) | 0; for (let k = 0; k < 8; k++) { const nx = cx + DX[k], ny = cy + DY[k]; if (inb(nx, ny) && T.sea[idx(nx, ny)]) { coast.push(c); break; } } }
  const enclosure = (c: number, seaCells: boolean) => { let n = 0, tot = 0; const cx = c % N, cy = (c / N) | 0; for (let dy = -7; dy <= 7; dy++) for (let dx = -7; dx <= 7; dx++) { const x = cx + dx, y = cy + dy; if (!inb(x, y)) continue; tot++; if ((T.sea[idx(x, y)] === 1) === seaCells) n++; } return n / tot; };
  const seaAccess: number[] = coast.slice();
  const bayC = coast.map(c => ({ c, v: enclosure(c, false) })).sort((a, b) => b.v - a.v);
  const headC = coast.map(c => ({ c, v: enclosure(c, true) })).sort((a, b) => b.v - a.v);
  const pickSpread = (list: Array<{ c: number }>, n: number, minD: number) => { const out: number[] = []; for (const { c } of list) { if (out.length >= n) break; if (out.every(o => Math.hypot((o % N) - (c % N), ((o / N) | 0) - ((c / N) | 0)) > minD)) out.push(c); } return out; };
  for (const c of pickSpread(bayC, 4, 20)) add('bay', namer.bay(), [c]);
  for (const c of pickSpread(headC, 3, 22)) add('headland', `${namer.stem(2)} Head`, [c]);
  // forests
  const fseen = new Uint8Array(N * N);
  for (let c = 0; c < N * N; c++) {
    const v = L.veg[c]; if (fseen[c] || !(v === Veg.Conifer || v === Veg.Mixed || v === Veg.Broadleaf)) continue; const comp = [c]; fseen[c] = 1;
    for (let h = 0; h < comp.length; h++) { const cx = comp[h] % N, cy = (comp[h] / N) | 0; for (let k = 0; k < 8; k += 2) { const nx = cx + DX[k], ny = cy + DY[k]; if (!inb(nx, ny)) continue; const vi = L.veg[idx(nx, ny)]; if (!fseen[idx(nx, ny)] && (vi === Veg.Conifer || vi === Veg.Mixed || vi === Veg.Broadleaf)) { fseen[idx(nx, ny)] = 1; comp.push(idx(nx, ny)); } } }
    if (comp.length > 150) add('forest', namer.wood(), comp);
  }
  // marshes
  const mseen = new Uint8Array(N * N);
  for (let c = 0; c < N * N; c++) {
    if (!L.wetland[c] || mseen[c]) continue; const comp = [c]; mseen[c] = 1;
    for (let h = 0; h < comp.length; h++) { const cx = comp[h] % N, cy = (comp[h] / N) | 0; for (let k = 0; k < 8; k++) { const nx = cx + DX[k], ny = cy + DY[k]; if (inb(nx, ny) && L.wetland[idx(nx, ny)] && !mseen[idx(nx, ny)]) { mseen[idx(nx, ny)] = 1; comp.push(idx(nx, ny)); } } }
    if (comp.length > 14) add('marsh', `${namer.stem(2)} ${r.pick(['Fen', 'Marsh', 'Carr', 'Slough'])}`, comp);
  }
  return { features, rivers, seaAccessCells: seaAccess };
}
