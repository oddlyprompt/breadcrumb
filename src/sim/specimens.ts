import { Rng, hash32 } from './rng';
import { N, CELL, SIZE, cellOf, cellCenter, DX, DY, idx, inb, CREEK_Q, RIVER_Q, riverWidth, elevAt } from './terrain';
import { Sed } from './landscape';
import { MIN } from './minerals';
import { TAXON } from './fossils';
import { periodOf } from './fossils';
import { CH } from './sites';
import { clamp } from './noise';
import type { World } from './worldtypes';
import type { Deposit } from './deposits';

export type SpecKind = 'rock' | 'mineral' | 'fossil' | 'ore' | 'native' | 'gem' | 'erratic' | 'hotrock';
export interface Specimen {
  id: string; kind: SpecKind; name: string; mineral?: string; taxon?: string; formation: number; deposit?: string;
  transport: { mode: 'in place' | 'slope wash' | 'river' | 'glacier' | 'shore' | 'surface'; from?: string; dist: number; text: string };
  x: number; y: number; depth: number; mass: number; size: number; quality: number; why: string; hex: string; ageMa?: number; props: string[]; panOnly: boolean;
}

function exposureOf(w: World, c: number): number {
  const L = w.L; let e = 0;
  switch (L.sediment[c]) { case Sed.Bedrock: e = 1.2; break; case Sed.Colluvium: e = 0.7; break; case Sed.Residual: e = 0.3; break; case Sed.Alluvium: e = 0.35; break; case Sed.Till: e = 0.4; break; case Sed.Beach: e = 0.6; break; case Sed.MarineSand: e = 0.2; break; default: e = 0.05; }
  return e * (1 + w.T.slope[c] / 18);
}
function upstreamSample(w: World, c: number, r: Rng): { cell: number; dist: number } {
  let cur = c, dist = 0; const steps = r.int(2, 45);
  for (let s = 0; s < steps; s++) {
    const cx = cur % N, cy = (cur / N) | 0; const ups: number[] = [];
    for (let k = 0; k < 8; k++) { const nx = cx + DX[k], ny = cy + DY[k]; if (!inb(nx, ny)) continue; const ni = idx(nx, ny); const d = w.T.flow[ni]; if (d >= 0 && (ni % N) + DX[d] === cx && ((ni / N) | 0) + DY[d] === cy) ups.push(ni); }
    if (!ups.length) break; cur = r.weighted(ups, u => w.T.Q[u])!; dist += CELL;
  }
  return { cell: cur, dist };
}
const ROCK_HEX: Record<string, string> = {};
const near = (w: World, x: number, y: number, rad: number) => w.D.deposits.filter(d => Math.abs(d.x - x) < rad && Math.abs(d.y - y) < rad);

