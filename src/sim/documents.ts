import { Rng, stream, hash32 } from './rng';
import type { World } from './worldtypes';
import type { HEvent, Business, Settlement } from './history_types';
import { placeDescribe, fmtDate, distText } from './describe';
import { CELL } from './terrain';
import { MINERALS, MIN } from './minerals';
import { periodOf } from './fossils';
import { TPL } from './geology';

export type DocKind = 'newspaper' | 'directory' | 'mining_record' | 'public_notice' | 'accident_report' | 'transport_record' | 'obituary' | 'property_record' | 'court_record' | 'survey_map' | 'shipping_register' | 'letter';
export const DOC_LABEL: Record<DocKind, string> = { newspaper: 'Newspaper report', directory: 'Business directory', mining_record: 'Mining record', public_notice: 'Public notice', accident_report: 'Accident report', transport_record: 'Transport record', obituary: 'Obituary', property_record: 'Property record', court_record: 'Court record', survey_map: 'Historical map', shipping_register: 'Shipping register', letter: 'Letter' };
export interface DocHint { x: number; y: number; radius: number; label: string }
export interface Doc {
  id: string; kind: DocKind; year: number; month: number; day: number; title: string; source: string; body: string[];
  refs: { events: string[]; people: string[]; businesses: string[]; settlements: string[]; sites: string[]; deposits: string[]; vessels: string[]; routes: string[] };
  facts: string[]; hints: DocHint[]; holdings: string[]; keywords: string[]; mapYear?: number;
}

