import { Rng, stream, hash32, hash01 } from './rng';
import { N, CELL, SIZE, idx, cellOf, cellCenter, Terrain, elevAt, CREEK_Q, RIVER_Q, DX, DY, inb } from './terrain';
import { Landscape, Sed, Veg } from './landscape';
import { Geology } from './geology';
import { Deposit, DepositsOut } from './deposits';
import type { HistoryData, Settlement, Business, HEvent, Route, Crossing, Mine, Cache } from './history_types';
import type { Ctx } from './archetypes';
import { Namer, Culture } from './names';

export type SiteKind = 'town_core' | 'town_common' | 'waterfront' | 'town_dump' | 'schoolyard' | 'farm' | 'field' | 'mine' | 'diggings' | 'works' | 'road' | 'railway' | 'station' | 'ford' | 'ferry_landing' | 'fort' | 'battlefield' | 'airfield' | 'beach' | 'wreck_debris' | 'cache' | 'accident' | 'picnic' | 'campground' | 'trailhead' | 'swimming_hole' | 'fairground';
export interface Activity { ctx: Ctx; from: number; to: number; n: number; note: string }
export interface Spot { ctx: Ctx[]; x: number; y: number; r: number; w: number; kind: string; depth?: [number, number] }
export interface Feature {
  id: string; kind: 'foundation' | 'cellar_hole' | 'chimney' | 'well' | 'privy_pit' | 'stone_wall' | 'road_trace' | 'rail_bed' | 'bridge_abutment' | 'adit' | 'tailings' | 'mill_ruin' | 'earthwork' | 'wreck_timber' | 'dump_mound' | 'orchard' | 'cairn' | 'loading_dock' | 'platform' | 'ford_stones' | 'shaft_collar' | 'diggings_pit' | 'concrete_slab' | 'boiler' | 'cemetery';
  x: number; y: number; w: number; h: number; ang: number; site: string; label: string; desc: string; from: number; to: number | null; conspicuous: number; // 0..1 how easy to notice
  settlement?: string; business?: string; route?: string; mine?: string; event?: string;
}
export interface Site {
  id: string; kind: SiteKind; name: string; x: number; y: number; r: number; shape: { t: 'circle' | 'line'; pts?: Array<[number, number]>; width?: number };
  bbox: [number, number, number, number]; acts: Activity[]; spots: Spot[]; features: Feature[]; from: number; to: number | null;
  refs: { settlement?: string; business?: string; route?: string; event?: string; mine?: string; cache?: string; crossing?: string; vessel?: string; farm?: string; deposit?: string };
  access: 'public' | 'permission' | 'builtup'; owner?: string; dynamic: 'none' | 'beach' | 'river'; densityMult: number; special?: any; ctxLabel: string;
}
export interface SiteSet { sites: Site[]; byId: Map<string, Site>; chunks: Map<number, number[]>; features: Feature[]; }

export const CH = 64; // spatial chunk size in metres
export const chunkKey = (cx: number, cy: number) => cy * 4096 + cx;

function popAt(s: Settlement, y: number, startYear: number): number {
  const i = Math.max(0, Math.min(s.popHist.length - 1, y - startYear));
  // popHist is sampled every 5 years; fill gaps by nearest previous
  let j = i; while (j > 0 && s.popHist[j] === undefined) j--; let k = i; while (k < s.popHist.length - 1 && s.popHist[k] === undefined) k++;
  const a = s.popHist[j] ?? 0, b = s.popHist[k] ?? a; return j === k ? a : a + (b - a) * (i - j) / (k - j);
}

