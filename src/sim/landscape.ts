import { Noise, clamp, smooth } from './noise';
import { N, CELL, idx, Terrain, RIVER_Q, CREEK_Q } from './terrain';
import { Geology } from './geology';

export const enum Sed { Bedrock = 0, Residual = 1, Colluvium = 2, Alluvium = 3, Till = 4, MarineSand = 5, Beach = 6, Peat = 7, Lacustrine = 8 }
export const enum Veg { Barren = 0, Alpine = 1, Conifer = 2, Mixed = 3, Broadleaf = 4, Grass = 5, Shrub = 6, Wetland = 7, Heath = 8, DuneScrub = 9 }
export const SED_NAMES = ['Bedrock outcrop', 'Residual soil', 'Colluvium', 'Alluvium', 'Glacial till', 'Marine sand', 'Beach sand', 'Peat', 'Lake clay'];
export const VEG_NAMES = ['Barren rock', 'Alpine meadow', 'Conifer forest', 'Mixed woodland', 'Broadleaf forest', 'Grassland', 'Shrubland', 'Wetland', 'Heath and moor', 'Dune scrub'];

export interface Landscape {
  sediment: Uint8Array; soilDepth: Float32Array; soilPH: Float32Array; soilMoist: Float32Array;
  mineral: Float32Array;   // detector ground mineralisation 0..1
  salinity: Float32Array; veg: Uint8Array; wetland: Uint8Array; erosion: Float32Array; agri: Float32Array;
  traverse: Float32Array;  // movement cost multiplier; Infinity = impassable
  floodplain: Uint8Array;
}