/** Natural specimens of one 64 m chunk, derived from the geology; deterministic and independent of rendering order. */
export function specimensInChunk(w: World, cx: number, cy: number): Specimen[] {
  const r = new Rng(hash32(`${w.seed}|spec|${cx}|${cy}`));
  const x0 = cx * CH, y0 = cy * CH; const mx = x0 + CH / 2, my = y0 + CH / 2;
  if (mx < 0 || my < 0 || mx > SIZE || my > SIZE) return [];
  const c = cellOf(mx, my); const T = w.T, L = w.L, G = w.G;
  if (T.sea[c] || T.lake[c] >= 0) return [];
  const out: Specimen[] = []; let seq = 0;
  const f = G.formations[G.formationOf[c]];
  const pos = (spread = CH) => ({ x: x0 + r.next() * spread, y: y0 + r.next() * spread });
  const mk = (o: Partial<Specimen> & Pick<Specimen, 'kind' | 'name' | 'transport' | 'why'>): Specimen => { const p = pos(); const s: Specimen = { id: `${cx},${cy}#${seq++}`, formation: G.formationOf[c], x: p.x, y: p.y, depth: 0, mass: 50, size: 5, quality: r.next(), hex: '#888', props: [], panOnly: false, ...o } as Specimen; out.push(s); return s; };
  const expo = exposureOf(w, c);
  const stream = T.Q[c] > CREEK_Q || [0, 1, 2, 3, 4, 5, 6, 7].some(k => { const nx = (c % N) + DX[k], ny = ((c / N) | 0) + DY[k]; return inb(nx, ny) && T.Q[idx(nx, ny)] > CREEK_Q; });
  const beach = L.sediment[c] === Sed.Beach || T.coastDist[c] < CELL * 1.2;
  // --- local rock in place (and cobbles)
  const nRock = Math.min(10, r.poisson(expo * 1.6 * (stream ? 1.3 : 1)));
  for (let i = 0; i < nRock; i++) {
    const roll = r.next();
    if (roll < 0.62 || !f.accessory.length) {
      const mass = r.logNormal(400, 0.9);
      mk({ kind: 'rock', name: f.rock, formation: G.formationOf[c], transport: { mode: 'in place', dist: 0, text: `weathered from the ${f.name}, which crops out here` }, why: `${f.process}.`, mass, size: Math.cbrt(mass / 2.7) * 1.0, hex: f.hex, ageMa: f.ageMa, props: [] });
    } else {
      const m = r.pick(f.accessory); const mn = MIN[m]; if (!mn) continue;
      const mass = r.logNormal(18, 0.9);
      mk({ kind: mn.gem ? 'gem' : 'mineral', name: mn.name, mineral: m, transport: { mode: 'in place', dist: 0, text: `an accessory mineral of the ${f.name}` }, why: `${mn.name} is a normal constituent of ${f.rock}.`, mass, size: Math.cbrt(mass / mn.density) * 1.1, hex: mn.hex, ageMa: f.ageMa });
    }
  }
  // --- deposit-related: weathered surface expression, with slope wash downhill
  for (const d of near(w, mx, my, 2500)) {
    const dist = Math.hypot(d.x - mx, d.y - my); const reach = d.surfaceRadius * 2.2 + 80; if (dist > reach) continue;
    if (d.kind === 'fossil_bed') continue; // handled below
    const downhill = elevAt(T, mx, my) <= elevAt(T, d.x, d.y) + 3;
    if (!downhill && dist > d.surfaceRadius * 0.4) continue;
    const p = Math.exp(-dist / (d.surfaceRadius * 0.9)) * (0.4 + 0.6 * (d.surfaceRadius / 400)) * clamp(1 + expo * 0.5, 0.6, 2);
    const n = r.poisson(p * 3.2); const dep = d;
    for (let i = 0; i < n; i++) {
      const pool = [...dep.minerals.supergene, ...dep.minerals.supergene, ...dep.minerals.gangue, ...dep.minerals.primary];
      const m = r.pick(pool); const mn = MIN[m]; if (!mn) continue;
      const nativeMetal = mn.cls === 'native'; if (nativeMetal && r.next() > Math.min(0.5, dep.grade / 40)) continue; // native gold on the surface is the exception
      const mass = nativeMetal ? r.logNormal(0.4, 1.0) : r.logNormal(150, 0.9);
      const viaWash = dist > d.surfaceRadius * 0.35;
      mk({ kind: nativeMetal ? 'native' : mn.cls === 'sulfide' || mn.cls === 'oxide' && mn.metallic ? 'ore' : mn.gem ? 'gem' : 'mineral', name: nativeMetal ? mn.name : mn.name, mineral: m, deposit: d.id, transport: viaWash ? { mode: 'slope wash', from: d.id, dist, text: `shed downslope from the ${d.name} by rain wash and creep, about ${Math.round(dist)} m` } : { mode: 'in place', from: d.id, dist, text: `weathered out of the ${d.name}` }, why: `${d.process}. At the surface this appears as: ${d.expression.toLowerCase()}.`, mass, size: Math.cbrt(mass / mn.density) * 1.2, hex: mn.hex, ageMa: d.ageMa, depth: 0 });
    }
    // chunks inside the surface zone also carry quartz float and gossan lumps, the visible clue to what lies beneath
    if (dist < d.surfaceRadius && (d.kind === 'orogenic_gold' || d.kind === 'epithermal' || d.kind === 'porphyry_copper' || d.kind === 'lead_zinc')) {
      for (let i = 0; i < r.poisson(2.2); i++) { const m = d.kind === 'porphyry_copper' || d.kind === 'lead_zinc' ? 'goethite' : 'quartz'; const mn = MIN[m]; const mass = r.logNormal(220, 0.8);
        mk({ kind: 'mineral', name: m === 'quartz' ? 'rusty vein quartz' : 'gossan (iron-stained rock)', mineral: m, deposit: d.id, transport: { mode: 'in place', from: d.id, dist, text: `outcrop and float above the ${d.name}` }, why: `Iron-stained quartz or gossan marks where sulfides oxidised; it hints at ${d.commodity} below.`, mass, size: Math.cbrt(mass / mn.density) * 1.2, hex: m === 'quartz' ? '#cdb892' : '#8a5a1f', props: [] }); }
    }
  }
  // --- fossils from beds that outcrop here (or wash from them)
  for (const d of near(w, mx, my, 1800)) {
    if (d.kind !== 'fossil_bed') continue; const dist = Math.hypot(d.x - mx, d.y - my); if (dist > d.surfaceRadius * 1.6) continue;
    const p = Math.exp(-dist / (d.surfaceRadius * 0.8)) * clamp(0.6 + expo, 0.5, 2.2);
    const n = r.poisson(p * 2.6); const taxa = (d.taxa ?? []).map(t => TAXON[t]);
    for (let i = 0; i < n; i++) {
      const t = r.weighted(taxa, q => q.weight)!; if (!t) continue; const size = r.float(t.size[0], t.size[1]) ; const form = G.formations[d.formation];
      mk({ kind: 'fossil', name: t.name, taxon: t.id, deposit: d.id, formation: d.formation, transport: dist < d.surfaceRadius * 0.4 ? { mode: 'in place', from: d.id, dist, text: `weathering out of the ${form.name}` } : { mode: 'slope wash', from: d.id, dist, text: `washed out of the ${form.name} and carried ${Math.round(dist)} m downslope` }, why: `${t.name} lived in the ${periodOf(form.ageMa)} (${t.from}–${t.to} Ma) and was buried in ${form.env?.replace('_', ' ')} sediment of the ${form.name}.`, mass: size * size * size * 0.9 + 5, size, quality: r.next() * (t.how === 'impression' ? 0.9 : 1), hex: t.hex, ageMa: form.ageMa, depth: 0 });
    }
  }
  // --- river gravel: cobbles of upstream rocks; placer gold
  if (stream && (L.sediment[c] === Sed.Alluvium || L.floodplain[c] || T.Q[c] > CREEK_Q)) {
    const nG = r.poisson(1.8 * clamp(Math.sqrt(T.Q[c]) + 0.4, 0.4, 2));
    for (let i = 0; i < nG; i++) {
      const up = upstreamSample(w, c, r); const uf = G.formations[G.formationOf[up.cell]];
      if (uf.cls === 'sedimentary' && uf.hardness < 0.3) continue; // soft rock does not survive the journey
      const mass = r.logNormal(600, 0.8);
      mk({ kind: 'rock', name: uf.rock, formation: uf.id, transport: { mode: 'river', dist: up.dist, text: `a rounded cobble carried about ${(up.dist / 1000).toFixed(1)} km down the stream from outcrops of the ${uf.name}` }, why: `River gravels contain the hard rocks of the whole catchment above them.`, mass, size: Math.cbrt(mass / 2.7), hex: uf.hex, ageMa: uf.ageMa });
    }
    for (const pt of w.D.placers) {
      const hit = pt.cells.find(q => q.cell === c); if (!hit) continue; const src = w.D.deposits.find(d => d.id === pt.sourceId)!;
      const worked = w.H.placerWorked[c]; const richness = hit.richness * (worked ? 0.25 : 1);
      const n = r.poisson(richness * 7);
      for (let i = 0; i < n; i++) {
        const big = r.chance(0.04 * Math.min(1, src.grade / 10)); const mass = big ? r.logNormal(1.6, 0.8) : r.logNormal(0.012, 0.8);
        const wdt = riverWidth(T.Q[c]); const [ccx, ccy] = cellCenter(c);
        const sp = mk({ kind: 'native', name: big ? 'gold nugget' : 'gold flake', mineral: pt.mineral, deposit: src.id, transport: { mode: 'river', from: src.id, dist: hit.dist, text: `eroded from the ${src.name} and carried about ${(hit.dist / 1000).toFixed(1)} km downstream, settling in the gravel where the current slows` }, why: `Gold from ${src.name} (${src.process.toLowerCase()}) was freed by erosion and, being very dense, collected in stream gravels.${worked ? ' The bar was worked over in the old gold rush.' : ''}`, mass, size: Math.cbrt(mass / 19.3) * 1.1, hex: MIN.gold.hex, depth: r.float(4, 35), panOnly: true, ageMa: src.ageMa });
        sp.x = clamp(ccx + r.float(-1, 1) * (wdt + 20), x0, x0 + CH); sp.y = clamp(ccy + r.float(-1, 1) * (wdt + 20), y0, y0 + CH);
      }
    }
  }
  // --- glacial erratics (if the region was glaciated): boulders carried down-ice from distinctive sources
  if (T.traits.glaciated && L.sediment[c] === Sed.Till) {
    for (const d of w.D.deposits) {
      if (!['porphyry_copper', 'iron_formation', 'pegmatite', 'orogenic_gold'].includes(d.kind)) continue;
      const dx = mx - d.x, dy = my - d.y, dist = Math.hypot(dx, dy); if (dist < 300 || dist > 14000) continue;
      const ang = Math.atan2(dy, dx); let da = Math.abs(ang - T.traits.iceFlow); da = Math.min(da, Math.PI * 2 - da); if (da > 0.35) continue;
      if (!r.chance(0.35 * Math.exp(-dist / 6000))) continue;
      const m = r.pick(d.minerals.primary.concat(d.minerals.gangue)); const mn = MIN[m]; if (!mn) continue; if (mn.cls === 'native') continue;
      const mass = r.logNormal(2500, 0.9);
      mk({ kind: 'erratic', name: `erratic boulder of ${G.formations[d.formation].rock}`, mineral: m, deposit: d.id, transport: { mode: 'glacier', from: d.id, dist, text: `plucked from the ${d.name} by Pleistocene ice flowing ${Math.round(dist / 100) / 10} km to this spot` }, why: 'Ice sheets carried boulders far from their source and dropped them as they melted.', mass, size: Math.cbrt(mass / 2.7), hex: mn.hex });
    }
  }
  // --- beaches: pebbles of the coast's rocks, agates and fossils eroded from the cliffs
  if (beach) {
    for (let i = 0; i < r.poisson(2.6); i++) {
      const cells: number[] = []; const cxi = c % N, cyi = (c / N) | 0; for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) { const nx = cxi + dx, ny = cyi + dy; if (inb(nx, ny) && !T.sea[idx(nx, ny)] && T.coastDist[idx(nx, ny)] < CELL * 3) cells.push(idx(nx, ny)); }
      const src = cells.length ? r.pick(cells) : c; const sf = G.formations[G.formationOf[src]]; const dist = Math.hypot((src % N) - cxi, ((src / N) | 0) - cyi) * CELL;
      const roll = r.next();
      if (roll < 0.15 && sf.fossiliferous) { const taxa = Object.values(TAXON).filter(t => t.from >= sf.ageMa && t.to <= sf.ageMa && sf.env && t.envs.includes(sf.env)); if (taxa.length) { const t = r.weighted(taxa, q => q.weight)!; const size = r.float(t.size[0], t.size[1]); mk({ kind: 'fossil', name: t.name, taxon: t.id, formation: sf.id, transport: { mode: 'shore', dist, text: `eroded from coastal outcrops of the ${sf.name} and rolled along the beach` }, why: `Waves undercut the cliffs of the ${sf.name} (${periodOf(sf.ageMa)}) and release their fossils onto the shore.`, mass: size ** 3 * 0.9 + 4, size, hex: t.hex, ageMa: sf.ageMa }); continue; } }
      if (roll < 0.28 && sf.accessory.some(a => MIN[a]?.gem || a === 'agate' || a === 'jasper')) { const m = sf.accessory.find(a => a === 'agate' || a === 'jasper' || MIN[a]?.gem) ?? 'quartz'; const mn = MIN[m]; const mass = r.logNormal(14, 0.8); mk({ kind: mn.gem ? 'gem' : 'mineral', name: `water-worn ${mn.name.toLowerCase()}`, mineral: m, formation: sf.id, transport: { mode: 'shore', dist, text: `tumbled by the surf from the ${sf.name}` }, why: 'Surf polishes hard minerals into smooth pebbles.', mass, size: Math.cbrt(mass / mn.density), hex: mn.hex }); continue; }
      const mass = r.logNormal(120, 0.8); mk({ kind: 'rock', name: `beach pebble of ${sf.rock}`, formation: sf.id, transport: { mode: 'shore', dist, text: `rounded by waves; its source rock (${sf.name}) crops out about ${Math.round(dist)} m away` }, why: 'Beach pebbles are the survivors of coastal erosion.', mass, size: Math.cbrt(mass / 2.7), hex: sf.hex });
    }
  }
  // --- hot rocks: magnetite-rich cobbles that fool a detector in mineralised ground
  const hot = L.mineral[c] - 0.38;
  if (hot > 0) for (let i = 0; i < r.poisson(hot * 14); i++) mk({ kind: 'hotrock', name: 'hot rock', mineral: 'magnetite', transport: { mode: 'in place', dist: 0, text: 'a cobble rich in magnetite' }, why: 'Strongly magnetic cobbles give detector signals like metal targets.', mass: r.logNormal(300, 0.7), size: 6, hex: '#2d2a2a', depth: r.float(0, 12), formation: G.formationOf[c] });
  return out.filter(s => s.x > 0 && s.y > 0 && s.x < SIZE && s.y < SIZE);
}
export { ROCK_HEX };
