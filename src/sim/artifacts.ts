import { Rng, hash32 } from './rng';
import { ARCHETYPES, ARC, Archetype, Ctx } from './archetypes';
import { MAT } from './materials';
import { preserve, BuryEnv } from './preservation';
import { N, CELL, SIZE, cellOf, DX, DY, idx, CREEK_Q, RIVER_Q, riverWidth, cellCenter, inb } from './terrain';
import { clamp } from './noise';
import { Sed } from './landscape';
import type { Site, Spot } from './sites';
import type { World } from './worldtypes';
import type { CoinSeries } from './coinage';
import type { Business } from './history_types';

export interface Mark { text: string; kind: 'date' | 'maker' | 'denom' | 'legend' | 'motif' | 'name' | 'mint' | 'text'; need: number; }
export interface Move { kind: 'flood' | 'storm' | 'plough' | 'collapse' | 'tailings'; year: number; event?: string; fromX: number; fromY: number; toX: number; toY: number; dist: number; }
export interface Artifact {
  id: string; site: string; arch: string; mat: string; produced: number; deposited: number;
  series?: string; token?: string; medal?: string; maker?: string; origin: string; marks: Mark[]; mass: number; dims: [number, number, number];
  x: number; y: number; depth: number; x0: number; y0: number;
  cond: { corr: number; wear: number; dmg: number; encrust: number; frag: number };
  assoc: { settlement?: string; event?: string; business?: string; persons?: string[]; vessel?: string; cache?: string; crossing?: string; route?: string; mine?: string; war?: string };
  ctx: Ctx; spot: string; moves: Move[]; lossKind: string; special?: string; cargo?: string; note?: string;
}

const RATE_SCALE = 0.1;
/** Recycling and clearance: share of each class that was never left lying (scrap drives, bottle diggers, dumps burned over). */
const SALVAGE: Record<string, number> = { iron_scrap: 0.35, nail_cut: 0.5, nail_wire: 0.5, nail_wrought: 0.6, can_tin: 0.5, crown_cap: 0.6, foil_scrap: 0.4, earthenware_sherd: 0.5, lead_scrap: 0.4, brass_scrap: 0.5, fence_staple: 0.5, alu_can: 0.5, stay_tab: 0.5, rivet_bolt: 0.6 };
const SITE_CAP: Record<string, number> = { town_core: 2600, town_dump: 3800, town_common: 1400, works: 2400, road: 320, railway: 420, station: 800, ford: 650, farm: 650, field: 500, mine: 2000, diggings: 1200, beach: 1500, picnic: 900, fairground: 900, schoolyard: 600, campground: 700, trailhead: 700, battlefield: 500, wreck_debris: 200, accident: 80, cache: 80 };
const MAT_FROM: Record<string, number> = { aluminium: 1895, zinc: 1790, steel: 1860, nickel: 1866, cupronickel: 1866, plastic: 1945, celluloid: 1872, bakelite: 1915, silverplate: 1840, goldfilled: 1850, rubber: 1840, porcelain: 1700, tin: 1620 };
const MAT_TO: Record<string, number> = { pewter: 1900 };
const byCtx: Record<string, Array<{ a: Archetype; w: number }>> = {};
for (const a of ARCHETYPES) for (const [c, w] of Object.entries(a.ctx)) { if (!w) continue; (byCtx[c] ??= []).push({ a, w: w as number }); }

export function matAvailable(m: string, year: number) { return year >= (MAT_FROM[m] ?? 0) && year <= (MAT_TO[m] ?? 9999); }

function chooseMaterial(a: Archetype, produced: number, r: Rng): string | null {
  const ok = a.mats.filter(([m]) => matAvailable(m, produced));
  if (!ok.length) return null; const tot = ok.reduce((s, [, w]) => s + w, 0); let x = r.next() * tot; for (const [m, w] of ok) { x -= w; if (x <= 0) return m; } return ok[0][0];
}
const initials = (r: Rng) => String.fromCharCode(65 + r.int(0, 25)) + '.' + String.fromCharCode(65 + r.int(0, 25)) + '.';

/** Indexed lookups used by the generator, built once per world. */
interface Idx { coin: Record<string, CoinSeries[]>; tokensBy: Map<string, any[]>; medalsBy: Map<string, any[]>; bizByKind: Map<string, Business[]>; wars: any[]; }
const idxCache = new WeakMap<World, Idx>();
function indexes(w: World): Idx {
  let i = idxCache.get(w); if (i) return i;
  const coin: Record<string, CoinSeries[]> = {}; for (const s of w.coin.series) (coin[s.archetype] ??= []).push(s);
  const tokensBy = new Map<string, any[]>(); for (const t of w.issues.tokens) { const b = w.H.businesses.find(q => q.id === t.business)!; (tokensBy.get(b.settlement) ?? tokensBy.set(b.settlement, []).get(b.settlement)!).push(t); }
  const medalsBy = new Map<string, any[]>(); for (const m of w.issues.medals) if (m.settlement) (medalsBy.get(m.settlement) ?? medalsBy.set(m.settlement, []).get(m.settlement)!).push(m);
  const bizByKind = new Map<string, Business[]>(); for (const b of w.H.businesses) (bizByKind.get(b.kind) ?? bizByKind.set(b.kind, []).get(b.kind)!).push(b);
  i = { coin, tokensBy, medalsBy, bizByKind, wars: w.H.wars }; idxCache.set(w, i); return i;
}