export function generateDocuments(w: World): Doc[] {
  const H = w.H; const r = stream(w.seed, 'documents');
  const docs: Doc[] = []; let dn = 0;
  const S = new Map(H.settlements.map(s => [s.id, s])); const P = new Map(H.people.map(p => [p.id, p])); const B = new Map(H.businesses.map(b => [b.id, b]));
  const bigTowns = H.settlements.filter(s => s.current && s.kind !== 'farmstead').sort((a, b) => b.pop - a.pop);
  const regional = bigTowns[0]?.id ?? H.settlements[0].id;
  const papersAt = (sid: string, year: number) => H.businesses.find(b => b.kind === 'newspaper' && b.settlement === sid && b.founded <= year && (b.closed ?? 9999) >= year);
  const anyPaper = (year: number, near: Settlement | undefined) => { const c = H.businesses.filter(b => b.kind === 'newspaper' && b.founded <= year && (b.closed ?? 9999) >= year); if (!c.length) return undefined; if (near) { c.sort((a, b) => (a.settlement === near.id ? -1 : 0) - (b.settlement === near.id ? -1 : 0) || Math.hypot(S.get(a.settlement)!.x - near.x, S.get(a.settlement)!.y - near.y) - Math.hypot(S.get(b.settlement)!.x - near.x, S.get(b.settlement)!.y - near.y)); } return c[0]; };
  const holdings = (sid: string | undefined, year: number): string[] => { const h: string[] = []; const s = sid ? S.get(sid) : undefined; if (s && s.hasArchive && (s.abandoned === undefined)) h.push(s.id); if (r.chance(0.8)) h.push(regional); return h.length ? Array.from(new Set(h)) : [regional]; };
  const add = (d: Omit<Doc, 'id' | 'holdings' | 'keywords' | 'refs'> & { refs?: Partial<Doc['refs']>; holdSettlement?: string }): Doc => {
    const refs = { events: [], people: [], businesses: [], settlements: [], sites: [], deposits: [], vessels: [], routes: [], ...d.refs };
    const kw = new Set<string>(); for (const id of refs.settlements) kw.add(S.get(id)?.name.toLowerCase() ?? ''); for (const id of refs.people) kw.add(P.get(id)?.name.toLowerCase() ?? ''); for (const id of refs.businesses) kw.add(B.get(id)?.name.toLowerCase() ?? '');
    for (const id of refs.vessels) kw.add(H.vessels.find(v => v.id === id)?.name.toLowerCase() ?? ''); kw.delete('');
    const doc: Doc = { ...d, id: `DOC${++dn}`, refs, holdings: holdings(d.holdSettlement ?? refs.settlements[0], d.year), keywords: Array.from(kw) } as Doc; delete (doc as any).holdSettlement; docs.push(doc); return doc;
  };
  const hintAround = (x: number, y: number, radius: number, label: string, r2: Rng): DocHint => { const a = r2.float(0, Math.PI * 2), d = r2.float(0, radius * 0.6); return { x: x + Math.cos(a) * d, y: y + Math.sin(a) * d, radius, label }; };
  const dr = (e: HEvent) => new Rng(hash32(w.seed + '|doc|' + e.id));
  const peopleList = (ids: string[]) => ids.map(i => P.get(i)?.name).filter(Boolean) as string[];

  // ---------- event reports
  for (const e of H.events) {
    if (e.extra?.secret) continue; const rr2 = dr(e); const s = e.settlement ? S.get(e.settlement) : undefined;
    const notable = e.fame >= 0.2 || ['shipwreck', 'robbery', 'trial', 'railway_opening', 'railway_closure', 'mine_opened', 'mine_closed', 'mining_discovery', 'gold_rush', 'accident_death', 'lost_shipment', 'rescue', 'battle', 'abandonment', 'relocation', 'fire'].includes(e.kind);
    if (!notable) continue;
    const paper = anyPaper(e.year, s);
    if (!paper && e.year > H.startYear + 60 && e.kind !== 'conflict') { if (!rr2.chance(0.4)) continue; }
    const source = paper ? paper.name : `${H.polities.find(p => p.from <= e.year && p.to >= e.year && p.kind !== 'homeland')?.name ?? 'Colonial'} Gazette`;
    const where = e.x !== undefined ? placeDescribe(w, e.x, e.y!) : s ? `at ${s.name}` : 'in the district';
    let body: string[] = []; const facts: string[] = [`event:${e.id}`]; const hints: DocHint[] = [];
    const names = peopleList(e.people);
    const head = e.title.toUpperCase();
    switch (e.kind) {
      case 'shipwreck': {
        const v = H.vessels.find(q => q.id === e.vessel)!; const lost = e.magnitude ?? 0;
        body = [`The ${v.type} ${v.name}, ${v.tonnage} tons, Captain ${P.get(v.captain!)?.name ?? 'unknown'}, ${v.cargo} for the outside ports, was lost in a gale this week ${where}.`, `${lost ? `${lost} of her crew perished` : 'All hands were saved'}, and wreckage is coming ashore along the beach to leeward. ${e.prereqs.length ? 'The storm was the severest in living memory.' : ''}`];
        hints.push(hintAround(e.x!, e.y!, 2500, `Wreck of the ${v.name}`, rr2)); facts.push(`vessel:${v.id}`); break;
      }
      case 'robbery': {
        const gang = e.people.length; body = [`${e.text}`, `A reward is offered for information. The ${gang === 1 ? 'man is' : 'men are'} believed to have gone ${rr2.pick(['into the hills', 'towards the coast', 'upriver', 'into the forest'])}.`]; hints.push(hintAround(e.x!, e.y!, 3000, 'Scene of the robbery', rr2)); break;
      }
      case 'trial': {
        const caches = H.caches.filter(c => e.prereqs.includes(c.event)); body = [e.text, caches.length ? `Asked where the money was hidden, the prisoner said only that "it is where nobody will think to look".` : 'The sum was returned to its owners.'];
        if (caches.length && rr2.chance(0.65)) { const c = caches[0]; hints.push(hintAround(c.x, c.y, 4000, 'Hideout said to be in this country', rr2)); body.push(`A witness testified that the accused was seen near ${placeDescribe(w, hints[0].x, hints[0].y)} in the days after the robbery.`); }
        break;
      }
      case 'mining_discovery': case 'gold_rush': {
        const d = e.deposit ? w.D.deposits.find(q => q.id === e.deposit) : undefined; body = [e.text, d ? `The ground is described as ${w.G.formations[d.formation].rock} country, with ${d.expression.toLowerCase()}.` : ''];
        hints.push(hintAround(e.x!, e.y!, 900, e.kind === 'gold_rush' ? 'The creek strike' : 'The discovery', rr2)); if (e.deposit) facts.push(`deposit:${e.deposit}`); break;
      }
      case 'mine_opened': case 'mine_closed': { body = [e.text]; hints.push(hintAround(e.x!, e.y!, 500, 'The mine', rr2)); if (e.deposit) facts.push(`deposit:${e.deposit}`); break; }
      case 'fire': body = [e.text, `The ${paper?.name ?? 'brigade'} was powerless for want of water. Insurance, where there was any, will cover little.`]; if (s) { facts.push(`settlement:${s.id}`); hints.push(hintAround(s.x, s.y, 300, `${s.name}`, rr2)); } break;
      case 'accident_death': case 'lost_shipment': body = [e.text, e.extra?.cargo ? `The load, ${e.extra.cargo}, is a total loss. Searchers have found nothing but a few spars.` : `The body was recovered below the crossing.`]; hints.push(hintAround(e.x!, e.y!, 700, 'The crossing', rr2)); break;
      case 'battle': body = [e.text, `The ground over which the action was fought lies ${where}.`]; hints.push(hintAround(e.x!, e.y!, 900, 'The skirmish ground', rr2)); break;
      case 'railway_closure': case 'railway_opening': { body = [e.text]; const rt = e.route ? H.routes.find(q => q.id === e.route) : undefined; if (rt) { facts.push(`route:${rt.id}`); body.push(`Stations: ${[rt.from, rt.to].map(id => S.get(id)!.name).join(' to ')}.`); } break; }
      case 'abandonment': case 'relocation': { body = [e.text]; if (s) { facts.push(`settlement:${s.id}`); hints.push(hintAround(s.x, s.y, 400, `Site of ${s.name}`, rr2)); } break; }
      case 'rescue': body = [e.text, `${names[0] ?? 'The rescuer'} has been recommended for the ${w.issues.medals.find(m => m.event === e.id) ? 'gallantry medal' : 'Society\'s medal'}.`]; facts.push(`person:${e.people[0]}`); break;
      default: body = [e.text]; if (s) facts.push(`settlement:${s.id}`);
    }
    body = body.filter(Boolean);
    const date = { month: e.month, day: e.day };
    add({ kind: ['accident_death', 'lost_shipment'].includes(e.kind) ? 'accident_report' : e.kind === 'trial' ? 'court_record' : ['mine_opened', 'mine_closed', 'mining_discovery', 'gold_rush'].includes(e.kind) ? 'mining_record' : ['railway_opening', 'railway_closure'].includes(e.kind) ? 'transport_record' : 'newspaper', year: e.year, ...date, title: `${head}`, source, body, refs: { events: [e.id], people: e.people, businesses: e.businesses, settlements: e.settlement ? [e.settlement] : [], vessels: e.vessel ? [e.vessel] : [], deposits: e.deposit ? [e.deposit] : [], routes: e.route ? [e.route] : [] }, facts, hints, holdSettlement: paper?.settlement ?? e.settlement });
  }
  // ---------- directories: who traded where, by decade
  for (const s of H.settlements) {
    if (s.kind === 'farmstead' || s.kind === 'seasonal_camp') continue;
    const first = Math.ceil((s.founded + 10) / 10) * 10; const last = s.abandoned ?? H.endYear;
    for (let y = first; y <= Math.min(last, 2020); y += r.chance(0.5) ? 10 : 20) {
      const active = H.businesses.filter(b => b.settlement === s.id && b.founded <= y && (b.closed ?? 9999) > y);
      if (active.length < 2) continue; const dr2 = new Rng(hash32(w.seed + '|dir|' + s.id + y));
      const lines = active.slice(0, 30).map(b => { const o = P.get(b.owners.filter(q => q.from <= y && (q.to ?? 9999) > y).slice(-1)[0]?.person ?? b.owners[0].person)!; const where = b.kind === 'sawmill' || b.kind === 'mill' || b.kind === 'quarry' || b.kind === 'lime_kiln' || b.kind === 'brickworks' ? `at ${placeDescribe(w, b.x, b.y)}` : b.address; return `${o.surname}, ${o.given[0]}. — ${b.name} (${b.kind.replace(/_/g, ' ')}), ${where}`; });
      const sources = [`${s.name} Directory and Almanac`, `${w.H.polities.find(p => p.from <= y && p.to >= y && p.kind !== 'homeland')?.name ?? 'Colonial'} Trade Directory`]; const src = dr2.pick(sources);
      const pop = Math.round(s.popHist[Math.max(0, y - H.startYear)] || s.pop);
      add({ kind: 'directory', year: y, month: 1, day: 1, title: `${s.name} — directory for ${y}`, source: src, body: [`${s.name}: a ${s.kind.replace(/_/g, ' ')} of about ${pop} souls${s.stationYear && s.stationYear <= y ? ', with a railway station' : ''}.`, ...lines], refs: { settlements: [s.id], businesses: active.slice(0, 30).map(b => b.id), people: [] }, facts: [`settlement:${s.id}`, ...active.slice(0, 30).map(b => `biz:${b.id}`)], hints: [{ x: s.x, y: s.y, radius: 350, label: s.name }], holdSettlement: s.id });
    }
  }
  // ---------- mining records: claims, assays, annual reports
  for (const m of H.mines) {
    const d = w.D.deposits.find(q => q.id === m.deposit)!; const f = w.G.formations[d.formation]; const co = B.get(m.company)!; const disc = P.get(m.discoverer)!; const rr3 = new Rng(hash32(w.seed + '|mrec|' + m.id)); const s = S.get(m.settlement)!;
    const minerals = d.minerals.primary.filter((x, i, a) => a.indexOf(x) === i).map(x => MIN[x]?.name ?? x);
    const sup = d.minerals.supergene.map(x => MIN[x]?.name ?? x);
    add({ kind: 'mining_record', year: m.opened - 1, month: rr3.int(1, 12), day: rr3.int(1, 28), title: `Registration of the ${m.claimName} claim`, source: `Register of Mining Claims, ${s.name} District`, body: [`Claimant: ${disc.name}, ${disc.occupation}. Situation: ${placeDescribe(w, d.x, d.y)}.`, `The ground is ${f.rock} (the ${f.name}), ${d.process.toLowerCase()}.`, `Ore examined: ${minerals.join(', ')}${sup.length ? `; weathered ore shows ${sup.join(', ')}` : ''}. Surface: ${d.expression.toLowerCase()}.`, `${d.faultId !== undefined ? `The workings follow the ${w.G.faults[d.faultId]?.name ?? 'fault'}.` : ''}`].filter(Boolean), refs: { people: [disc.id], deposits: [d.id], settlements: [s.id], businesses: [co.id] }, facts: [`deposit:${d.id}`, `mine:${m.id}`, `person:${disc.id}`, `biz:${co.id}`], hints: [hintAround(d.x, d.y, 350, `The ${m.claimName} claim`, rr3)], holdSettlement: s.id });
    if (m.closed) add({ kind: 'mining_record', year: m.closed, month: rr3.int(1, 12), day: rr3.int(1, 28), title: `${m.claimName}: final return`, source: `Inspector of Mines, annual report`, body: [`${co.name} produced ${Math.round(m.produced).toLocaleString()} ${m.unit === 'oz' ? 'ounces of gold' : 'tons of ore'} in all. The mine ceased work because ${m.reason}.`, `Spoil heaps, mill foundations and a ${m.method.replace('_', ' ')} remain on the ground; the mine's scrip tokens are still found.`, `Open workings are dangerous and the Inspector warns against entering them.`], refs: { deposits: [d.id], businesses: [co.id], settlements: [s.id] }, facts: [`mine:${m.id}`, `biz:${co.id}`], hints: [hintAround(m.x, m.y, 250, `${m.claimName} workings`, rr3)], holdSettlement: s.id });
  }
  // ---------- business notices of sale and closure; property records of farms
  for (const b of H.businesses) {
    if (b.closed === undefined || b.scale < 3 || b.kind === 'mine_company' || b.kind === 'railway_company') continue; const s = S.get(b.settlement)!; const rr4 = new Rng(hash32(w.seed + '|bn|' + b.id)); if (!rr4.chance(0.8)) continue;
    add({ kind: 'public_notice', year: b.closed, month: rr4.int(1, 12), day: rr4.int(1, 28), title: `Auction: ${b.name}`, source: papersAt(s.id, b.closed)?.name ?? `${s.name} Notices`, body: [`By order of the creditors, the stock, plant and premises of ${b.name} (${b.kind.replace(/_/g, ' ')}), ${b.address}${b.kind === 'sawmill' || b.kind === 'mill' ? ` ${placeDescribe(w, b.x, b.y)}` : ''}, will be sold. Closed because ${b.closure}.`, `Established ${b.founded}. The firm's marked wares: ${b.mark}.`], refs: { businesses: [b.id], settlements: [s.id] }, facts: [`biz:${b.id}`, `biz:${b.id}:site`], hints: [hintAround(b.x, b.y, 200, b.name, rr4)], holdSettlement: s.id });
  }
  for (const f of H.settlements) {
    if (f.kind !== 'farmstead') continue; const rr5 = new Rng(hash32(w.seed + '|prop|' + f.id)); if (!rr5.chance(0.35)) continue; const head = P.get(f.founderId ?? ''); const parent = S.get(f.parent!);
    add({ kind: 'property_record', year: f.founded, month: rr5.int(1, 12), day: rr5.int(1, 28), title: `Deed: ${f.name}`, source: `Land Registry, ${parent?.name ?? 'the district'}`, body: [`Conveyance of ${rr5.int(40, 220)} acres ${placeDescribe(w, f.x, f.y)} to ${head?.name ?? 'a settler'}, farmer, with a dwelling house and well.`, f.abandoned ? `Marginal note (${f.abandoned}): the holding was given up because ${f.abandonReason}.` : ''].filter(Boolean), refs: { people: head ? [head.id] : [], settlements: [f.id] }, facts: [`settlement:${f.id}`, `settlement:${f.id}:site`], hints: [hintAround(f.x, f.y, 250, f.name, rr5)], holdSettlement: parent?.id });
  }
  // ---------- shipping register
  for (const v of H.vessels) {
    const home = S.get(v.homePort)!; const rr6 = new Rng(hash32(w.seed + '|ship|' + v.id)); const cap = P.get(v.captain!);
    add({ kind: 'shipping_register', year: v.built + 1, month: rr6.int(1, 12), day: rr6.int(1, 28), title: `Register of vessels: ${v.name}`, source: `Registrar of Shipping, ${home.name}`, body: [`${v.name}, ${v.type}, ${v.tonnage} tons, built ${v.built} (${v.hull}-hulled, ${v.power}). Home port ${home.name}. Master: ${cap?.name ?? 'unknown'}. Usual cargo: ${v.cargo}.`, v.lost ? `Struck from the register in ${v.lost}: lost.` : ''].filter(Boolean), refs: { vessels: [v.id], settlements: [v.homePort], people: v.captain ? [v.captain] : [] }, facts: [`vessel:${v.id}`], hints: [], holdSettlement: home.id });
  }
  // ---------- obituaries
  for (const p of H.people) {
    if (p.died === null || p.fame < 0.2 && !p.role && !p.deathCause) continue; if (p.deathCause?.startsWith('drowned in the wreck') && p.fame < 0.3) continue;
    const rr7 = new Rng(hash32(w.seed + '|ob|' + p.id)); const s = p.residence ? S.get(p.residence) : undefined; if (p.died < H.startYear + 2) continue;
    const bizIds = H.businesses.filter(b => b.owners.some(o => o.person === p.id)).map(b => b.id); const biz = bizIds.map(i => B.get(i)!).filter(Boolean);
    const lines = [`${p.name}, ${p.occupation}${s ? ` of ${s.name}` : ''}, died this week at the age of ${p.died - p.born}${p.deathCause ? `, ${p.deathCause}` : ''}.`];
    if (biz.length) lines.push(`He is remembered as the founder of ${biz[0].name}${biz[0].closed ? ', now closed' : ''}.`);
    if (p.role === 'discoverer') lines.push(`He was the first to find ore in the district.`);
    if (p.role === 'rescuer') lines.push(`He was awarded a medal for saving life at sea.`);
    const cache = H.caches.find(c => c.owner === p.id);
    if (cache && cache.why.includes(p.name)) lines.push(`He was said never to have trusted banks, and some believe he took the whereabouts of his savings to the grave.`);
    else if (cache && cache.kind === 'loot') lines.push(`The loot of the old ${s ? s.name : ''} robbery was never recovered, and he did not say where it lay.`);
    const hints: DocHint[] = []; if (cache && rr7.chance(0.5)) hints.push(hintAround(cache.x, cache.y, cache.kind === 'savings' ? 500 : 5000, 'Where he was last known to range', rr7));
    add({ kind: 'obituary', year: p.died, month: rr7.int(1, 12), day: rr7.int(1, 28), title: `Obituary: ${p.name}`, source: (anyPaper(p.died, s)?.name) ?? 'Parish register', body: lines, refs: { people: [p.id], businesses: bizIds, settlements: s ? [s.id] : [] }, facts: [`person:${p.id}`, ...bizIds.map(b => `biz:${b}`)], hints, holdSettlement: s?.id });
  }
  // ---------- survey maps (what the surveyors of the day knew)
  for (let y = Math.ceil((H.startYear + 15) / 25) * 25; y <= H.endYear; y += 25) {
    const act = H.settlements.filter(s => s.founded <= y && (s.abandoned === undefined || s.abandoned > y) && s.kind !== 'farmstead' && s.kind !== 'seasonal_camp');
    add({ kind: 'survey_map', year: y, month: 6, day: 1, title: `Survey map of the district, ${y}`, source: `${H.polities.find(p => p.from <= y && p.to >= y && p.kind !== 'homeland')?.name ?? 'Colonial'} Surveyor's Office`, body: [`A map of the settled district as surveyed in ${y}, showing ${act.length} settlements, the principal roads${y >= 1840 ? ' and railways' : ''}, and the mines then at work. Positions are good to about ${y < 1750 ? 400 : y < 1850 ? 250 : 120} metres.`], refs: { settlements: act.map(s => s.id) }, facts: act.map(s => `settlement:${s.id}`), hints: [], mapYear: y, holdSettlement: regional });
  }
  // ---------- geological survey reports (public knowledge of formations and prospects)
  for (const p of w.G.provinces) {
    const forms = p.formations.map(i => w.G.formations[i]); const dd = w.D.deposits.filter(q => forms.some(f => f.id === q.formation));
    const lines = [`The ${p.name} is a ${p.terrane.replace('_', ' ')} province. Rocks seen: ${forms.map(f => `${f.name} (${f.rock}, ${periodOf(f.ageMa)}, ${f.process.toLowerCase()})`).join('; ')}.`];
    if (dd.some(q => q.kind === 'orogenic_gold')) lines.push('Gold-bearing quartz veins are known where the greenstone and schist are cut by faults.');
    if (dd.some(q => q.kind === 'fossil_bed')) lines.push('Fossil-bearing beds crop out along the streams and cliffs of the sedimentary units.');
    add({ kind: 'letter', year: Math.min(H.endYear - 5, H.startYear + 90 + (hash32(p.name) % 60)), month: 3, day: 14, title: `Geological survey notes on the ${p.name}`, source: 'Geological Survey, field notes', body: lines, refs: { settlements: [] }, facts: [`prov:${p.id}`], hints: [{ x: p.cx * CELL, y: p.cy * CELL, radius: 5000, label: p.name }], holdSettlement: regional });
  }
  return docs;
}
