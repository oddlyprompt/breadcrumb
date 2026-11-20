import type { App } from './app';
import { h, esc, money } from './dom';
import { explainArtifact, explainSpecimen, discoveryChains, worldSummary } from '../sim/inspect';
import { validateWorld } from '../sim/validate';
import { generateSite } from '../sim/artifacts';
import { trueValue, demandOf, marketDrift, buyersFor } from '../sim/economy';
import { ARC } from '../sim/archetypes';
import { MIN } from '../sim/minerals';
import { periodOf } from '../sim/fossils';
import { fmtDate, placeDescribe } from '../sim/describe';
import { CELL } from '../sim/terrain';
import { describeArtifact } from '../sim/identify';

/** Developer-only inspection tools: the full underlying truth of the generated world. */
export function devPane(a: App, el: HTMLElement) {
  const w = a.w, g = a.g, H = w.H; el.classList.add('dev'); el.append(h('h2', {}, 'Developer inspection'));
  const tabs = ['world', 'geology', 'history', 'objects', 'economy', 'chains']; const tb = h('div', { class: 'tabs', style: 'margin-bottom:6px' }); for (const t of tabs) tb.append(h('button', { class: a.devTab === t ? 'on' : '', onClick: () => { a.devTab = t; a.renderPane(); } }, t)); el.append(tb);
  const table = (head: string[], rows: Array<Array<string | number>>, onRow?: (i: number) => void) => { const t = h('table'); const th = h('tr'); head.forEach(x => th.append(h('th', {}, x))); t.append(th); rows.forEach((r, i) => { const tr = h('tr', onRow ? { style: 'cursor:pointer', onClick: () => onRow(i) } : {}); r.forEach(c => tr.append(h('td', {}, String(c)))); t.append(tr); }); return t; };
  const goMap = (x: number, y: number) => { a.setView('map'); a.map.centerOn(x, y, 0.03); };
  switch (a.devTab) {
    case 'world': {
      const sum = worldSummary(w); el.append(h('pre', { class: 'small', style: 'white-space:pre-wrap' }, JSON.stringify({ ...sum, traits: { ...sum.traits, coastAngles: sum.traits.coastAngles.map(x => +x.toFixed(2)) } }, null, 1)));
      const xr = h('label', {}, h('input', { type: 'checkbox' }), ' X-ray: show every buried object and specimen in the field view') as HTMLElement; const cb = xr.querySelector('input') as HTMLInputElement; cb.checked = a.field.xray; cb.onchange = () => { a.field.xray = cb.checked; }; el.append(xr);
      const out = h('div', { class: 'small' }); el.append(h('button', { class: 'btn small', style: 'margin-top:6px', onClick: () => { const t0 = performance.now(); const r = validateWorld(w, { siteSample: 60 }); out.innerHTML = `<b>${r.violations.length} violations</b> in ${(performance.now() - t0).toFixed(0)} ms. ${esc(JSON.stringify(r.stats))}<br>` + r.violations.slice(0, 30).map(v => `${esc(v.cat)}: ${esc(v.msg)}`).join('<br>'); } }, 'Run validation on this world'), out);
      el.append(h('h3', {}, 'Ledger'), h('div', {}, `Sites generated this session: ${w.ledger.sitesGenerated}; objects decayed away before recovery: ${w.ledger.decayed}; recovered by you: ${Object.keys(g.recovered).length}.`));
      break; }
    case 'geology': {
      el.append(h('h3', {}, 'Formations')); el.append(table(['name', 'rock', 'Ma', 'env', 'fossils'], w.G.formations.map(f => [f.name, f.rock, Math.round(f.ageMa), f.env ?? '', f.fossiliferous ? 'yes' : '-'])));
      el.append(h('h3', {}, 'Deposits (click to map)')); el.append(table(['id', 'kind', 'name', 'host', 'grade', 'viable', 'tonnes'], w.D.deposits.map(d => [d.id, d.kind, d.name, w.G.formations[d.formation].rock, `${d.grade.toFixed(1)} ${d.gradeUnit}`, d.viableFrom ?? 'never', Math.round(d.tonnage)]), i => goMap(w.D.deposits[i].x, w.D.deposits[i].y)));
      el.append(h('h3', {}, 'Placer trains')); el.append(table(['source', 'cells', 'length km', 'richest'], w.D.placers.map(p => [p.sourceId, p.cells.length, (p.cells[p.cells.length - 1]?.dist / 1000).toFixed(1), Math.max(...p.cells.map(c => c.richness)).toFixed(2)])));
      break; }
    case 'history': {
      el.append(h('h3', {}, 'Settlements (click to map)')); const ss = H.settlements.filter(s => s.kind !== 'farmstead'); el.append(table(['name', 'kind', 'founded', 'ended', 'peak', 'why'], ss.map(s => [s.name, s.kind, s.founded, s.abandoned ?? '-', Math.round(s.peak), s.reason.slice(0, 60)]), i => goMap(ss[i].x, ss[i].y)));
      const q = ((a as any).evQ ?? '') as string; const inp = h('input', { class: 'q', placeholder: 'filter events by text…', value: q }) as HTMLInputElement; inp.onkeydown = e => { if (e.key === 'Enter') { (a as any).evQ = inp.value; a.renderPane(); } }; el.append(h('h3', {}, 'Events'), inp);
      const evs = H.events.filter(e => !q || (e.title + e.kind + e.text).toLowerCase().includes(q.toLowerCase())).slice(0, 80); el.append(table(['id', 'year', 'kind', 'title', 'prereqs', 'causes'], evs.map(e => [e.id, e.year, e.kind, e.title.slice(0, 50), e.prereqs.join(','), e.consequences.slice(0, 4).join(',')]), i => { const e = evs[i]; if (e.x !== undefined) goMap(e.x, e.y!); }));
      el.append(h('h3', {}, 'Manufacturers')); el.append(table(['name', 'kind', 'place', 'years', 'tokens', 'closure'], H.businesses.filter(b => b.scale >= 2).slice(0, 80).map(b => [b.name, b.kind, H.settlements.find(s => s.id === b.settlement)!.name, `${b.founded}-${b.closed ?? ''}`, b.tokenFrom ? `${b.tokenFrom}-${b.tokenTo}` : '', b.closure ?? ''])));
      break; }
    case 'objects': {
      const near = a.S.sitesNear(g.x, g.y, 2500).filter(s => s.densityMult > 0); el.append(h('h3', {}, `Sites within 2.5 km (${near.length})`)); el.append(table(['site', 'kind', 'objects', 'metal', 'value', 'access'], near.slice(0, 40).map(s => { const arts = generateSite(w, s); const metal = arts.filter(x => ARC[x.arch] && x.mat && x.mat !== 'glass').length; return [s.name.slice(0, 40), s.kind, arts.length, metal, money(arts.reduce((t, x) => t + trueValue(w, x).total, 0)), s.access]; })));
      el.append(h('h3', {}, 'Provenance inspector')); const selF = g.finds.find(f => f.uid === a.selected);
      const closest = a.S.artifactsNear(a.field.x, a.field.y, 8).sort((p, q) => Math.hypot(p.x - a.field.x, p.y - a.field.y) - Math.hypot(q.x - a.field.x, q.y - a.field.y))[0];
      const show = (title: string, qa: ReturnType<typeof explainArtifact>) => { el.append(h('h3', {}, title)); for (const x of qa) el.append(h('div', {}, h('div', { class: 'q', style: 'font-weight:700' }, x.q), h('div', { class: 'ans q' }, ...x.a.map(l => h('div', {}, l))))); };
      if (selF) show(`Selected find: ${selF.art ? ARC[selF.art.arch].name : selF.spec!.name}`, selF.art ? explainArtifact(w, selF.art) : explainSpecimen(w, selF.spec!));
      if (closest) show(`Nearest buried object (${Math.hypot(closest.x - a.field.x, closest.y - a.field.y).toFixed(1)} m, depth ${closest.depth.toFixed(0)} cm): ${ARC[closest.art.arch].name}`, explainArtifact(w, closest.art)); else el.append(h('p', {}, 'No buried object within 8 m. Walk to a site (turn on X-ray on the World tab) and come back.'));
      const sp = a.S.specimensNear(a.field.x, a.field.y, 10)[0]; if (sp) show(`Nearest specimen: ${sp.name}`, explainSpecimen(w, sp));
      break; }
    case 'economy': {
      const d = demandOf(w); el.append(h('h3', {}, 'Regional demand multipliers (from this world\'s history)'), table(['category', 'demand', 'drift now'], Object.entries(d).map(([k, v]) => [k, v.toFixed(2), marketDrift(w, g.day, k).toFixed(2)])));
      el.append(h('h3', {}, 'Rarest coin series (expected survivors)')); const rare = w.coin.series.slice().sort((x, y) => x.expected - y.expected).slice(0, 15); el.append(table(['series', 'denom', 'year', 'mintage', 'survivors'], rare.map(s => [s.id, s.denomText, s.year, s.mintage, s.expected.toFixed(2)])));
      const buyers = buyersFor(w, w.start.settlement); el.append(h('h3', {}, 'Start-town buyers'), table(['buyer', 'kind', 'margin', 'expertise'], buyers.map(b => [b.name, b.kind, b.margin.toFixed(2), b.expertise])));
      break; }
    case 'chains': { const ch = discoveryChains(w).slice(0, 40); el.append(h('p', { class: 'small' }, `${ch.length} connected-evidence chains exist (first 40).`)); for (const c of ch) el.append(h('div', { class: 'card q' }, h('b', {}, c.title), ...c.steps.map(s => h('div', {}, '→ ' + s)))); break; }
  }
  void MIN; void periodOf; void fmtDate; void placeDescribe; void CELL; void describeArtifact;
}