export function envAt(w: World, x: number, y: number, depthCm: number, ctx: Ctx, disturbed = 0): BuryEnv {
  const c = cellOf(x, y); const L = w.L;
  let ph = L.soilPH[c], moist = L.soilMoist[c], salt = L.salinity[c];
  if (ctx === 'dump') { ph += 0.5; salt += 0.05; } if (ctx === 'beach' || ctx === 'wreck') { moist = Math.max(moist, 0.7); salt = Math.max(salt, 0.55); ph = Math.max(ph, 7.6); }
  if (ctx === 'ford') moist = Math.max(moist, 0.8);
  return { ph, moist: clamp(moist, 0, 1), salt: clamp(salt, 0, 1), depthCm, disturbed, temp: w.T.temp[c], sed: L.sediment[c] };
}

function pickSpot(site: Site, ctx: Ctx, r: Rng): Spot | null {
  let cands = site.spots.filter(s => s.ctx.includes(ctx)); if (!cands.length && site.shape.t === 'line') cands = site.spots; if (!cands.length) return null;
  const tot = cands.reduce((a, s) => a + s.w, 0); let x = r.next() * tot; for (const s of cands) { x -= s.w; if (x <= 0) return s; } return cands[0];
}

export function generateSite(w: World, site: Site): Artifact[] {
  const cached = w.artCache.get(site.id); if (cached) return cached;
  const out: Artifact[] = [];
  const r = new Rng(hash32(`${w.seed}|art|${site.id}`));
  const I = indexes(w); const H = w.H;
  const siteSettlement = site.refs.settlement ? H.settlements.find(s => s.id === site.refs.settlement) : undefined;
  let seq = 0;
  const near = new Set<string>(); if (siteSettlement) near.add(siteSettlement.id);
  if (site.refs.route) { const rt = H.routes.find(q => q.id === site.refs.route)!; near.add(rt.from); near.add(rt.to); }
  if (site.refs.mine) { const m = H.mines.find(q => q.id === site.refs.mine)!; near.add(m.settlement); }
  if (site.refs.crossing) { const x = H.crossings.find(q => q.id === site.refs.crossing)!; const rt = H.routes.find(q => q.id === x.route)!; near.add(rt.from); near.add(rt.to); }
  if (site.refs.business) { const b = H.businesses.find(q => q.id === site.refs.business)!; near.add(b.settlement); }
  if (!near.size) { // nearest settlements within 8 km for sites of the open country
    for (const s of H.settlements) if (s.kind !== 'farmstead' && Math.hypot(s.x - site.x, s.y - site.y) < 8000) near.add(s.id);
  }
  if (site.densityMult > 0) {
    // expected counts first, so that the salvage factor (metal drives, bottle collectors, later clearance) can be applied
    interface Job { act: typeof site.acts[0]; a: Archetype; wc: number; lo: number; hi: number; lambda: number }
    const jobs: Job[] = []; let expected = 0;
    for (const act of site.acts) {
      const list = byCtx[act.ctx]; if (!list) continue;
      const years = act.to - act.from + 1;
      for (const { a, w: wc } of list) {
        if (a.special === 'wreck' || a.special === 'hoard') continue; // generated by dedicated code
        if (a.special === 'medal' && a.id === 'medal_gallantry') continue;
        const lo = Math.max(act.from, a.from); const hiLim = a.to === null ? act.to : Math.min(act.to, a.to + a.life * 2.5); if (lo > hiLim) continue;
        const frac = (hiLim - lo + 1) / years; if (frac <= 0) continue;
        let lambda = act.n * years * frac * a.rate / 100 * wc * RATE_SCALE * site.densityMult * (SALVAGE[a.id] ?? 1);
        if (a.special === 'medal') lambda *= 0.6;
        if (lambda <= 0) continue;
        jobs.push({ act, a, wc, lo, hi: hiLim, lambda }); expected += lambda;
      }
    }
    const cap = SITE_CAP[site.kind] ?? 1500; const thin = expected > cap ? cap / expected : 1;
    for (const j of jobs) {
      const n = r.poisson(j.lambda * thin);
      for (let k = 0; k < n; k++) {
        const dep = j.lo + Math.floor(r.next() * (j.hi - j.lo + 1));
        const art = makeArtifact(w, I, site, j.a, j.act.ctx, dep, r, `${site.id}#${seq}`, near);
        if (art) { seq++; out.push(art); }
      }
    }
  }
  // dedicated generation: wrecks, caches, accidents, gallantry medals
  specials(w, I, site, out, r, () => seq++);
  // apply history-driven transport
  for (const art of out) taphonomy(w, site, art, r);
  const kept = out.filter(a => { const c = cellOf(a.x, a.y); return !w.T.sea[c] || a.lossKind === 'wreck'; });
  w.ledger.decayed += out.length - kept.length;
  w.ledger.sitesGenerated++; w.artCache.set(site.id, kept); return kept;
}

