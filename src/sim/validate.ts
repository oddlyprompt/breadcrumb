import type { World } from './worldtypes';
import { generateSite, matAvailable } from './artifacts';
import { ARC } from './archetypes';
import { N, CELL, cellOf } from './terrain';
import { TAXON } from './fossils';
import { hash32 } from './rng';

export interface Violation { cat: string; msg: string }
export interface Report { seed: string; violations: Violation[]; stats: Record<string, number>; }

export function validateWorld(w: World, opts: { siteSample?: number } = {}): Report {
  const V: Violation[] = []; const st: Record<string, number> = {};
  const bad = (cat: string, msg: string) => { if (V.length < 400) V.push({ cat, msg }); };
  const H = w.H, T = w.T, G = w.G;
  const S = new Map(H.settlements.map(s => [s.id, s])); const P = new Map(H.people.map(p => [p.id, p])); const B = new Map(H.businesses.map(b => [b.id, b]));
  const E = new Map(H.events.map(e => [e.id, e]));
  // ---------- world consistency: terrain
  let badFlow = 0, badQ = 0;
  for (let c = 0; c < N * N; c++) { const d = T.flow[c]; if (d >= 0) { const x = (c % N) + [1, 1, 0, -1, -1, -1, 0, 1][d], y = ((c / N) | 0) + [0, 1, 1, 1, 0, -1, -1, -1][d]; const n = y * N + x; if (T.filled[n] > T.filled[c] + 1e-3) badFlow++; if (T.Q[n] < T.Q[c] - 1e-6) badQ++; } }
  if (badFlow) bad('world', `${badFlow} river cells flow uphill on the filled surface`); if (badQ) bad('world', `${badQ} cells where discharge decreases downstream`);
  // ---------- geological consistency
  for (const d of w.D.deposits) {
    const f = G.formations[d.formation]; const here = G.formations[G.formationOf[d.cell]];
    if (here.id !== d.formation) bad('geology', `${d.id} host formation differs from map`);
    switch (d.kind) {
      case 'fossil_bed': if (!f.fossiliferous || f.cls !== 'sedimentary') bad('geology', `fossil bed ${d.id} in non-fossiliferous ${f.rock}`); for (const t of d.taxa ?? []) { const tx = TAXON[t]; if (f.ageMa > tx.from || f.ageMa < tx.to) bad('geology', `${tx.name} not alive ${f.ageMa} Ma in ${d.id}`); if (!tx.envs.includes(f.env as any)) bad('geology', `${tx.name} habitat mismatch in ${d.id}`); } break;
      case 'porphyry_copper': if (!(f.rock === 'diorite' || f.rock === 'granodiorite')) bad('geology', `porphyry ${d.id} not in stock`); break;
      case 'orogenic_gold': if (!(f.tags.includes('greenstone') || f.tags.includes('metased') || f.rock === 'greywacke')) bad('geology', `orogenic gold ${d.id} in ${f.rock}`); if (G.faultDist[d.cell] > 3600) bad('geology', `orogenic gold ${d.id} far from faults`); break;
      case 'epithermal': if (!f.tags.includes('volcanic') || f.ageMa > 170) bad('geology', `epithermal ${d.id} host ${f.rock} ${f.ageMa}Ma`); break;
      case 'lead_zinc': if (!f.tags.includes('carbonate')) bad('geology', `lead-zinc ${d.id} not in carbonate`); break;
      case 'iron_formation': if (!f.tags.includes('bif') || f.ageMa < 1700) bad('geology', `iron formation ${d.id} wrong host/age`); break;
      case 'coal': if (!(f.ageMa <= 359 )) bad('geology', `coal ${d.id} predates land plants forests (${f.ageMa} Ma)`); break;
      case 'evaporite': if (!f.tags.includes('evaporite')) bad('geology', `evaporite ${d.id} host`); break;
      case 'pegmatite': if (d.plutonId === undefined || !G.formations[G.plutons[d.plutonId].formation].tags.includes('granitic')) bad('geology', `pegmatite ${d.id} not beside a granitic pluton`); break;
    }
    for (const m of d.minerals.primary) if (m === 'coal' && d.kind !== 'coal') bad('geology', `${d.id} coal outside coal seam`);
  }
  for (const f of G.formations) { if (f.cls === 'igneous' && f.fossiliferous) bad('geology', `fossils in igneous ${f.name}`); if (f.cls === 'metamorphic' && f.fossiliferous) bad('geology', `fossils in metamorphic ${f.name}`); if (f.intrudes !== undefined) { /* contact rocks must be younger than nothing else */ } }
  for (const pl of G.plutons) { const host = G.provinces[pl.province]; const minHost = Math.min(...host.formations.map(i => G.formations[i].ageMa)); if (pl.ageMa > minHost + 1e-6) bad('geology', `pluton ${pl.id} older than its host rocks`); }
  for (const pt of w.D.placers) { const src = w.D.deposits.find(d => d.id === pt.sourceId); if (!src) { bad('geology', 'placer without source'); continue; } if (!src.minerals.primary.some(m => m === 'gold' || m === 'electrum')) bad('geology', `placer from non-gold source ${src.id}`); let prev = -1; for (const c of pt.cells) { if (c.dist < prev) bad('geology', 'placer distance not monotonic'); prev = c.dist; if (T.Q[c.cell] < 0.018) bad('geology', 'placer in dry cell'); } }
  // ---------- historical consistency
  for (const s of H.settlements) {
    if (s.abandoned !== undefined && s.abandoned < s.founded) bad('history', `${s.name} abandoned before founding`);
    if (s.parent) { const p = S.get(s.parent); if (p && p.founded > s.founded) bad('history', `${s.name} founded before its parent ${p.name}`); }
    if (T.sea[s.cell] || T.lake[s.cell] >= 0) bad('history', `${s.name} in water`);
    if (s.kind === 'mining_town' && s.depositId) { const m = H.mines.find(q => q.deposit === s.depositId && q.settlement === s.id); if (!m) bad('history', `mining town ${s.name} without a mine`); }
  }
  for (const e of H.events) {
    for (const pid of e.prereqs) { const pe = E.get(pid); if (!pe) bad('history', `${e.id} prereq missing`); else if (pe.year > e.year) bad('history', `${e.title} (${e.year}) precedes prerequisite ${pe.title} (${pe.year})`); }
    if (e.settlement) { const s = S.get(e.settlement); if (s) { if (e.year < s.founded && e.kind !== 'founding') bad('history', `${e.title} at ${s.name} before its founding`); if (s.abandoned !== undefined && e.year > s.abandoned + 1 && !['abandonment', 'relocation', 'commemoration'].includes(e.kind) && e.kind !== 'cache_recovered') bad('history', `${e.title} after ${s.name} abandoned (${e.year}>${s.abandoned})`); } }
    for (const pid of e.people) { const p = P.get(pid); if (!p) continue; if (p.born > e.year - 14 && !['rescue'].includes(e.kind)) bad('history', `${p.name} (b.${p.born}) too young for ${e.title} (${e.year})`); if (p.died !== null && p.died < e.year && !['obituary'].includes(e.kind) && e.kind !== 'trial') bad('history', `${p.name} (d.${p.died}) acts in ${e.title} (${e.year})`); }
    if (e.kind === 'mine_opened' || e.kind === 'boom') { const d = e.deposit ? w.D.deposits.find(q => q.id === e.deposit) : undefined; if (!d || d.viableFrom === null || e.year < d.viableFrom) bad('history', `${e.title}: no commercially viable discovery yet (${e.year} vs viable ${d?.viableFrom})`); }
    if (e.kind === 'railway_opening') { const rt = H.routes.find(q => q.id === e.route)!; if (e.year < 1830) bad('history', 'railway before 1830'); if (!rt || rt.kind !== 'railway') bad('history', 'opening without railway'); }
    if (e.kind === 'shipwreck') { const v = H.vessels.find(q => q.id === e.vessel)!; if (v.built > e.year) bad('history', `${v.name} wrecked before built`); if (v.power === 'steam' && e.year < 1840) bad('history', 'steamship too early'); const home = S.get(v.homePort)!; if (!home.port || home.founded > e.year) bad('history', 'wreck from non-port'); if (!(T.coastDist[e.cell!] <= CELL * 4)) bad('history', 'wreck not near coast'); }
    if (e.kind === 'robbery') { for (const bid of e.businesses) { const b = B.get(bid)!; if (b.founded > e.year) bad('history', 'robbery of a bank before founding'); } if (e.extra?.bullion && !H.mines.some(m => m.opened <= e.year)) bad('history', 'bullion robbery without any mine'); if (e.extra?.kind === 'train' && !H.routes.some(r => r.kind === 'railway' && (r.opened ?? 9999) <= e.year)) bad('history', 'train robbery before railway'); }
  }
  for (const rt of H.routes) { if (rt.kind === 'railway' && (rt.opened ?? rt.built) < 1830) bad('history', 'railway too early'); if (rt.opened !== undefined && rt.opened < rt.built) bad('history', 'railway opens before built'); const a = S.get(rt.from)!, b = S.get(rt.to)!; if (rt.built < Math.min(a.founded, b.founded)) bad('history', `${rt.name} built before its termini existed`); }
  for (const b of H.businesses) { const s = S.get(b.settlement)!; if (b.founded < s.founded) bad('history', `${b.name} founded before ${s.name}`); if (b.closed !== undefined && b.closed < b.founded) bad('history', 'business closed before founded'); for (const o of b.owners) { const p = P.get(o.person)!; if (p.born > o.from - 15) bad('history', `${p.name} too young to own ${b.name}`); if (p.died !== null && p.died < o.from) bad('history', `${p.name} dead before owning ${b.name}`); } }
  for (const c of H.caches) { const o = P.get(c.owner)!; if (o.died !== null && o.died < c.year) bad('history', 'cache owner dead before burying'); if (c.contents.some(x => x.metal === 'gold' && !H.mines.some(m => m.opened <= c.year))) bad('history', 'gold bars without a mine'); }
  // ---------- artifact consistency (sample sites; all in thorough mode)
  const sites = w.sites.sites.filter(s => s.densityMult > 0); const sample = opts.siteSample ?? 80;
  const picked = sites.length <= sample ? sites : sites.filter((_, i) => i % Math.ceil(sites.length / sample) === 0);
  let nArt = 0; const ids = new Set<string>();
  for (const site of picked) {
    const arts = generateSite(w, site);
    for (const a of arts) {
      nArt++; const arch = ARC[a.arch];
      if (!arch) { bad('artifact', `unknown archetype ${a.arch}`); continue; }
      if (ids.has(a.id)) bad('artifact', `duplicate id ${a.id}`); ids.add(a.id);
      if (a.produced < arch.from) bad('artifact', `${a.id} ${arch.name} produced ${a.produced} before ${arch.from}`);
      if (arch.to !== null && a.produced > arch.to) bad('artifact', `${a.id} ${arch.name} produced ${a.produced} after ${arch.to}`);
      if (a.deposited < a.produced) bad('artifact', `${a.id} deposited ${a.deposited} before produced ${a.produced}`);
      if (a.deposited > H.endYear) bad('artifact', `${a.id} deposited in the future`);
      if (!matAvailable(a.mat, a.produced)) bad('artifact', `${a.id} material ${a.mat} unavailable in ${a.produced}`);
      if (!a.special && (site.from > a.deposited || (site.to !== null && a.deposited > site.to + 1))) bad('artifact', `${a.id} deposited ${a.deposited} outside site ${site.name} life ${site.from}-${site.to}`);
      if (a.series) { const s = w.coin.byId[a.series]; if (!s) bad('artifact', 'missing coin series'); else { if (s.year !== a.produced) bad('artifact', 'coin year mismatch'); if (s.year > a.deposited) bad('artifact', `${a.id} coin of ${s.year} lost in ${a.deposited}`); if (s.metal !== a.mat) bad('artifact', 'coin metal mismatch'); if (a.marks.find(m => m.kind === 'date')?.text !== String(s.year)) bad('artifact', 'displayed coin date contradicts data'); } }
      if (a.token) { const t = w.issues.tokens.find(q => q.id === a.token)!; const b = B.get(t.business)!; if (a.deposited < t.from || a.produced < t.from || a.produced > t.to) bad('artifact', `${a.id} token out of issue period`); if (b.founded > a.produced) bad('artifact', 'token before business founded'); }
      if (a.maker) { const b = B.get(a.maker)!; if (a.produced < b.founded || (b.closed !== undefined && a.produced > b.closed)) bad('artifact', `${a.id} made by ${b.name} outside its operating years (${a.produced} vs ${b.founded}-${b.closed})`); }
      if (a.medal) { const m = w.issues.medals.find(q => q.id === a.medal)!; if (a.deposited < m.year) bad('artifact', 'medal lost before struck'); }
      for (const pid of a.assoc.persons ?? []) { const p = P.get(pid)!; if (p.born > a.produced + 2 && !a.series && a.special !== 'accident' && a.special !== 'medal') bad('artifact', `${a.id} tied to ${p.name} born after manufacture`); if (a.special === 'accident' && p.died !== a.deposited) bad('artifact', 'accident victim date'); if (a.special === 'cache' && p.died !== null && p.died < a.deposited - 3) bad('artifact', 'cache owner dead before burial'); if (a.special === 'medal' && p.died !== null && a.deposited < p.died) bad('artifact', 'gallantry medal lost before the owner died'); }
      if (a.assoc.event) { const e = E.get(a.assoc.event); if (!e) bad('artifact', 'event missing'); else if (e.year > a.deposited + 0 && a.special !== 'medal') bad('artifact', `${a.id} linked to later event`); }
      const yearsBuried = H.endYear - a.deposited;
      if (yearsBuried < 12 && a.cond.corr > 0.4) bad('artifact', `${a.id} ${a.mat} object buried only ${yearsBuried} yrs shows corrosion ${a.cond.corr.toFixed(2)}`);
      if (a.x < 0 || a.y < 0 || a.x > N * CELL || a.y > N * CELL) bad('artifact', 'outside world');
      const c = cellOf(a.x, a.y); if (T.sea[c] && a.lossKind !== 'wreck') bad('artifact', `${a.id} in the sea`);
      if (!a.lossKind || !a.site) bad('artifact', 'no deposition explanation');
      if (!a.special && (a.x < site.bbox[0] - 2 || a.x > site.bbox[2] + 2 || a.y < site.bbox[1] - 2 || a.y > site.bbox[3] + 2)) bad('artifact', `${a.id} lies outside its site's indexed area (${Math.round(Math.hypot(a.x - site.x, a.y - site.y))} m from centre)`);
      for (const mv of a.moves) { if (mv.year < a.deposited) bad('artifact', 'moved before deposited'); if (mv.kind === 'flood' && !H.floods.some(f => f.year === mv.year)) bad('artifact', 'flood move without flood'); if (mv.kind === 'storm' && !H.storms.some(f => f.year === mv.year)) bad('artifact', 'storm move without storm'); }
      if (a.cond.encrust < 0 || a.cond.encrust > 1 || a.cond.frag <= 0) bad('artifact', 'bad condition values');
    }
  }
  st.artifactsChecked = nArt; st.sitesChecked = picked.length; st.settlements = H.settlements.length; st.events = H.events.length; st.deposits = w.D.deposits.length; st.docs = w.docs.length;
  // ---------- documents refer to real entities
  for (const d of w.docs) { for (const e of d.refs.events) if (!E.has(e)) bad('docs', `${d.id} refs missing event`); for (const p of d.refs.people) if (!P.has(p)) bad('docs', `${d.id} refs missing person`); for (const b of d.refs.businesses) if (!B.has(b)) bad('docs', `${d.id} refs missing business`); for (const s of d.refs.settlements) if (!S.has(s)) bad('docs', `${d.id} refs missing settlement`); if (d.kind !== 'survey_map') { const ev = d.refs.events.map(e => E.get(e)!).filter(Boolean); for (const e of ev) if (d.year < e.year) bad('docs', `${d.id} dated ${d.year} before its event ${e.year}`); } if (!d.body.length) bad('docs', `${d.id} empty`); if (d.kind === 'directory') for (const b of d.refs.businesses) { const bb = B.get(b)!; if (bb.founded > d.year || (bb.closed ?? 9999) <= d.year) bad('docs', 'directory lists business not trading that year'); } }
  // ---------- gameplay viability
  const start = S.get(w.start.settlement);
  if (!start || !start.current) bad('gameplay', 'no viable starting settlement');
  else {
    if (!start.hasArchive) bad('gameplay', 'start has no archive');
    const near = w.sites.sites.filter(s => s.access !== 'builtup' && s.densityMult > 0 && Math.hypot(s.x - start.x, s.y - start.y) < 9000);
    const kinds = new Set(near.map(s => s.kind)); st.startSiteKinds = kinds.size; st.startSites = near.length;
    if (near.length < 6) bad('gameplay', `only ${near.length} searchable sites near the start`);
    if (!w.docs.some(d => d.holdings.includes(start.id))) bad('gameplay', 'start archive empty');
  }
  return { seed: w.seed, violations: V, stats: st };
}

/** A fingerprint of everything generated up-front, used by the determinism test. */
export function worldFingerprint(w: World): number {
  let h = hash32(w.seed + w.name);
  const mix = (s: string) => { h = (Math.imul(h ^ hash32(s), 16777619)) >>> 0; };
  for (const s of w.H.settlements) mix(`${s.id}${s.name}${s.founded}${s.abandoned}${Math.round(s.pop)}${Math.round(s.x)}`);
  for (const d of w.D.deposits) mix(`${d.id}${d.kind}${d.cell}${d.grade.toFixed(3)}`);
  for (const e of w.H.events) mix(`${e.id}${e.kind}${e.year}${e.title}`);
  for (const f of [0, 1, 7]) { const s = w.sites.sites[Math.min(f, w.sites.sites.length - 1)]; const a = generateSite(w, s); mix(`${s.id}${a.length}`); for (const x of a.slice(0, 40)) mix(`${x.id}${x.arch}${x.x.toFixed(2)}${x.y.toFixed(2)}${x.mat}`); }
  mix(String(w.docs.length)); return h;
}
