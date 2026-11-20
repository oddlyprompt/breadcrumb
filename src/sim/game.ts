import { hash01, hash32, Rng } from './rng';
import { generateSite, Artifact } from './artifacts';
import { specimensInChunk, Specimen } from './specimens';
import { N, CELL, SIZE, cellOf, cellCenter, elevAt, idx, inb, DX, DY, CREEK_Q, riverWidth } from './terrain';
import { Sed, Veg } from './landscape';
import { CH, chunkKey, Site } from './sites';
import { START_CASH, GEARBY, Gear } from './equipment';
import { playEventsUntil, weatherOn, wetnessOn, tideHeight, PlayEvent, calendar, lightLevel } from './environment';
import { Find, toolsFrom, Tools, legibility, describeArtifact, specimenName, observeSpecimen, cleanFind } from './identify';
import { Target, DetSetup, response, groundInfo, Response } from './detector';
import { offerFor, buyersFor, trueValue, specimenValue, Buyer } from './economy';
import { ARC } from './archetypes';
import { aStar } from './path';
import { clamp } from './noise';
import type { World } from './worldtypes';
import type { Doc } from './documents';
import { fmtDate, MONTHS, placeDescribe, bearing as bearingWord } from './describe';
import { KNOWN_GROUND } from './sites';

export function lakeMask(w: World, x: number, y: number): number { const fx = clamp(x / CELL - 0.5, 0, N - 1.001), fy = clamp(y / CELL - 0.5, 0, N - 1.001); const ix = Math.floor(fx), iy = Math.floor(fy), tx = fx - ix, ty = fy - iy; const m = (i: number) => (w.T.lake[i] >= 0 ? 1 : 0); return (m(iy * N + ix) * (1 - tx) + m(iy * N + ix + 1) * tx) * (1 - ty) + (m((iy + 1) * N + ix) * (1 - tx) + m((iy + 1) * N + ix + 1) * tx) * ty; }
/** is this spot under the sea (at the given tide) or a lake? */
export function isWater(w: World, x: number, y: number, tide = 0): boolean { if (lakeMask(w, x, y) > 0.5) return true; const c = cellOf(x, y); if (w.T.coastDist[c] > CELL * 3) return false; return elevAt(w.T, x, y) < tide - 0.15; }

export const SAVE_VERSION = 1;
const BUCKET = 8; const bucketKey = (x: number, y: number) => Math.floor(y / BUCKET) * 100000 + Math.floor(x / BUCKET);
/** Share of shallow objects that actually lie exposed on the surface, by kind of ground. Bare sand, ploughland,
 *  dump faces and spoil heaps show things; turf shows a little; forest floor and verges almost nothing. */