function makeArtifact(w: World, I: Idx, site: Site, a: Archetype, ctx: Ctx, dep: number, r: Rng, id: string, near: Set<string>, forced?: { series?: CoinSeries; mat?: string; produced?: number }): Artifact | null {
  const H = w.H;
  let produced = dep - Math.min(dep - a.from, Math.round(r.exp(a.life)));
  if (a.to !== null && produced > a.to) produced = Math.max(a.from, a.to - Math.floor(r.next() * a.life));
  if (forced?.produced !== undefined) produced = forced.produced;
  if (produced > dep) return null;
  const mat0 = forced?.mat ?? chooseMaterial(a, produced, r); if (!mat0) return null; let mat: string = mat0;
  const marks: Mark[] = []; let series: CoinSeries | undefined; let token: string | undefined; let medal: string | undefined; let maker: string | undefined; let origin = 'a manufacturer outside the region';
  let mass = a.mass[0] * Math.pow(a.mass[1] / a.mass[0], r.next()); let L0 = a.size[0] * Math.pow(a.size[1] / a.size[0], r.next());
  const assoc: Artifact['assoc'] = { settlement: site.refs.settlement };
  let wear = 0; let special: string | undefined;
  if (a.special === 'coin') {
    const pool = (I.coin[a.id] ?? []).filter(s => s.year <= dep && s.year >= dep - 150);
    if (!pool.length) return null;
    const tot = pool.reduce((s, c) => s + c.mintage * Math.exp(-(dep - c.year) / c.life), 0); let x = r.next() * tot; series = pool[pool.length - 1];
    for (const c of pool) { x -= c.mintage * Math.exp(-(dep - c.year) / c.life); if (x <= 0) { series = c; break; } }
    produced = series.year; mat = series.metal; mass = series.massG; L0 = series.diameter;
    const T = w.coin.types.find(t => t.id === series!.type)!;
    marks.push({ text: T.legend, kind: 'legend', need: 0.35 }, { text: series.denomText, kind: 'denom', need: 0.3 }, { text: String(series.year), kind: 'date', need: 0.45 }, { text: T.obverse, kind: 'motif', need: 0.25 });
    if (series.mint) marks.push({ text: series.mint, kind: 'mint', need: 0.6 }); origin = series.authority === 'homeland' ? `the ${series.polity} mint (imported coin)` : `the mint of the ${series.polity}`;
    const years = dep - produced; wear = clamp(years / (series.life * 1.7) * (MAT[mat].hard < 3 ? 1.1 : 0.8) + r.float(-0.05, 0.1), 0, 0.95);
    mass *= 1 - wear * 0.06; special = 'coin';
  } else if (a.special === 'token') {
    const cands: any[] = []; for (const sid of near) for (const t of I.tokensBy.get(sid) ?? []) if (t.from <= dep && (a.id === 'token_scrip' || a.id === 'advert_token')) { if (a.id === 'token_scrip' && t.kind === 'scrip') cands.push(t); }
    if (site.refs.mine) { const m = H.mines.find(q => q.id === site.refs.mine)!; const own = (I.tokensBy.get(m.settlement) ?? []).filter(t => t.business === m.company); if (own.length) { cands.length = 0; cands.push(...own); } }
    const pool = cands.filter(t => t.from <= dep && dep <= t.to + 8); if (!pool.length) return null;
    const tot = pool.reduce((s: number, t: any) => s + t.mintage, 0); let x = r.next() * tot; let t = pool[0]; for (const c of pool) { x -= c.mintage; if (x <= 0) { t = c; break; } }
    const b = H.businesses.find(q => q.id === t.business)!;
    token = t.id; maker = b.id; produced = Math.max(t.from, Math.min(dep, t.to, t.from + Math.floor(r.next() * (t.to - t.from + 1)))); mat = t.metal; L0 = 20 + t.value * 0.3 + r.float(-1, 1); mass = MAT[mat].density * Math.PI * (L0 / 20) ** 2 * 0.9 * 1.3;
    marks.push(...t.lines.map((l: string, i: number) => ({ text: l, kind: (i === 0 ? 'maker' : i === 1 ? 'name' : 'denom') as Mark['kind'], need: 0.35 + i * 0.05 })), { text: String(produced), kind: 'date', need: 0.5 });
    origin = `${b.name} of ${H.settlements.find(s => s.id === b.settlement)!.name}`; assoc.business = b.id; assoc.settlement = b.settlement; wear = clamp((dep - produced) / 40 * 0.5, 0, 0.7); special = 'token';
  } else if (a.special === 'medal' && a.id === 'medal_event') {
    const cands: any[] = []; for (const sid of near) for (const m of I.medalsBy.get(sid) ?? []) if (m.kind === 'commemorative' && m.year <= dep) cands.push(m);
    if (!cands.length) return null; const tot = cands.reduce((s: number, m: any) => s + m.mintage, 0); let x = r.next() * tot; let m = cands[0]; for (const c of cands) { x -= c.mintage; if (x <= 0) { m = c; break; } }
    medal = m.id; produced = m.year; mat = m.metal; assoc.event = m.event; assoc.settlement = m.settlement; marks.push(...m.lines.map((l: string, i: number) => ({ text: l, kind: 'text' as Mark['kind'], need: 0.3 + i * 0.08 })));
    origin = 'a local commemorative issue'; wear = clamp((dep - produced) / 90 * 0.4, 0, 0.5); special = 'medal'; L0 = 32 + r.float(-3, 3); mass = MAT[mat].density * Math.PI * (L0 / 20) ** 2 * 0.7;
  } else if (a.special === 'insignia') {
    const war = I.wars.filter((q: any) => q.from <= dep + 0 && (a.id === 'mil_disc' ? q.from >= 1914 : true) && q.to >= dep - 25).sort((x: any, y: any) => y.to - x.to)[0] ?? I.wars.find((q: any) => q.from <= dep);
    if (!war) return null; assoc.war = war.id;
    const unit = `${r.int(1, 12)}${['st', 'nd', 'rd'][r.int(0, 2)] ?? 'th'} ${r.pick(['Foot', 'Rifles', 'Militia', 'Fusiliers', 'Artillery', 'Light Horse'])}`;
    marks.push({ text: unit.toUpperCase(), kind: 'text', need: 0.4 }, { text: war.name.toUpperCase(), kind: 'legend', need: 0.5 }); origin = `a military contractor, issued during the ${war.name}`; special = 'insignia';
  }
  // makers and marks for ordinary goods
  if (!special && a.marked && r.chance(a.marked)) {
    const kinds = a.maker ?? [];
    let cands: Business[] = [];
    for (const k of kinds) for (const b of I.bizByKind.get(k) ?? []) if (b.founded <= produced && (b.closed ?? 9999) >= produced && (near.has(b.settlement) || (a.cat === 'bottle' || a.cat === 'pottery') && Math.hypot(b.x - site.x, b.y - site.y) < 14000)) cands.push(b);
    if (cands.length && r.chance(0.7)) {
      const b = r.weighted(cands, q => q.capacity)!; maker = b.id; assoc.business = b.id;
      const town = H.settlements.find(s => s.id === b.settlement)!;
      marks.push({ text: b.mark, kind: 'maker', need: 0.5 }, { text: town.name.toUpperCase(), kind: 'name', need: 0.55 }); origin = `${b.name} of ${town.name}`;
    } else {
      const m = `${initials(r)} & ${r.pick(['CO', 'SONS', 'BROS'])}`; marks.push({ text: m, kind: 'maker', need: 0.5 }); origin = `a firm outside the region (marked ${m})`;
    }
  }
  if (a.dated && !special && !marks.some(m => m.kind === 'date')) marks.push({ text: String(produced), kind: 'date', need: 0.5 });
  // size and thickness
  const W0 = L0 * r.float(0.45, 1), vol = mass / MAT[mat].density * 1000; // mm3
  const T0 = clamp(vol / Math.max(1, L0 * W0), 0.3, Math.min(L0, 60));
  if (a.render === 'coin' || a.render === 'disc') { /* round */ }
  // placement
  const spot = pickSpot(site, ctx, r);
  let x: number, y: number, depthCm: number, spotName = 'scatter';
  if (spot) { const ang = r.next() * Math.PI * 2, rad = Math.sqrt(r.next()) * spot.r; x = spot.x + Math.cos(ang) * rad; y = spot.y + Math.sin(ang) * rad; const d0 = spot.depth?.[0] ?? 1, d1 = spot.depth?.[1] ?? 25; depthCm = d0 + (d1 - d0) * Math.pow(r.next(), 1.6); spotName = spot.kind; }
  else { const ang = r.next() * Math.PI * 2, rad = Math.sqrt(r.next()) * site.r; x = site.x + Math.cos(ang) * rad; y = site.y + Math.sin(ang) * rad; depthCm = 1 + 25 * r.next(); }
  depthCm += Math.min(24, (w.H.endYear - dep) * 0.07 * r.next());
  x = clamp(x, 5, SIZE - 5); y = clamp(y, 5, SIZE - 5);
  const isField = site.kind === 'field';
  if (isField) depthCm = r.next() * 22;
  // preservation
  const env = envAt(w, x, y, depthCm, ctx, isField ? 1 : site.kind === 'beach' ? 0.5 : 0);
  const thin = clamp(1 - T0 / 8, 0, 1);
  const p = preserve(mat, w.H.endYear - dep, env, r.next(), thin);
  if (p.lost) { w.ledger.decayed++; return null; }
  if (MAT[mat].organic && !p.note) { if (r.chance(0.85)) { w.ledger.decayed++; return null; } }
  const dmg = isField || ctx === 'dump' ? r.float(0, 0.5) : r.float(0, 0.18);
  const art: Artifact = {
    id, site: site.id, arch: a.id, mat, produced, deposited: dep, series: series?.id, token, medal, maker, origin, marks, mass, dims: [L0, W0, T0], x, y, depth: depthCm, x0: x, y0: y,
    cond: { corr: p.corr, wear, dmg, encrust: p.encrust, frag: p.frag * (1 - dmg * 0.3) }, assoc, ctx, spot: spotName, moves: [], lossKind: lossKind(a, ctx, site), special,
  };
  return art;
}

