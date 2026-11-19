import { Rng, stream } from './rng';
import { Noise, clamp } from './noise';
import { N, CELL, DX, DY, idx, inb, Terrain } from './terrain';
import { Namer, Culture } from './names';
import type { DepEnv } from './fossils';

export type RockClass = 'igneous' | 'sedimentary' | 'metamorphic';
export interface Formation {
  id: number; name: string; rock: string; cls: RockClass; ageMa: number; env?: DepEnv;
  process: string; accessory: string[]; hardness: number; // 0..1 erosion resistance
  ph: number; magnetism: number; fossiliferous: boolean; terrane: Terrane; hex: string; tags: string[];
  intrudes?: number; plutonId?: number; carbonate?: boolean;
}
export interface Province { id: number; name: string; terrane: Terrane; cx: number; cy: number; formations: number[]; trend: number; bandW: number; layered: boolean; ageSpan: [number, number]; }
export interface Pluton { id: number; cx: number; cy: number; a: number; b: number; ang: number; formation: number; aureole: number; province: number; ageMa: number; rock: string; }
export interface Fault { id: number; name: string; pts: Array<[number, number]>; kind: 'thrust' | 'strike-slip' | 'normal'; ageMa: number; }
export type Terrane = 'shield' | 'foldbelt' | 'arc' | 'marine_basin' | 'terrestrial_basin' | 'coastal_plain';

export interface Geology {
  formations: Formation[]; provinces: Province[]; plutons: Pluton[]; faults: Fault[];
  formationOf: Uint16Array; provinceOf: Uint8Array; plutonOf: Int16Array; plutonR: Float32Array; faultDist: Float32Array; faultOf: Int16Array;
  glacialLimit: number; // elevation below which till covers (if glaciated)
}

interface Tpl { key: string; rock: string; cls: RockClass; process: string; accessory: string[]; hard: number; ph: number; mag: number; fossil: boolean; hex: string; tags: string[]; envs?: DepEnv[]; carbonate?: boolean; suffix: string; }
const T = (key: string, rock: string, cls: RockClass, suffix: string, process: string, accessory: string[], hard: number, ph: number, mag: number, fossil: boolean, hex: string, tags: string[], envs?: DepEnv[], carbonate = false): Tpl =>
  ({ key, rock, cls, suffix, process, accessory, hard, ph, mag, fossil, hex, tags, envs, carbonate });
