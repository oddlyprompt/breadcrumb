import { CELL, SIZE, cellOf, elevAt, RIVER_Q, CREEK_Q, riverWidth } from '../sim/terrain';
import { Veg, Sed } from '../sim/landscape';
import { hash01, hash32 } from '../sim/rng';
import { clamp } from '../sim/noise';
import { GEARBY } from '../sim/equipment';
import { weatherOn, lightLevel, calendar } from '../sim/environment';
import { Searcher, dig, pickUp, minutesPass, learn, isWater, Recovered, GameState } from '../sim/game';
import { trueValue } from '../sim/economy';
import { toneHz } from '../sim/detector';
import type { World } from '../sim/worldtypes';
import type { Feature, Site } from '../sim/sites';
import { renderTile, TILE_M, tileKey, segsNear, meander, riverDistAt, tideLevelAt } from './ground';
import type { Sound } from './audio';
import { placeDescribe } from '../sim/describe';
import { MAT } from '../sim/materials';

export type Mode = 'walk' | 'detect' | 'search' | 'pan';
export interface FieldCb { toast: (msg: string, big?: boolean) => void; found: (got: Recovered[]) => void; changed: () => void; feature: (f: Feature) => void; siteEntered: (s: Site, first: boolean) => void; }
export class FieldView {
  cv: HTMLCanvasElement; c: CanvasRenderingContext2D; mode: Mode = 'walk'; ppm = 24; x: number; y: number; keys = new Set<string>(); mouse = { x: 0, y: 0, in: false };
  coil = { x: 0, y: 0, vx: 0, vy: 0 }; reading: { s: number; vdi: number; iron: boolean; depth: number; show: boolean } = { s: 0, vdi: 0, iron: false, depth: 0, show: false };
  xray = false; tiles = new Map<number, HTMLCanvasElement>(); private last = performance.now(); private raf = 0; private tideNow = 0; puffs: Array<{ x: number; y: number; t: number; kind: string }> = [];
  private lastScan = 0; private audioStr = 0; private lastCoil = { x: 0, y: 0 }; panning = 0; running = false; private stepAcc = 0; private pinTimer = 0; private noteSite = '';
  private waterCv = document.createElement('canvas'); private seenFeat = new Set<string>(); private rt: any[] | null = null; hoverItem: any = null; digTimer = 0; lastMsg = '';
  constructor(host: HTMLElement, public w: World, public g: GameState, public S: Searcher, public snd: Sound, public cb: FieldCb) {
    this.cv = document.createElement('canvas'); host.appendChild(this.cv); this.c = this.cv.getContext('2d')!; this.x = g.x; this.y = g.y; this.coil.x = this.x; this.coil.y = this.y;
    for (const f of g.featuresSeen) this.seenFeat.add(f);
    const ro = new ResizeObserver(() => this.resize()); ro.observe(host); this.resize();
    window.addEventListener('keydown', this.kd); window.addEventListener('keyup', this.ku);
    this.cv.addEventListener('pointermove', e => { const r = this.cv.getBoundingClientRect(); this.mouse.x = e.clientX - r.left; this.mouse.y = e.clientY - r.top; this.mouse.in = true; });
    this.cv.addEventListener('pointerleave', () => { this.mouse.in = false; });
    this.cv.addEventListener('pointerdown', e => { if (e.button === 0) this.act(); });
    this.cv.addEventListener('wheel', e => { e.preventDefault(); this.ppm = clamp(this.ppm * Math.exp(-e.deltaY * 0.0012), 5, 80); }, { passive: false });
    this.cv.tabIndex = 0;
  }
  destroy() { cancelAnimationFrame(this.raf); window.removeEventListener('keydown', this.kd); window.removeEventListener('keyup', this.ku); this.cv.remove(); }
  start() { this.last = performance.now(); const loop = (t: number) => { const dt = Math.min(0.05, (t - this.last) / 1000); this.last = t; this.update(dt); this.draw(); this.raf = requestAnimationFrame(loop); }; this.raf = requestAnimationFrame(loop); }
  resize() { const r = this.cv.parentElement!.getBoundingClientRect(); const dpr = Math.min(2, window.devicePixelRatio || 1); this.cv.width = r.width * dpr; this.cv.height = r.height * dpr; this.cv.style.width = r.width + 'px'; this.cv.style.height = r.height + 'px'; this.c.setTransform(dpr, 0, 0, dpr, 0, 0); }
  get vw() { return this.cv.width / Math.min(2, window.devicePixelRatio || 1); } get vh() { return this.cv.height / Math.min(2, window.devicePixelRatio || 1); }
  private active = true; setActive(a: boolean) { this.active = a; }
  kd = (e: KeyboardEvent) => { if (!this.active || (e.target as HTMLElement)?.tagName === 'INPUT' || (e.target as HTMLElement)?.tagName === 'SELECT') return; const k = e.key.toLowerCase(); this.keys.add(k); if (k === ' ') { e.preventDefault(); this.act(); } if (k === 'e') this.pickNearest(); if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) e.preventDefault(); };
  ku = (e: KeyboardEvent) => { this.keys.delete(e.key.toLowerCase()); };
  setMode(m: Mode) { if (m === 'detect' && !this.S.setup()) { this.cb.toast('You need a metal detector for that. The shop in town sells a basic one.'); return; } if (m === 'pan' && !Object.keys(this.g.owned).some(k => GEARBY[k]?.cat === 'pan')) { this.cb.toast('You need a gold pan to wash gravel.'); return; } this.mode = m; this.snd.detect(0, 300, false); this.cb.changed(); }
  /** the single contextual action: dig, pick up or pan depending on the mode */
  act() {
    this.snd.start(); if (this.digTimer > 0) return;
    const g = this.g, S = this.S;
    if (this.mode === 'search') { this.pickNearest(); return; }
    if (this.mode === 'walk') { this.pickNearest(); return; }
    const tx = this.mode === 'detect' ? this.coil.x : this.mouseWorld().x, ty = this.mode === 'detect' ? this.coil.y : this.mouseWorld().y;
    if (Math.hypot(tx - this.x, ty - this.y) > 3) { this.cb.toast('Too far to reach. Walk closer.'); return; }
    if (this.mode === 'pan') { const rd = riverDistAt(this.w, tx, ty); if (!rd || rd.d > rd.width / 2 + 28) { this.cb.toast('Panning needs stream gravel. Move to the water.'); return; } }
    const res = this.mode === 'pan' ? this.panAt(tx, ty) : dig(S, tx, ty);
    if (!res.ok) { this.cb.toast(res.msg); this.snd.deny(); return; }
    this.snd.dig(); this.puffs.push({ x: tx, y: ty, t: 0, kind: this.mode === 'pan' ? 'splash' : 'dust' }); if (this.mode === 'pan') this.snd.splash(); this.digTimer = 0.45;
    if (res.msg && !res.got.length) this.cb.toast(res.msg); if (res.got.length) { this.cb.found(res.got); } this.cb.changed();
  }
  private panAt(x: number, y: number) {
    const g = this.g; const saved = g.equipped.digger; const gear = Object.keys(g.owned).map(k => GEARBY[k]).filter(q => q.cat === 'pan').sort((a, b) => b.tier - a.tier)[0];
    const sv = (GEARBY as any).__pan; void sv; g.equipped.digger = '__pan'; (GEARBY as any)['__pan'] = { s: { depth: 40, r: 1.05 * (gear?.s.eff as number ?? 1) ** 0.3, speed: 0.22, care: 0.95 } };
    const res = dig(this.S, x, y, { pan: true }); g.equipped.digger = saved; delete (GEARBY as any)['__pan']; g.stats.panned++; if (res.ok && !res.got.length) res.msg = 'You swirl the gravel until only black sand is left: no gold in this pan.'; return res;
  }
  mouseWorld() { return { x: this.x + (this.mouse.x - this.vw / 2) / this.ppm, y: this.y + (this.mouse.y - this.vh / 2) / this.ppm }; }
  pickNearest() {
    const items = this.S.visibleItems(this.x, this.y, 3.2); let best: any = null, bd = 1e9; const m = this.mouseWorld();
    for (const it of items) { const d = Math.hypot(it.x - m.x, it.y - m.y) * 0.7 + Math.hypot(it.x - this.x, it.y - this.y) * 0.3; if (Math.hypot(it.x - this.x, it.y - this.y) <= 3 && d < bd) { bd = d; best = it; } }
    if (!best) { if (this.mode === 'search') this.cb.toast('Nothing within reach. Look for glints on the ground.'); return; }
    const r = pickUp(this.S, { art: best.art, spec: best.spec }); if (!r) { this.cb.toast(this.S.access(best.x, best.y).ok ? 'Your bags are full.' : this.S.access(best.x, best.y).reason); return; }
    this.snd.recover(0); this.cb.found([r]); this.cb.changed();
  }
  update(dt: number) {
    const g = this.g, w = this.w; if (!this.active) return;
    const wx = weatherOn(w, g.day); this.tideNow = tideLevelAt(w, g.day * 1440 + g.minute); this.S.tide = this.tideNow;
    let mx = 0, my = 0; if (this.keys.has('w') || this.keys.has('arrowup')) my -= 1; if (this.keys.has('s') || this.keys.has('arrowdown')) my += 1; if (this.keys.has('a') || this.keys.has('arrowleft')) mx -= 1; if (this.keys.has('d') || this.keys.has('arrowright')) mx += 1;
    const moving = mx || my; this.running = this.keys.has('shift') && this.mode !== 'detect';
    const c = cellOf(this.x, this.y); const slow = clamp(1 / Math.sqrt(Math.max(1, w.L.traverse[c] > 5 ? 5 : w.L.traverse[c])), 0.45, 1);
    const speed = (this.mode === 'detect' ? 2.1 : this.running ? 8 : 4.6) * slow;
    if (moving) {
      const l = Math.hypot(mx, my); let nx = this.x + mx / l * speed * dt, ny = this.y + my / l * speed * dt; nx = clamp(nx, 4, SIZE - 4); ny = clamp(ny, 4, SIZE - 4);
      const blocked = (px: number, py: number) => { if (isWater(w, px, py, this.tideNow)) return true; const rd = riverDistAt(w, px, py); return !!rd && rd.width > 5 && rd.d < rd.width / 2 - 0.5; };
      if (!blocked(nx, ny)) { this.x = nx; this.y = ny; } else if (!blocked(nx, this.y)) this.x = nx; else if (!blocked(this.x, ny)) this.y = ny;
      this.stepAcc += speed * dt; if (this.stepAcc > 1.4) { this.stepAcc = 0; this.snd.scrape(); }
      g.minute += dt * (this.running ? 0.55 : 0.3) * (this.mode === 'detect' ? 1.3 : 1) * 1; g.stats.minutes += dt * 0.3; if (g.minute >= 1440) { g.minute -= 1440; g.day++; this.cb.changed(); }
      g.x = this.x; g.y = this.y;
    }
    // coil
    const m = this.mouseWorld(); let tx = m.x, ty = m.y; const dd = Math.hypot(tx - this.x, ty - this.y); const reach = 2.4; if (dd > reach) { tx = this.x + (tx - this.x) / dd * reach; ty = this.y + (ty - this.y) / dd * reach; }
    if (!this.mouse.in) { tx = this.x; ty = this.y + 1; }
    this.coil.vx = (tx - this.coil.x) / Math.max(dt, 0.001); this.coil.vy = (ty - this.coil.y) / Math.max(dt, 0.001); this.coil.x += (tx - this.coil.x) * Math.min(1, dt * 18); this.coil.y += (ty - this.coil.y) * Math.min(1, dt * 18);
    const cs = Math.hypot(this.coil.x - this.lastCoil.x, this.coil.y - this.lastCoil.y) / Math.max(dt, 0.001); this.lastCoil = { x: this.coil.x, y: this.coil.y };
    if (this.mode === 'detect') { g.minute += dt * 0.12 * Math.min(1, cs / 1.0); if (g.minute >= 1440) { g.minute -= 1440; g.day++; } this.detect(dt, cs); } else { this.snd.detect(0, 300, false); this.reading.show = false; }
    if (this.digTimer > 0) this.digTimer -= dt; for (const p of this.puffs) p.t += dt; this.puffs = this.puffs.filter(p => p.t < 1);
    // ambience
    const coastNear = clamp(1 - w.T.coastDist[c] / 2500, 0, 1); this.snd.setAmbience({ wind: clamp(wx.windMs / 12, 0, 1), surf: coastNear, rain: clamp(wx.rainMm / 12, 0, 1) });
    this.exploreChecks();
  }
  private detect(dt: number, coilSpeed: number) {
    const S = this.S; const set = S.setup()!; const pin = this.keys.has('shift') || this.keys.has('p'); let hit = S.scan(this.coil.x, this.coil.y);
    const acc = S.access(this.coil.x, this.coil.y); if (!acc.ok) hit = null;
    const pinOwned = this.g.equipped.pin ? GEARBY[this.g.equipped.pin] : null; const moving = coilSpeed > 0.22;
    this.snd.crackle(S.noise(this.coil.x, this.coil.y));
    if (pin && pinOwned) { // pinpointer wand: beeps faster as it nears metal
      const range = pinOwned.s.range as number; let best = 1e9; let any = false; for (const t of S.targetsNear(this.coil.x, this.coil.y, range + 0.05)) { const d = Math.hypot(t.x - this.coil.x, t.y - this.coil.y, t.depth / 100); if (d < best && !t.hot) { best = d; any = true; } }
      this.pinTimer -= dt; if (any && best < range) { const prox = 1 - best / range; if (this.pinTimer <= 0) { this.snd.pinpoint(prox); this.pinTimer = 0.55 - prox * 0.5; } this.reading = { s: prox, vdi: 0, iron: false, depth: 0, show: true }; } else this.reading.show = false; this.snd.detect(0, 300, false); return;
    }
    if (hit && (moving || pin)) {
      const r = hit.r; const str = clamp((r.s - 0.02) * (pin ? 1.4 : 1) * (moving ? clamp(coilSpeed / 0.7, 0.35, 1) : 0.45), 0, 1); this.audioStr += (str - this.audioStr) * Math.min(1, dt * 14);
      this.snd.detect(this.audioStr, toneHz(r.vdi, r.iron), r.iron);
      const depthEst = hit.target.depth + (hash01(hash32(hit.target.id), 5) - 0.5) * 3; this.reading = { s: r.s, vdi: r.vdi, iron: r.iron, depth: depthEst, show: true };
    } else { this.audioStr *= Math.pow(0.001, dt * 4); this.snd.detect(this.audioStr > 0.03 ? this.audioStr : 0, 300, false); if (!hit) this.reading.show = false; }
  }
  private exploreChecks() {
    const g = this.g, w = this.w; if (Math.floor(performance.now() / 200) === this.lastScan) return; this.lastScan = Math.floor(performance.now() / 200);
    for (const s of this.S.sitesNear(this.x, this.y, 120)) {
      const d = Math.hypot(s.x - this.x, s.y - this.y);
      if (d < s.r * 0.7 + 4 && s.access !== 'builtup' && !g.sitesVisited.includes(s.id) && s.kind !== 'cache' && s.kind !== 'accident') { g.sitesVisited.push(s.id); this.cb.siteEntered(s, true); }
      for (const f of s.features) { if (this.seenFeat.has(f.id)) continue; const sight = 10 + f.conspicuous * 65; if (Math.hypot(f.x - this.x, f.y - this.y) < sight) { this.seenFeat.add(f.id); g.featuresSeen.push(f.id); this.cb.feature(f); } }
    }
  }
  // ---------------- drawing
  private tileFor(tx: number, ty: number): HTMLCanvasElement { const k = tileKey(tx, ty); let t = this.tiles.get(k); if (!t) { t = renderTile(this.w, tx, ty, 8); this.tiles.set(k, t); if (this.tiles.size > 120) this.tiles.delete(this.tiles.keys().next().value!); } else { this.tiles.delete(k); this.tiles.set(k, t); } return t; }
  draw() {
    if (!this.active) return; const c = this.c, w = this.w, g = this.g; const vw = this.vw, vh = this.vh, ppm = this.ppm;
    const X = (x: number) => (x - this.x) * ppm + vw / 2, Y = (y: number) => (y - this.y) * ppm + vh / 2; const halfW = vw / 2 / ppm, halfH = vh / 2 / ppm;
    const x0 = this.x - halfW, x1 = this.x + halfW, y0 = this.y - halfH, y1 = this.y + halfH;
    c.fillStyle = '#25343f'; c.fillRect(0, 0, vw, vh); c.imageSmoothingEnabled = true;
    for (let ty = Math.floor(y0 / TILE_M); ty <= Math.floor(y1 / TILE_M); ty++) for (let tx = Math.floor(x0 / TILE_M); tx <= Math.floor(x1 / TILE_M); tx++) { if (tx < 0 || ty < 0 || tx * TILE_M > SIZE || ty * TILE_M > SIZE) continue; const t = this.tileFor(tx, ty); c.drawImage(t, X(tx * TILE_M) - 0.5, Y(ty * TILE_M) - 0.5, TILE_M * ppm + 1, TILE_M * ppm + 1); }
    if (ppm >= 11) this.drawDetail(c, X, Y, x0, y0, x1, y1);
    this.drawFields(c, X, Y, x0, y0, x1, y1); this.drawRoutes(c, X, Y, x0, y0, x1, y1); this.drawRivers(c, X, Y, x0, y0, x1, y1); this.drawWater(c, X, Y, x0, y0, x1, y1);
    this.drawFeatures(c, X, Y, x0, y0, x1, y1); this.drawTown(c, X, Y, x0, y0, x1, y1);
    // holes
    for (const h of g.holes) { if (h.x < x0 - 1 || h.x > x1 + 1 || h.y < y0 - 1 || h.y > y1 + 1) continue; const r = Math.max(2, 0.09 * ppm); c.fillStyle = '#4a3a26'; c.beginPath(); c.arc(X(h.x), Y(h.y), r * 1.25, 0, 7); c.fill(); c.fillStyle = '#6b5a3c'; c.beginPath(); c.arc(X(h.x) + r * 0.2, Y(h.y) + r * 0.15, r * 0.7, 0, 7); c.fill(); }
    // surface items
    const t = performance.now() / 1000; const vis = this.S.visibleItems(this.x, this.y, Math.max(halfW, halfH) + 1);
    for (const it of vis) { const px = X(it.x), py = Y(it.y); if (px < -20 || px > vw + 20 || py < -20 || py > vh + 20) continue; const near = Math.hypot(it.x - this.x, it.y - this.y) <= 3; const sz = clamp(it.size * 0.0012 * ppm * 4 + 2.2, 2.2, 14); c.fillStyle = it.hex; c.strokeStyle = '#0008'; c.lineWidth = 1; c.beginPath(); c.arc(px, py, sz, 0, 7); c.fill(); c.stroke(); if (near || this.mode === 'search') { const k = 0.5 + 0.5 * Math.sin(t * 4 + it.x); c.strokeStyle = `rgba(255,248,200,${0.35 + 0.5 * k})`; c.lineWidth = 1.5; c.beginPath(); c.arc(px, py, sz + 3 + k * 2, 0, 7); c.stroke(); } }
    // x-ray (developer)
    if (this.xray) for (const q of this.S.artifactsNear(this.x, this.y, Math.max(halfW, halfH) + 1)) { const v = trueValue(w, q.art); c.fillStyle = ['#ffffff88', '#7fc6ffcc', '#ffcf3fdd', '#ff4d2eee'][v.tier]; c.beginPath(); c.arc(X(q.x), Y(q.y), 2 + v.tier * 1.5, 0, 7); c.fill(); if (q.depth > 1.8) { c.strokeStyle = '#0006'; c.stroke(); } }
    if (this.xray) for (const s of this.S.specimensNear(this.x, this.y, Math.max(halfW, halfH) + 1)) { c.fillStyle = s.kind === 'native' ? '#ffd400' : s.kind === 'fossil' ? '#b57cff' : s.kind === 'hotrock' ? '#ff00aa' : '#00d1a0'; c.fillRect(X(s.x) - 2, Y(s.y) - 2, 4, 4); }
    for (const p of this.puffs) { const k = p.t; c.globalAlpha = 1 - k; c.fillStyle = p.kind === 'splash' ? '#9fc8e0' : '#8a7550'; for (let i = 0; i < 7; i++) { const a = i * 0.9 + p.x; c.beginPath(); c.arc(X(p.x) + Math.cos(a) * k * 18, Y(p.y) + Math.sin(a) * k * 18 - k * 8, 2 + (1 - k) * 3, 0, 7); c.fill(); } c.globalAlpha = 1; }
    this.drawTrees(c, X, Y, x0, y0, x1, y1);
    // player and coil
    c.fillStyle = '#00000055'; c.beginPath(); c.ellipse(X(this.x) + 3, Y(this.y) + 4, 0.34 * ppm, 0.24 * ppm, 0, 0, 7); c.fill();
    c.fillStyle = '#34503c'; c.strokeStyle = '#142016'; c.lineWidth = 1.5; c.beginPath(); c.ellipse(X(this.x), Y(this.y), 0.3 * ppm, 0.22 * ppm, 0, 0, 7); c.fill(); c.stroke(); c.fillStyle = '#c9a77a'; c.beginPath(); c.arc(X(this.x), Y(this.y) - 0.04 * ppm, 0.12 * ppm, 0, 7); c.fill(); c.stroke();
    if (this.mode === 'detect') {
      const set = this.S.setup(); const cr = (this.g.equipped.coil ? GEARBY[this.g.equipped.coil].s.r : set!.det.s.coil) as number; c.strokeStyle = '#0006'; c.lineWidth = 2; c.beginPath(); c.moveTo(X(this.x), Y(this.y)); c.lineTo(X(this.coil.x), Y(this.coil.y)); c.stroke();
      const hot = this.reading.show; c.strokeStyle = hot ? '#ffe27a' : '#e8e0c0'; c.lineWidth = 3; c.beginPath(); c.arc(X(this.coil.x), Y(this.coil.y), cr * ppm, 0, 7); c.stroke(); c.fillStyle = hot ? 'rgba(255,226,122,0.16)' : 'rgba(255,255,255,0.05)'; c.fill();
      const dg = this.g.equipped.digger === 'hands' ? 0.14 : (GEARBY[this.g.equipped.digger].s.r as number); c.strokeStyle = 'rgba(255,255,255,0.35)'; c.lineWidth = 1; c.setLineDash([3, 3]); c.beginPath(); c.arc(X(this.coil.x), Y(this.coil.y), dg * ppm, 0, 7); c.stroke(); c.setLineDash([]);
      if (hot) { c.strokeStyle = `rgba(255,226,122,${0.5 + 0.4 * Math.sin(t * 12)})`; c.lineWidth = 1.5; c.beginPath(); c.arc(X(this.coil.x), Y(this.coil.y), cr * ppm * (1.15 + 0.12 * Math.sin(t * 12)), 0, 7); c.stroke(); }
    } else if (this.mode === 'pan' || this.mode === 'search') { const m = this.mouseWorld(); c.strokeStyle = 'rgba(255,255,255,.55)'; c.lineWidth = 1.5; c.beginPath(); c.arc(X(m.x), Y(m.y), (this.mode === 'pan' ? 1.0 : 0.25) * ppm, 0, 7); c.stroke(); }
    // light, weather
    const light = lightLevel(g.day, g.minute); const wx = weatherOn(w, g.day);
    if (light < 1 || wx.cloud > 0.6) { c.fillStyle = `rgba(10,18,40,${clamp((1 - light) * 0.7 + (wx.cloud - 0.5) * 0.08, 0, 0.75)})`; c.fillRect(0, 0, vw, vh); }
    if (wx.rainMm > 0.5) { c.strokeStyle = 'rgba(210,225,240,0.35)'; c.lineWidth = 1; c.beginPath(); const n = Math.min(160, 40 + wx.rainMm * 6); for (let i = 0; i < n; i++) { const rx = (hash01(i, Math.floor(t * 20), 1) * vw), ry = ((hash01(i, 7, 2) * vh + t * 900) % vh); c.moveTo(rx, ry); c.lineTo(rx - 4, ry + 14); } c.stroke(); }
    this.drawHud(c, vw, vh);
  }
  private drawHud(c: CanvasRenderingContext2D, vw: number, vh: number) {
    if (this.mode === 'detect' && this.reading.show) {
      const r = this.reading; const set = this.S.setup()!; const x = vw - 190, y = 60; c.fillStyle = '#10190fe8'; c.strokeStyle = '#4a6252'; c.lineWidth = 1; c.fillRect(x, y, 170, 92); c.strokeRect(x, y, 170, 92);
      c.fillStyle = '#d7e8c7'; c.font = '11px Courier New'; c.fillText('TARGET', x + 10, y + 16);
      if (this.g.equipped.pin && (this.keys.has('shift') || this.keys.has('p'))) { c.fillText('PINPOINT', x + 10, y + 34); c.fillStyle = '#ffd35a'; c.fillRect(x + 10, y + 46, 150 * r.s, 12); }
      else { if (set.det.s.vdi) { c.font = 'bold 34px Courier New'; c.fillStyle = r.iron ? '#c78a5a' : '#ffe27a'; c.fillText(String(r.vdi).padStart(2, '0'), x + 10, y + 56); c.font = '11px Courier New'; c.fillStyle = '#d7e8c7'; c.fillText(r.iron ? 'FERROUS' : r.vdi < 40 ? 'LOW COND.' : r.vdi < 60 ? 'MID-LOW' : r.vdi < 80 ? 'MID' : 'HIGH', x + 78, y + 40); c.fillText(`depth ~${Math.round(r.depth)} cm`, x + 78, y + 56); } else { c.font = 'bold 18px Courier New'; c.fillStyle = r.iron ? '#c78a5a' : '#ffe27a'; c.fillText(r.iron ? 'LOW TONE' : r.vdi >= 60 ? 'HIGH TONE' : 'MID TONE', x + 10, y + 44); }
        c.fillStyle = '#2e3d2a'; c.fillRect(x + 10, y + 70, 150, 8); c.fillStyle = '#ffd35a'; c.fillRect(x + 10, y + 70, 150 * clamp(r.s * 1.4, 0, 1), 8); }
    }
    const hint = this.mode === 'detect' ? 'Sweep the coil with the mouse. Hold P/Shift to pinpoint. Click or Space to dig.' : this.mode === 'search' ? 'Look for glints. Click or E to pick up what is within reach.' : this.mode === 'pan' ? 'Click on stream gravel to pan it.' : 'WASD to walk (Shift to run). Wheel to zoom.'; void hint;
  }
  private drawTrees(c: CanvasRenderingContext2D, X: (x: number) => number, Y: (y: number) => number, x0: number, y0: number, x1: number, y1: number) {
    const ppm = this.ppm; const step = 6; const L = this.w.L;
    for (let gy = Math.floor(y0 / step) - 1; gy <= Math.floor(y1 / step) + 1; gy++) for (let gx = Math.floor(x0 / step) - 1; gx <= Math.floor(x1 / step) + 1; gx++) {
      const wx = (gx + hash01(gx, gy, 1)) * step, wy = (gy + hash01(gx, gy, 2)) * step; if (wx < 0 || wy < 0 || wx > SIZE || wy > SIZE) continue; const cell = cellOf(wx, wy); const v = L.veg[cell];
      const p = v === Veg.Conifer ? 0.62 : v === Veg.Mixed ? 0.5 : v === Veg.Broadleaf ? 0.52 : v === Veg.Shrub ? 0.3 : v === Veg.Heath ? 0.14 : v === Veg.DuneScrub ? 0.14 : v === Veg.Wetland ? 0.14 : v === Veg.Alpine ? 0.04 : 0.015; if (hash01(gx, gy, 3) > p) continue;
      if (this.isOpenGround(wx, wy)) continue; const rad = (v === Veg.Shrub || v === Veg.Heath || v === Veg.DuneScrub ? 0.8 : v === Veg.Wetland ? 0.5 : 1.6 + hash01(gx, gy, 4) * 1.5); const px = X(wx), py = Y(wy); if (px < -60 || px > this.vw + 60 || py < -60 || py > this.vh + 60) continue;
      const near = Math.hypot(wx - this.x, wy - this.y); const alpha = near < rad + 1.5 ? 0.35 : 0.82;
      c.globalAlpha = 0.3; c.fillStyle = '#000'; c.beginPath(); c.arc(px + rad * ppm * 0.35, py + rad * ppm * 0.4, rad * ppm, 0, 7); c.fill(); c.globalAlpha = alpha;
      if (v === Veg.Conifer) { c.fillStyle = '#2d4a2e'; c.beginPath(); c.arc(px, py, rad * ppm, 0, 7); c.fill(); c.fillStyle = '#3b5d3a'; c.beginPath(); c.arc(px - rad * ppm * 0.15, py - rad * ppm * 0.15, rad * ppm * 0.55, 0, 7); c.fill(); }
      else if (v === Veg.Wetland) { c.strokeStyle = '#71874f'; c.lineWidth = 1; for (let i = 0; i < 5; i++) { c.beginPath(); c.moveTo(px + (i - 2) * 3, py); c.lineTo(px + (i - 2) * 3 + 1, py - 8 * Math.max(1, ppm / 24)); c.stroke(); } }
      else { c.fillStyle = v === Veg.Shrub || v === Veg.Heath || v === Veg.DuneScrub ? '#6f7a40' : '#4f6f35'; c.beginPath(); c.arc(px, py, rad * ppm, 0, 7); c.fill(); c.fillStyle = v === Veg.Broadleaf ? '#6f8f45' : '#5f7d3a'; c.beginPath(); c.arc(px - rad * ppm * 0.2, py - rad * ppm * 0.2, rad * ppm * 0.6, 0, 7); c.fill(); }
      c.globalAlpha = 1;
    }
  }
  private isOpenGround(x: number, y: number): boolean {
    for (const s of this.S.sitesNear(x, y, 3)) { if ((s.kind === 'field' || s.kind === 'town_common' || s.kind === 'beach' || s.kind === 'schoolyard' || s.kind === 'fairground' || s.kind === 'picnic') && Math.hypot(s.x - x, s.y - y) < s.r * 0.9 && !(s.kind === 'field' && s.to !== null)) return true; }
    return isWater(this.w, x, y, this.tideNow) || !!riverDistAt(this.w, x, y)?.width && riverDistAt(this.w, x, y)!.d < 8;
  }
  private drawDetail(c: CanvasRenderingContext2D, X: any, Y: any, x0: number, y0: number, x1: number, y1: number) {
    const ppm = this.ppm, L = this.w.L, step = 1.35; c.lineCap = 'round';
    for (let gy = Math.floor(y0 / step); gy <= Math.floor(y1 / step); gy++) for (let gx = Math.floor(x0 / step); gx <= Math.floor(x1 / step); gx++) {
      const wx = (gx + hash01(gx, gy, 11)) * step, wy = (gy + hash01(gx, gy, 12)) * step; if (wx < 0 || wy < 0 || wx > SIZE || wy > SIZE) continue; const cell = cellOf(wx, wy); const r = hash01(gx, gy, 13); const sed = L.sediment[cell], v = L.veg[cell];
      if (this.w.T.coastDist[cell] < CELL * 3 && isWater(this.w, wx, wy, this.tideNow)) continue; const px = X(wx), py = Y(wy);
      if (sed === Sed.Beach || sed === Sed.MarineSand) { if (r < 0.2) { c.fillStyle = r < 0.07 ? '#e8e0cc' : '#a39469'; c.beginPath(); c.arc(px, py, (0.04 + r * 0.25) * ppm * 0.5, 0, 7); c.fill(); } else if (r < 0.34) { c.strokeStyle = 'rgba(110,95,60,.35)'; c.lineWidth = 1; c.beginPath(); c.moveTo(px, py); c.lineTo(px + ppm * 0.5, py + ppm * 0.1); c.stroke(); } if (v === Veg.DuneScrub && r > 0.8) { c.strokeStyle = '#8e9a58'; c.lineWidth = 1.4; for (let k = -1; k <= 1; k++) { c.beginPath(); c.moveTo(px + k * 3, py); c.lineTo(px + k * 5, py - ppm * 0.5); c.stroke(); } } }
      else if (sed === Sed.Bedrock || sed === Sed.Colluvium || sed === Sed.Till || sed === Sed.Alluvium) { if (r < 0.34) { const rad = (0.05 + r * 0.5) * ppm * 0.6; c.fillStyle = 'rgba(0,0,0,.28)'; c.beginPath(); c.ellipse(px + rad * 0.3, py + rad * 0.35, rad, rad * 0.8, 0, 0, 7); c.fill(); c.fillStyle = r < 0.1 ? '#9a9588' : r < 0.2 ? '#b0aa9a' : '#807a6e'; c.beginPath(); c.ellipse(px, py, rad, rad * 0.8, r * 3, 0, 7); c.fill(); } }
      else if (v === Veg.Conifer || v === Veg.Mixed || v === Veg.Broadleaf) { if (r < 0.5) { c.fillStyle = r < 0.2 ? 'rgba(90,60,30,.5)' : 'rgba(60,45,25,.45)'; c.beginPath(); c.ellipse(px, py, ppm * 0.12, ppm * 0.06, r * 6, 0, 7); c.fill(); } if (r > 0.93) { c.strokeStyle = 'rgba(80,60,40,.7)'; c.lineWidth = Math.max(1, ppm * 0.05); c.beginPath(); c.moveTo(px, py); c.lineTo(px + ppm * 0.6, py + ppm * 0.2); c.stroke(); } }
      else if (v !== Veg.Barren) { if (r < 0.7) { c.strokeStyle = r < 0.35 ? 'rgba(60,85,30,.55)' : 'rgba(150,170,80,.45)'; c.lineWidth = Math.max(1, ppm * 0.03); for (let k = 0; k < 3; k++) { const ox = (k - 1) * ppm * 0.12; c.beginPath(); c.moveTo(px + ox, py); c.quadraticCurveTo(px + ox + ppm * 0.05 * (k - 1), py - ppm * 0.2, px + ox + ppm * 0.12 * (k - 1), py - ppm * 0.38 * (0.7 + r * 0.6)); c.stroke(); } } }
    }
  }
  private drawFields(c: CanvasRenderingContext2D, X: any, Y: any, x0: number, y0: number, x1: number, y1: number) {
    for (const s of this.S.sitesNear((x0 + x1) / 2, (y0 + y1) / 2, Math.max(x1 - x0, y1 - y0) / 2 + 100)) {
      if (s.kind !== 'field' || s.access !== 'permission') continue; const px = X(s.x), py = Y(s.y), r = s.r * this.ppm; if (px + r < 0 || px - r > this.vw || py + r < 0 || py - r > this.vh) continue; const ang = (hash32(s.id) % 314) / 100;
      c.save(); c.beginPath(); c.arc(px, py, r, 0, 7); c.clip(); c.translate(px, py); c.rotate(ang); const col = ['#a1925a', '#8fa05a', '#b2a066'][hash32(s.id) % 3]; c.fillStyle = col; c.fillRect(-r, -r, r * 2, r * 2); c.strokeStyle = 'rgba(70,55,25,.35)'; c.lineWidth = Math.max(1, 0.25 * this.ppm); const sp = Math.max(5, 1.6 * this.ppm); for (let u = -r; u < r; u += sp) { c.beginPath(); c.moveTo(u, -r); c.lineTo(u, r); c.stroke(); } c.restore(); c.strokeStyle = 'rgba(60,50,30,.7)'; c.lineWidth = 2; c.setLineDash([6, 4]); c.beginPath(); c.arc(px, py, r, 0, 7); c.stroke(); c.setLineDash([]);
    }
  }
  private drawRoutes(c: CanvasRenderingContext2D, X: any, Y: any, x0: number, y0: number, x1: number, y1: number) {
    const ppm = this.ppm; if (!this.rt) this.rt = this.w.H.routes.map(rt => { const xs = rt.pts.map(p => p[0]), ys = rt.pts.map(p => p[1]); return { rt, bb: [Math.min(...xs) - 30, Math.min(...ys) - 30, Math.max(...xs) + 30, Math.max(...ys) + 30] }; });
    for (const { rt, bb } of this.rt) {
      if (bb[2] < x0 || bb[0] > x1 || bb[3] < y0 || bb[1] > y1) continue; const open = rt.kind === 'railway' ? !rt.lifted && !rt.closed : !rt.closed; const path = () => { c.beginPath(); rt.pts.forEach((p: [number, number], i: number) => { i ? c.lineTo(X(p[0]), Y(p[1])) : c.moveTo(X(p[0]), Y(p[1])); }); };
      c.lineCap = 'round'; c.lineJoin = 'round';
      if (rt.kind === 'railway') { if (!open) { if (rt.lifted) { c.strokeStyle = 'rgba(120,108,86,.65)'; c.lineWidth = rt.width * ppm * 1.5; path(); c.stroke(); c.strokeStyle = 'rgba(80,70,50,.4)'; c.lineWidth = rt.width * ppm * 0.4; c.setLineDash([ppm * 0.5, ppm * 0.7]); path(); c.stroke(); c.setLineDash([]); } else { c.strokeStyle = 'rgba(70,70,70,.6)'; c.lineWidth = rt.width * ppm; path(); c.stroke(); } continue; }
        c.strokeStyle = '#8b8479'; c.lineWidth = rt.width * ppm * 1.6; path(); c.stroke(); c.strokeStyle = '#4c4640'; c.lineWidth = Math.max(1, ppm * 0.12); c.setLineDash([ppm * 0.3, ppm * 0.5]); c.lineWidth = rt.width * ppm * 0.7; path(); c.stroke(); c.setLineDash([]); c.strokeStyle = '#999'; c.lineWidth = Math.max(1, ppm * 0.06); for (const o of [-0.75, 0.75]) { c.save(); c.translate(0, o * ppm); path(); c.stroke(); c.restore(); } continue; }
      const col = rt.kind === 'highway' ? '#6b6b6b' : rt.kind === 'road' ? '#a8956d' : '#9d8b62'; if (open) { c.strokeStyle = 'rgba(70,60,35,.45)'; c.lineWidth = Math.max(2, (rt.width + 1.2) * ppm); path(); c.stroke(); }
      c.strokeStyle = open ? col : 'rgba(110,100,60,.4)'; c.lineWidth = Math.max(1.5, rt.width * ppm * (open ? 1 : 0.6)); if (!open) c.setLineDash([ppm * 1.5, ppm]); path(); c.stroke(); c.setLineDash([]);
      if (open && rt.kind !== 'highway' && ppm >= 10) { c.strokeStyle = 'rgba(70,55,30,.35)'; c.lineWidth = Math.max(1, ppm * 0.18); for (const o of [-0.45, 0.45]) { c.save(); c.translate(0, o * ppm * rt.width * 0.5); path(); c.stroke(); c.restore(); } }
      if (rt.kind === 'highway' && open) { c.strokeStyle = '#e6d37a'; c.lineWidth = Math.max(1, ppm * 0.12); c.setLineDash([ppm * 3, ppm * 4]); path(); c.stroke(); c.setLineDash([]); }
    }
  }
  private drawRivers(c: CanvasRenderingContext2D, X: any, Y: any, x0: number, y0: number, x1: number, y1: number) {
    const ppm = this.ppm; c.lineCap = 'round'; c.lineJoin = 'round';
    const segs = segsNear(this.w, x0, y0, x1, y1);
    for (const pass of [0, 1]) for (const s of segs) {
      const dx = s.bx - s.ax, dy = s.by - s.ay, L = Math.hypot(dx, dy), nx = -dy / L, ny = dx / L; c.beginPath();
      for (let i = 0; i <= 14; i++) { const t = i / 14; const m = meander(s, t); const px = X(s.ax + dx * t + nx * m), py = Y(s.ay + dy * t + ny * m); i ? c.lineTo(px, py) : c.moveTo(px, py); }
      if (pass === 0) { c.strokeStyle = 'rgba(176,160,120,0.9)'; c.lineWidth = (s.w + 2.4) * ppm; } else { c.strokeStyle = s.q > RIVER_Q ? 'rgba(66,116,150,0.95)' : 'rgba(84,134,160,0.9)'; c.lineWidth = s.w * ppm; }
      c.stroke();
    }
  }
  private drawWater(c: CanvasRenderingContext2D, X: any, Y: any, x0: number, y0: number, x1: number, y1: number) {
    const w = this.w; const cx = cellOf(this.x, this.y); let near = w.T.coastDist[cx] < CELL * 4 || w.T.lake[cx] >= 0; if (!near) { const ox = [-1, 1, 0, 0]; for (let i = 0; i < 4 && !near; i++) { const nc = cellOf(this.x + ox[i] * CELL * 2, this.y + (i > 1 ? (i === 2 ? -1 : 1) * CELL * 2 : 0)); if (w.T.lake[nc] >= 0 || w.T.coastDist[nc] < CELL) near = true; } } if (!near) return;
    const sc = 6; const W = Math.ceil(this.vw / sc), Hh = Math.ceil(this.vh / sc); if (this.waterCv.width !== W) { this.waterCv.width = W; this.waterCv.height = Hh; } const wc = this.waterCv.getContext('2d')!; const img = wc.createImageData(W, Hh); const d = img.data; const t = performance.now() / 1000;
    for (let j = 0; j < Hh; j++) for (let i = 0; i < W; i++) { const wx = this.x + (i * sc + sc / 2 - this.vw / 2) / this.ppm, wy = this.y + (j * sc + sc / 2 - this.vh / 2) / this.ppm; if (wx < 0 || wy < 0 || wx > SIZE || wy > SIZE) continue; if (isWater(w, wx, wy, this.tideNow)) { const e = elevAt(w.T, wx, wy) - this.tideNow; const dep = clamp(-e / 12, 0, 1); const o = (j * W + i) * 4; const wave = Math.sin(t * 1.6 + wx * 0.7 + wy * 0.3) * 6; d[o] = 52 - 24 * dep + wave; d[o + 1] = 110 - 44 * dep + wave; d[o + 2] = 140 - 36 * dep + wave; d[o + 3] = 214 - (1 - dep) * 80; } else { const e = elevAt(w.T, wx, wy); if (e < this.tideNow + 1.2 && e > this.tideNow - 0.15 && w.T.coastDist[cellOf(wx, wy)] < CELL * 3) { const o = (j * W + i) * 4; d[o] = 120; d[o + 1] = 105; d[o + 2] = 78; d[o + 3] = 80; } } }
    wc.putImageData(img, 0, 0); c.imageSmoothingEnabled = true; c.drawImage(this.waterCv, 0, 0, W * sc, Hh * sc); void X; void Y; void x0; void y0; void x1; void y1;
  }
  private drawFeatures(c: CanvasRenderingContext2D, X: any, Y: any, x0: number, y0: number, x1: number, y1: number) {
    const ppm = this.ppm;
    for (const s of this.S.sitesNear((x0 + x1) / 2, (y0 + y1) / 2, Math.max(x1 - x0, y1 - y0) / 2 + 60)) for (const f of s.features) {
      if (!this.seenFeat.has(f.id)) continue; if (f.x < x0 - 60 || f.x > x1 + 60 || f.y < y0 - 60 || f.y > y1 + 60) continue; const px = X(f.x), py = Y(f.y); const wpx = f.w * ppm, hpx = f.h * ppm; c.save(); c.translate(px, py); c.rotate(f.ang);
      const stone = '#8d877b', dark = '#3d372a';
      switch (f.kind) {
        case 'foundation': case 'concrete_slab': c.strokeStyle = stone; c.lineWidth = Math.max(2, 0.5 * ppm); c.strokeRect(-wpx / 2, -hpx / 2, wpx, hpx); c.fillStyle = 'rgba(60,55,40,.22)'; c.fillRect(-wpx / 2, -hpx / 2, wpx, hpx); break;
        case 'cellar_hole': c.fillStyle = 'rgba(40,32,20,.55)'; c.fillRect(-wpx / 2, -hpx / 2, wpx, hpx); c.strokeStyle = 'rgba(30,25,15,.7)'; c.lineWidth = 2; c.strokeRect(-wpx / 2, -hpx / 2, wpx, hpx); break;
        case 'chimney': c.fillStyle = '#7a6f5c'; for (let i = 0; i < 14; i++) { c.beginPath(); c.arc((hash01(i, 1, 1) - 0.5) * 2.2 * ppm, (hash01(i, 2, 1) - 0.5) * 2.2 * ppm, 0.3 * ppm + 1, 0, 7); c.fill(); } break;
        case 'well': c.strokeStyle = stone; c.lineWidth = 0.35 * ppm; c.beginPath(); c.arc(0, 0, 0.8 * ppm, 0, 7); c.stroke(); c.fillStyle = '#10100d'; c.beginPath(); c.arc(0, 0, 0.6 * ppm, 0, 7); c.fill(); break;
        case 'stone_wall': c.strokeStyle = '#8a8478'; c.lineWidth = Math.max(2, 0.7 * ppm); c.setLineDash([ppm * 0.9, ppm * 0.25]); c.beginPath(); c.moveTo(-wpx / 2, 0); c.lineTo(wpx / 2, 0); c.stroke(); c.setLineDash([]); break;
        case 'road_trace': case 'rail_bed': c.strokeStyle = 'rgba(85,75,50,.4)'; c.lineWidth = Math.max(2, 3 * ppm); c.beginPath(); c.moveTo(-wpx / 2, 0); c.lineTo(wpx / 2, 0); c.stroke(); break;
        case 'adit': case 'shaft_collar': c.fillStyle = '#16120d'; c.beginPath(); c.arc(0, 0, 1.4 * ppm, 0, 7); c.fill(); c.strokeStyle = '#7a5a30'; c.lineWidth = 0.5 * ppm; c.beginPath(); c.arc(0, 0, 1.6 * ppm, 0, 7); c.stroke(); break;
        case 'tailings': c.fillStyle = 'rgba(138,104,72,.78)'; for (let i = 0; i < 9; i++) { c.beginPath(); c.arc((hash01(i, 3, 3) - 0.5) * f.w * ppm * 0.8, (hash01(i, 4, 3) - 0.5) * f.h * ppm * 0.8, (4 + hash01(i, 5, 3) * 9) * ppm * 0.5, 0, 7); c.fill(); } break;
        case 'mill_ruin': c.strokeStyle = stone; c.lineWidth = 0.6 * ppm; c.strokeRect(-wpx / 2, -hpx / 2, wpx, hpx); c.strokeRect(-wpx / 4, -hpx / 4, wpx / 2, hpx / 2); break;
        case 'earthwork': c.strokeStyle = 'rgba(90,75,45,.8)'; c.lineWidth = 1.4 * ppm; c.strokeRect(-wpx / 2, -hpx / 2, wpx, hpx); break;
        case 'wreck_timber': c.fillStyle = '#5a4630'; c.fillRect(-wpx / 2, -0.25 * ppm, wpx, 0.5 * ppm); c.fillStyle = '#9a8a6a'; for (let i = 0; i < 4; i++) c.fillRect(-wpx / 2 + i * wpx / 4, -0.12 * ppm, 0.15 * ppm + 1, 0.24 * ppm); break;
        case 'dump_mound': c.fillStyle = 'rgba(110,100,74,.75)'; c.beginPath(); c.ellipse(0, 0, wpx / 2, hpx / 2, 0, 0, 7); c.fill(); c.fillStyle = '#9bb8a0'; for (let i = 0; i < 10; i++) c.fillRect((hash01(i, 1, 9) - 0.5) * wpx * 0.8, (hash01(i, 2, 9) - 0.5) * hpx * 0.8, 2, 2); break;
        case 'orchard': c.fillStyle = '#4d6b34'; for (let i = 0; i < 12; i++) { c.beginPath(); c.arc(((i % 4) - 1.5) * 5 * ppm, (Math.floor(i / 4) - 1) * 5 * ppm, 1.4 * ppm, 0, 7); c.fill(); } break;
        case 'platform': case 'loading_dock': c.fillStyle = '#7f786a'; c.fillRect(-wpx / 2, -hpx / 2, wpx, hpx); break;
        case 'bridge_abutment': case 'ford_stones': c.fillStyle = '#85806f'; for (let i = 0; i < 8; i++) { c.fillRect((i - 4) * 1.4 * ppm - 0.5 * ppm, (hash01(i, 6, 6) - 0.5) * 3 * ppm, 1 * ppm, 0.8 * ppm); } break;
        case 'diggings_pit': c.fillStyle = 'rgba(95,85,60,.7)'; for (let i = 0; i < 8; i++) { c.beginPath(); c.ellipse((hash01(i, 7, 7) - 0.5) * f.w * ppm, (hash01(i, 8, 7) - 0.5) * f.h * ppm, 1.5 * ppm, 1 * ppm, 0, 0, 7); c.fill(); } break;
        case 'cemetery': c.strokeStyle = 'rgba(60,50,30,.8)'; c.lineWidth = 1.5; c.strokeRect(-wpx / 2, -hpx / 2, wpx, hpx); c.fillStyle = '#8d877b'; for (let i = 0; i < 8; i++) c.fillRect(((i % 4) - 1.5) * 4 * ppm, (Math.floor(i / 4) - 0.5) * 5 * ppm, 0.8 * ppm, 1.1 * ppm); break;
        default: c.fillStyle = dark; c.fillRect(-wpx / 2, -hpx / 2, wpx, hpx);
      }
      c.restore(); if (ppm >= 14 || this.hoverNear(f)) { c.font = 'italic 11px Georgia'; c.fillStyle = '#f2ead0'; c.strokeStyle = '#0009'; c.lineWidth = 3; c.textAlign = 'center'; c.strokeText(f.label, px, py - Math.max(hpx, 14) / 2 - 6); c.fillText(f.label, px, py - Math.max(hpx, 14) / 2 - 6); c.textAlign = 'start'; }
    }
  }
  private hoverNear(f: Feature) { return Math.hypot(f.x - this.x, f.y - this.y) < 14; }
  private drawTown(c: CanvasRenderingContext2D, X: any, Y: any, x0: number, y0: number, x1: number, y1: number) {
    const ppm = this.ppm;
    for (const s of this.S.sitesNear((x0 + x1) / 2, (y0 + y1) / 2, Math.max(x1 - x0, y1 - y0) / 2 + 80)) {
      if (s.access !== 'builtup') continue; const st = s.refs.settlement ? this.w.H.settlements.find(q => q.id === s.refs.settlement) : undefined; if (!st) continue;
      for (const sp of s.spots) { if (sp.kind === 'privy and midden' || sp.kind === 'main street' || sp.kind === 'cross street' || sp.kind === 'quay' || sp.kind === 'common') continue; const px = X(sp.x), py = Y(sp.y); if (px < -40 || px > this.vw + 40 || py < -40 || py > this.vh + 40) continue; const h2 = hash32(sp.x + ',' + sp.y); const bw = (7 + (h2 % 5)) * ppm, bh = (6 + (h2 % 4)) * ppm; c.save(); c.translate(px, py); c.rotate(st.streetAngle + ((h2 % 5) - 2) * 0.03); c.fillStyle = 'rgba(70,90,50,.35)'; c.fillRect(-bw * 0.9, -bh * 0.9, bw * 1.8, bh * 1.8); c.fillStyle = '#00000044'; c.fillRect(-bw / 2 + 3, -bh / 2 + 3, bw, bh); c.fillStyle = ['#a65a40', '#b49b78', '#8d8f93', '#9a6a4a'][h2 % 4]; c.fillRect(-bw / 2, -bh / 2, bw, bh); c.fillStyle = '#00000033'; c.beginPath(); c.moveTo(-bw / 2, -bh / 2); c.lineTo(0, -bh / 2 - bh * 0.25); c.lineTo(bw / 2, -bh / 2); c.fill(); c.restore(); }
      if (this.mode !== 'detect' || Math.hypot(s.x - this.x, s.y - this.y) < s.r + 30) { const px = X(s.x), py = Y(s.y); c.strokeStyle = 'rgba(180,60,40,.6)'; c.setLineDash([8, 6]); c.lineWidth = 2; c.beginPath(); c.arc(px, py, s.r * ppm, 0, 7); c.stroke(); c.setLineDash([]); }
    }
  }
}