function lossKind(a: Archetype, ctx: Ctx, site: Site): string {
  if (ctx === 'dump') return 'discard'; if (ctx === 'field') return 'agriculture'; if (ctx === 'ford') return 'crossing'; if (ctx === 'beach' || ctx === 'wharf') return 'shore';
  if (ctx === 'mine' || ctx === 'works') return 'industrial'; if (ctx === 'military') return 'military'; if (a.cat === 'scrap' || a.cat === 'litter') return 'discard'; return 'accidental';
}

/** Special generation: deliberate deposits and event-driven losses. */
function specials(w: World, I: Idx, site: Site, out: Artifact[], r: Rng, next: () => number) {
  const H = w.H;
  const add = (a: Archetype, ctx: Ctx, dep: number, o: { mat?: string; x: number; y: number; depth: number; assoc: Artifact['assoc']; kind: string; marks?: Mark[]; produced?: number; special?: string; origin?: string; mass?: number; cargo?: string; series?: CoinSeries; spot?: string }) => {
    const id = `${site.id}#s${next()}`;
    const mat1 = o.mat ?? chooseMaterial(a, o.produced ?? dep, r); if (!mat1) return null; const mat: string = mat1;
    let mass = o.mass ?? a.mass[0] * Math.pow(a.mass[1] / a.mass[0], r.next()); let L0 = a.size[0] * Math.pow(a.size[1] / a.size[0], r.next());
    let marks = o.marks ?? []; let produced = o.produced ?? Math.max(a.from, dep - r.int(0, 10)); let series: string | undefined = o.series?.id; let wear = 0;
    if (!o.series) { if (o.assoc.persons?.length) { const pr = H.people.find(q => q.id === o.assoc.persons![0]); if (pr) produced = Math.max(produced, pr.born + 3); } if (a.to !== null && produced > a.to) produced = a.to; if (produced > dep) produced = dep; if (produced < a.from) return null; if (!matAvailable(mat, produced)) return null; }
    if (o.series) { const s = o.series; const T = w.coin.types.find(t => t.id === s.type)!; produced = s.year; marks = [{ text: T.legend, kind: 'legend', need: 0.35 }, { text: s.denomText, kind: 'denom', need: 0.3 }, { text: String(s.year), kind: 'date', need: 0.45 }, { text: T.obverse, kind: 'motif', need: 0.25 }]; mass = s.massG; L0 = s.diameter; wear = clamp((dep - s.year) / (s.life * 1.7), 0, 0.9) * 0.8; }
    const W0 = L0 * r.float(0.5, 1), T0 = clamp(mass / MAT[mat].density * 1000 / Math.max(1, L0 * W0), 0.3, Math.min(L0, 60));
    o.x = clamp(o.x, 5, SIZE - 5); o.y = clamp(o.y, 5, SIZE - 5);
    const env = envAt(w, o.x, o.y, o.depth, ctx, 0); const p = preserve(mat, H.endYear - dep, env, r.next(), clamp(1 - T0 / 8, 0, 1));
    if (p.lost && !(MAT[mat].id === 'gold')) { w.ledger.decayed++; return null; }
    const art: Artifact = { id, site: site.id, arch: a.id, mat, produced, deposited: dep, series, maker: undefined, origin: o.origin ?? 'unknown', marks, mass, dims: [L0, W0, T0], x: o.x, y: o.y, depth: o.depth, x0: o.x, y0: o.y, cond: { corr: p.corr, wear, dmg: 0, encrust: p.encrust, frag: p.frag }, assoc: o.assoc, ctx, spot: o.spot ?? 'special', moves: [], lossKind: o.kind, special: o.special, cargo: o.cargo };
    out.push(art); return art;
  };
  // --- shipwreck debris
  if (site.kind === 'wreck_debris' && site.special) {
    const v = H.vessels.find(q => q.id === site.special.vessel)!; const ev = H.events.find(q => q.id === site.special.event)!; const home = H.settlements.find(s => s.id === v.homePort)!;
    const n = Math.round(10 + v.tonnage / 8);
    const wreckArch = ARCHETYPES.filter(a => a.special === 'wreck' && a.id !== 'ship_bell' && a.id !== 'porthole' && a.id !== 'wreck_cargo');
    const cargoFor: Record<string, string[]> = { timber: ['nail_cut', 'iron_scrap', 'rail_spike', 'iron_chain'], 'general cargo': ['stone_crock', 'bottle_case', 'padlock', 'scissors', 'knife_table', 'iron_scrap'], 'salted fish': ['iron_scrap', 'iron_chain'], 'barrelled flour': ['iron_scrap', 'nail_cut'], coal: ['iron_scrap', 'slag_lump'], 'ore concentrate': ['iron_scrap', 'wire_rope'], 'manufactured goods': ['hammer_head', 'padlock', 'knife_pocket', 'scissors', 'axe_head', 'cookpot', 'flatiron'], bricks: ['firebrick', 'iron_scrap'], 'barrelled beer': ['iron_scrap', 'bottle_beer'] };
    for (let i = 0; i < n; i++) {
      const roll = r.next(); let a: Archetype;
      if (roll < 0.35) a = ARC[r.pick(cargoFor[v.cargo] ?? ['iron_scrap'])]; else if (roll < 0.55) a = r.pick(wreckArch); else a = ARC['wreck_cargo'];
      if (!a || a.from > ev.year || (a.to !== null && a.to + 30 < ev.year)) a = ARC['iron_scrap'];
      if (a.id === 'copper_tack' && !(v.hull === 'wood' && ev.year >= 1760 && ev.year <= 1880)) a = ARC['ship_fitting'];
      const spot = site.spots[0]; const ang = r.next() * Math.PI * 2, rad = Math.sqrt(r.next()) * spot.r;
      let mat: string = chooseMaterial(a, ev.year, r) ?? 'iron'; if (v.hull === 'wood' && a.id === 'iron_scrap' && ev.year < 1860 && r.chance(0.3)) mat = 'iron';
      const marks: Mark[] = a.marked && r.chance(0.5) ? [{ text: v.name.toUpperCase(), kind: 'name', need: 0.5 }] : [];
      add(a, 'wreck', ev.year, { mat, x: spot.x + Math.cos(ang) * rad, y: spot.y + Math.sin(ang) * rad, depth: r.next() * 14, assoc: { event: ev.id, vessel: v.id, settlement: home.id }, kind: 'wreck', marks, produced: Math.max(a.from, Math.min(ev.year, v.built - r.int(0, 15))), origin: `fittings and cargo of the ${v.type} ${v.name}`, special: 'wreck', cargo: v.cargo });
    }
    if (r.chance(0.12)) { const spot = site.spots[0]; add(ARC['ship_bell'], 'wreck', ev.year, { mat: 'bronze', x: spot.x + r.float(-30, 30), y: spot.y + r.float(-30, 30), depth: r.float(3, 20), assoc: { event: ev.id, vessel: v.id, settlement: home.id }, kind: 'wreck', marks: [{ text: v.name.toUpperCase(), kind: 'name', need: 0.4 }, { text: String(v.built), kind: 'date', need: 0.5 }], produced: v.built, origin: `cast for the ${v.type} ${v.name}`, special: 'wreck' }); }
  }
  // --- buried caches
  if (site.kind === 'cache' && site.special) {
    const c = H.caches.find(q => q.id === site.special.cache)!; const ev = H.events.find(q => q.id === c.event)!;
    const person = c.owner; const base: { assoc: Artifact['assoc']; kind: string; origin: string; special: string } = { assoc: { event: ev.id, persons: [person], cache: c.id, settlement: ev.settlement }, kind: 'cache', origin: `hidden by ${H.people.find(p => p.id === person)?.name ?? 'someone unknown'}`, special: 'cache' };
    const containerArch = c.container.includes('crock') ? ARC['stone_crock'] : c.container.includes('kettle') ? ARC['cookpot'] : c.container.includes('tin') ? ARC['tobacco_tin'] : c.container.includes('jar') ? ARC['jar_canning'] : ARC['cash_box_part'];
    const cont = containerArch.from <= c.year && (containerArch.to === null || containerArch.to + 25 >= c.year) ? containerArch : ARC['tobacco_tin'];
    if (cont.from <= c.year) add(cont, 'home', c.year, { x: c.x, y: c.y, depth: c.depth, ...base, spot: 'cache container' });
    let remaining = c.value * 100 * 0.12; const metalPref = ['coin_gold', 'coin_silver', 'coin_cupronickel', 'coin_copper'];
    const picks: Array<{ s: CoinSeries; n: number }> = [];
    let guard = 0;
    while (remaining > 0 && guard++ < 50) {
      const pool = w.coin.series.filter(s => s.year <= c.year && s.year >= c.year - 40 && s.denom <= Math.max(5, remaining) && (c.kind === 'loot' ? s.denom >= 10 : true));
      if (!pool.length) break; const s = r.weighted(pool, q => Math.sqrt(q.mintage) * (q.denom >= 100 ? 2 : 1) * (q.metal === 'gold' ? 3 : 1))!;
      const k = Math.min(Math.max(1, Math.floor(remaining / s.denom)), r.int(1, 6)); picks.push({ s, n: k }); remaining -= s.denom * k;
    }
    for (const { s, n } of picks) for (let i = 0; i < Math.min(n, 12); i++) add(ARC[s.archetype], 'home', c.year, { x: c.x + r.float(-0.3, 0.3), y: c.y + r.float(-0.3, 0.3), depth: c.depth + r.float(-8, 8), ...base, series: s, mat: s.metal, spot: 'cache coins' });
    for (const item of c.contents) if (item.metal === 'gold' && item.what.includes('bar')) for (let i = 0; i < item.n; i++) {
      const mines = H.mines.filter(m => m.opened <= c.year); const mine = mines.length ? r.pick(mines) : undefined; const co = mine ? H.businesses.find(b => b.id === mine.company) : undefined;
      add(ARC['bullion_bar'], 'home', c.year, { x: c.x + r.float(-0.25, 0.25), y: c.y + r.float(-0.25, 0.25), depth: c.depth + r.float(0, 6), ...base, mat: 'gold', marks: [{ text: co?.name.toUpperCase() ?? 'ASSAY OFFICE', kind: 'maker', need: 0.3 }, { text: String(c.year - r.int(0, 1)), kind: 'date', need: 0.4 }, { text: `No. ${r.int(100, 9000)}`, kind: 'text', need: 0.45 }], produced: c.year - 1, mass: r.float(900, 4800), assoc: { ...base.assoc, business: co?.id, mine: mine?.id } });
    }
  }
  // --- drownings and lost cargo
  if (site.kind === 'accident' && site.special) {
    const ev = H.events.find(q => q.id === site.special.event)!; const victim = H.people.find(p => p.id === ev.people[0])!;
    const base: { assoc: Artifact['assoc']; kind: string; origin: string; special: string } = { assoc: { event: ev.id, persons: [victim.id], settlement: ev.settlement, crossing: ev.extra?.crossing }, kind: 'accident', origin: `lost with ${victim.name}`, special: 'accident' };
    const pers = [ARC['pocketwatch'], ARC['knife_pocket'], ARC['buckle_belt'], ARC['ring_silver'], ARC['button_brass'], ARC['key_skeleton'], ARC['horseshoe']].filter(a => a.from <= ev.year && (a.to === null || a.to + 40 >= ev.year));
    for (const a of pers) if (r.chance(0.6)) add(a, 'ford', ev.year, { x: site.x + r.float(-14, 14), y: site.y + r.float(-14, 14), depth: r.float(5, 60), produced: Math.max(a.from, victim.born + 5, ev.year - r.int(1, 25)), ...base });
    for (let i = 0; i < r.int(2, 9); i++) { const s = r.pick(w.coin.series.filter(q => q.year <= ev.year && q.year > ev.year - 30 && q.denom <= 100)); if (s) add(ARC[s.archetype], 'ford', ev.year, { x: site.x + r.float(-12, 12), y: site.y + r.float(-12, 12), depth: r.float(5, 50), series: s, mat: s.metal, ...base }); }
    if (ev.kind === 'lost_shipment') {
      const cargo = ev.extra?.cargo as string; const map: Record<string, [string, number]> = { 'casks of nails': ['nail_cut', 60], 'barrels of flour': ['iron_scrap', 12], 'crates of tools': ['hammer_head', 8], 'bolts of cloth': ['button_brass', 14], 'kegs of powder': ['iron_scrap', 10], crockery: ['transferware', 18], 'bottled goods': ['bottle_bitters', 12] };
      const [aid, cnt] = map[cargo] ?? ['iron_scrap', 8]; let a = ARC[aid]; if (a.from > ev.year || (a.to !== null && a.to + 40 < ev.year)) a = ARC['iron_scrap'];
      for (let i = 0; i < cnt; i++) add(a, 'ford', ev.year, { x: site.x + r.float(-18, 18), y: site.y + r.float(-18, 18), depth: r.float(5, 70), ...base, cargo, origin: `part of a wagon load of ${cargo} lost at the crossing`, produced: Math.max(a.from, ev.year - r.int(0, 3)) });
      for (const a2 of [ARC['wagon_tire'], ARC['harness_ring'], ARC['horseshoe']]) if (a2.from <= ev.year && (a2.to === null || a2.to + 40 >= ev.year)) for (let i = 0; i < r.int(1, 4); i++) add(a2, 'ford', ev.year, { x: site.x + r.float(-16, 16), y: site.y + r.float(-16, 16), depth: r.float(5, 60), ...base, origin: 'ironwork of the overturned wagon', produced: Math.max(a2.from, ev.year - r.int(0, 15)) });
    }
  }
  // --- gallantry medals, in the town sites where the recipient lived
  if (site.kind === 'town_core' && site.refs.settlement && site.densityMult > 0) {
    for (const m of w.issues.medals) if (m.kind === 'gallantry' && m.settlement === site.refs.settlement) {
      const person = H.people.find(p => p.id === m.person)!; const hr = new Rng(hash32(w.seed + '|gm|' + m.id));
      if (!hr.chance(0.55) || person.died === null) continue;
      const dep = person.died + hr.int(2, 30); if (dep > H.endYear) continue;
      const home = site.spots.filter(s => s.ctx.includes('home')); if (!home.length) continue; const sp = hr.pick(home);
      add(ARC['medal_gallantry'], 'home', dep, { mat: m.metal, x: sp.x + hr.float(-sp.r, sp.r), y: sp.y + hr.float(-sp.r, sp.r), depth: hr.float(5, 50), marks: m.lines.map((l: string, i: number) => ({ text: l, kind: 'text' as Mark['kind'], need: 0.3 + i * 0.1 })), produced: m.year, assoc: { event: m.event, persons: [person.id], settlement: m.settlement }, kind: 'accidental', origin: `awarded to ${person.name}`, special: 'medal' });
    }
  }
}

