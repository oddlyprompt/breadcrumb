import { N, CELL, SIZE, cellOf, cellCenter, elevAt, idx, CREEK_Q, RIVER_Q, riverWidth } from '../sim/terrain';
import { Veg } from '../sim/landscape';
import { hash01, hash32 } from '../sim/rng';
import { clamp } from '../sim/noise';
import { streamSegs } from './ground';
import type { World } from '../sim/worldtypes';
import type { GameState } from '../sim/game';
import type { Doc } from '../sim/documents';

export type Overlay = 'geology' | 'history' | 'discoveries' | 'hints' | 'contours';
export interface MapHit { x: number; y: number; title: string; lines: string[]; kind: string; id?: string }
const PX = 5; // pixels per cell in the prerendered base

function hypso(e: number, temp: number): [number, number, number] {
  if (e <= 0) { const d = clamp(-e / 60, 0, 1); return [Math.round(86 - 56 * d), Math.round(128 - 72 * d), Math.round(158 - 76 * d)]; }
  const stops: Array<[number, [number, number, number]]> = [[0, [214, 216, 170]], [60, [200, 208, 152]], [250, [178, 190, 130]], [600, [166, 160, 112]], [1000, [150, 128, 96]], [1400, [140, 120, 100]], [1900, [172, 168, 160]], [2600, [226, 226, 222]]];
  for (let i = 1; i < stops.length; i++) if (e <= stops[i][0]) { const t = (e - stops[i - 1][0]) / (stops[i][0] - stops[i - 1][0]); const a = stops[i - 1][1], b = stops[i][1]; return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
  return stops[stops.length - 1][1];
}
export class MapView {
  cv: HTMLCanvasElement; cx!: CanvasRenderingContext2D; base: HTMLCanvasElement; geol: HTMLCanvasElement;
  scale = 0; ox = 0; oy = 0; // px per metre and the screen position of world (0,0)
  overlays = new Set<Overlay>(['contours']); histYear: number | null = null; histDoc: Doc | null = null;
  onHit: (h: MapHit | null) => void = () => {}; onGo: (x: number, y: number) => void = () => {};
  private drag: { x: number; y: number; ox: number; oy: number; moved: boolean } | null = null; marker: { x: number; y: number } | null = null; private dirty = true; hover: { x: number; y: number } | null = null;
  constructor(public w: World, public g: () => GameState, host: HTMLElement) {
    this.cv = document.createElement('canvas'); host.appendChild(this.cv); this.cx = this.cv.getContext('2d')!;
    this.base = this.paintBase(); this.geol = this.paintGeology();
    const ro = new ResizeObserver(() => { this.resize(); }); ro.observe(host); this.resize(true);
    this.cv.addEventListener('wheel', e => { e.preventDefault(); const r = this.cv.getBoundingClientRect(); const mx = e.clientX - r.left, my = e.clientY - r.top; const k = Math.exp(-e.deltaY * 0.0014); this.zoomAt(mx, my, k); }, { passive: false });
    this.cv.addEventListener('pointerdown', e => { this.cv.setPointerCapture(e.pointerId); this.drag = { x: e.clientX, y: e.clientY, ox: this.ox, oy: this.oy, moved: false }; });
    this.cv.addEventListener('pointermove', e => { const r = this.cv.getBoundingClientRect(); this.hover = this.toWorld(e.clientX - r.left, e.clientY - r.top); if (this.drag) { const dx = e.clientX - this.drag.x, dy = e.clientY - this.drag.y; if (Math.abs(dx) + Math.abs(dy) > 4) this.drag.moved = true; this.ox = this.drag.ox + dx; this.oy = this.drag.oy + dy; this.clampView(); this.dirty = true; } });
    this.cv.addEventListener('pointerup', e => { const d = this.drag; this.drag = null; if (d && !d.moved) { const r = this.cv.getBoundingClientRect(); const p = this.toWorld(e.clientX - r.left, e.clientY - r.top); this.click(p.x, p.y); } });
    this.cv.addEventListener('dblclick', e => { const r = this.cv.getBoundingClientRect(); const p = this.toWorld(e.clientX - r.left, e.clientY - r.top); this.onGo(p.x, p.y); });
  }
  private paintBase(): HTMLCanvasElement {
    const W = N * PX; const cv = document.createElement('canvas'); cv.width = W; cv.height = W; const c = cv.getContext('2d')!; const img = c.createImageData(W, W); const d = img.data; const T = this.w.T, L = this.w.L;
    const e = (px: number, py: number) => elevAt(T, (px + 0.5) / PX * CELL, (py + 0.5) / PX * CELL);
    for (let py = 0; py < W; py++) for (let px = 0; px < W; px++) {
      const x = (px + 0.5) / PX * CELL, y = (py + 0.5) / PX * CELL; const el = elevAt(T, x, y); const cell = cellOf(x, y); const o = (py * W + px) * 4;
      let [r, g, b] = hypso(el, T.temp[cell]);
      if (T.lake[cell] >= 0) { r = 104; g = 150; b = 178; }
      else if (el > 0) { const v = L.veg[cell]; const n = (hash01(px, py, 3) - 0.5) * 8; if (v === Veg.Conifer || v === Veg.Mixed || v === Veg.Broadleaf) { const k = v === Veg.Conifer ? 0.62 : 0.74; r = r * k - 4 + n; g = g * (k + 0.18) + 2 + n; b = b * k + n; } else if (v === Veg.Wetland) { r = r * 0.85; g = g * 0.95; b = b * 1.0 + 8; } else if (v === Veg.Heath) { r = r * 0.95 + 8; g = g * 0.88; b = b * 0.9; } }
      // hillshade, light from the north-west
      const ex = e(px + 1, py) - e(px - 1, py), ey = e(px, py + 1) - e(px, py - 1); const sh = clamp(1 + (-ex - ey) / (CELL / PX * 2) * (el > 0 ? 1.6 : 0.2), 0.55, 1.45);
      r *= sh; g *= sh; b *= sh;
      d[o] = clamp(r, 0, 255); d[o + 1] = clamp(g, 0, 255); d[o + 2] = clamp(b, 0, 255); d[o + 3] = 255;
    }
    c.putImageData(img, 0, 0);
    // contour lines every 100 m, bolder every 500 m
    const cd = c.getImageData(0, 0, W, W); const dd = cd.data;
    for (let py = 0; py < W - 1; py++) for (let px = 0; px < W - 1; px++) { const e0 = e(px, py); if (e0 <= 0) continue; const e1 = e(px + 1, py), e2 = e(px, py + 1); const k0 = Math.floor(e0 / 100), k1 = Math.floor(e1 / 100), k2 = Math.floor(e2 / 100); if (k0 !== k1 || k0 !== k2) { const idxc = Math.max(k0, k1, k2); const strong = idxc % 5 === 0; const o = (py * W + px) * 4; const a = strong ? 0.38 : 0.2; dd[o] = dd[o] * (1 - a) + 70 * a; dd[o + 1] = dd[o + 1] * (1 - a) + 50 * a; dd[o + 2] = dd[o + 2] * (1 - a) + 30 * a; } }
    c.putImageData(cd, 0, 0); return cv;
  }
  private paintGeology(): HTMLCanvasElement {
    const W = N * 3; const cv = document.createElement('canvas'); cv.width = W; cv.height = W; const c = cv.getContext('2d')!;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const i = idx(x, y); if (this.w.T.sea[i]) continue; const f = this.w.G.formations[this.w.G.formationOf[i]]; c.fillStyle = f.hex; c.fillRect(x * 3, y * 3, 3, 3); }
    return cv;
  }
  resize(first = false) { const r = this.cv.parentElement!.getBoundingClientRect(); const dpr = Math.min(2, window.devicePixelRatio || 1); this.cv.width = Math.max(10, r.width * dpr); this.cv.height = Math.max(10, r.height * dpr); this.cv.style.width = r.width + 'px'; this.cv.style.height = r.height + 'px'; this.cx.setTransform(dpr, 0, 0, dpr, 0, 0); if (first || this.scale === 0) this.fit(); this.dirty = true; }
  get vw() { return this.cv.width / Math.min(2, window.devicePixelRatio || 1); } get vh() { return this.cv.height / Math.min(2, window.devicePixelRatio || 1); }
  fit() { this.scale = Math.min(this.vw, this.vh) / SIZE * 0.98; this.ox = (this.vw - SIZE * this.scale) / 2; this.oy = (this.vh - SIZE * this.scale) / 2; }
  centerOn(x: number, y: number, zoom?: number) { if (zoom) this.scale = zoom; this.ox = this.vw / 2 - x * this.scale; this.oy = this.vh / 2 - y * this.scale; this.clampView(); this.dirty = true; }
  toWorld(sx: number, sy: number) { return { x: (sx - this.ox) / this.scale, y: (sy - this.oy) / this.scale }; }
  zoomAt(sx: number, sy: number, k: number) { const min = Math.min(this.vw, this.vh) / SIZE * 0.9; const ns = clamp(this.scale * k, min, min * 22); const wx = (sx - this.ox) / this.scale, wy = (sy - this.oy) / this.scale; this.scale = ns; this.ox = sx - wx * ns; this.oy = sy - wy * ns; this.clampView(); this.dirty = true; }
  private clampView() { const m = 80; this.ox = clamp(this.ox, this.vw - SIZE * this.scale - m, m); this.oy = clamp(this.oy, this.vh - SIZE * this.scale - m, m); }
  setOverlay(o: Overlay, on: boolean) { if (on) this.overlays.add(o); else this.overlays.delete(o); this.dirty = true; }
  invalidate() { this.dirty = true; }
  /** jitter of a position on a historical map: older maps are less accurate */
  private jit(id: string, x: number, y: number, year: number): [number, number] { const acc = year < 1750 ? 400 : year < 1850 ? 250 : 120; return [x + (hash01(hash32(id), year, 1) - 0.5) * 2 * acc, y + (hash01(hash32(id), year, 2) - 0.5) * 2 * acc]; }
  private click(x: number, y: number) {
    const w = this.w, g = this.g(); const known = (f: string) => g.kb.includes(f);
    const pick: Array<{ d: number; h: MapHit }> = []; const px = 14 / this.scale;
    for (const s of w.H.settlements) { if (s.kind === 'farmstead') continue; const hist = this.histYear !== null; const show = s.current ? true : (known(`settlement:${s.id}`) && this.overlays.has('history')); if (!show) continue; const d = Math.hypot(s.x - x, s.y - y); if (d < px * 1.3) pick.push({ d, h: { x: s.x, y: s.y, kind: 'settlement', id: s.id, title: s.name, lines: [`${s.current ? (k => (/^[aeiou]/.test(k) ? 'An ' : 'A ') + k)(s.kind === 'agricultural_village' ? 'village' : s.kind.replace(/_/g, ' ')) + ` of about ${Math.round(s.pop)} people` : `Former ${s.kind.replace(/_/g, ' ')}, founded ${s.founded}, abandoned ${s.abandoned}`}.`, ...(s.current ? [] : [`Abandoned because ${s.abandonReason ?? 'it declined'}.`])] } }); void hist; }
    for (const f of w.geo.features) { const d = Math.hypot(f.x - x, f.y - y); if (f.kind === 'peak' && d < px) pick.push({ d, h: { x: f.x, y: f.y, kind: 'peak', title: f.name, lines: [`Summit, ${Math.round(w.T.elev[f.cells[0]])} m.`] } }); if (f.kind === 'lake' && d < px * 4) pick.push({ d: d + 5, h: { x: f.x, y: f.y, kind: 'lake', title: f.name, lines: [`A lake of about ${(f.cells.length * CELL * CELL / 1e6).toFixed(1)} km².`] } }); }
    if (this.overlays.has('geology')) { const c = cellOf(x, y); if (!w.T.sea[c]) { const f = w.G.formations[w.G.formationOf[c]]; const prov = w.G.provinces[w.G.provinceOf[c]]; pick.push({ d: 1e5, h: { x, y, kind: 'geology', title: f.name, lines: [`${f.rock[0].toUpperCase() + f.rock.slice(1)} (${f.cls}), ${f.ageMa >= 1000 ? (f.ageMa / 1000).toFixed(1) + ' billion' : Math.round(f.ageMa) + ' million'} years old.`, f.process + '.', `Province: ${prov.name}.`, ...(f.cls === 'igneous' ? ['Igneous rock cannot contain fossils.'] : f.fossiliferous ? ['Sedimentary: fossils are possible where this rock is exposed.'] : [])] } }); } }
    for (const b of g.bookmarks) { const d = Math.hypot(b.x - x, b.y - y); if (d < px) pick.push({ d, h: { x: b.x, y: b.y, kind: 'bookmark', id: b.id, title: b.label, lines: [`Bookmarked; uncertainty about ${Math.round(b.radius)} m.`] } }); }
    pick.sort((a, b) => a.d - b.d); this.onHit(pick[0]?.h ?? { x, y, kind: 'point', title: 'Position', lines: [`${Math.round(elevAt(w.T, x, y))} m above sea level.`, w.T.sea[cellOf(x, y)] ? 'Open sea.' : ''] }); this.marker = { x, y };
    this.dirty = true;
  }
  draw(player: { x: number; y: number }) {
    const c = this.cx, w = this.w, g = this.g(); const vw = this.vw, vh = this.vh;
    c.setTransform(Math.min(2, window.devicePixelRatio || 1), 0, 0, Math.min(2, window.devicePixelRatio || 1), 0, 0);
    c.fillStyle = '#2d4a63'; c.fillRect(0, 0, vw, vh); c.imageSmoothingEnabled = true; c.imageSmoothingQuality = 'high';
    const S = this.scale; c.drawImage(this.base, this.ox, this.oy, SIZE * S, SIZE * S);
    if (this.overlays.has('geology')) { c.globalAlpha = 0.72; c.drawImage(this.geol, this.ox, this.oy, SIZE * S, SIZE * S); c.globalAlpha = 1; c.imageSmoothingEnabled = false; }
    const X = (x: number) => this.ox + x * S, Y = (y: number) => this.oy + y * S;
    const hist = this.histYear !== null ? this.histYear : null;
    if (hist !== null) { c.fillStyle = 'rgba(200,170,110,0.28)'; c.fillRect(this.ox, this.oy, SIZE * S, SIZE * S); }
    // geology extras
    if (this.overlays.has('geology')) { c.strokeStyle = '#7a1f1f'; c.lineWidth = 1.4; c.setLineDash([6, 3]); for (const f of w.G.faults) { c.beginPath(); f.pts.forEach((p, i) => i ? c.lineTo(X(p[0]), Y(p[1])) : c.moveTo(X(p[0]), Y(p[1]))); c.stroke(); } c.setLineDash([]); }
    // rivers
    c.lineCap = 'round'; c.lineJoin = 'round'; c.strokeStyle = '#4b7fa3';
    for (const r of w.geo.rivers) { c.lineWidth = clamp(Math.sqrt(r.q) * 0.9 * (S * 600) / 60, 1, 5); c.beginPath(); r.path.forEach((p, i) => { const [x, y] = cellCenter(p); i ? c.lineTo(X(x), Y(y)) : c.moveTo(X(x), Y(y)); }); c.stroke(); }
    if (S > 0.0007) { c.lineWidth = 0.9; c.strokeStyle = '#6f9cbb'; c.beginPath(); for (const arr of streamSegs(w).values()) for (const s of arr) { if (s.q > RIVER_Q * 1.2) continue; c.moveTo(X(s.ax), Y(s.ay)); c.lineTo(X(s.bx), Y(s.by)); } c.stroke(); }
    // roads and rails
    const showRoute = (rt: any) => hist !== null ? rt.built <= hist && (rt.closed === undefined || rt.closed > hist) && (rt.lifted === undefined || rt.lifted > hist) && (rt.kind !== 'railway' || (rt.opened ?? rt.built) <= hist) : (rt.kind === 'railway' ? !rt.lifted && !rt.closed : !rt.closed) || g.kb.includes(`route:${rt.id}`);
    for (const rt of w.H.routes) {
      if (!showRoute(rt)) continue; const open = hist !== null || (!rt.closed && !rt.lifted); const col = rt.kind === 'railway' ? '#3a3a3a' : rt.kind === 'highway' ? '#8a3a2a' : rt.kind === 'road' ? '#6b4a2a' : '#8b6d45'; c.strokeStyle = col; c.lineWidth = rt.kind === 'highway' ? 2 : rt.kind === 'railway' ? 1.6 : rt.kind === 'road' ? 1.3 : 0.9; if (!open) c.setLineDash([2, 4]); else if (rt.kind === 'track') c.setLineDash([4, 2]); else c.setLineDash([]);
      c.beginPath(); rt.pts.forEach((p: [number, number], i: number) => { const q = hist !== null ? this.jit(rt.id + i, p[0], p[1], hist) : p; i ? c.lineTo(X(q[0]), Y(q[1])) : c.moveTo(X(q[0]), Y(q[1])); }); c.stroke(); c.setLineDash([]);
      if (rt.kind === 'railway' && open && S > 0.0006) { c.setLineDash([1, 5]); c.strokeStyle = '#eee'; c.lineWidth = 1; c.beginPath(); rt.pts.forEach((p: [number, number], i: number) => i ? c.lineTo(X(p[0]), Y(p[1])) : c.moveTo(X(p[0]), Y(p[1]))); c.stroke(); c.setLineDash([]); }
    }
    // mines (historic overlay or known)
    if (hist !== null) for (const m of w.H.mines) if (m.opened <= hist && (m.closed === undefined || m.closed > hist)) { const [x, y] = this.jit(m.id, m.x, m.y, hist); c.fillStyle = '#5a2a1a'; c.beginPath(); c.moveTo(X(x), Y(y) - 5); c.lineTo(X(x) + 4, Y(y) + 3); c.lineTo(X(x) - 4, Y(y) + 3); c.fill(); c.font = 'italic 10px Georgia'; c.fillStyle = '#4a2a1a'; c.fillText('mine', X(x) + 6, Y(y) + 3); }
    // settlements
    c.textBaseline = 'middle';
    for (const s of w.H.settlements) {
      if (s.kind === 'farmstead') continue; let show: boolean, x = s.x, y = s.y, name = s.name; let ghost = false;
      if (hist !== null) { show = s.founded <= hist && (s.abandoned === undefined || s.abandoned > hist) && s.kind !== 'seasonal_camp'; if (show) [x, y] = this.jit(s.id, s.x, s.y, hist); }
      else if (s.current) show = true; else { show = this.overlays.has('history') && g.kb.includes(`settlement:${s.id}`); ghost = true; }
      if (!show) continue;
      const pop = hist !== null ? (s.popHist[Math.max(0, hist - w.H.startYear)] || 40) : s.pop; const rad = clamp(2.5 + Math.sqrt(pop) * 0.12, 3, 9) * (ghost ? 0.8 : 1);
      c.fillStyle = ghost ? '#f1ead0' : '#2a2822'; c.strokeStyle = ghost ? '#7a3a2a' : '#f1ead0'; c.lineWidth = 1.5; c.beginPath(); c.arc(X(x), Y(y), rad, 0, 7); c.fill(); c.stroke();
      if (!ghost && s.id === w.start.settlement) { c.strokeStyle = '#a8873a'; c.lineWidth = 2; c.beginPath(); c.arc(X(x), Y(y), rad + 4, 0, 7); c.stroke(); }
      c.font = `${ghost ? 'italic ' : ''}${pop > 2000 ? 'bold ' : ''}${pop > 2000 ? 13 : 11}px Georgia`; c.fillStyle = ghost ? '#6b2f22' : '#1f1d17'; c.strokeStyle = 'rgba(244,236,214,0.85)'; c.lineWidth = 3; c.strokeText(name, X(x) + rad + 4, Y(y)); c.fillText(name, X(x) + rad + 4, Y(y));
    }
    // geographic labels
    for (const f of w.geo.features) {
      if (f.kind === 'range') { if (S > 0.012 * 0.4 + 0) { } c.font = `italic ${clamp(S * 22000, 12, 26)}px Georgia`; c.fillStyle = 'rgba(70,52,34,0.62)'; c.textAlign = 'center'; (c as any).letterSpacing = '4px'; c.fillText(f.name.toUpperCase(), X(f.x), Y(f.y)); (c as any).letterSpacing = '0px'; c.textAlign = 'start'; }
      else if (f.kind === 'peak' && S > 0.0006) { const x = X(f.x), y = Y(f.y); c.fillStyle = '#4a3a2a'; c.beginPath(); c.moveTo(x, y - 5); c.lineTo(x + 4, y + 3); c.lineTo(x - 4, y + 3); c.fill(); c.font = 'italic 10px Georgia'; c.strokeStyle = 'rgba(244,236,214,.8)'; c.lineWidth = 3; c.strokeText(`${f.name} ${Math.round(w.T.elev[f.cells[0]])}`, x + 6, y); c.fillStyle = '#3a2d1f'; c.fillText(`${f.name} ${Math.round(w.T.elev[f.cells[0]])}`, x + 6, y); }
      else if (f.kind === 'lake' || f.kind === 'bay') { c.font = 'italic 11px Georgia'; c.fillStyle = '#1d4560'; c.textAlign = 'center'; c.fillText(f.name, X(f.x), Y(f.y)); c.textAlign = 'start'; }
      else if (f.kind === 'headland' && S > 0.0005) { c.font = 'italic 10px Georgia'; c.fillStyle = '#3a3a2a'; c.fillText(f.name, X(f.x) + 4, Y(f.y)); }
      else if (f.kind === 'forest' && S > 0.001) { c.font = 'italic 11px Georgia'; c.fillStyle = 'rgba(30,60,30,.65)'; c.textAlign = 'center'; c.fillText(f.name, X(f.x), Y(f.y)); c.textAlign = 'start'; }
    }
    for (const r of w.geo.rivers) { const mid = r.path[Math.floor(r.path.length * 0.55)]; const nx = r.path[Math.floor(r.path.length * 0.55) + 1] ?? mid; const [x, y] = cellCenter(mid), [x2, y2] = cellCenter(nx); let ang = Math.atan2(y2 - y, x2 - x); if (Math.cos(ang) < 0) ang += Math.PI; if (S > 0.0003) { c.save(); c.translate(X(x), Y(y) - 7); c.rotate(ang); c.font = 'italic 10px Georgia'; c.fillStyle = '#2b5876'; c.textAlign = 'center'; c.fillText(r.name, 0, 0); c.restore(); } }
    // discoveries overlay: visited sites, features seen, finds
    if (this.overlays.has('discoveries')) {
      for (const sid of g.sitesVisited) { const s = w.sites.byId.get(sid); if (!s) continue; c.fillStyle = 'rgba(60,110,70,.5)'; c.strokeStyle = '#2b5a35'; c.lineWidth = 1; c.beginPath(); c.arc(X(s.x), Y(s.y), Math.max(4, s.r * S), 0, 7); c.fill(); c.stroke(); }
      for (const fid of g.featuresSeen) { const ft = w.sites.features.find(q => q.id === fid); if (!ft) continue; c.fillStyle = '#8a4b2a'; c.fillRect(X(ft.x) - 2.5, Y(ft.y) - 2.5, 5, 5); }
      for (const d of g.discoveries) { const f = g.finds.find(q => q.uid === d.uid); if (f) { c.fillStyle = '#d9a916'; c.beginPath(); c.arc(X(f.x), Y(f.y), 3.5, 0, 7); c.fill(); c.strokeStyle = '#3a2d08'; c.stroke(); } }
    }
    if (this.overlays.has('hints') || hist === null) { for (const b of g.bookmarks) { const x = X(b.x), y = Y(b.y); c.setLineDash([5, 4]); c.strokeStyle = '#a8260a'; c.lineWidth = 1.5; c.beginPath(); c.arc(x, y, Math.max(7, b.radius * S), 0, 7); c.stroke(); c.setLineDash([]); c.fillStyle = '#a8260a'; c.beginPath(); c.moveTo(x, y); c.lineTo(x - 4, y - 11); c.lineTo(x + 4, y - 11); c.fill(); c.font = '11px Georgia'; c.fillStyle = '#6a1a08'; c.strokeStyle = 'rgba(244,236,214,.9)'; c.lineWidth = 3; c.strokeText(b.label, x + 8, y - 10); c.fillText(b.label, x + 8, y - 10); } }
    if (this.marker) { const x = X(this.marker.x), y = Y(this.marker.y); c.strokeStyle = '#a8873a'; c.lineWidth = 2; c.beginPath(); c.moveTo(x - 7, y); c.lineTo(x + 7, y); c.moveTo(x, y - 7); c.lineTo(x, y + 7); c.stroke(); }
    // player
    const px = X(player.x), py = Y(player.y); c.fillStyle = '#b3261e'; c.strokeStyle = '#fff'; c.lineWidth = 2; c.beginPath(); c.arc(px, py, 6, 0, 7); c.fill(); c.stroke(); c.strokeStyle = '#b3261e'; c.lineWidth = 1.2; c.beginPath(); c.arc(px, py, 11 + 2 * Math.sin(performance.now() / 400), 0, 7); c.stroke();
    // scale bar
    const km = [1, 2, 5, 10].find(k => k * 1000 * S > 70) ?? 10; c.fillStyle = '#1f1d17'; c.fillRect(14, vh - 24, km * 1000 * S, 3); c.font = '11px Georgia'; c.fillText(`${km} km`, 14, vh - 32);
    c.strokeStyle = '#1f1d17'; c.lineWidth = 1.2; c.beginPath(); c.moveTo(vw - 36, 52); c.lineTo(vw - 36, 22); c.lineTo(vw - 42, 32); c.moveTo(vw - 36, 22); c.lineTo(vw - 30, 32); c.stroke(); c.fillText('N', vw - 40, 62);
    if (hist !== null) { c.font = 'italic 18px Georgia'; c.fillStyle = '#4a2f12'; c.fillText(`Survey of ${hist}`, 16, 24); }
  }
}