const SURFACE: Record<string, number> = { beach: 1, wreck_debris: 1, town_dump: 0.55, diggings: 0.35, mine: 0.3, fairground: 0.16, picnic: 0.16, town_common: 0.14, schoolyard: 0.16, campground: 0.2, trailhead: 0.2, station: 0.12, works: 0.1, field: 0.4, town_core: 0.06, farm: 0.06, ford: 0.12, accident: 0.1, road: 0.05, railway: 0.08, battlefield: 0.05, cache: 0 };
const PUBLIC_IN_TOWN = new Set(['town_common', 'schoolyard', 'picnic', 'fairground', 'beach', 'town_dump']);
export interface Bookmark { id: string; day: number; label: string; x: number; y: number; radius: number; doc?: string; note?: string }
export interface JournalNote { id: string; day: number; kind: 'find' | 'place' | 'record' | 'link' | 'geology' | 'note' | 'objective'; title: string; text: string; x?: number; y?: number; ref?: string }
export interface Discovery { day: number; title: string; text: string; tier: number; value: number; uid?: string; ref?: string }
export interface GameState {
  v: number; genVersion: number; seed: string; created: number;
  day: number; minute: number; x: number; y: number;
  cash: number; owned: Record<string, number>; equipped: { det?: string; coil?: string; digger: string; pin?: string };
  det: { sens: number; reject: boolean[]; ironReject: boolean; ground: number };
  finds: Find[]; uidSeq: number; recovered: Record<string, number>; holes: Array<{ x: number; y: number; day: number }>;
  kb: string[]; docsRead: string[]; bookmarks: Bookmark[]; notes: JournalNote[]; discoveries: Discovery[]; featuresSeen: string[]; sitesVisited: string[];
  permissions: Record<string, 'granted' | 'denied'>; stats: { dug: number; found: number; sold: number; earned: number; minutes: number; panned: number; travelled: number };
  objectives: Record<string, boolean>; soldIds: string[]; knownTypes: string[]; knownMakers: string[];
}
export function newGame(w: World): GameState {
  const gm: GameState = {
    v: SAVE_VERSION, genVersion: w.genVersion, seed: w.seed, created: Date.now(), day: 0, minute: 8 * 60, x: w.start.x, y: w.start.y, cash: START_CASH, owned: {}, equipped: { digger: 'hands' },
    det: { sens: 1, reject: [false, false, false, false, false], ironReject: true, ground: 1 }, finds: [], uidSeq: 0, recovered: {}, holes: [], kb: [], docsRead: [], bookmarks: [], notes: [], discoveries: [], featuresSeen: [], sitesVisited: [], permissions: {},
    stats: { dug: 0, found: 0, sold: 0, earned: 0, minutes: 0, panned: 0, travelled: 0 }, objectives: {}, soldIds: [], knownTypes: [], knownMakers: [],
  };
  const s = w.H.settlements.find(q => q.id === w.start.settlement)!;
  // start on the high street of the starting town; the known grounds around it are common knowledge
  gm.x = s.x + 6; gm.y = s.y + 6;
  const known = w.sites.sites.filter(q => KNOWN_GROUND.has(q.kind) && q.access === 'public' && q.densityMult > 0 && Math.hypot(q.x - s.x, q.y - s.y) < 6000).sort((a, b) => Math.hypot(a.x - s.x, a.y - s.y) - Math.hypot(b.x - s.x, b.y - s.y));
  for (const q of known) gm.kb.push(`site:${q.id}:known`);
  gm.kb.push(`settlement:${s.id}`);
  // public records: the current settlements and the regional geology are common knowledge
  for (const q of w.H.settlements) if (q.current && q.kind !== 'farmstead') gm.kb.push(`settlement:${q.id}`);
  gm.notes.push({ id: 'n0', day: 0, kind: 'note', title: `Arrival at ${s.name}`, text: `You have $${START_CASH}, a backpack and a free afternoon. Folk in ${s.name} hunt for lost things at ${known.slice(0, 4).map(q => `${q.name} (${(Math.hypot(q.x - s.x, q.y - s.y) / 1000).toFixed(1)} km ${bearingWord(q.x - s.x, q.y - s.y)})`).join(', ') || 'the edge of town'}. These are marked on your map. Anything further afield you will have to find out about.`, x: s.x, y: s.y });
  return gm;
}
export const hasFact = (g: GameState) => { const set = new Set(g.kb); return (f: string) => set.has(f); };
export function learn(g: GameState, facts: string[]) { const set = new Set(g.kb); let n = 0; for (const f of facts) if (!set.has(f)) { g.kb.push(f); set.add(f); n++; } return n; }
export function ownedTools(g: GameState): Tools { return toolsFrom(g.owned); }
export function slotsOf(g: GameState): number { let s = 30; for (const id of Object.keys(g.owned)) { const ge = GEARBY[id]; if (g.owned[id] && ge?.cat === 'bag') s += ge.s.slots as number; } return s; }
export function slotsUsed(g: GameState): number { return g.finds.filter(f => f.status !== 'sold').length; }
export function minutesPass(g: GameState, m: number) { g.minute += m; g.stats.minutes += m; while (g.minute >= 1440) { g.minute -= 1440; g.day++; } }
export function sleepToMorning(g: GameState, w: World) { const want = 7 * 60 + 20; let m = want - g.minute; if (m <= 0) m += 1440; minutesPass(g, m); }