export const TPL: Record<string, Tpl> = Object.fromEntries([
  T('gneiss','gneiss','metamorphic','Gneiss','High-grade regional metamorphism of older granite and sediment at depth during mountain building',['quartz','microcline','biotite','garnet'],0.92,-0.3,0.2,false,'#b9a7a0',['metamorphic','basement']),
  T('greenstone','greenstone','metamorphic','Greenstone Belt','Metamorphosed submarine basalt and volcanic sediment of an ancient volcanic arc',['chlorite','epidote','quartz','pyrite'],0.8,0.1,0.35,false,'#6f8f6a',['metamorphic','greenstone','mafic-volc','metavolcanic']),
  T('bif','banded iron formation','sedimentary','Iron Formation','Iron and silica laid down on an ancient sea floor when oxygen first built up in the oceans',['hematite','magnetite','jasper','chert','quartz'],0.9,-0.2,0.95,false,'#8c4a3a',['bif','marine','chemical']),
  T('quartzite','quartzite','metamorphic','Quartzite','Sandstone recrystallised into a hard quartz rock by metamorphism',['quartz','muscovite'],0.97,-0.4,0,false,'#d9d2c4',['metamorphic','metased']),
  T('schist','schist','metamorphic','Schist','Mudstone metamorphosed at medium grade so that mica aligns into a glittering fabric',['muscovite','quartz','garnet','biotite'],0.62,-0.2,0.1,false,'#8d8a7e',['metamorphic','metased']),
  T('slate','slate','metamorphic','Slate','Shale squeezed and mildly heated so it splits along fine cleavage',['quartz','chlorite','pyrite'],0.6,0,0.05,false,'#575d63',['metamorphic','metased']),
  T('marble','marble','metamorphic','Marble','Limestone recrystallised by heat and pressure',['calcite','dolomite'],0.45,0.6,0,false,'#e6e2d8',['metamorphic','carbonate'],undefined,true),
  T('greywacke','greywacke','sedimentary','Greywacke','Sand and mud shed by submarine landslides into a deep marine trough',['quartz','chlorite','plagioclase'],0.75,0,0.1,true,'#7a7e7b',['marine','clastic'],['marine_deep']),
  T('limestone','limestone','sedimentary','Limestone','Lime mud and shell debris deposited in a warm shallow sea',['calcite','dolomite','chert'],0.4,0.7,0,true,'#c9c2a8',['marine','carbonate','host-mvt'],['marine_shallow','reef'],true),
  T('dolostone','dolostone','sedimentary','Dolostone','Limestone altered by magnesium-rich brines after burial',['dolomite','calcite','chert'],0.5,0.6,0,true,'#c4b7a0',['marine','carbonate','host-mvt'],['marine_shallow'],true),
  T('sandstone','sandstone','sedimentary','Sandstone','Sand carried by rivers, wind or waves and cemented after burial',['quartz','microcline','muscovite'],0.6,-0.2,0.05,true,'#c79a6a',['clastic'],['fluvial','aeolian','marine_shallow']),
  T('shale','shale','sedimentary','Shale','Fine mud settled in still water and compacted',['quartz','pyrite','calcite'],0.3,0,0.05,true,'#6d6a65',['clastic'],['marine_deep','lacustrine']),
  T('conglomerate','conglomerate','sedimentary','Conglomerate','Gravel laid down by fast-flowing rivers and cemented',['quartz','chert','jasper'],0.7,-0.1,0.05,true,'#9b7f62',['clastic','terrestrial'],['fluvial']),
  T('coalmeasures','coal measures','sedimentary','Coal Measures','Layered sandstone, shale and coal laid down in lowland swamps',['coal','pyrite'],0.28,-0.5,0,true,'#4a4a45',['clastic','coal','terrestrial'],['swamp']),
  T('evaporite','evaporite (gypsum and salt)','sedimentary','Evaporite','Seawater evaporated in a restricted, arid basin leaving gypsum and salt',['gypsum','halite','calcite'],0.15,0.4,0,false,'#e7dfcf',['evaporite','marine','chemical'],['marine_shallow']),
  T('granite','granite','igneous','Granite','Silica-rich magma that cooled slowly in a deep intrusion',['quartz','microcline','plagioclase','biotite','muscovite'],0.88,-0.6,0.1,false,'#d4b3a6',['plutonic','granitic']),
  T('granodiorite','granodiorite','igneous','Granodiorite','Intermediate magma that cooled slowly at depth',['quartz','plagioclase','biotite','epidote'],0.86,-0.3,0.15,false,'#a9a7a4',['plutonic','granitic']),
  T('diorite','diorite','igneous','Diorite','Intermediate magma crystallised in a small stock beneath a volcano',['plagioclase','chlorite','epidote','pyrite'],0.84,0,0.25,false,'#85888a',['plutonic','dioritic']),
  T('andesite','andesite','igneous','Andesite','Lava and ash erupted from arc volcanoes above a subduction zone',['plagioclase','chlorite','epidote'],0.7,0.1,0.25,false,'#7e7a73',['volcanic','felsic-volc','intermediate-volc']),
  T('rhyolite','rhyolite','igneous','Rhyolite','Sticky silica-rich lava, ash flows and domes',['quartz','microcline','chalcedony'],0.75,-0.2,0.05,false,'#b79a8e',['volcanic','felsic-volc']),
  T('tuff','volcanic tuff','igneous','Tuff','Ash that fell or flowed from explosive eruptions and welded',['quartz','zeolite','chlorite'],0.35,0,0.05,false,'#c3b49c',['volcanic','felsic-volc','ash'],['volcaniclastic']),
  T('basalt','basalt','igneous','Basalt','Fluid iron-rich lava that flooded the surface and cooled quickly, trapping gas bubbles',['plagioclase','zeolite','calcite','agate'],0.8,0.3,0.4,false,'#4a4d52',['volcanic','mafic-volc','basalt']),
  T('riftbasalt','rift basalt','igneous','Basalt','Flood basalt erupted in a failed continental rift',['plagioclase','zeolite','calcite','epidote'],0.82,0.3,0.4,false,'#46494e',['volcanic','mafic-volc','basalt']),
  T('sand','sand and gravel','sedimentary','Sands','Loose marine and beach sand and gravel deposited as the sea retreated',['quartz','garnet','magnetite'],0.08,-0.1,0.1,true,'#d9c9a0',['unconsolidated','marine','clastic'],['marine_shallow','estuarine']),
  T('clay','marl and clay','sedimentary','Clays','Soft marine mud, marl and clay deposited in a shallow shelf sea',['calcite','gypsum','pyrite'],0.1,0.3,0,true,'#a89f87',['unconsolidated','marine','clastic'],['marine_shallow','estuarine']),
  T('lignite','lignite and clay','sedimentary','Lignite Beds','Peat and clay from coastal swamps buried and slightly compacted',['coal','amber','gypsum'],0.1,-0.6,0,true,'#6b5e4a',['unconsolidated','coal','terrestrial'],['swamp']),
  T('hornfels','hornfels','metamorphic','Hornfels','Rock baked hard by contact with a hot intrusion',['biotite','quartz','epidote'],0.95,0,0.3,false,'#4b4b4c',['metamorphic','contact']),
  T('skarn','skarn','metamorphic','Skarn','Limestone replaced by lime-silicate minerals where a hot intrusion released metal-bearing fluids',['garnet','epidote','calcite','magnetite'],0.8,0.2,0.5,false,'#7d5f4d',['metamorphic','contact','skarn','carbonate']),
].map(t => [t.key, t])) as any;