/** History-driven movement of objects after deposition: ploughing, floods, storms. Identity is conserved. */
function taphonomy(w: World, site: Site, a: Artifact, r: Rng) {
  const H = w.H;
  if (site.kind === 'field' && a.deposited >= 1700) {
    const ang = (hash32(site.id) % 628) / 100; const years = Math.min(60, H.endYear - a.deposited); const d = r.next() * years * 0.4;
    if (d > 0.5) { const nx = clamp(a.x + Math.cos(ang) * d, 5, SIZE - 5), ny = clamp(a.y + Math.sin(ang) * d, 5, SIZE - 5); a.moves.push({ kind: 'plough', year: a.deposited + Math.round(years / 2), fromX: a.x, fromY: a.y, toX: nx, toY: ny, dist: d }); a.x = nx; a.y = ny; }
    return;
  }
  const mass = Math.max(1, a.mass);
  if (site.dynamic === 'river' || a.ctx === 'ford') {
    for (const f of H.floods) {
      if (f.year < a.deposited) continue; const c = cellOf(a.x, a.y); if (!w.L.floodplain[c] && w.T.Q[c] < CREEK_Q) continue;
      const thr = 1.1 + Math.pow(mass, 0.3) * 0.12 + a.depth / 120; if (f.scale < thr) continue;
      if (!r.chance(clamp((f.scale - thr) * 0.35, 0, 0.8))) continue;
      // find the stream next to the object and follow it downstream
      let sc = -1, bq = 0; const cx = c % N, cy = (c / N) | 0; for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { const nx = cx + dx, ny = cy + dy; if (inb(nx, ny) && w.T.Q[idx(nx, ny)] > bq && w.T.Q[idx(nx, ny)] > CREEK_Q) { bq = w.T.Q[idx(nx, ny)]; sc = idx(nx, ny); } }
      if (sc < 0) continue;
      let dist = (20 + f.scale * 45 * (0.4 + r.next())) / Math.pow(mass, 0.15); let cur = sc; let px = a.x, py = a.y; const fx = a.x, fy = a.y;
      while (dist > 0 && w.T.flow[cur] >= 0) { const d = w.T.flow[cur]; const nx = (cur % N) + DX[d], ny = ((cur / N) | 0) + DY[d]; if (!inb(nx, ny)) break; const nc = idx(nx, ny); if (w.T.sea[nc] || w.T.lake[nc] >= 0) break; const [tx, ty] = cellCenter(nc); const [sx, sy] = cellCenter(cur); const seg = Math.hypot(tx - sx, ty - sy); const step = Math.min(dist, seg); px += (tx - sx) / seg * step; py += (ty - sy) / seg * step; dist -= step; cur = nc; if (step < seg) break; }
      const wdt = riverWidth(w.T.Q[cur]); const off = wdt * 0.5 + 1 + r.next() * 15; const ang = r.next() * Math.PI * 2;
      const nx2 = clamp(px + Math.cos(ang) * off, 5, SIZE - 5), ny2 = clamp(py + Math.sin(ang) * off, 5, SIZE - 5); const moved = Math.hypot(nx2 - fx, ny2 - fy);
      if (moved < 2) continue;
      if (Math.hypot(nx2 - a.x0, ny2 - a.y0) > 1300) continue; // the flood zone ends here
      a.moves.push({ kind: 'flood', year: f.year, event: f.event || undefined, fromX: a.x, fromY: a.y, toX: nx2, toY: ny2, dist: moved }); a.x = nx2; a.y = ny2; a.depth = 4 + r.next() * 50; a.cond.dmg = Math.min(1, a.cond.dmg + 0.06);
    }
  } else if (site.dynamic === 'beach' && a.ctx !== 'wreck') {
    beachStorms(w, a, r);
  } else if (a.ctx === 'wreck') beachStorms(w, a, r, true);
  if (site.kind === 'mine' && a.ctx === 'mine' && r.chance(0.12)) { a.depth += r.float(20, 120); a.moves.push({ kind: 'tailings', year: a.deposited + 1, fromX: a.x, fromY: a.y, toX: a.x, toY: a.y, dist: 0 }); }
}
function beachStorms(w: World, a: Artifact, r: Rng, wreck = false) {
  for (const st of w.H.storms) {
    if (st.year < a.deposited || st.severity < 1.6) continue;
    const c = cellOf(a.x, a.y); if (w.T.coastDist[c] > CELL * 1.8) continue;
    if (!r.chance(clamp((st.severity - 1.2) * 0.25, 0, 0.7))) continue;
    // along-shore drift: tangent to the coast (perpendicular to the direction of the sea)
    const cx = c % N, cy = (c / N) | 0; let gx = 0, gy = 0; for (let k = 0; k < 8; k++) { const nx = cx + DX[k], ny = cy + DY[k]; if (inb(nx, ny)) { const d = w.T.coastDist[idx(nx, ny)]; gx += DX[k] * d; gy += DY[k] * d; } }
    const gl = Math.hypot(gx, gy) || 1; const tx = -gy / gl, ty = gx / gl; const sgn = Math.cos(st.windAngle) * tx + Math.sin(st.windAngle) * ty >= 0 ? 1 : -1;
    const dist = (15 + st.severity * 40 * r.next()) * (wreck ? 1.5 : 1) / Math.pow(Math.max(1, a.mass), 0.12);
    const nx = clamp(a.x + tx * sgn * dist, 5, SIZE - 5), ny = clamp(a.y + ty * sgn * dist, 5, SIZE - 5);
    if (Math.hypot(nx - a.x0, ny - a.y0) > 420) { a.depth = r.next() * 18; continue; } // beyond the active shore: re-buried in place rather than carried further
    a.moves.push({ kind: 'storm', year: st.year, event: st.event || undefined, fromX: a.x, fromY: a.y, toX: nx, toY: ny, dist }); a.x = nx; a.y = ny; a.depth = r.next() * 18;
  }
}