/** The runtime view of the world: what lies near a point right now (generated lazily, deterministic, order-independent). */
export class Searcher {
  private events: PlayEvent[] = []; private evDay = -1; private shifted = new Map<string, { n: number; x: number; y: number; depth: number }>();
  private specCache = new Map<number, Specimen[]>();
  tide = 0;
  constructor(public w: World, public g: GameState) {}
  private refreshEvents() { if (this.evDay !== this.g.day) { this.events = playEventsUntil(this.w, this.g.day); this.evDay = this.g.day; } }
  sitesNear(x: number, y: number, r: number): Site[] {
    const out = new Set<number>(); const cx0 = Math.floor((x - r) / CH), cx1 = Math.floor((x + r) / CH), cy0 = Math.floor((y - r) / CH), cy1 = Math.floor((y + r) / CH);
    for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) for (const i of this.w.sites.chunks.get(chunkKey(cx, cy)) ?? []) out.add(i);
    return Array.from(out).map(i => this.w.sites.sites[i]);
  }
  /** current location of an artifact after storms and floods of the play period */
  pos(a: Artifact, site: Site): { x: number; y: number; depth: number } {
    this.refreshEvents(); if (site.dynamic === 'none' && a.ctx !== 'ford') return { x: a.x, y: a.y, depth: a.depth };
    const prev = this.shifted.get(a.id); const evs = this.events; if (prev && prev.n === evs.length) return prev;
    let x = a.x, y = a.y, depth = a.depth;
    for (const ev of evs) {
      if (ev.day < 0) continue; const h = hash01(hash32(a.id), hash32(ev.id)); const h2 = hash01(hash32(a.id + 'b'), hash32(ev.id));
      if (ev.kind === 'storm' && (site.dynamic === 'beach' || a.ctx === 'beach' || a.ctx === 'wreck') && this.w.T.coastDist[cellOf(x, y)] < CELL * 2.2) {
        if (h < 0.45 * Math.min(1, ev.severity / 2)) { // reworked by the surf: re-exposed, buried deeper or carried along the shore
          const ang = ev.windAngle + Math.PI / 2 * (h2 > 0.5 ? 1 : -1); const d = (10 + 90 * h2) * ev.severity / Math.pow(Math.max(1, a.mass), 0.1);
          x = clamp(x + Math.cos(ang) * d * 0.3, 5, SIZE - 5); y = clamp(y + Math.sin(ang) * d * 0.3, 5, SIZE - 5); depth = h2 < 0.55 ? Math.max(0, depth - 8 - 12 * h) : depth + 6 + 14 * h; }
      } else if (ev.kind === 'flood' && (site.dynamic === 'river' || a.ctx === 'ford') && h < 0.3 * Math.min(1.2, ev.severity / 1.5)) { depth = h2 < 0.5 ? Math.max(0, depth - 10 * h2 * 3) : depth + 15; x += (h - 0.15) * 6; y += (h2 - 0.5) * 6; }
    }
    const res = { n: evs.length, x, y, depth }; this.shifted.set(a.id, res); return res;
  }
  specimens(cx: number, cy: number): Specimen[] { const k = chunkKey(cx, cy); let s = this.specCache.get(k); if (!s) { s = specimensInChunk(this.w, cx, cy); this.specCache.set(k, s); if (this.specCache.size > 400) this.specCache.delete(this.specCache.keys().next().value!); } return s; }
  /** Per-site spatial buckets of current positions, rebuilt only when storms or floods move things. */
  private grids = new Map<string, { n: number; b: Map<number, Artifact[]> }>();
  pending = 0;
  private gridOf(site: Site): Map<number, Artifact[]> {
    this.refreshEvents(); const n = site.dynamic === 'none' ? -1 : this.events.length; const have = this.grids.get(site.id); if (have && have.n === n) return have.b;
    const b = new Map<number, Artifact[]>(); for (const a of generateSite(this.w, site)) { const p = this.pos(a, site); const k = bucketKey(p.x, p.y); const l = b.get(k); if (l) l.push(a); else b.set(k, [a]); }
    this.grids.set(site.id, { n, b }); return b;
  }
  /** Objects within a square of half-size r. `budget` limits how many not-yet-generated sites are created in one call, so a busy place loads over a few frames instead of all at once. */
  artifactsNear(x: number, y: number, r: number, budget = Infinity): Array<{ art: Artifact; x: number; y: number; depth: number; site: Site }> {
    const out: Array<{ art: Artifact; x: number; y: number; depth: number; site: Site }> = []; let skipped = 0;
    const bx0 = Math.floor((x - r) / BUCKET), bx1 = Math.floor((x + r) / BUCKET), by0 = Math.floor((y - r) / BUCKET), by1 = Math.floor((y + r) / BUCKET);
    for (const site of this.sitesNear(x, y, r)) {
      if (site.access === 'builtup') continue;
      if (!this.w.artCache.has(site.id)) { if (budget <= 0) { skipped++; continue; } budget--; }
      const grid = this.gridOf(site);
      for (let by = by0; by <= by1; by++) for (let bx = bx0; bx <= bx1; bx++) { const l = grid.get(by * 100000 + bx); if (!l) continue; for (const a of l) { if (this.g.recovered[a.id] !== undefined) continue; const p = this.pos(a, site); if (Math.abs(p.x - x) <= r && Math.abs(p.y - y) <= r) out.push({ art: a, ...p, site }); } }
    }
    this.pending = skipped; return out;
  }
  specimensNear(x: number, y: number, r: number): Specimen[] {
    const out: Specimen[] = []; for (let cy = Math.floor((y - r) / CH); cy <= Math.floor((y + r) / CH); cy++) for (let cx = Math.floor((x - r) / CH); cx <= Math.floor((x + r) / CH); cx++) for (const s of this.specimens(cx, cy)) if (this.g.recovered[s.id] === undefined && Math.abs(s.x - x) <= r && Math.abs(s.y - y) <= r) out.push(s); return out;
  }
  access(x: number, y: number): { ok: boolean; reason: string; farm?: string; site?: Site } {
    if (isWater(this.w, x, y, this.tide)) return { ok: false, reason: 'Under water.' };
    const near5 = this.sitesNear(x, y, 5);
    if (near5.some(s => PUBLIC_IN_TOWN.has(s.kind) && s.access === 'public' && (s.kind === 'beach' ? Math.hypot(s.x - x, s.y - y) <= s.r + 450 && elevAt(this.w.T, x, y) < this.tide + 2.5 : Math.hypot(s.x - x, s.y - y) <= s.r))) return { ok: true, reason: '' };
    for (const s of near5) {
      if (s.access === 'builtup' && Math.hypot(s.x - x, s.y - y) <= s.r) return { ok: false, reason: s.kind === 'farm' ? 'A working farmyard: private.' : 'Built-up land and private property: nothing here is open for searching.', site: s };
      if (s.access === 'permission' && Math.hypot(s.x - x, s.y - y) <= s.r && this.g.permissions[s.owner!] !== 'granted') return { ok: false, reason: this.g.permissions[s.owner!] === 'denied' ? 'The farmer has refused permission.' : 'Farmland: you need the farmer\'s permission.', farm: s.owner, site: s };
    }
    return { ok: true, reason: '' };
  }
  groundAt(x: number, y: number) { const c = cellOf(x, y); const L = this.w.L; const wet = wetnessOn(this.w, this.g.day, L.soilMoist[c]); return { c, mineral: L.mineral[c], moist: wet, salt: L.salinity[c], sed: L.sediment[c], veg: L.veg[c], depthSoil: L.soilDepth[c] }; }
  interferenceAt(x: number, y: number): number {
    let i = 0; for (const s of this.sitesNear(x, y, 12)) { if (s.kind === 'railway' && s.shape.pts) for (const p of s.shape.pts) if (Math.hypot(p[0] - x, p[1] - y) < 9) { i = Math.max(i, 0.1); break; } if (s.kind === 'station' && Math.hypot(s.x - x, s.y - y) < 40) i = Math.max(i, 0.06); }
    return i;
  }
  /** detector targets near a point: artifacts that are metal plus hot rocks */
  targetsNear(x: number, y: number, r: number, budget = Infinity): Array<Target & { art?: Artifact; spec?: Specimen }> {
    const t: Array<Target & { art?: Artifact; spec?: Specimen }> = [];
    for (const q of this.artifactsNear(x, y, r, budget)) t.push({ id: q.art.id, x: q.x, y: q.y, depth: q.depth, mat: q.art.mat, L: q.art.dims[0], W: q.art.dims[1], mass: q.art.mass, art: q.art });
    for (const s of this.specimensNear(x, y, r)) if (s.kind === 'hotrock') t.push({ id: s.id, x: s.x, y: s.y, depth: s.depth, mat: 'iron', L: 80, W: 80, mass: s.mass, hot: true, spec: s });
    return t;
  }
  setup(): DetSetup | null { const g = this.g; if (!g.equipped.det) return null; const det = GEARBY[g.equipped.det]; const coil = g.equipped.coil ? GEARBY[g.equipped.coil] : undefined; return { det, coil, sens: g.det.sens, reject: g.det.reject, ironReject: g.det.ironReject, ground: g.det.ground }; }
  /** What the detector reports with its coil at (x,y): the strongest audible target. */
  scan(x: number, y: number): { r: Response; target: Target & { art?: Artifact; spec?: Specimen }; all: number } | null {
    const set = this.setup(); if (!set) return null; const gr = this.groundAt(x, y); const gi = groundInfo({ mineral: gr.mineral, moist: gr.moist, salt: gr.salt }, this.interferenceAt(x, y), wetnessOn(this.w, this.g.day, 0));
    let best: { r: Response; target: any } | null = null; let all = 0;
    for (const t of this.targetsNear(x, y, 0.9, 2)) { const r = response(set, t, t.x - x, t.y - y, gi, Math.floor(this.g.minute / 5)); all++; if (r.audible && (!best || r.s > best.r.s)) best = { r, target: t }; }
    return best ? { ...best, all } : null;
  }
  /** background noise sound level for UI audio */
  noise(x: number, y: number): number { const set = this.setup(); if (!set) return 0; const gr = this.groundAt(x, y); return gr.mineral * (1 - (set.det.s.gb as number)) * (0.4 + gr.moist) + this.interferenceAt(x, y); }
  visibleItems(x: number, y: number, r: number, budget = 2): Array<{ kind: 'artifact' | 'specimen'; art?: Artifact; spec?: Specimen; x: number; y: number; hex: string; size: number }> {
    const out: any[] = []; const ground = this.groundAt(x, y); const cover = ground.veg === Veg.Conifer || ground.veg === Veg.Mixed || ground.veg === Veg.Broadleaf ? 0.6 : ground.veg === Veg.Grass || ground.veg === Veg.Heath || ground.veg === Veg.Shrub ? 0.45 : ground.veg === Veg.Wetland ? 0.5 : 0.1;
    const light = lightLevel(this.g.day, this.g.minute); const wx = weatherOn(this.w, this.g.day);
    for (const q of this.artifactsNear(x, y, r, budget)) { if (q.depth > 1.8) continue; const sz = Math.sqrt(q.art.dims[0] * q.art.dims[1]); const exposed = (SURFACE[q.site.kind] ?? 0.05) * (q.site.kind === 'field' && q.site.to !== null ? 0.12 : 1); const vis = clamp(1 - cover * (1 - Math.min(1, sz / 90)) * 0.9, 0.05, 1) * (0.35 + 0.65 * light) * exposed; if (hash01(hash32(q.art.id), 77) < vis && Math.hypot(q.x - x, q.y - y) <= r) out.push({ kind: 'artifact', art: q.art, x: q.x, y: q.y, hex: ARC_HEX(q.art), size: Math.max(2, sz) }); }
    for (const s of this.specimensNear(x, y, r)) { if (s.depth > 1 || s.kind === 'hotrock' || s.panOnly) continue; const sc = cellOf(s.x, s.y); const sed = this.w.L.sediment[sc]; const bare = sed === Sed.Bedrock || sed === Sed.Beach || s.transport.mode === 'river' || s.transport.mode === 'shore' || this.w.T.slope[sc] > 14 ? 1 : sed === Sed.Colluvium ? 0.5 : 0.12; const vis = clamp(1 - cover * (1 - Math.min(1, s.size / 12)), 0.1, 1) * (0.35 + 0.65 * light) * bare; if (hash01(hash32(s.id), 78) < vis) out.push({ kind: 'specimen', spec: s, x: s.x, y: s.y, hex: s.hex, size: s.size * 10 }); }
    void wx; return out;
  }
}
import { MAT } from './materials';
const ARC_HEX = (a: Artifact) => MAT[a.mat].hex;