interface TerraneDef { stack: string[]; ageSpan: [number, number]; layered: boolean; intrusion?: string; label: string; }
const TERRANES: Record<Terrane, TerraneDef> = {
  shield: { stack: ['gneiss','greenstone','bif','quartzite','riftbasalt'], ageSpan: [2800, 1100], layered: false, intrusion: 'granite', label: 'Shield' },
  foldbelt: { stack: ['slate','schist','greywacke','limestone','quartzite','greenstone'], ageSpan: [540, 340], layered: false, intrusion: 'granodiorite', label: 'Fold Belt' },
  arc: { stack: ['andesite','rhyolite','tuff','andesite','sandstone'], ageSpan: [150, 20], layered: false, intrusion: 'diorite', label: 'Volcanic Arc' },
  marine_basin: { stack: ['sandstone','shale','limestone','dolostone','evaporite','coalmeasures','limestone'], ageSpan: [480, 100], layered: true, label: 'Marine Basin' },
  terrestrial_basin: { stack: ['conglomerate','sandstone','shale','coalmeasures','tuff','sandstone'], ageSpan: [210, 35], layered: true, label: 'Terrestrial Basin' },
  coastal_plain: { stack: ['sand','clay','lignite','sand'], ageSpan: [34, 3], layered: true, label: 'Coastal Plain' },
};

const AGE_WIN: Record<string, number[]> = { gneiss: [2800, 1800], greenstone: [2800, 400], bif: [2500, 1800], riftbasalt: [1800, 1100], quartzite: [2000, 400], coalmeasures: [359, 299], evaporite: [299, 160], conglomerate: [250, 35], tuff: [250, 20], lignite: [56, 10], sand: [34, 3], clay: [34, 3], dolostone: [540, 200] };
const MOUNTAIN_TERRANES: Terrane[] = ['shield', 'foldbelt', 'arc'];