export function buildSites(seed: string, T: Terrain, L: Landscape, G: Geology, D: DepositsOut, H: HistoryData, culture: Culture): SiteSet {
  const rr = stream(seed, 'sites');
  const namer = new Namer(culture, stream(seed, 'sitenames'));
  const sites: Site[] = []; const feats: Feature[] = [];
  const S = new Map(H.settlements.map(s => [s.id, s])); const Bz = new Map(H.businesses.map(b => [b.id, b]));
  const END = H.endYear;
  let sn = 0, fn = 0;
  const mkSite = (kind: SiteKind, name: string, x: number, y: number, r: number, o: Partial<Site> & { refs?: Site['refs'] }): Site => {
    const s: Site = { id: `ST${++sn}`, kind, name, x, y, r, shape: { t: 'circle' }, bbox: [x - r, y - r, x + r, y + r], acts: [], spots: [], features: [], from: 0, to: null, refs: {}, access: 'public', dynamic: 'none', densityMult: 1, ctxLabel: kind, ...o } as Site;
    sites.push(s); return s;
  };
  const addFeat = (site: Site, f: Omit<Feature, 'id' | 'site'>) => { const ft: Feature = { id: `F${++fn}`, site: site.id, ...f }; site.features.push(ft); feats.push(ft); return ft; };
  const decades = (from: number, to: number, fn2: (a: number, b: number) => Activity[]): Activity[] => { const out: Activity[] = []; for (let y = from; y <= to; y += 10) out.push(...fn2(y, Math.min(to, y + 9))); return out; };
  const inWorld = (x: number, y: number) => x > 20 && y > 20 && x < SIZE - 20 && y < SIZE - 20;
  const landAt = (x: number, y: number) => { const c = cellOf(x, y); return !T.sea[c] && T.lake[c] < 0; };
  const overgrown = (c: number) => [Veg.Conifer, Veg.Mixed, Veg.Broadleaf].includes(L.veg[c]) ? 0.55 : L.veg[c] === Veg.Shrub || L.veg[c] === Veg.Heath ? 0.7 : L.veg[c] === Veg.Wetland ? 0.5 : 0.9;

  // ---------------- towns, camps, forts
  for (const s of H.settlements) {
    const end = s.abandoned ?? END; const r0 = new Rng(hash32(seed + '|town|' + s.id));
    if (s.kind === 'farmstead') continue;
    const peak = Math.max(s.peak, 10);
    const radius = s.kind === 'seasonal_camp' ? s.radius : Math.min(650, 60 + Math.sqrt(peak) * 7);
    const builtUp = s.current && s.kind !== 'military_settlement';
    const kindName = s.kind === 'seasonal_camp' ? 'camp' : s.kind === 'mining_town' ? 'mining town' : 'townsite';
    const site = mkSite('town_core', builtUp ? `${s.name} (built-up area)` : `Site of ${s.name}`, s.x, s.y, radius, { refs: { settlement: s.id }, from: s.founded, to: s.abandoned ?? null, access: builtUp ? 'builtup' : 'public', ctxLabel: kindName, densityMult: builtUp ? 0 : 1 });
    const spanFrom = s.founded, spanTo = end;
    site.acts = decades(spanFrom, spanTo, (a, b) => {
      const p = (popAt(s, a, H.startYear) + popAt(s, b, H.startYear)) / 2; const yrs = b - a + 1; const n = p * yrs / 10; // person-years per decade averaged to per-year
      const out: Activity[] = [];
      const k = s.kind === 'seasonal_camp' ? 1.4 : 1;
      out.push({ ctx: 'home', from: a, to: b, n: p * k * 1.0, note: 'residents' }, { ctx: 'street', from: a, to: b, n: p * 0.7, note: 'daily traffic' });
      if (s.kind !== 'seasonal_camp') out.push({ ctx: 'shop', from: a, to: b, n: p * 0.3, note: 'trade' });
      if (s.kind === 'seasonal_camp' || s.kind === 'mining_town') out.push({ ctx: 'camp', from: a, to: b, n: p * 0.5, note: 'camp life' });
      if (s.institutions.school !== undefined && b >= s.institutions.school) out.push({ ctx: 'school', from: Math.max(a, s.institutions.school), to: b, n: p * 0.12, note: 'schoolchildren' });
      if (b >= 1880 && p > 400) out.push({ ctx: 'play', from: a, to: b, n: p * 0.12, note: 'recreation' });
      if (s.port) out.push({ ctx: 'wharf', from: a, to: b, n: p * 0.25, note: 'harbour traffic' });
      void n; return out;
    });
    if (s.kind === 'military_settlement') site.acts.push(...decades(spanFrom, spanTo, (a, b) => [{ ctx: 'military' as Ctx, from: a, to: b, n: s.peak * 2, note: 'garrison' }]));
    // layout: street grid with lots
    const nLots = Math.min(90, Math.max(3, Math.round(peak / (s.kind === 'seasonal_camp' ? 6 : 4.5))));
    const ang = s.streetAngle; const ca = Math.cos(ang), sa = Math.sin(ang);
    const spacing = s.kind === 'seasonal_camp' ? 14 : 26;
    const spots: Spot[] = []; let placed = 0;
    for (let ring = 0; placed < nLots && ring < 400; ring++) {
      const u = (r0.next() - 0.5) * 2 * radius, v0 = Math.round((r0.next() - 0.5) * 2 * (radius / 90)) * 90; // street lines every 90 m
      const side = r0.chance(0.5) ? 1 : -1; const vv = v0 + side * 18;
      const x = s.x + u * ca - vv * sa, y = s.y + u * sa + vv * ca;
      if (Math.hypot(u, vv) > radius || !inWorld(x, y) || !landAt(x, y)) continue;
      const main = v0 === 0;
      spots.push({ ctx: main && r0.chance(0.5) ? ['shop', 'street'] : ['home'], x, y, r: 9 + r0.next() * 4, w: main ? 1.4 : 1, kind: main ? 'shopfront lot' : 'house lot', depth: [2, 40] });
      // backyard privy and midden
      const bx = x + (-sa * side) * -9 + r0.float(-2, 2), by = y + (ca * side) * -9 + r0.float(-2, 2);
      spots.push({ ctx: ['dump'], x: bx, y: by, r: 2.6, w: 0.5, kind: 'privy and midden', depth: [25, 200] });
      placed++;
    }
    for (let i = 0; i < Math.max(6, nLots / 3); i++) { const u = (i / Math.max(5, nLots / 3) - 0.5) * 2 * radius; spots.push({ ctx: ['street'], x: s.x + u * ca, y: s.y + u * sa, r: 6, w: 1, kind: 'main street', depth: [1, 25] }); }
    for (let i = 0; i < 4; i++) { const u = (i - 1.5) * 90; spots.push({ ctx: ['street'], x: s.x - u * sa, y: s.y + u * ca, r: 6, w: 0.5, kind: 'cross street', depth: [1, 25] }); }
    if (s.kind === 'seasonal_camp' || s.kind === 'mining_town') for (let i = 0; i < 6; i++) spots.push({ ctx: ['camp'], x: s.x + r0.float(-radius, radius) * 0.8, y: s.y + r0.float(-radius, radius) * 0.8, r: 10, w: 1, kind: 'tent ground', depth: [1, 30] });
    if (s.port) spots.push({ ctx: ['wharf'], x: s.x + r0.float(-60, 60), y: s.y + r0.float(-60, 60), r: 18, w: 1, kind: 'quay', depth: [2, 50] });
    if (s.institutions.school !== undefined) spots.push({ ctx: ['school'], x: s.x + r0.float(-radius, radius) * 0.5, y: s.y + r0.float(-radius, radius) * 0.5, r: 14, w: 1, kind: 'school yard', depth: [1, 25] });
    if (b2(s)) spots.push({ ctx: ['play'], x: s.x + r0.float(-radius, radius) * 0.6, y: s.y + r0.float(-radius, radius) * 0.6, r: 22, w: 1, kind: 'common', depth: [1, 25] });
    for (const sp of spots) if (!sp.ctx.includes('military') && s.kind === 'military_settlement') sp.ctx.push('military');
    if (s.kind === 'military_settlement') spots.push({ ctx: ['military'], x: s.x, y: s.y, r: radius * 0.6, w: 3, kind: 'parade ground', depth: [1, 30] });
    site.spots = spots;
    // visible remains of abandoned places
    if (!builtUp) {
      const lastY = end; const since = END - lastY; const viz = overgrown(s.cell);
      const stone = (y: number) => y >= 1830 || T.slope[s.cell] > 0;
      let fCount = 0;
      for (const sp of spots) {
        if (!(sp.kind === 'house lot' || sp.kind === 'shopfront lot') || fCount > 40) continue;
        const k = hash01(hash32(sp.x + ',' + sp.y), 7);
        if (s.kind === 'seasonal_camp') { if (k < 0.15) addFeat(site, { kind: 'diggings_pit', x: sp.x, y: sp.y, w: 3, h: 3, ang: 0, label: 'fire pit and levelled tent platform', desc: 'A level patch with a scatter of fire-blackened stones.', from: s.founded, to: end, conspicuous: 0.3 * viz, settlement: s.id }); continue; }
        const masonry = s.founded >= 1800 || k > 0.5;
        if (k < (masonry ? 0.7 : 0.35)) { fCount++;
          const w = 5 + hash01(hash32('fw' + sp.x), 3) * 6, h = 4 + hash01(hash32('fh' + sp.y), 4) * 5; const ang = ang0(s);
          const kind: Feature['kind'] = masonry ? (k < 0.18 ? 'chimney' : 'foundation') : 'cellar_hole';
          addFeat(site, { kind, x: sp.x, y: sp.y, w, h, ang, label: kind === 'chimney' ? 'collapsed chimney base' : kind === 'foundation' ? `${s.founded > 1900 ? 'concrete' : 'stone'} foundation` : 'cellar hole', desc: kind === 'cellar_hole' ? 'A squared depression where a cellar was dug.' : kind === 'chimney' ? 'A heap of stones around a hearth base.' : 'The footing of a building, partly buried.', from: s.founded, to: end, conspicuous: Math.max(0.15, (masonry ? 0.8 : 0.4) * viz * Math.exp(-since / 150)), settlement: s.id });
        }
      }
      if (s.institutions.cemetery && r0.chance(0.8)) addFeat(site, { kind: 'cemetery', x: s.x + r0.float(-radius, radius) * 0.9, y: s.y + r0.float(-radius, radius) * 0.9, w: 25, h: 18, ang: 0, label: 'old burial ground', desc: 'A fenced plot of leaning stones. Respect the graves; nothing here is for searching.', from: s.founded, to: end, conspicuous: 0.8, settlement: s.id });
      if (s.kind === 'military_settlement') addFeat(site, { kind: 'earthwork', x: s.x, y: s.y, w: 80, h: 80, ang: 0, label: 'earthwork rampart', desc: 'A low square bank and ditch, the line of a stockade.', from: s.founded, to: end, conspicuous: 0.7, settlement: s.id });
      if (s.stationYear) addFeat(site, { kind: 'platform', x: s.x + 40, y: s.y + 30, w: 40, h: 5, ang: ang, label: 'station platform', desc: 'A raised line of masonry beside a railway bed.', from: s.stationYear, to: end, conspicuous: 0.6 * viz, settlement: s.id });
    }
    // dumps of towns and the like: beyond the edge, near drainage
    if (s.kind !== 'seasonal_camp' && s.pop > 0 && peak > 60) {
      const nd = peak > 1200 ? 2 : 1;
      for (let i = 0; i < nd; i++) {
        let bx = s.x, by = s.y;
        for (let t = 0; t < 40; t++) { const a = r0.float(0, Math.PI * 2), d = radius * r0.float(1.1, 1.8) + 60; const x = s.x + Math.cos(a) * d, y = s.y + Math.sin(a) * d; if (!inWorld(x, y) || !landAt(x, y)) continue; bx = x; by = y; if (T.Q[cellOf(x, y)] > CREEK_Q * 0.4 || T.slope[cellOf(x, y)] > 5) break; }
        const dumpTo = s.current ? Math.min(END, 1965 + i * 5) : end;
        const d = mkSite('town_dump', `${s.current ? 'Old' : 'Former'} ${s.name} refuse dump`, bx, by, 38, { refs: { settlement: s.id }, from: s.founded + 5, to: dumpTo, ctxLabel: 'refuse dump' });
        d.acts = decades(s.founded + 5, dumpTo, (a, b) => { const p = (popAt(s, a, H.startYear) + popAt(s, b, H.startYear)) / 2; return [{ ctx: 'dump' as Ctx, from: a, to: b, n: p * 1.6 / nd, note: 'household and trade refuse' }]; });
        d.spots = [{ ctx: ['dump'], x: bx, y: by, r: 18, w: 1, kind: 'tipping face', depth: [10, 160] }, { ctx: ['dump'], x: bx + 12, y: by - 8, r: 9, w: 0.6, kind: 'burnt rubbish', depth: [5, 90] }];
        addFeat(d, { kind: 'dump_mound', x: bx, y: by, w: 30, h: 20, ang: 0, label: 'rubbish mound with glass and rust', desc: 'A hummock in the scrub littered with bottle glass and pot sherds.', from: s.founded, to: dumpTo, conspicuous: 0.55 * overgrown(cellOf(bx, by)), settlement: s.id });
      }
    }
    // modern commons, waterfronts and school grounds for towns still lived in
    if (s.current && s.kind !== 'military_settlement') {
      if (peak > 250) {
        const pa = r0.float(0, Math.PI * 2), pd = radius * 0.5; const px = s.x + Math.cos(pa) * pd, py = s.y + Math.sin(pa) * pd;
        if (landAt(px, py)) {
          const c = mkSite('town_common', `${s.name} Common`, px, py, 55, { refs: { settlement: s.id }, from: s.founded + 5, to: null, ctxLabel: 'public common', densityMult: 1 });
          c.acts = decades(s.founded + 5, END, (a, b) => { const p = (popAt(s, a, H.startYear) + popAt(s, b, H.startYear)) / 2; return [{ ctx: 'play' as Ctx, from: a, to: b, n: p * 0.5, note: 'public gatherings' }, { ctx: 'street' as Ctx, from: a, to: b, n: p * 0.15, note: 'foot traffic' }]; });
          c.spots = [{ ctx: ['play', 'street'], x: px, y: py, r: 30, w: 1, kind: 'open grass', depth: [1, 22] }];
        }
      }
      if (s.institutions.school !== undefined && peak > 400) {
        const pa = r0.float(0, Math.PI * 2), pd = radius * 0.7; const px = s.x + Math.cos(pa) * pd, py = s.y + Math.sin(pa) * pd;
        if (landAt(px, py) && r0.chance(0.6)) {
          const c = mkSite('schoolyard', `${s.name} old school field`, px, py, 40, { refs: { settlement: s.id }, from: s.institutions.school, to: null, ctxLabel: 'school field' });
          c.acts = decades(s.institutions.school!, END, (a, b) => [{ ctx: 'school' as Ctx, from: a, to: b, n: popAt(s, a, H.startYear) * 0.14, note: 'children at play' }]);
          c.spots = [{ ctx: ['school'], x: px, y: py, r: 22, w: 1, kind: 'playground', depth: [1, 22] }];
        }
      }
    }
    // recreation grounds near sizeable towns
    if (peak > 1100 && !builtUp === false) {
      const nfair = hash01(hash32(s.id), 11) < 0.55;
      for (const [kind, lbl, from, rad] of [['picnic', 'picnic grove', 1885, 45], ['fairground', 'old fairground', 1860, 70]] as const) {
        if (kind === 'fairground' && !nfair) continue; const a = r0.float(0, Math.PI * 2), d = radius * r0.float(1.0, 2.2) + 100; const px = s.x + Math.cos(a) * d, py = s.y + Math.sin(a) * d;
        if (!inWorld(px, py) || !landAt(px, py) || T.slope[cellOf(px, py)] > 8) continue;
        const sx = mkSite(kind, `${s.name} ${lbl}`, px, py, rad, { refs: { settlement: s.id }, from: Math.max(from, s.founded + 10), to: kind === 'fairground' && r0.chance(0.4) ? 1960 + Math.floor(r0.next() * 40) : null, ctxLabel: lbl });
        sx.acts = decades(sx.from, sx.to ?? END, (a, b) => [{ ctx: 'play' as Ctx, from: a, to: b, n: popAt(s, a, H.startYear) * (kind === 'fairground' ? 0.9 : 0.5), note: lbl }, { ctx: 'camp' as Ctx, from: a, to: b, n: popAt(s, a, H.startYear) * 0.08, note: 'day visitors' }]);
        sx.spots = [{ ctx: ['play', 'camp'], x: px, y: py, r: rad * 0.6, w: 1, kind: 'open ground', depth: [1, 22] }];
        if (kind === 'fairground' && sx.to !== null) addFeat(sx, { kind: 'stone_wall', x: px, y: py, w: 100, h: 2, ang: 0.4, label: 'fairground boundary bank', desc: 'A grassed bank marks where the show ring stood.', from: sx.from, to: sx.to, conspicuous: 0.4, settlement: s.id });
      }
    }
  }
  function b2(s: Settlement) { return s.peak > 400; }
  function ang0(s: Settlement) { return s.streetAngle; }

  // ---------------- farms
  for (const f of H.settlements) {
    if (f.kind !== 'farmstead') continue; const end = f.abandoned ?? END; const r0 = new Rng(hash32(seed + '|farm|' + f.id));
    const cur = f.abandoned === undefined;
    const fam = (f as any).family as string;
    const farm = mkSite('farm', cur ? `${f.name}stead` : `Site of ${f.name}`, f.x, f.y, 55, { refs: { settlement: f.id, farm: f.id }, from: f.founded, to: f.abandoned ?? null, access: cur ? 'builtup' : 'public', ctxLabel: 'farmstead', densityMult: cur ? 0 : 1 });
    farm.acts = decades(f.founded, end, (a, b) => [{ ctx: 'home' as Ctx, from: a, to: b, n: 6.5, note: 'household' }, { ctx: 'field' as Ctx, from: a, to: b, n: 2.5, note: 'farm work' }, { ctx: 'camp' as Ctx, from: a, to: b, n: 0.8, note: 'outdoor work' }]);
    const ang = r0.float(0, Math.PI);
    farm.spots = [{ ctx: ['home'], x: f.x, y: f.y, r: 10, w: 2, kind: 'farmhouse', depth: [2, 35] }, { ctx: ['dump'], x: f.x + 22, y: f.y - 15, r: 7, w: 1, kind: 'kitchen midden', depth: [5, 90] }, { ctx: ['field', 'camp'], x: f.x - 20, y: f.y + 18, r: 12, w: 1, kind: 'barnyard', depth: [2, 30] }, { ctx: ['dump'], x: f.x - 4, y: f.y - 20, r: 3, w: 0.5, kind: 'privy', depth: [25, 160] }];
    if (!cur) {
      const viz = overgrown(f.cell);
      addFeat(farm, { kind: end >= 1850 ? 'foundation' : 'cellar_hole', x: f.x, y: f.y, w: 8, h: 6, ang, label: end >= 1850 ? 'farmhouse foundation' : 'cellar hole', desc: 'The footing of a small farmhouse.', from: f.founded, to: end, conspicuous: 0.7 * viz, settlement: f.id });
      addFeat(farm, { kind: 'well', x: f.x + 12, y: f.y + 9, w: 1.5, h: 1.5, ang: 0, label: 'stone-lined well', desc: 'A well, capped with slabs. It is deep and unsafe.', from: f.founded, to: end, conspicuous: 0.35 * viz, settlement: f.id });
      if (r0.chance(0.5)) addFeat(farm, { kind: 'orchard', x: f.x - 30, y: f.y - 30, w: 40, h: 25, ang, label: 'old orchard trees', desc: 'Gnarled fruit trees in rows beside the house site.', from: f.founded, to: end, conspicuous: 0.7, settlement: f.id });
      if (r0.chance(0.6)) addFeat(farm, { kind: 'stone_wall', x: f.x, y: f.y, w: 180, h: 1.5, ang: ang + 1.3, label: 'field wall', desc: 'A tumbled drystone wall running through the trees.', from: f.founded, to: end, conspicuous: 0.45, settlement: f.id });
    }
    const field = mkSite('field', cur ? `${fam} family fields` : `Old fields of ${f.name}`, f.x + r0.float(-60, 60), f.y + r0.float(-60, 60), 200 + r0.next() * 130, { refs: { settlement: f.id, farm: f.id }, from: f.founded, to: f.abandoned ?? null, access: cur ? 'permission' : 'public', owner: f.id, ctxLabel: 'ploughed field' });
    field.acts = decades(f.founded, END, (a, b) => { if (a > end) return [{ ctx: 'modern' as Ctx, from: Math.max(a, 1960), to: b, n: 0.4, note: 'hunters and walkers' }].filter(x => x.to >= 1960); return [{ ctx: 'field' as Ctx, from: a, to: Math.min(b, end), n: 5, note: 'ploughing and haymaking' }, { ctx: 'road' as Ctx, from: a, to: Math.min(b, end), n: 0.6, note: 'carts at the lane' }]; });
    field.spots = [{ ctx: ['field', 'road', 'modern'], x: field.x, y: field.y, r: field.r * 0.85, w: 1, kind: 'ploughland', depth: [0, 24] }];
    field.dynamic = 'none';
  }

  // ---------------- mines and diggings
  for (const m of H.mines) {
    const town = S.get(m.settlement)!; const dep = D.deposits.find(d => d.id === m.deposit)!; const end = m.closed ?? END; const r0 = new Rng(hash32(seed + '|mine|' + m.id));
    const rad = m.tailingsRadius + 40;
    const site = mkSite('mine', `${m.claimName}`, m.x, m.y, rad, { refs: { mine: m.id, settlement: town.id, deposit: m.deposit, business: m.company }, from: m.opened, to: m.closed ?? null, ctxLabel: 'mine workings' });
    const workers = (y: number) => m.method === 'open_pit' ? 120 : m.method === 'quarry' ? 25 : 40 + 30 * Math.min(3, H.econ[Math.max(0, y - H.startYear)] ?? 1);
    site.acts = decades(m.opened, end, (a, b) => [{ ctx: 'mine' as Ctx, from: a, to: b, n: workers(a), note: 'miners' }, { ctx: 'works' as Ctx, from: a, to: b, n: workers(a) * 0.4, note: 'mill and surface works' }, { ctx: 'camp' as Ctx, from: a, to: b, n: workers(a) * 0.3, note: 'meal breaks' }, { ctx: 'dump' as Ctx, from: a, to: b, n: workers(a) * 0.6, note: 'waste' }]);
    site.spots = [{ ctx: ['mine'], x: m.x, y: m.y, r: 14, w: 2, kind: 'portal and collar', depth: [2, 60] }, { ctx: ['works'], x: m.x + 30, y: m.y + 20, r: 18, w: 2, kind: 'mill and blacksmith area', depth: [2, 50] }, { ctx: ['mine', 'dump'], x: m.x - 25, y: m.y - 15, r: m.tailingsRadius * 0.4, w: 1.5, kind: 'waste rock heaps', depth: [5, 120] }, { ctx: ['camp'], x: m.x + 10, y: m.y + 50, r: 15, w: 1, kind: 'lunch ground', depth: [1, 30] }];
    const viz = overgrown(cellOf(m.x, m.y)); const since = END - end;
    const adit = addFeat(site, { kind: m.method === 'shaft' ? 'shaft_collar' : m.method === 'open_pit' ? 'tailings' : 'adit', x: m.x, y: m.y, w: 6, h: 6, ang: 0, label: m.method === 'shaft' ? 'collapsed shaft collar' : m.method === 'open_pit' ? 'flooded open pit and benches' : m.method === 'quarry' ? 'quarry face' : 'timbered adit portal, caved', desc: 'Old workings. Dangerous: do not enter.', from: m.opened, to: end, conspicuous: 0.85, mine: m.id, business: m.company });
    void adit;
    addFeat(site, { kind: 'tailings', x: m.x - 25, y: m.y - 15, w: m.tailingsRadius, h: m.tailingsRadius * 0.7, ang: r0.float(0, 3), label: 'spoil heaps and tailings', desc: 'Piles of broken rock, rust-coloured where sulfides weathered.', from: m.opened, to: end, conspicuous: Math.max(0.5, 0.9 * viz), mine: m.id });
    addFeat(site, { kind: 'mill_ruin', x: m.x + 30, y: m.y + 20, w: 14, h: 10, ang: r0.float(0, 3), label: 'mill footings and engine bed', desc: 'Stepped stone footings where a stamp mill or engine stood.', from: m.opened, to: end, conspicuous: Math.max(0.3, 0.7 * viz * Math.exp(-since / 120)), mine: m.id, business: m.company });
    if (dep.kind === 'coal' || m.method === 'open_pit') addFeat(site, { kind: 'loading_dock', x: m.x + 60, y: m.y + 10, w: 20, h: 6, ang: 0, label: 'loading ramp', desc: 'A masonry ramp where wagons or rail cars were loaded.', from: m.opened, to: end, conspicuous: 0.4, mine: m.id });
  }
  // gold rush diggings
  for (const ev of H.events.filter(e => e.kind === 'gold_rush')) {
    const camp = H.settlements.find(s => s.kind === 'seasonal_camp' && s.depositId === ev.deposit && s.founded === ev.year); if (!camp) continue;
    const r0 = new Rng(hash32(seed + '|rush|' + ev.id)); const len = (ev.extra?.rushLen as number) ?? 3; const cx = ev.x!, cy = ev.y!;
    const site = mkSite('diggings', `Diggings of ${camp.name}`, cx, cy, 160, { refs: { settlement: camp.id, event: ev.id, deposit: ev.deposit }, from: ev.year, to: ev.year + len, ctxLabel: 'placer diggings', dynamic: 'river' });
    site.acts = [{ ctx: 'mine', from: ev.year, to: ev.year + len, n: camp.peak * 0.9, note: 'diggers' }, { ctx: 'camp', from: ev.year, to: ev.year + len, n: camp.peak * 0.6, note: 'tent life' }, { ctx: 'dump', from: ev.year, to: ev.year + len, n: camp.peak * 0.4, note: 'camp refuse' }];
    site.spots = [{ ctx: ['mine'], x: cx, y: cy, r: 55, w: 2, kind: 'worked gravel bars', depth: [3, 80] }, { ctx: ['camp', 'dump'], x: camp.x, y: camp.y, r: 40, w: 1.5, kind: 'tent ground', depth: [1, 40] }];
    addFeat(site, { kind: 'diggings_pit', x: cx, y: cy, w: 60, h: 30, ang: 0.3, label: 'worked-over gravel bars with cobble piles', desc: 'Stones turned over and heaped by hand: the creek was dug right through.', from: ev.year, to: ev.year + len, conspicuous: 0.6 * overgrown(cellOf(cx, cy)), event: ev.id });
  }
  // ---------------- works (businesses with plant)
  const WORKS: string[] = ['sawmill', 'mill', 'foundry', 'brickworks', 'glassworks', 'cannery', 'bottler', 'brewery', 'tannery', 'pottery', 'quarry', 'lime_kiln', 'button_works', 'tin_shop', 'garage'];
  for (const b of H.businesses) {
    if (!WORKS.includes(b.kind) || b.scale < 2) continue; const s = S.get(b.settlement)!; const end = b.closed ?? END;
    const cur = s.current; const local = new Rng(hash32(seed + '|biz|' + b.id));
    const reveal = !cur || hash01(hash32(b.id), 5) < 0.35 || b.kind === 'quarry' || b.kind === 'lime_kiln';
    if (!reveal) continue; if (b.closed === undefined && cur) continue; // a working factory in a living town is not searchable
    let bx = b.x, by = b.y; if (b.kind === 'sawmill' || b.kind === 'mill' || b.kind === 'tannery' || b.kind === 'brickworks') { // move beside water
      for (let t = 0; t < 30; t++) { const x = bx + local.float(-250, 250), y = by + local.float(-250, 250); if (landAt(x, y) && inWorld(x, y) && T.Q[cellOf(x, y)] > CREEK_Q) { bx = x; by = y; break; } } }
    const site = mkSite('works', `Site of ${b.name}`, bx, by, 55, { refs: { business: b.id, settlement: s.id }, from: b.founded, to: end, ctxLabel: 'works site', access: 'public' });
    site.acts = decades(b.founded, end, (a, c2) => [{ ctx: 'works' as Ctx, from: a, to: c2, n: b.capacity * 4, note: 'workforce' }, { ctx: 'dump' as Ctx, from: a, to: c2, n: b.capacity * 2.5, note: 'works waste' }, { ctx: 'camp' as Ctx, from: a, to: c2, n: b.capacity * 0.6, note: 'breaks' }]);
    site.spots = [{ ctx: ['works'], x: bx, y: by, r: 20, w: 2, kind: 'works floor', depth: [2, 45] }, { ctx: ['dump'], x: bx + 22, y: by + 12, r: 10, w: 1.5, kind: `${b.kind === 'glassworks' ? 'cullet' : b.kind === 'pottery' ? 'wasters' : 'works'} dump`, depth: [5, 100] }, { ctx: ['camp'], x: bx - 18, y: by + 14, r: 8, w: 1, kind: 'yard', depth: [1, 25] }];
    const viz = overgrown(cellOf(bx, by)); const since = END - end;
    addFeat(site, { kind: b.kind === 'sawmill' || b.kind === 'mill' ? 'mill_ruin' : 'foundation', x: bx, y: by, w: 14 + b.scale * 3, h: 10 + b.scale * 2, ang: local.float(0, 3), label: `${b.kind.replace('_', ' ')} footings`, desc: `Footings and rubble of what was ${b.name}.`, from: b.founded, to: end, conspicuous: Math.max(0.25, 0.8 * viz * Math.exp(-since / 140)), business: b.id, settlement: s.id });
    if (b.kind === 'foundry' || b.kind === 'brickworks' || b.kind === 'glassworks' || b.kind === 'lime_kiln' || b.kind === 'pottery') addFeat(site, { kind: 'chimney', x: bx + 6, y: by + 3, w: 3, h: 3, ang: 0, label: b.kind === 'lime_kiln' ? 'stone kiln' : 'brick chimney stump', desc: 'A stump of firebrick or stone with a blackened throat.', from: b.founded, to: end, conspicuous: Math.max(0.3, 0.75 * viz), business: b.id });
  }
  // ---------------- routes
  const SEG = 1000;
  for (const rt of H.routes) {
    const end = rt.kind === 'railway' ? (rt.lifted ?? END) : rt.closed ?? END; const start = rt.kind === 'railway' ? (rt.opened ?? rt.built) : rt.built;
    const a = S.get(rt.from)!, b = S.get(rt.to)!;
    const pts = rt.pts; let acc = 0, seg: Array<[number, number]> = [pts[0]]; let segIdx = 0; const segs: Array<Array<[number, number]>> = [];
    for (let i = 1; i < pts.length; i++) { acc += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); seg.push(pts[i]); if (acc >= SEG) { segs.push(seg); seg = [pts[i]]; acc = 0; } }
    if (seg.length > 1) segs.push(seg);
    for (const sp of segs) {
      const xs = sp.map(p => p[0]), ys = sp.map(p => p[1]); const mx = (Math.min(...xs) + Math.max(...xs)) / 2, my = (Math.min(...ys) + Math.max(...ys)) / 2;
      const w = rt.width;
      const site = mkSite(rt.kind === 'railway' ? 'railway' : 'road', `${rt.name} (section ${++segIdx})`, mx, my, Math.hypot(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) / 2 + 20, { shape: { t: 'line', pts: sp, width: w }, refs: { route: rt.id }, from: start, to: end >= END && !(rt.closed || rt.lifted) ? null : end, ctxLabel: rt.kind === 'railway' ? 'railway line' : 'roadside', bbox: [Math.min(...xs) - 25, Math.min(...ys) - 25, Math.max(...xs) + 25, Math.max(...ys) + 25], dynamic: 'none' });
      const length = sp.reduce((t, p, i) => i ? t + Math.hypot(p[0] - sp[i - 1][0], p[1] - sp[i - 1][1]) : t, 0);
      const traffic = (y: number) => { const pp = (popAt(a, y, H.startYear) + popAt(b, y, H.startYear)); return rt.kind === 'railway' ? 3000 + pp * 0.3 : Math.max(60, pp * (y < 1910 ? 0.12 : 0.18)); };
      site.acts = decades(start, end, (x0, x1) => [{ ctx: rt.kind === 'railway' ? 'rail' as Ctx : 'road' as Ctx, from: x0, to: x1, n: traffic(x0) * length / 1000 / 5, note: rt.kind === 'railway' ? 'trains and track gangs' : 'carts, riders and walkers' }]);
      if (end >= 1960 && !rt.closed && rt.kind !== 'railway') site.acts.push({ ctx: 'modern', from: 1960, to: END, n: traffic(2000) * length / 1000 / 8, note: 'passing motorists' });
      if (rt.closed || rt.lifted) site.acts.push({ ctx: 'trail', from: Math.max(end, 1950), to: END, n: 4 * length / 1000, note: 'walkers on the old route' });
      const lineSpots = Math.max(3, Math.round(length / 28));
      for (let i = 0; i < lineSpots; i++) { const t = (i + 0.5) / lineSpots; const k = Math.min(sp.length - 2, Math.floor(t * (sp.length - 1))); const f2 = t * (sp.length - 1) - k; const x = sp[k][0] + (sp[k + 1][0] - sp[k][0]) * f2, y = sp[k][1] + (sp[k + 1][1] - sp[k][1]) * f2;
        site.spots.push({ ctx: rt.kind === 'railway' ? ['rail'] : ['road', 'modern', 'trail'], x, y, r: w * 0.9 + 2, w: 1, kind: rt.kind === 'railway' ? 'track bed' : 'verge', depth: [1, 25] }); }
      if (rt.kind === 'railway' && rt.lifted) addFeat(site, { kind: 'rail_bed', x: mx, y: my, w: length, h: 4, ang: Math.atan2(sp[sp.length - 1][1] - sp[0][1], sp[sp.length - 1][0] - sp[0][0]), label: 'abandoned railway embankment', desc: 'A raised, level bed with a scatter of rotten sleepers; the rails were lifted.', from: start, to: end, conspicuous: 0.85, route: rt.id });
      else if ((rt.closed ?? 9999) < END && rt.kind !== 'railway' && length > 300) addFeat(site, { kind: 'road_trace', x: mx, y: my, w: length, h: 5, ang: Math.atan2(sp[sp.length - 1][1] - sp[0][1], sp[sp.length - 1][0] - sp[0][0]), label: 'overgrown old road', desc: 'A sunken, tree-lined lane that leads nowhere any more.', from: start, to: end, conspicuous: 0.5 * overgrown(cellOf(mx, my)), route: rt.id });
    }
  }
  // stations (rail ctx + street)
  for (const s of H.settlements) {
    if (!s.stationYear || s.kind === 'farmstead') continue; const r0 = new Rng(hash32(seed + '|stn|' + s.id));
    const rtEnd = Math.max(...H.routes.filter(rt => rt.kind === 'railway' && (rt.from === s.id || rt.to === s.id)).map(rt => rt.lifted ?? END), s.stationYear);
    const stX = s.x + 55, stY = s.y - 40; const cur = rtEnd >= END;
    if (cur && s.current) continue; // working station in a living town
    const site = mkSite('station', `${s.name} station yard`, stX, stY, 50, { refs: { settlement: s.id }, from: s.stationYear, to: cur ? null : rtEnd, ctxLabel: 'station yard' });
    site.acts = decades(s.stationYear, rtEnd, (a, b) => [{ ctx: 'rail' as Ctx, from: a, to: b, n: 140 + popAt(s, a, H.startYear) * 0.4, note: 'passengers and freight' }, { ctx: 'street' as Ctx, from: a, to: b, n: popAt(s, a, H.startYear) * 0.15, note: 'station forecourt' }]);
    site.spots = [{ ctx: ['rail', 'street'], x: stX, y: stY, r: 18, w: 2, kind: 'platform and forecourt', depth: [1, 40] }, { ctx: ['rail'], x: stX + 40, y: stY + 6, r: 12, w: 1, kind: 'goods yard', depth: [2, 45] }];
    addFeat(site, { kind: 'platform', x: stX, y: stY, w: 45, h: 5, ang: r0.float(0, 3), label: 'station platform edge', desc: 'A line of squared stones with a cinder surface.', from: s.stationYear, to: rtEnd, conspicuous: 0.6 * overgrown(s.cell), settlement: s.id });
  }
  // ---------------- crossings
  for (const x of H.crossings) {
    const rt = H.routes.find(q => q.id === x.route)!; const end = rt.closed ?? rt.lifted ?? END; const s0 = x.built;
    const site = mkSite('ford', `${x.kind === 'ferry' ? 'Ferry landing' : x.kind === 'bridge' ? 'Bridge' : 'Ford'} on the ${rt.name}`, x.x, x.y, 45, { refs: { crossing: x.id, route: rt.id }, from: s0, to: end >= END ? null : end, ctxLabel: x.kind === 'ferry' ? 'ferry landing' : 'river crossing', dynamic: 'river' });
    const trafficF = Math.max(80, (S.get(rt.from)!.peak + S.get(rt.to)!.peak) * 0.12);
    site.acts = decades(s0, end, (a, b) => [{ ctx: 'ford' as Ctx, from: a, to: b, n: trafficF * (rt.kind === 'railway' ? 0.2 : 1), note: 'travellers crossing' }]);
    if ((x.replaced ?? 0) > 0) site.acts.push({ ctx: 'ford', from: s0, to: x.replaced!, n: trafficF * 0.6, note: `traffic at the ${x.replacedBy}` });
    const r0 = new Rng(hash32(seed + '|x|' + x.id)); const ang = r0.float(0, Math.PI);
    site.spots = [{ ctx: ['ford'], x: x.x, y: x.y, r: 16, w: 2, kind: 'crossing place', depth: [3, 80] }, { ctx: ['ford'], x: x.x + Math.cos(ang) * 20, y: x.y + Math.sin(ang) * 20, r: 10, w: 1, kind: 'approach', depth: [2, 40] }];
    if (x.kind === 'bridge' && rt.kind !== 'railway') addFeat(site, { kind: 'bridge_abutment', x: x.x, y: x.y, w: 8, h: 6, ang, label: 'bridge abutments', desc: 'Stone abutments on both banks; the span is gone or replaced.', from: x.replaced ?? s0, to: null, conspicuous: 0.6, route: rt.id });
    if (x.kind === 'ford') addFeat(site, { kind: 'ford_stones', x: x.x, y: x.y, w: 14, h: 6, ang, label: 'paved ford', desc: 'Flat stones laid across a shallow stream, worn smooth.', from: s0, to: null, conspicuous: 0.35, route: rt.id });
  }
  // ---------------- shipwrecks: debris along the shore
  for (const ev of H.events.filter(e => e.kind === 'shipwreck')) {
    const v = H.vessels.find(q => q.id === ev.vessel)!; const wind = (ev.extra?.windAngle as number) ?? T.traits.windAngle;
    // debris comes ashore on the nearest coast cells downwind
    const coast: number[] = []; for (let c = 0; c < N * N; c++) if (!T.sea[c] && T.coastDist[c] <= CELL * 1.2) coast.push(c);
    if (!coast.length) continue;
    const wx = ev.x!, wy = ev.y!;
    let best = -1, bd = 1e9; for (const c of coast) { const [cx, cy] = cellCenter(c); const d = Math.hypot(cx - wx - Math.cos(wind) * 1500, cy - wy - Math.sin(wind) * 1500); if (d < bd) { bd = d; best = c; } }
    const [bx, by] = cellCenter(best); const r0 = new Rng(hash32(seed + '|wreck|' + ev.id));
    const site = mkSite('wreck_debris', `Wreck debris of the ${v.name}`, bx + r0.float(-80, 80), by + r0.float(-80, 80), 90, { refs: { event: ev.id, vessel: v.id }, from: ev.year, to: null, ctxLabel: 'wreck strand', dynamic: 'beach', special: { vessel: v.id, event: ev.id } });
    site.acts = [{ ctx: 'wreck', from: ev.year, to: ev.year, n: Math.round(8 + v.tonnage / 12), note: `the ${v.name} broke up` }];
    site.spots = [{ ctx: ['wreck'], x: site.x, y: site.y, r: 50, w: 1, kind: 'tideline', depth: [0, 25] }];
    addFeat(site, { kind: 'wreck_timber', x: site.x, y: site.y, w: 6, h: 1, ang: wind, label: 'weathered ship\'s timber', desc: 'A hull timber studded with corroded fastenings, jammed among the rocks.', from: ev.year, to: null, conspicuous: 0.35, event: ev.id });
  }
  // ---------------- caches and accidents
  for (const c of H.caches) { const ev = H.events.find(e => e.id === c.event)!; const site = mkSite('cache', 'Buried cache', c.x, c.y, 2.5, { refs: { cache: c.id, event: c.event }, from: c.year, to: null, special: { cache: c.id }, ctxLabel: 'buried cache' }); site.bbox = [c.x - 3, c.y - 3, c.x + 3, c.y + 3]; void ev; }
  for (const ev of H.events.filter(e => e.kind === 'accident_death' || e.kind === 'lost_shipment')) {
    const cr = H.crossings.find(q => q.id === ev.extra?.crossing); const site = mkSite('accident', ev.title, ev.x!, ev.y!, 35, { refs: { event: ev.id, crossing: cr?.id }, from: ev.year, to: null, special: { event: ev.id }, ctxLabel: ev.kind === 'lost_shipment' ? 'lost cargo' : 'drowning site', dynamic: 'river' }); void site;
  }
  // battles and forts
  for (const ev of H.events.filter(e => e.kind === 'battle')) {
    const war = H.wars.find(w => w.id === ev.extra?.war); const site = mkSite('battlefield', ev.title, ev.x!, ev.y!, 140, { refs: { event: ev.id, settlement: ev.settlement }, from: ev.year, to: null, ctxLabel: 'skirmish ground', special: { event: ev.id, war: war?.id } });
    const r0 = new Rng(hash32(seed + '|battle|' + ev.id));
    site.acts = [{ ctx: 'military', from: ev.year, to: ev.year, n: 120 + r0.int(0, 200), note: 'the fighting' }, { ctx: 'camp', from: ev.year, to: ev.year, n: 40, note: 'bivouac' }];
    site.spots = [{ ctx: ['military'], x: ev.x!, y: ev.y!, r: 70, w: 2, kind: 'skirmish line', depth: [0, 20] }, { ctx: ['camp'], x: ev.x! + 80, y: ev.y! + 40, r: 25, w: 1, kind: 'bivouac', depth: [1, 25] }];
  }
  // WW airfield
  // modern: trailheads and campgrounds near highways and towns
  const rng2 = rr;
  for (const rt of H.routes.filter(q => q.kind === 'highway' || q.kind === 'road').slice(0, 12)) {
    if (rt.closed) continue; const k = Math.floor(rt.path.length / 2); const [x, y] = cellCenter(rt.path[k]);
    const dx = rng2.float(-300, 300), dy = rng2.float(-300, 300); if (!inWorld(x + dx, y + dy) || !landAt(x + dx, y + dy)) continue;
    const site = mkSite(rng2.chance(0.5) ? 'campground' : 'trailhead', rng2.chance(0.5) ? 'Roadside rest area' : 'Trailhead car park', x + dx, y + dy, 40, { refs: { route: rt.id }, from: 1960, to: null, ctxLabel: 'public recreation area' });
    site.acts = [{ ctx: 'modern', from: 1960, to: END, n: 380, note: 'visitors' }, { ctx: 'camp', from: 1960, to: END, n: 120, note: 'campers' }, { ctx: 'trail', from: 1960, to: END, n: 80, note: 'walkers' }];
    site.spots = [{ ctx: ['modern', 'camp', 'trail'], x: site.x, y: site.y, r: 25, w: 1, kind: 'parking and picnic ground', depth: [0, 15] }];
  }
  // beaches near coastal settlements (and a few wild ones)
  const coastCells: number[] = []; for (let c = 0; c < N * N; c++) if (!T.sea[c] && T.coastDist[c] <= CELL * 1.2 && T.slope[c] < 10) coastCells.push(c);
  const beachSeeds: Array<{ c: number; s?: Settlement }> = [];
  for (const s of H.settlements) { if (s.kind === 'farmstead' || s.kind === 'seasonal_camp' || s.peak < 80 || T.coastDist[s.cell] > CELL * 14) continue; let best = -1, bd = 1e9; for (const c of coastCells) { const [cx, cy] = cellCenter(c); const d = Math.hypot(cx - s.x, cy - s.y); if (d < bd) { bd = d; best = c; } } if (best >= 0) beachSeeds.push({ c: best, s }); }
  for (let i = 0; i < 6 && coastCells.length; i++) beachSeeds.push({ c: rng2.pick(coastCells) });
  for (const bs of beachSeeds) {
    const r0 = new Rng(hash32(seed + '|beach|' + bs.c)); const [cx, cy] = cellCenter(bs.c);
    const nearTown = bs.s && Math.hypot(cx - bs.s.x, cy - bs.s.y) < 3500;
    const site = mkSite('beach', bs.s ? `${bs.s.name} shore` : `${namer.stem(2)} strand`, cx + r0.float(-60, 60), cy + r0.float(-60, 60), 110, { refs: { settlement: bs.s?.id }, from: bs.s?.founded ?? 1800, to: null, dynamic: 'beach', ctxLabel: 'shoreline', access: 'public' });
    const s = bs.s;
    site.acts = decades(s?.founded ?? 1900, END, (a, b) => {
      const p = s ? popAt(s, a, H.startYear) : 80; const out: Activity[] = [{ ctx: 'beach' as Ctx, from: a, to: b, n: Math.min(2000, p * (nearTown ? 0.5 : 0.12) * (a >= 1890 ? 1 : 0.4)), note: 'beachgoers and shore fishermen' }];
      if (s && s.port && a < 1960) out.push({ ctx: 'wharf' as Ctx, from: a, to: b, n: p * 0.12, note: 'boats pulled up on the shore' }); if (a >= 1960) out.push({ ctx: 'modern' as Ctx, from: a, to: b, n: 140 + p * 0.1, note: 'visitors' }); return out; });
    site.spots = [{ ctx: ['beach', 'wharf', 'modern'], x: site.x, y: site.y, r: 60, w: 1, kind: 'high-tide line', depth: [0, 28] }];
  }
  // ----------- index
  const chunks = new Map<number, number[]>(); const byId = new Map<string, Site>();
  sites.forEach((s, i) => {
    byId.set(s.id, s);
    let [x0, y0, x1, y1] = s.bbox;
    if (s.dynamic === 'river') { x0 -= 1500; y0 -= 1500; x1 += 1500; y1 += 1500; }
    else if (s.dynamic === 'beach') { x0 -= 500; y0 -= 500; x1 += 500; y1 += 500; }
    s.bbox = [x0, y0, x1, y1];
    const cx0 = Math.max(0, Math.floor(x0 / CH)), cx1 = Math.min(Math.floor(SIZE / CH), Math.floor(x1 / CH)), cy0 = Math.max(0, Math.floor(y0 / CH)), cy1 = Math.min(Math.floor(SIZE / CH), Math.floor(y1 / CH));
    for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) { const k = chunkKey(cx, cy); const l = chunks.get(k); if (l) l.push(i); else chunks.set(k, [i]); }
  });
  return { sites, byId, chunks, features: feats };
}
export { popAt };