export function generateLandscape(seed: string, T: Terrain, G: Geology): Landscape {
  const nz = new Noise(seed + '|land');
  const M = N * N;
  const L: Landscape = {
    sediment: new Uint8Array(M), soilDepth: new Float32Array(M), soilPH: new Float32Array(M), soilMoist: new Float32Array(M), mineral: new Float32Array(M),
    salinity: new Float32Array(M), veg: new Uint8Array(M), wetland: new Uint8Array(M), erosion: new Float32Array(M), agri: new Float32Array(M), traverse: new Float32Array(M), floodplain: new Uint8Array(M),
  };
  // floodplain: low, flat cells beside rivers
  for (let c = 0; c < M; c++) {
    if (T.sea[c] || T.Q[c] < CREEK_Q) continue;
    const reach = T.Q[c] > RIVER_Q ? 2 : 1;
    const x0 = c % N, y0 = (c / N) | 0;
    for (let dy = -reach; dy <= reach; dy++) for (let dx = -reach; dx <= reach; dx++) {
      const x = x0 + dx, y = y0 + dy; if (x < 0 || y < 0 || x >= N || y >= N) continue; const i = idx(x, y);
      if (!T.sea[i] && T.slope[i] < 7 && T.elev[i] - T.elev[c] < 12 + 8 * reach) L.floodplain[i] = 1;
    }
  }
  const treeLine = (T0: number) => T0 < 1;
  for (let c = 0; c < M; c++) {
    const x = c % N, y = (c / N) | 0; const f = G.formations[G.formationOf[c]]; const slope = T.slope[c];
    const n1 = nz.fbm(x * 0.08, y * 0.08, 3);
    // erosion (stream power with rock resistance)
    const q = Math.sqrt(Math.max(0, T.Q[c]) + 0.01);
    L.erosion[c] = clamp((Math.pow(slope, 1.1) * 0.035 + q * 0.04) * (1.15 - f.hardness), 0, 1);
    // wetness
    const dep = T.filled[c] - T.elev[c];
    const wet = clamp(T.precip[c] / 1500 + Math.log10(1 + T.upstream[c]) / 3.2 - slope / 25 + (dep > 0.3 ? 0.25 : 0), 0, 1.5);
    L.soilMoist[c] = clamp(wet / 1.2, 0, 1);
    // sediment type
    let sed = Sed.Residual; const coastal = T.coastDist[c] <= CELL * 1.6 && T.elev[c] < 22;
    if (T.sea[c]) sed = Sed.MarineSand;
    else if (T.lake[c] >= 0) sed = Sed.Lacustrine;
    else if (coastal && slope < 6) sed = Sed.Beach;
    else if (L.floodplain[c] && slope < 5) sed = Sed.Alluvium;
    else if (G.glacialLimit > 0 && T.elev[c] < G.glacialLimit && slope < 22) sed = Sed.Till;
    else if (wet > 1.05 && slope < 3 && T.temp[c] < 14) sed = Sed.Peat;
    else if (slope > 28 || (slope > 18 && f.hardness > 0.8 && n1 > 0)) sed = Sed.Bedrock;
    else if (slope > 14) sed = Sed.Colluvium;
    if (f.tags.includes('unconsolidated') && sed === Sed.Residual) sed = Sed.MarineSand;
    L.sediment[c] = sed;
    // depth
    let depth = 0.4 + (1 - f.hardness) * 1.4 - slope * 0.035 + n1 * 0.2;
    switch (sed) { case Sed.Bedrock: depth = 0.05; break; case Sed.Alluvium: depth = 3 + n1; break; case Sed.Till: depth = 5 + 3 * n1; break; case Sed.Beach: depth = 8; break; case Sed.MarineSand: depth = 6; break; case Sed.Peat: depth = 1.5; break; case Sed.Colluvium: depth = Math.max(0.5, depth + 0.6); break; }
    L.soilDepth[c] = Math.max(0.03, depth);
    // chemistry
    L.salinity[c] = clamp((T.coastDist[c] < 1200 ? 0.55 - T.coastDist[c] / 2400 : 0) + (f.tags.includes('evaporite') ? 0.45 : 0) + (T.precip[c] < 400 ? 0.15 : 0) + (sed === Sed.Beach ? 0.2 : 0), 0, 1);
    L.soilPH[c] = clamp(6.3 + f.ph * 1.1 - Math.max(0, T.precip[c] - 900) / 900 + (sed === Sed.Peat ? -1.3 : 0) + (sed === Sed.Beach ? 1.3 : 0) + n1 * 0.4, 3.6, 8.6);
    // mineralisation (what the detector sees as ground noise)
    const lat = T.temp[c] > 13 && T.precip[c] > 1200 ? 0.14 : 0;
    L.mineral[c] = clamp(0.06 + f.magnetism * 0.5 + (f.tags.includes('bif') ? 0.3 : 0) + lat + L.salinity[c] * 0.3 * (0.4 + L.soilMoist[c]) + (sed === Sed.Beach ? 0.1 : 0) + 0.08 * n1, 0.02, 1);
    L.wetland[c] = (!T.sea[c] && T.lake[c] < 0 && slope < 2.5 && (wet > 1.0 || (dep > 0.3 && T.precip[c] > 450)) ) ? 1 : 0;
    // vegetation
    const tmp = T.temp[c], pr = T.precip[c], ph = L.soilPH[c];
    let v: Veg;
    if (T.sea[c] || T.lake[c] >= 0) v = Veg.Barren;
    else if (sed === Sed.Bedrock && slope > 30) v = Veg.Barren;
    else if (tmp < -1 || treeLine(tmp - n1 * 2)) v = tmp < -3 ? Veg.Barren : Veg.Alpine;
    else if (L.wetland[c]) v = Veg.Wetland;
    else if (sed === Sed.Beach) v = Veg.DuneScrub;
    else if (pr < 320) v = Veg.Shrub;
    else if (pr < 650) v = (L.soilMoist[c] > 0.5 || n1 > 0.15) ? Veg.Shrub : Veg.Grass;
    else if (tmp < 7.5 && pr > 1100 && slope < 12 && f.hardness > 0.7 && n1 > 0.1) v = Veg.Heath;
    else if (tmp < 7 || ph < 5.2 || sed === Sed.MarineSand) v = Veg.Conifer;
    else if (tmp > 11 && ph > 5.4 && pr > 800) v = Veg.Broadleaf;
    else if (pr > 700 && n1 > -0.05) v = Veg.Mixed;
    else v = Veg.Grass;
    if ((v === Veg.Conifer || v === Veg.Mixed || v === Veg.Broadleaf) && pr < 800 && n1 < -0.1) v = Veg.Grass;
    L.veg[c] = v;
    // agricultural suitability
    const grow = clamp((tmp - 3) / 9, 0, 1) * (tmp > 26 ? 0.5 : 1);
    const water = clamp(pr / 700, 0, 1) * (pr > 2000 ? 0.6 : 1);
    let ag = grow * water * clamp(1 - slope / 14, 0, 1) * clamp(L.soilDepth[c] / 1.0, 0.1, 1) * (ph < 4.8 || ph > 8.2 ? 0.55 : 1) * (1 - L.salinity[c] * 0.8);
    if (sed === Sed.Alluvium) ag *= 1.35; if (sed === Sed.Peat || sed === Sed.Bedrock || sed === Sed.Beach || L.wetland[c]) ag *= 0.15;
    if (T.sea[c] || T.lake[c] >= 0) ag = 0;
    L.agri[c] = clamp(ag, 0, 1);
    // traversal
    let cost = 1 + Math.pow(slope / 11, 2);
    if (v === Veg.Conifer || v === Veg.Mixed || v === Veg.Broadleaf) cost *= 1.45;
    if (L.wetland[c]) cost *= 3; if (v === Veg.Heath) cost *= 1.3; if (v === Veg.Shrub) cost *= 1.1;
    if (T.Q[c] > RIVER_Q * 2.2) cost *= 5;  // wide river: crossing needs a ford or bridge
    if (slope > 36) cost = Infinity;
    if (T.sea[c] || T.lake[c] >= 0) cost = Infinity;
    L.traverse[c] = cost;
  }
  return L;
}
export { smooth };