export function generateGeology(seed: string, T: Terrain, culture: Culture): Geology {
  const r = stream(seed, 'geology');
  const nz = new Noise(seed + '|geo');
  const namer = new Namer(culture, stream(seed, 'geonames'));
  const formations: Formation[] = [];

  // ---- provinces: warped Voronoi cells, typed by elevation so geology and relief agree
  const nProv = r.int(4, 7);
  const seeds: Array<{ x: number; y: number }> = [];
  for (let tries = 0; seeds.length < nProv && tries < 400; tries++) {
    const x = r.float(0.05, 0.95) * N, y = r.float(0.05, 0.95) * N;
    if (T.sea[idx(Math.floor(x), Math.floor(y))] && r.chance(0.8)) continue;
    if (seeds.every(s => Math.hypot(s.x - x, s.y - y) > N * 0.18)) seeds.push({ x, y });
  }
  const provinceOf = new Uint8Array(N * N);
  const meanE = new Array(seeds.length).fill(0), cnt = new Array(seeds.length).fill(0);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const wx = x + nz.fbm(x * 0.02, y * 0.02, 3) * 24, wy = y + nz.fbm(x * 0.02 + 50, y * 0.02, 3) * 24;
    let b = 0, bd = 1e9;
    for (let s = 0; s < seeds.length; s++) { const d = Math.hypot(seeds[s].x - wx, seeds[s].y - wy); if (d < bd) { bd = d; b = s; } }
    provinceOf[idx(x, y)] = b; meanE[b] += T.elev[idx(x, y)]; cnt[b]++;
  }
  const rank = seeds.map((_, i) => i).sort((a, b) => (meanE[b] / Math.max(1, cnt[b])) - (meanE[a] / Math.max(1, cnt[a])));
  const emph = T.traits.emphasis;
  const provinces: Province[] = [];
  const assigned: Terrane[] = new Array(seeds.length);
  rank.forEach((p, k) => {
    const frac = k / Math.max(1, seeds.length - 1);
    let w: Record<Terrane, number>;
    if (frac < 0.4) w = { shield: emph === 'mining' ? 3 : 1.4, foldbelt: 2.5, arc: 0.4 + T.traits.volcanic * 3, marine_basin: 0.2, terrestrial_basin: 0.1, coastal_plain: 0 };
    else if (frac < 0.75) w = { shield: 0.4, foldbelt: emph === 'mining' ? 2.5 : 1, arc: 0.3 + T.traits.volcanic * 1.5, marine_basin: emph === 'fossil' ? 3 : 1.6, terrestrial_basin: emph === 'fossil' ? 3 : 1.4, coastal_plain: 0.2 };
    else w = { shield: 0.05, foldbelt: 0.2, arc: 0.1, marine_basin: emph === 'fossil' ? 3 : 1.5, terrestrial_basin: emph === 'fossil' ? 2.5 : 1.2, coastal_plain: 2 };
    const used = new Set(assigned.filter(Boolean));
    for (const k2 of Object.keys(w) as Terrane[]) if (used.has(k2)) w[k2] *= 0.55; // diversity
    const keys = Object.keys(w) as Terrane[];
    assigned[p] = r.weighted(keys, k2 => w[k2])!;
  });
  // coastal plain only makes sense near the sea
  for (let p = 0; p < seeds.length; p++) {
    if (assigned[p] === 'coastal_plain') {
      let near = 0, n = 0;
      for (let i = 0; i < N * N; i++) if (provinceOf[i] === p) { n++; if (T.coastDist[i] < 12000) near++; }
      if (near < n * 0.4) assigned[p] = 'marine_basin';
    }
  }

  // ---- formation instances per province
  const mkFormation = (key: string, ageMa: number, terrane: Terrane, extra: Partial<Formation> = {}): Formation => {
    const t = TPL[key];
    const nm = namer.unique(() => `${namer.stem(r.int(1, 2))} ${t.suffix}`);
    const env = t.envs ? r.pick(t.envs) : undefined;
    const f: Formation = {
      id: formations.length, name: nm, rock: t.rock, cls: t.cls, ageMa: Math.round(ageMa * 10) / 10, env, process: t.process,
      accessory: t.accessory, hardness: t.hard, ph: t.ph, magnetism: t.mag, fossiliferous: t.fossil && ageMa < 2500 && t.cls === 'sedimentary',
      terrane, hex: t.hex, tags: [...t.tags], carbonate: t.carbonate, ...extra,
    };
    formations.push(f); return f;
  };
  for (let p = 0; p < seeds.length; p++) {
    const terr = assigned[p], def = TERRANES[terr];
    const ids: number[] = [];
    let stack = def.stack.slice();
    // shield and foldbelt: drop a unit or two so provinces differ
    if (!def.layered) { r.shuffle(stack); stack = stack.slice(0, r.int(3, Math.min(5, stack.length))); }
    const [a0, a1] = def.ageSpan;
    // required units so that deposit models have hosts in a reasonable share of worlds
    if (terr === 'shield' && !stack.includes('greenstone') && r.chance(0.7)) stack.push('greenstone');
    if (terr === 'arc' && !stack.includes('rhyolite')) stack.push('rhyolite');
    const n = stack.length;
    const ages = stack.map(key => {
      const w = AGE_WIN[key] ?? def.ageSpan; const span = def.ageSpan;
      let lo = Math.max(Math.min(...w), Math.min(...span)), hi = Math.min(Math.max(...w), Math.max(...span));
      if (lo > hi) { lo = Math.min(...w); hi = Math.max(...w); }
      return r.float(lo, hi);
    });
    // stratigraphic order: youngest first (the top of a layered stack)
    const orderIdx = stack.map((_, i) => i).sort((a, b) => ages[a] - ages[b]);
    const stackSorted = orderIdx.map(i => stack[i]), agesSorted = orderIdx.map(i => ages[i]);
    stackSorted.forEach((key, i) => { ids.push(mkFormation(key, agesSorted[i], terr).id); });
    // shield: BIF must be older than the greenstone it sits in? Both Archaean-Proterozoic; fine.
    const trend = r.float(0, Math.PI);
    provinces.push({ id: p, name: `${namer.stem(2)} ${def.label}`, terrane: terr, cx: seeds[p].x, cy: seeds[p].y, formations: ids, trend, bandW: r.float(14, 30), layered: def.layered, ageSpan: def.ageSpan });
  }

  // ---- assign bedrock formation per cell
  const formationOf = new Uint16Array(N * N);
  const elevRank = new Float32Array(N * N);
  for (const P of provinces) {
    const cells: number[] = [];
    for (let i = 0; i < N * N; i++) if (provinceOf[i] === P.id) cells.push(i);
    if (P.layered) {
      const val = cells.map(c => T.elev[c] + 60 * nz.fbm((c % N) * 0.05, ((c / N) | 0) * 0.05, 3) * (0.5 + T.traits.relief));
      const order = cells.map((_, k) => k).sort((a, b) => val[a] - val[b]);
      order.forEach((k, rnk) => { elevRank[cells[k]] = rnk / cells.length; });
      const m = P.formations.length;
      // formations are listed youngest-first; the highest ground is the youngest layer
      for (const c of cells) formationOf[c] = P.formations[clamp(m - 1 - Math.floor(elevRank[c] * m), 0, m - 1)];
    } else {
      const ct = Math.cos(P.trend), st = Math.sin(P.trend);
      const m = P.formations.length;
      // band pattern with repeats so units outcrop in several belts
      const pattern: number[] = []; for (let k = 0; k < m * 2; k++) pattern.push(k % m);
      for (let k = pattern.length - 1; k > 0; k--) { const j = Math.floor(hashf(P.id, k) * (k + 1)); [pattern[k], pattern[j]] = [pattern[j], pattern[k]]; }
      for (const c of cells) {
        const x = c % N, y = (c / N) | 0;
        const u = (x * ct + y * st) / P.bandW + nz.fbm(x * 0.03 + P.id * 9, y * 0.03, 3) * 1.6;
        const band = ((Math.floor(u) % pattern.length) + pattern.length) % pattern.length;
        formationOf[c] = P.formations[pattern[band]];
      }
    }
  }
  // volcanic-trait worlds get a Cenozoic basalt flow field capping lowlands
  const hasBasalt = formations.some(f => f.tags.includes('basalt'));
  if (T.traits.volcanic > 0.5 && r.chance(0.6)) {
    const prov = r.pick(provinces);
    const f = mkFormation('basalt', r.float(8, 30), prov.terrane);
    f.name = namer.unique(() => `${namer.stem(2)} Basalts`);
    const c0 = pickLandCell(r, T, provinceOf, prov.id);
    const [bx, by] = [c0 % N, (c0 / N) | 0]; const rad = r.float(7, 16), ang = r.float(0, Math.PI);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const dx = x - bx, dy = y - by; const u = dx * Math.cos(ang) + dy * Math.sin(ang), v = -dx * Math.sin(ang) + dy * Math.cos(ang);
      const d = Math.hypot(u / 1.8, v) + nz.fbm(x * 0.07, y * 0.07, 3) * 4;
      if (d < rad && !T.sea[idx(x, y)] && T.elev[idx(x, y)] < 900) formationOf[idx(x, y)] = f.id;
    }
  }
  void hasBasalt;

  // ---- intrusions
  const plutons: Pluton[] = [];
  const plutonOf = new Int16Array(N * N).fill(-1), plutonR = new Float32Array(N * N).fill(9);
  for (const P of provinces) {
    const def = TERRANES[P.terrane];
    if (!def.intrusion) continue;
    const hostMin = Math.min(...P.formations.map(id => formations[id].ageMa));
    const count = P.terrane === 'arc' ? r.int(1, 4) : r.int(0, 3);
    for (let k = 0; k < count; k++) {
      const c0 = pickLandCell(r, T, provinceOf, P.id, true); if (c0 < 0) continue;
      const age = P.terrane === 'arc' ? hostMin * r.float(0.85, 1.0) : hostMin * r.float(0.45, 0.92);
      const key = P.terrane === 'arc' ? 'diorite' : (r.chance(0.35) && P.terrane === 'foldbelt' ? 'granite' : def.intrusion);
      const f = mkFormation(key, age, P.terrane);
      const a = r.float(3, P.terrane === 'arc' ? 6 : 11), b = a * r.float(0.5, 1);
      const id = plutons.length; f.plutonId = id;
      f.name = namer.unique(() => `${namer.stem(2)} ${TPL[key].rock === 'diorite' ? 'Stock' : 'Pluton'}`);
      plutons.push({ id, cx: c0 % N, cy: (c0 / N) | 0, a, b, ang: r.float(0, Math.PI), formation: f.id, aureole: 1.3, province: P.id, ageMa: f.ageMa, rock: f.rock });
    }
  }
  for (const pl of plutons) {
    const ct = Math.cos(pl.ang), st = Math.sin(pl.ang);
    const hornfelsKey = formations.find(f => f.rock === 'hornfels' && f.intrudes === pl.id);
    let hornfels: Formation | undefined = hornfelsKey, skarn: Formation | undefined;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const i = idx(x, y); if (T.sea[i]) continue;
      const dx = x - pl.cx, dy = y - pl.cy;
      const u = dx * ct + dy * st, v = -dx * st + dy * ct;
      const rr = Math.hypot(u / pl.a, v / pl.b) + nz.fbm(x * 0.09 + pl.id * 7, y * 0.09, 3) * 0.28;
      if (rr < plutonR[i] || plutonOf[i] < 0) { if (rr < 1.35) { plutonR[i] = rr; plutonOf[i] = pl.id; } }
      if (rr < 1) { formationOf[i] = pl.formation; continue; }
      if (rr < pl.aureole) {
        const host = formations[formationOf[i]];
        if (host.intrudes !== undefined || host.cls === 'igneous' && host.tags.includes('plutonic')) continue;
        if (host.tags.includes('carbonate')) {
          if (!skarn) { skarn = mkFormation('skarn', pl.ageMa, formations[pl.formation].terrane, { intrudes: pl.id }); skarn.name = `${formations[pl.formation].name.replace(/ (Pluton|Stock)$/, '')} Skarn`; }
          formationOf[i] = skarn.id;
        } else if (host.cls !== 'metamorphic' || host.hardness < 0.9) {
          if (!hornfels) { hornfels = mkFormation('hornfels', pl.ageMa, formations[pl.formation].terrane, { intrudes: pl.id }); hornfels.name = `${formations[pl.formation].name.replace(/ (Pluton|Stock)$/, '')} Hornfels`; }
          formationOf[i] = hornfels.id;
        }
      }
    }
  }

  // ---- faults
  const faults: Fault[] = [];
  const nFaults = r.int(3, 8);
  for (let k = 0; k < nFaults; k++) {
    const p = r.pick(provinces); const c0 = pickLandCell(r, T, provinceOf, p.id); if (c0 < 0) continue;
    let x = (c0 % N) * CELL, y = ((c0 / N) | 0) * CELL; let ang = p.trend + r.float(-0.35, 0.35);
    const pts: Array<[number, number]> = [[x, y]]; const len = r.int(24, 90);
    for (let s = 0; s < len; s++) { ang += r.float(-0.12, 0.12); x += Math.cos(ang) * CELL * 0.6; y += Math.sin(ang) * CELL * 0.6; if (x < 0 || y < 0 || x > N * CELL || y > N * CELL) break; pts.push([x, y]); }
    // run the other way from the start too
    x = pts[0][0]; y = pts[0][1]; ang = p.trend + Math.PI + r.float(-0.2, 0.2);
    for (let s = 0; s < len / 2; s++) { ang += r.float(-0.12, 0.12); x += Math.cos(ang) * CELL * 0.6; y += Math.sin(ang) * CELL * 0.6; if (x < 0 || y < 0 || x > N * CELL || y > N * CELL) break; pts.unshift([x, y]); }
    if (pts.length < 8) continue;
    faults.push({ id: faults.length, name: `${namer.stem(2)} Fault`, pts, kind: r.pick(['thrust', 'strike-slip', 'normal'] as const), ageMa: Math.max(1, Math.min(...p.formations.map(id => formations[id].ageMa)) * r.float(0.3, 0.95)) });
  }
  const faultDist = new Float32Array(N * N).fill(1e9), faultOf = new Int16Array(N * N).fill(-1);
  const q: number[] = [];
  for (const F of faults) for (let s = 0; s < F.pts.length - 1; s++) {
    const [ax, ay] = F.pts[s], [bx, by] = F.pts[s + 1]; const steps = Math.ceil(Math.hypot(bx - ax, by - ay) / (CELL * 0.5));
    for (let t = 0; t <= steps; t++) { const x = Math.floor((ax + (bx - ax) * t / steps) / CELL), y = Math.floor((ay + (by - ay) * t / steps) / CELL);
      if (inb(x, y) && faultDist[idx(x, y)] > 0) { faultDist[idx(x, y)] = 0; faultOf[idx(x, y)] = F.id; q.push(idx(x, y)); } }
  }
  for (let h = 0; h < q.length; h++) {
    const c = q[h], cx = c % N, cy = (c / N) | 0;
    for (let k = 0; k < 8; k++) { const nx = cx + DX[k], ny = cy + DY[k]; if (!inb(nx, ny)) continue; const ni = idx(nx, ny); const nd = faultDist[c] + Math.hypot(DX[k], DY[k]) * CELL;
      if (nd < faultDist[ni] && nd < 8000) { faultDist[ni] = nd; faultOf[ni] = faultOf[c]; q.push(ni); } }
  }
  return { formations, provinces, plutons, faults, formationOf, provinceOf, plutonOf, plutonR, faultDist, faultOf, glacialLimit: T.traits.glaciated ? 300 + 500 * T.traits.relief : -1 };
}

function hashf(a: number, b: number) { let h = (a * 374761393 + b * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }

function pickLandCell(r: Rng, T: Terrain, provinceOf: Uint8Array, prov: number, interior = false): number {
  for (let t = 0; t < 300; t++) {
    const x = r.int(8, N - 9), y = r.int(8, N - 9); const i = idx(x, y);
    if (T.sea[i] || provinceOf[i] !== prov) continue;
    if (interior && T.coastDist[i] < 3000) continue;
    return i;
  }
  for (let i = 0; i < N * N; i++) if (provinceOf[i] === prov && !T.sea[i]) return i;
  return -1;
}