// ------------- actions
export interface Recovered { find: Find; art?: Artifact; spec?: Specimen; note: string }
function stackKeyOf(a: Artifact): string | undefined { const arch = ARC[a.arch]; if ((arch.cat === 'scrap' || arch.cat === 'litter') && a.marks.length === 0) return `${a.arch}|${a.mat}`; if (a.arch === 'nail_cut' || a.arch === 'nail_wire' || a.arch === 'nail_wrought' || a.arch === 'earthenware_sherd') return `${a.arch}|${a.mat}`; return undefined; }
export function addFind(g: GameState, w: World, o: { art?: Artifact; spec?: Specimen; x: number; y: number; site?: string; damage?: number }): Find {
  const sk = o.art ? stackKeyOf(o.art) : undefined;
  if (sk) { const ex = g.finds.find(f => f.stackKey === sk && f.status === 'bag'); if (ex) { ex.count++; g.stats.found++; return ex; } }
  const f: Find = { uid: `f${++g.uidSeq}`, kind: o.art ? 'artifact' : 'specimen', day: g.day, x: o.x, y: o.y, site: o.site, art: o.art ? JSON.parse(JSON.stringify(o.art)) : undefined, spec: o.spec ? JSON.parse(JSON.stringify(o.spec)) : undefined, cleaning: 0, cleanCount: 0, cleanDamage: o.damage ?? 0, split: false, status: 'bag', count: 1, stackKey: sk };
  if (f.art && o.damage) f.art.cond.dmg = clamp(f.art.cond.dmg + o.damage, 0, 0.95);
  g.finds.push(f); g.stats.found++; return f;
}
export interface DigResult { ok: boolean; msg: string; got: Recovered[]; minutes: number; fail?: 'access' | 'tool' | 'full' }
/** Dig a plug at (x,y) with the equipped digger. Everything inside the plug's reach is recovered and cannot come back. */
export function dig(S: Searcher, x: number, y: number, o: { pan?: boolean } = {}): DigResult {
  const g = S.g, w = S.w; const acc = S.access(x, y); if (!acc.ok) return { ok: false, msg: acc.reason, got: [], minutes: 0, fail: 'access' };
  const dg = g.equipped.digger === 'hands' ? { depth: 6, r: 0.14, speed: 0.6, care: 0.7 } : (GEARBY[g.equipped.digger].s as any);
  const ground = S.groundAt(x, y); const hard = ground.sed === Sed.Bedrock ? 0.02 : ground.sed === Sed.Till ? 0.6 : ground.sed === Sed.Beach || ground.sed === Sed.MarineSand ? 1.2 : 1;
  const depthReach = Math.min(dg.depth, ground.sed === Sed.Bedrock ? 3 : ground.depthSoil * 100 + 5) * (g.equipped.digger === 'hands' ? hard : Math.min(1.2, hard + 0.2));
  const got: Recovered[] = []; const full = slotsUsed(g) >= slotsOf(g);
  const t = ownedTools(g); const R = dg.r;
  const arts = S.artifactsNear(x, y, R + 0.02).filter(q => Math.hypot(q.x - x, q.y - y) <= R && q.depth <= depthReach);
  const specs = S.specimensNear(x, y, R + 0.02).filter(s => Math.hypot(s.x - x, s.y - y) <= R && s.depth <= depthReach && (!s.panOnly || (o.pan && t.pan > 0)));
  for (const q of arts) { if (slotsUsed(g) >= slotsOf(g) && !(stackKeyOf(q.art) && g.finds.some(f => f.stackKey === stackKeyOf(q.art)))) { return { ok: true, msg: 'Your bags are full. Sell or drop something first.', got, minutes: 1, fail: 'full' }; }
    const fragile = MAT[q.art.mat].fragile || q.art.cond.frag < 0.7; const roll = hash01(hash32(q.art.id), g.stats.dug + 1);
    const dmg = roll < (1 - dg.care) * (fragile ? 0.5 : 0.18) ? 0.04 + roll * 0.3 : 0; const f = addFind(g, w, { art: q.art, x: q.x, y: q.y, site: q.site.id, damage: dmg }); g.recovered[q.art.id] = g.day; got.push({ find: f, art: q.art, note: dmg > 0 ? `Nicked by the ${g.equipped.digger === 'hands' ? 'dig' : GEARBY[g.equipped.digger].name.toLowerCase()}.` : '' }); }
  for (const s of specs) { if (s.kind === 'hotrock') { g.recovered[s.id] = g.day; got.push({ find: { uid: 'hot', kind: 'specimen', day: g.day, x: s.x, y: s.y, cleaning: 0, cleanCount: 0, cleanDamage: 0, split: false, status: 'sold', count: 1, spec: s } as Find, spec: s, note: 'A hot rock: a magnetic cobble that fooled the detector. It is gone.' }); continue; }
    if (slotsUsed(g) >= slotsOf(g)) return { ok: true, msg: 'Your bags are full.', got, minutes: 1, fail: 'full' }; const f = addFind(g, w, { spec: s, x: s.x, y: s.y }); g.recovered[s.id] = g.day; got.push({ find: f, spec: s, note: '' }); }
  const minutes = Math.max(1, Math.round((1 + depthReach / 18) / dg.speed / (hard > 0.9 ? 1 : 1.3)));
  g.holes.push({ x, y, day: g.day }); g.stats.dug++; if (g.holes.length > 600) g.holes.shift(); minutesPass(g, minutes);
  void full;
  return { ok: true, msg: got.length ? '' : 'Nothing but soil.', got, minutes };
}
/** Pick up an item lying on the surface. */
export function pickUp(S: Searcher, ref: { art?: Artifact; spec?: Specimen }): Recovered | null {
  const g = S.g; const acc = S.access(ref.art?.x ?? ref.spec!.x, ref.art?.y ?? ref.spec!.y); if (!acc.ok) return null;
  const id = ref.art?.id ?? ref.spec!.id; if (g.recovered[id] !== undefined) return null; if (slotsUsed(g) >= slotsOf(g)) return null;
  const f = addFind(g, S.w, { art: ref.art, spec: ref.spec, x: ref.art?.x ?? ref.spec!.x, y: ref.art?.y ?? ref.spec!.y, site: ref.art?.site }); g.recovered[id] = g.day; minutesPass(g, 1); return { find: f, art: ref.art, spec: ref.spec, note: '' };
}
export function split(f: Find, g: GameState): string { if (f.kind !== 'specimen' || f.split) return 'Already split.'; f.split = true; minutesPass(g, 4); const s = f.spec!; if (s.kind === 'rock' && s.name.includes('nodule')) return 'You crack it open.'; return 'You break it open to a fresh face.'; }
export function sellFind(g: GameState, w: World, f: Find, buyer: Buyer, t: Tools, kb: Set<string>, opts: { all?: boolean } = {}): number {
  const item = f.art ? { art: f.art, legibility: legibility(f), identified: true, count: f.count } : { spec: f.spec, legibility: 1, identified: specimenName(w, f, kb, t).identified, fresh: f.split, count: 1 };
  const o = offerFor(w, buyer, item as any, g.day); if (o.refuses) return 0;
  f.status = 'sold'; f.soldFor = o.price; g.cash += o.price; g.stats.sold += f.count; g.stats.earned += o.price; g.soldIds.push(f.art?.id ?? f.spec!.id); minutesPass(g, 3); return o.price;
}
export function buyGear(g: GameState, id: string): string {
  const ge = GEARBY[id]; if (!ge) return 'No such item.'; if (g.cash < ge.price) return 'Not enough money.'; if (g.owned[id]) return 'You already own one.';
  g.cash -= ge.price; g.owned[id] = 1;
  if (ge.cat === 'detector') { g.equipped.det = id; } if (ge.cat === 'digger' && (GEARBY[g.equipped.digger]?.s.depth as number ?? 0) < (ge.s.depth as number)) g.equipped.digger = id;
  if (ge.cat === 'coil' && !g.equipped.coil) g.equipped.coil = id; if (ge.cat === 'pinpointer') g.equipped.pin = id; return `Bought ${ge.name}.`;
}
export function readDoc(g: GameState, w: World, d: Doc): { newFacts: number; message: string } {
  if (!g.docsRead.includes(d.id)) { g.docsRead.push(d.id); minutesPass(g, 20); }
  const n = learn(g, d.facts);
  // a document that names a business whose mark the player has already seen makes the connection
  const messages: string[] = [];
  for (const bid of d.refs.businesses) { const b = w.H.businesses.find(q => q.id === bid); if (b && g.kb.includes(`mark:${b.mark}`) && !g.kb.includes(`biz:${bid}:linked`)) { g.kb.push(`biz:${bid}:linked`); messages.push(`${b.name} matches a maker's mark in your finds (${b.mark}).`); } }
  if (n) g.notes.push({ id: `n${g.notes.length}`, day: g.day, kind: 'record', title: d.title, text: `${d.source}, ${d.year}. ${d.body[0].slice(0, 220)}`, ref: d.id, x: d.hints[0]?.x, y: d.hints[0]?.y });
  return { newFacts: n, message: messages.join(' ') };
}
export function addBookmark(g: GameState, label: string, x: number, y: number, radius: number, doc?: string) { const b: Bookmark = { id: `b${g.bookmarks.length + 1}-${g.day}`, day: g.day, label, x, y, radius, doc }; g.bookmarks.push(b); return b; }
export function askPermission(S: Searcher, farmId: string): { granted: boolean; msg: string } {
  const g = S.g, w = S.w; const f = w.H.settlements.find(q => q.id === farmId)!; const fam = (f as any).family as string;
  if (g.permissions[farmId]) return { granted: g.permissions[farmId] === 'granted', msg: g.permissions[farmId] === 'granted' ? 'You already have permission.' : 'You were refused.' };
  const mood = hash01(hash32(w.seed + farmId), 21); const rep = Math.min(0.2, g.stats.found / 400); const ok = mood < 0.62 + rep; g.permissions[farmId] = ok ? 'granted' : 'denied'; minutesPass(g, 10);
  return { granted: ok, msg: ok ? `${fam} gives permission: "Mind the crops, and shut the gate. If you find anything old, I'd like to hear about it."` : `${fam} shakes their head: "No strangers on the land, thanks."` };
}
// ------------- travel
let roadGridCache = new WeakMap<World, Float32Array>();
export function travelCostGrid(w: World): Float32Array {
  let g = roadGridCache.get(w); if (g) return g; g = Float32Array.from(w.L.traverse);
  for (const rt of w.H.routes) { if (rt.closed && rt.closed < w.H.endYear - 1) continue; if (rt.lifted) continue; const f = rt.kind === 'highway' ? 0.14 : rt.kind === 'road' ? 0.2 : rt.kind === 'railway' ? 0.4 : 0.38; for (const c of rt.path) g[c] = Math.min(g[c], Math.max(0.12, f * (isFinite(g[c]) ? 1 : 1))); }
  for (const rt of w.H.routes) if (rt.closed && rt.closed < w.H.endYear - 1 && !rt.lifted) for (const c of rt.path) g[c] = Math.min(g[c], 0.6 * (isFinite(w.L.traverse[c]) ? w.L.traverse[c] : 1)); // overgrown lanes still help a walker
  roadGridCache.set(w, g); return g;
}
export interface TravelPlan { path: number[]; walkMinutes: number; rideMinutes: number; rideCost: number; km: number }
export function planTravel(w: World, fromX: number, fromY: number, toX: number, toY: number): TravelPlan | null {
  const cost = travelCostGrid(w); const a = cellOf(fromX, fromY), b = cellOf(toX, toY); if (!isFinite(cost[b])) return null;
  const path = aStar(a, b, (c, from) => isFinite(cost[c]) ? cost[c] : (c === a ? 1 : Infinity), 0.12); if (!path) return null;
  let m = 0, km = 0; for (let i = 1; i < path.length; i++) { const d = Math.hypot((path[i] % N) - (path[i - 1] % N), ((path[i] / N) | 0) - ((path[i - 1] / N) | 0)) * CELL; km += d / 1000; const k = 0.5 * (cost[path[i]] + cost[path[i - 1]]); m += d / 1000 / 4.8 * 60 * (isFinite(k) ? k : 1); }
  const onRoad = path.filter(c => cost[c] <= 0.4).length / path.length; const rideMin = onRoad > 0.7 ? km / 38 * 60 + 12 : Infinity; const rideCost = Math.max(1.5, km * 0.14);
  return { path, walkMinutes: Math.round(m), rideMinutes: isFinite(rideMin) ? Math.round(rideMin) : Infinity, rideCost, km };
}
export function travel(g: GameState, w: World, plan: TravelPlan, toX: number, toY: number, ride: boolean): string {
  if (ride) { if (!isFinite(plan.rideMinutes)) return 'No service on that route.'; if (g.cash < plan.rideCost) return 'Not enough money for the fare.'; g.cash -= plan.rideCost; minutesPass(g, plan.rideMinutes); } else minutesPass(g, plan.walkMinutes);
  g.x = toX; g.y = toY; g.stats.travelled += plan.km; return `${ride ? 'Rode' : 'Walked'} ${plan.km.toFixed(1)} km.`;
}
export function nearestSettlementOf(w: World, x: number, y: number) { let b = w.H.settlements[0], bd = 1e12; for (const s of w.H.settlements) { if (!s.current || s.kind === 'farmstead') continue; const d = Math.hypot(s.x - x, s.y - y); if (d < bd) { bd = d; b = s; } } return { s: b, d: bd }; }
export const dateString = (g: GameState) => { const c = calendar(g.day); return `${c.dom} ${MONTHS[c.month - 1]} ${c.year}`; };
export const timeString = (g: GameState) => `${String(Math.floor(g.minute / 60)).padStart(2, '0')}:${String(Math.floor(g.minute % 60)).padStart(2, '0')}`;
/** Serialisable save; the world itself is regenerated from the seed and generation version. */
export function serialize(g: GameState): string { return JSON.stringify(g); }
export function deserialize(s: string): GameState { const g = JSON.parse(s) as GameState; return migrate(g); }
export function migrate(g: GameState): GameState { if (!g.v) g.v = 1; g.knownTypes ??= []; g.knownMakers ??= []; g.objectives ??= {}; g.soldIds ??= []; return g; }
