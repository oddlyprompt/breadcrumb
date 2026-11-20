import type { World } from '../sim/worldtypes';
import { GameState, Searcher, serialize, dateString, timeString, minutesPass, sleepToMorning, nearestSettlementOf, planTravel, travel, Recovered, learn, addBookmark } from '../sim/game';
import { weatherOn, calendar, tideHeight } from '../sim/environment';
import { placeDescribe } from '../sim/describe';
import { Find, toolsFrom, describeArtifact } from '../sim/identify';
import { ARC } from '../sim/archetypes';
import { MAT } from '../sim/materials';
import { Sound } from './audio';
import { FieldView, Mode } from './field';
import { MapView, MapHit } from './mapview';
import { h, esc, money } from './dom';
import { drawFind } from './draw';
import { putSave } from './storage';
import { packPane, gearPane, shopPane, researchPane, journalPane, collectionPane, guidePane } from './panels';
import { devPane } from './devpanel';
import { tideLevelAt } from './ground';
import type { Feature, Site } from '../sim/sites';
import { cellOf } from '../sim/terrain';
import { SED_NAMES, VEG_NAMES } from '../sim/landscape';
import { isWater } from '../sim/game';

export interface Panel { id: string; label: string; render: (app: App, el: HTMLElement) => void; badge?: (app: App) => number; }
export class App {
  S: Searcher; snd = new Sound(); field!: FieldView; map!: MapView; view: 'field' | 'map' = 'field'; tab = 'pack'; selected: string | null = null; private toastEl!: HTMLElement; private toastT = 0;
  private paneEl!: HTMLElement; private tabsEl!: HTMLElement; private topEl!: HTMLElement; private viewHost!: HTMLElement; private toolbar!: HTMLElement; private mapInfo!: HTMLElement; private hudEl!: HTMLElement; private mapBar!: HTMLElement;
  private hudHtml = ''; private hudT = 0;
  private actions = 0; private lastSave = Date.now(); lastTier = 0; devOn = false; private panels: Panel[]; mapHit: MapHit | null = null; selDoc: string | null = null; shopBuyer = 0; devTab = 'world';
  constructor(public root: HTMLElement, public w: World, public g: GameState, public saveId: string, public onQuit: () => void) {
    this.S = new Searcher(w, g); this.snd.vol = loadVol();
    this.panels = [{ id: 'pack', label: 'Pack', render: packPane, badge: a => a.g.finds.filter(f => f.status !== 'sold').length }, { id: 'gear', label: 'Gear', render: gearPane }, { id: 'shop', label: 'Town', render: shopPane }, { id: 'research', label: 'Archive', render: researchPane }, { id: 'journal', label: 'Journal', render: journalPane }, { id: 'collection', label: 'Collection', render: collectionPane }, { id: 'guide', label: 'Guide', render: guidePane }, { id: 'dev', label: 'Dev', render: devPane }];
    this.mount(); this.checkObjectives(); window.addEventListener('beforeunload', () => this.save()); document.addEventListener('visibilitychange', () => { if (document.hidden) this.save(); });
    window.addEventListener('keydown', e => { if ((e.target as HTMLElement)?.tagName === 'INPUT' || (e.target as HTMLElement)?.tagName === 'TEXTAREA' || (e.target as HTMLElement)?.tagName === 'SELECT') return; const k = e.key.toLowerCase(); if (k === 'm') this.setView(this.view === 'map' ? 'field' : 'map'); else if (this.view === 'field') { if (k === 'f') this.field.setMode(this.field.mode === 'search' ? 'walk' : 'search'); if (k === 'q') this.field.setMode(this.field.mode === 'detect' ? 'walk' : 'detect'); if (k === 'g') this.field.setMode(this.field.mode === 'pan' ? 'walk' : 'pan'); } if (k === '`') this.toggleDev(); if (k === 'escape') this.closeModal(); });
  }
  get tools() { return toolsFrom(this.g.owned); }
  mount() {
    const r = this.root; r.innerHTML = '';
    const shell = h('div', { class: 'shell' }); this.topEl = h('div', { class: 'top' }); this.viewHost = h('div', { class: 'viewwrap' }); const side = h('div', { class: 'side' }); this.tabsEl = h('div', { class: 'tabs' }); this.paneEl = h('div', { class: 'pane' }); side.append(this.tabsEl, this.paneEl); shell.append(this.topEl, this.viewHost, side); r.append(shell);
    this.toastEl = h('div', { class: 'toast' }); this.viewHost.append(this.toastEl);
    this.field = new FieldView(this.viewHost, this.w, this.g, this.S, this.snd, { toast: (m, b) => this.toast(m, b), found: got => this.onFound(got), changed: () => this.refresh(false), feature: f => this.onFeature(f), siteEntered: (s, first) => this.onSite(s, first) });
    this.map = new MapView(this.w, () => this.g, this.viewHost); this.map.cv.style.display = 'none'; this.map.onHit = hit => { this.mapHit = hit; this.renderMapInfo(); }; this.map.onGo = (x, y) => this.travelDialog(x, y);
    this.toolbar = h('div', { class: 'toolbar' }); this.viewHost.append(this.toolbar);
    this.hudEl = h('div', { class: 'hud tl' }); this.viewHost.append(this.hudEl); this.mapInfo = h('div', { class: 'hud bl' }); this.viewHost.append(this.mapInfo); this.mapBar = h('div', { class: 'hud tr' }); this.viewHost.append(this.mapBar);
    this.field.start(); this.field.cv.focus(); this.refresh(true);
    const loop = () => { if (this.view === 'map') this.map.draw(this.g); this.updateHud(); requestAnimationFrame(loop); }; requestAnimationFrame(loop);
    setInterval(() => { if (Date.now() - this.lastSave > 45000) this.save(); }, 5000);
  }
  setView(v: 'field' | 'map') {
    this.view = v; this.field.cv.style.display = v === 'field' ? 'block' : 'none'; this.map.cv.style.display = v === 'map' ? 'block' : 'none'; this.field.setActive(v === 'field');
    if (v === 'map') { this.map.resize(); this.map.centerOn(this.g.x, this.g.y, Math.max(this.map.scale, 0.012)); this.map.marker = null; } else this.field.cv.focus(); this.mapHit = null; this.renderMapInfo(); this.refresh(true);
  }
  toast(msg: string, big = false) { this.toastEl.textContent = msg; this.toastEl.className = 'toast on' + (big ? ' big' : ''); clearTimeout(this.toastT); this.toastT = window.setTimeout(() => { this.toastEl.className = 'toast'; }, big ? 4200 : 2600); }
  save() { this.lastSave = Date.now(); const g = this.g; const s = this.w.H.settlements.find(q => q.id === this.w.start.settlement)!; const net = g.cash + 0; void s;
    putSave({ id: this.saveId, name: `${this.w.name}`, seed: g.seed, genVersion: g.genVersion, saveVersion: g.v, updated: Date.now(), summary: `${dateString(g)} · ${money(g.cash)} · ${g.finds.filter(f => f.status !== 'sold').length} finds · ${g.stats.dug} holes`, state: JSON.parse(serialize(g)) }).catch(() => {}); void net; }
  refresh(full = false) {
    this.renderTop(); if (full) { this.renderTabs(); this.renderToolbar(); this.renderMapBar(); } this.renderPane(); this.actions++;
  }
  private renderTop() {
    const g = this.g, w = this.w; const wx = weatherOn(w, g.day); const c = calendar(g.day); const near = nearestSettlementOf(w, g.x, g.y);
    const tide = tideLevelAt(w, g.day * 1440 + g.minute); const coast = w.T.coastDist[cellOf(g.x, g.y)] < 2500;
    this.topEl.innerHTML = `<span class="logo">BREADCRUMB</span><span>${esc(placeDescribe(w, g.x, g.y))}</span><span class="sp"></span><span>${esc(dateString(g))}, <b>${timeString(g)}</b></span><span>${esc(wx.text)}, ${Math.round(wx.tempC)}°C</span>${coast ? `<span>tide ${tide > 0.3 ? 'high' : tide < -0.3 ? 'low' : 'mid'}</span>` : ''}<span>Cash <b>${money(g.cash)}</b></span>`;
    const btn = (label: string, fn: () => void, title = '') => { const b = h('button', { class: 'tbtn', title, onClick: fn }, label); this.topEl.append(b); };
    btn(this.view === 'map' ? 'Field (M)' : 'Map (M)', () => this.setView(this.view === 'map' ? 'field' : 'map')); btn('Rest', () => this.rest(), 'Sleep until morning'); btn('Save', () => { this.save(); this.toast('Saved.'); }); btn('Menu', () => this.menu());
  }
  private renderTabs() {
    this.tabsEl.innerHTML = ''; for (const p of this.panels) { if (p.id === 'dev' && !this.devOn) continue; const n = p.badge?.(this) ?? 0; const b = h('button', { class: this.tab === p.id ? 'on' : '', onClick: () => { this.tab = p.id; this.renderTabs(); this.renderPane(); this.snd.start(); this.snd.click(); } }, p.label, n ? h('span', { class: 'n' }, String(n)) : null); this.tabsEl.append(b); }
  }
  renderPane() { const p = this.panels.find(q => q.id === this.tab) ?? this.panels[0]; const st = this.paneEl.scrollTop; const body = document.createElement('div'); p.render(this, body); this.paneEl.replaceChildren(body); this.paneEl.scrollTop = st; } // a fresh container per render, so event handlers bound by a panel never accumulate
  private renderToolbar() {
    this.toolbar.innerHTML = ''; if (this.view !== 'field') { this.toolbar.style.display = 'none'; return; } this.toolbar.style.display = 'flex';
    const mk = (m: Mode, label: string, key: string) => { const b = h('button', { class: this.field.mode === m ? 'on' : '', onClick: () => { this.snd.start(); this.field.setMode(m); this.renderToolbar(); this.field.cv.focus(); } }, label, h('kbd', {}, key)); this.toolbar.append(b); };
    mk('walk', 'Walk', 'WASD'); mk('detect', 'Detect', 'Q'); mk('search', 'Surface', 'F'); mk('pan', 'Pan', 'G');
    this.toolbar.append(h('button', { class: 'act', onClick: () => { this.snd.start(); this.field.act(); } }, 'Dig', h('kbd', {}, 'Space')), h('button', { class: this.field.pinOn ? 'on' : '', onClick: () => { this.field.pinOn = !this.field.pinOn; this.renderToolbar(); } }, 'Pinpoint', h('kbd', {}, 'P')));
    this.toolbar.append(h('button', { class: 'zoom', onClick: () => { this.field.ppm = Math.min(80, this.field.ppm * 1.4); } }, '+'), h('button', { class: 'zoom', onClick: () => { this.field.ppm = Math.max(5, this.field.ppm / 1.4); } }, '−'));
  }
  private updateHud() {
    if (performance.now() - this.hudT < 200) return; this.hudT = performance.now();
    if (this.view !== 'field') { if (this.hudHtml) { this.hudHtml = ''; this.hudEl.innerHTML = ''; } return; } const g = this.g, w = this.w, c = cellOf(this.field.x, this.field.y); const gr = this.S.groundAt(this.field.x, this.field.y); const acc = this.S.access(this.field.x, this.field.y);
    const set = this.S.setup(); const dg = g.equipped.digger === 'hands' ? 'bare hands' : '';
    const html = `<div class="panel small">${esc(SED_NAMES[gr.sed])} · ${esc(VEG_NAMES[gr.veg])}<br>Mode: <b>${this.field.mode}</b>${set ? ` · ${esc(set.det.name)}` : ' · no detector'}${dg ? ' · ' + dg : ''}<br>${acc.ok ? '<span style="color:#9fd18a">Open to search</span>' : `<span style="color:#f0a090">${esc(acc.reason)}</span>`}${acc.farm ? ` <a class="lnk" id="ask" style="pointer-events:auto;color:#ffd98a">Ask permission</a>` : ''}${this.S.pending ? '<br><span class="tiny">Loading this area…</span>' : ''}</div>`;
    if (html === this.hudHtml) return; this.hudHtml = html; this.hudEl.innerHTML = html;
    const ask = this.hudEl.querySelector('#ask'); if (ask) (ask as HTMLElement).onclick = () => { import('../sim/game').then(m => { const r = m.askPermission(this.S, acc.farm!); this.toast(r.msg, r.granted); this.refresh(); }); };
  }
  private renderMapBar() {
    this.mapBar.innerHTML = ''; if (this.view !== 'map') return; const p = h('div', { class: 'panel small' }); const toggles: Array<[string, string]> = [['contours', 'Contours'], ['geology', 'Geology'], ['history', 'Known old sites'], ['discoveries', 'My discoveries'], ['hints', 'Record hints']];
    for (const [id, label] of toggles) { const l = h('label', { style: 'display:block;cursor:pointer' }); const cb = h('input', { type: 'checkbox' }) as HTMLInputElement; cb.checked = this.map.overlays.has(id as any); cb.onchange = () => { this.map.setOverlay(id as any, cb.checked); }; l.append(cb, ' ' + label); p.append(l); }
    const maps = this.g.docsRead.map(id => this.w.docs.find(d => d.id === id)!).filter(d => d?.mapYear); if (maps.length) { p.append(h('div', { class: 'tiny', style: 'margin-top:6px' }, 'Historical maps you have read:')); const row = h('div', { class: 'row', style: 'flex-wrap:wrap;gap:3px' }); const none = h('button', { class: 'btn small alt', onClick: () => { this.map.histYear = null; this.map.invalidate(); } }, 'Today'); row.append(none); for (const d of maps.sort((a, b) => a.year - b.year)) row.append(h('button', { class: 'btn small alt', onClick: () => { this.map.histYear = d.mapYear!; this.map.invalidate(); } }, String(d.mapYear))); p.append(row); }
    if (this.map.overlays.has('geology')) { const forms = new Map<number, string>(); const seen = new Set<number>(); const G = this.w.G; for (let i = 0; i < G.formationOf.length; i += 7) if (!this.w.T.sea[i]) seen.add(G.formationOf[i]); const lg = h('div', { class: 'tiny scrollable', style: 'margin-top:6px;max-height:160px' }); for (const id of Array.from(seen).sort((a, b) => G.formations[b].ageMa - G.formations[a].ageMa)) { const f = G.formations[id]; lg.append(h('div', { html: `<span class="swatch" style="background:${f.hex}"></span>${esc(f.name)} <span class="muted">(${esc(f.rock)}, ${Math.round(f.ageMa)} Ma)</span>` })); void forms; } p.append(lg); }
    this.mapBar.append(p);
  }
  private renderMapInfo() {
    this.mapInfo.innerHTML = ''; if (this.view !== 'map' || !this.mapHit) return; const hit = this.mapHit; const p = h('div', { class: 'panel', style: 'max-width:340px;text-align:left' }); p.innerHTML = `<b>${esc(hit.title)}</b><br>${hit.lines.map(esc).join('<br>')}`;
    const plan = planTravel(this.w, this.g.x, this.g.y, hit.x, hit.y);
    if (plan) { const row = h('div', { class: 'row', style: 'margin-top:6px' }); row.append(h('button', { class: 'btn small', onClick: () => this.travelDialog(hit.x, hit.y) }, `Travel (${fmtMin(plan.walkMinutes)} on foot${isFinite(plan.rideMinutes) ? `, ${fmtMin(plan.rideMinutes)} by bus ${money(plan.rideCost)}` : ''})`)); p.append(row); } else p.append(h('div', { class: 'tiny muted' }, 'You cannot walk there.'));
    p.append(h('div', { class: 'row', style: 'margin-top:4px' }, h('button', { class: 'btn small alt', onClick: () => { addBookmark(this.g, hit.title === 'Position' ? 'Marked spot' : hit.title, hit.x, hit.y, 60); this.toast('Bookmarked.'); this.refresh(); this.map.invalidate(); } }, 'Bookmark')));
    this.mapInfo.append(p);
  }
  travelDialog(x: number, y: number) {
    const plan = planTravel(this.w, this.g.x, this.g.y, x, y); if (!plan) { this.toast('No way to walk there.'); return; }
    const m = h('div', { class: 'modal', onClick: (e: Event) => { if (e.target === m) m.remove(); } }); const box = h('div', { class: 'box' }); box.append(h('h2', {}, 'Travel'), h('p', {}, `Destination: ${placeDescribe(this.w, x, y)}. ${plan.km.toFixed(1)} km by the easiest route.`));
    const go = (ride: boolean) => { const msg = travel(this.g, this.w, plan, x, y, ride); this.field.x = this.g.x; this.field.y = this.g.y; this.field.coil.x = x; this.field.coil.y = y; m.remove(); this.toast(msg); this.setView('field'); this.save(); };
    box.append(h('div', { class: 'row' }, h('button', { class: 'btn', onClick: () => go(false) }, `Walk (${fmtMin(plan.walkMinutes)})`), isFinite(plan.rideMinutes) ? h('button', { class: 'btn alt', disabled: this.g.cash < plan.rideCost, onClick: () => go(true) }, `Ride the bus (${fmtMin(plan.rideMinutes)}, ${money(plan.rideCost)})`) : h('span', { class: 'muted small' }, 'No bus service on that route.')), h('p', { class: 'tiny muted' }, 'Roads and abandoned lanes make walking faster; wetland and steep ground slow it. Night travel is allowed, but searching in the dark is hard.'));
    m.append(box); document.body.append(m);
  }
  rest() { const before = this.g.day; sleepToMorning(this.g, this.w); this.toast(this.g.day > before ? 'You make camp and sleep until morning.' : 'You rest for a while.'); this.refresh(); this.save(); }
  menu() {
    const m = h('div', { class: 'modal', onClick: (e: Event) => { if (e.target === m) m.remove(); } }); const box = h('div', { class: 'box' }); box.append(h('h2', {}, 'Menu'));
    const vol = (label: string, key: 'master' | 'detector' | 'effects' | 'ambience') => { const r = h('div', { class: 'row' }); const sl = h('input', { type: 'range', min: 0, max: 1, step: 0.05, value: this.snd.vol[key], style: 'flex:1' }) as HTMLInputElement; sl.oninput = () => { this.snd.vol[key] = +sl.value; this.snd.applyVol(); saveVol(this.snd.vol); }; r.append(h('span', { style: 'width:90px' }, label), sl); return r; };
    box.append(vol('Master', 'master'), vol('Detector', 'detector'), vol('Effects', 'effects'), vol('Ambience', 'ambience'));
    const mute = h('label', {}, h('input', { type: 'checkbox' }), ' Mute all sound') as HTMLElement; const cb = mute.querySelector('input') as HTMLInputElement; cb.checked = this.snd.vol.muted; cb.onchange = () => { this.snd.vol.muted = cb.checked; this.snd.applyVol(); saveVol(this.snd.vol); }; box.append(mute);
    box.append(h('p', { class: 'small muted' }, `World seed: ${this.g.seed} (generation v${this.g.genVersion}, save v${this.g.v}). Backquote (\`) toggles the developer tools.`));
    box.append(h('div', { class: 'row', style: 'margin-top:10px' }, h('button', { class: 'btn', onClick: () => { this.save(); m.remove(); this.toast('Saved.'); } }, 'Save'), h('button', { class: 'btn alt', onClick: () => { const blob = new Blob([serialize(this.g)], { type: 'application/json' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `breadcrumb-${this.g.seed}-day${this.g.day}.json`; a.click(); } }, 'Export save'), h('button', { class: 'btn alt', onClick: () => { this.save(); this.onQuit(); } }, 'Quit to title'), h('button', { class: 'btn alt', onClick: () => m.remove() }, 'Close')));
    m.append(box); document.body.append(m);
  }
  closeModal() { document.querySelectorAll('.modal').forEach(e => e.remove()); document.querySelectorAll('.discover').forEach(e => e.remove()); }
  toggleDev() { this.devOn = !this.devOn; if (this.devOn) this.tab = 'dev'; else if (this.tab === 'dev') this.tab = 'pack'; this.field.xray = this.devOn && this.field.xray; this.refresh(true); this.toast(this.devOn ? 'Developer tools on' : 'Developer tools off'); }
  // ----- events
  onFound(got: Recovered[]) {
    const t = this.tools; let top = 0; let best: Recovered | null = null; const hoard = got.length >= 5;
    for (const r of got) { if (!r.find || r.find.uid === 'hot') { if (r.note) this.toast(r.note); continue; } const wow = wowOf(r.find, hoard); if (wow >= top) { top = wow; best = r; } }
    const real = got.filter(r => r.find && r.find.uid !== 'hot'); if (!real.length) { this.snd.recover(0); return; }
    this.snd.recover(top); if (top <= 0 && real[0].art && ARC[real[0].art.arch].cat === 'coin') this.snd.coin();
    const names = real.slice(0, 3).map(r => r.find.kind === 'artifact' ? describeArtifact(this.w, r.find, new Set(this.g.kb), t).title : r.spec!.kind === 'fossil' ? 'a fossil' : r.spec!.kind === 'native' ? r.spec!.name : 'a specimen');
    this.toast(`Recovered ${names.join(', ')}${real.length > 3 ? ` and ${real.length - 3} more` : ''}.${real.find(r => r.note)?.note ? ' ' + real.find(r => r.note)!.note : ''}`, top >= 2);
    for (const r of real) { const f = r.find; const val = f.art ? import('../sim/economy').then(m => m.trueValue(this.w, f.art!).tier) : Promise.resolve(0); val.then(tier => { if (tier >= 2 || (hoard && r === real[0])) { if (!this.g.discoveries.some(d => d.uid === f.uid)) this.g.discoveries.push({ day: this.g.day, title: hoard ? 'A buried hoard' : f.art ? ARC[f.art.arch].name : 'Specimen', text: placeDescribe(this.w, f.x, f.y), tier, value: 0, uid: f.uid }); } }); }
    if (top >= 2 && best) this.discoveryModal(best.find, hoard ? `A hoard: ${real.length} objects together in one hole!` : undefined);
    this.afterLearn(real.map(r => r.find)); this.checkObjectives(); this.refresh(); if (this.actions % 6 === 0) this.save();
  }
  discoveryModal(f: Find, extra?: string) {
    const d = h('div', { class: 'discover' }); const c = h('div', { class: 'c' }); const cv = h('canvas', { width: 220, height: 220 }) as HTMLCanvasElement; drawFind(cv, this.w, f, this.tools, { size: 220 });
    const desc = f.art ? describeArtifact(this.w, f, new Set(this.g.kb), this.tools) : null; c.append(h('h2', {}, 'A remarkable find'), cv, h('p', {}, extra ?? (desc ? `${desc.title}. ${desc.lines[0]}` : f.spec!.name)), h('p', { class: 'small muted' }, 'It will need careful cleaning and research to learn its story.'), h('button', { class: 'btn', onClick: () => d.remove() }, 'Into the pack')); d.append(c); this.viewHost.append(d); setTimeout(() => d.remove(), 12000);
  }
  afterLearn(finds: Find[]) {
    const kb = new Set(this.g.kb);
    for (const f of finds) { if (!f.art) continue; const d = describeArtifact(this.w, f, kb, this.tools); const n = learn(this.g, d.facts); if (d.level >= 3 && !this.g.knownTypes.includes(f.art.arch)) { this.g.knownTypes.push(f.art.arch); this.g.notes.push({ id: `n${this.g.notes.length}`, day: this.g.day, kind: 'find', title: `First ${ARC[f.art.arch].name}`, text: d.title, x: f.x, y: f.y }); } if (n) for (const c of d.connections) { if (!this.g.notes.some(q => q.text === c)) this.g.notes.push({ id: `n${this.g.notes.length}`, day: this.g.day, kind: 'link', title: 'Connection', text: c, x: f.x, y: f.y, ref: f.uid }); } }
  }
  onFeature(f: Feature) {
    this.snd.click(); this.toast(`Discovered: ${f.label}. ${f.desc}`, f.conspicuous > 0.6); const s = f.settlement ? this.w.H.settlements.find(q => q.id === f.settlement) : undefined; const ident = s && this.g.kb.includes(`settlement:${s.id}`) && f.settlement ? ` Matches the old records of ${s.name}.` : '';
    this.g.notes.push({ id: `n${this.g.notes.length}`, day: this.g.day, kind: 'place', title: ident ? `${s!.name}: ${f.label}` : `Unrecorded: ${f.label}`, text: f.desc + ident + (!ident && (f.settlement || f.business || f.mine) ? ' Compare with the archive records and historical maps to find out what stood here.' : ''), x: f.x, y: f.y, ref: f.id });
    if (s && this.g.kb.includes(`settlement:${s.id}`)) learn(this.g, [`settlement:${s.id}:site`]); if (f.business) learn(this.g, [`biz:${f.business}:site`]); if (f.mine) learn(this.g, [`mine:${f.mine}:site`]);
    this.checkObjectives(); this.refresh();
  }
  onSite(s: Site, first: boolean) {
    if (first && !['road', 'railway', 'trailhead', 'campground'].includes(s.kind) && (s.access !== 'permission' || this.g.permissions[s.owner!] === 'granted')) this.toast(`You are at ${this.g.kb.includes(`site:${s.id}:known`) || s.kind === 'beach' ? s.name : s.kind === 'field' ? 'farmland' : 'an old site: compare what you see with the records'}.`);
    if (['town_core', 'farm', 'works', 'mine', 'station', 'fort', 'diggings'].includes(s.kind) && s.to !== null) { const st = s.refs.settlement ? this.w.H.settlements.find(q => q.id === s.refs.settlement) : undefined; if (st && this.g.kb.includes(`settlement:${st.id}`)) { learn(this.g, [`settlement:${st.id}:site`]); } }
    this.checkObjectives();
  }
  checkObjectives() {
    const g = this.g; const o = g.objectives; const mark = (k: string, t: string) => { if (!o[k]) { o[k] = true; this.g.notes.push({ id: `n${g.notes.length}`, day: g.day, kind: 'objective', title: 'Objective complete', text: t }); this.toast('Objective complete: ' + t); } };
    if (g.finds.length) mark('first', 'Pick something up from the ground'); if (g.docsRead.length) mark('archive', 'Read a document in the archive'); if (g.stats.sold) mark('sold', 'Sell your first find'); if (g.featuresSeen.length) mark('feature', 'Discover an old structure');
    if (g.knownTypes.length) mark('id', 'Identify what an object is'); if (g.owned['det1'] || g.owned['det2']) mark('detector', 'Buy a metal detector'); if (g.finds.some(f => f.status === 'keep')) mark('keep', 'Keep a find for your collection');
  }
}
const fmtMin = (m: number) => m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`;
export function wowOf(f: Find, hoard: boolean): number {
  if (hoard) return 3; if (f.spec) { if (f.spec.kind === 'native') return f.spec.name.includes('nugget') ? 3 : 1; if (f.spec.kind === 'fossil') return f.spec.size > 14 ? 2 : 1; return f.spec.kind === 'gem' ? 1 : 0; }
  const a = f.art!; const arch = ARC[a.arch]; if (a.mat === 'gold' || a.mat === 'goldfilled') return 2 + (a.mass > 20 ? 1 : 0); if (arch.id === 'ship_bell' || arch.id === 'porthole' || arch.id === 'bullion_bar' || arch.id === 'medal_gallantry') return 3;
  if (a.special === 'cache') return 2; if (['coin', 'token', 'medal', 'insignia', 'jewelry'].includes(arch.cat) && a.mat !== 'zinc' && a.mat !== 'aluminium' && !MAT[a.mat].ferrous) return 1; return 0;
}
function loadVol() { try { const v = JSON.parse(localStorage.getItem('breadcrumb_vol') || ''); return { master: 0.7, detector: 0.8, effects: 0.7, ambience: 0.35, muted: false, ...v }; } catch { return { master: 0.7, detector: 0.8, effects: 0.7, ambience: 0.35, muted: false }; } }
function saveVol(v: any) { try { localStorage.setItem('breadcrumb_vol', JSON.stringify(v)); } catch { /* ignore */ } }
