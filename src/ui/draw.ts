import { ARC } from '../sim/archetypes';
import { MAT } from '../sim/materials';
import { MIN } from '../sim/minerals';
import { TAXON } from '../sim/fossils';
import { hash01, hash32, Rng } from '../sim/rng';
import { legibility, encrustLeft, Find, Tools } from '../sim/identify';
import { clamp } from '../sim/noise';
import type { World } from '../sim/worldtypes';

const mix = (a: string, b: string, t: number) => { const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16); const c = (s: number) => Math.round(((pa >> s) & 255) * (1 - t) + ((pb >> s) & 255) * t); return `rgb(${c(16)},${c(8)},${c(0)})`; };
const PATINA: Record<string, string> = { copper: '#4e8a6a', bronze: '#5a7a52', brass: '#7e8a4a', silver: '#2c2a2a', iron: '#7a3f1e', steel: '#7a3f1e', lead: '#b9b9ae', zinc: '#d4d4cc', tin: '#7e7f7c', pewter: '#6e706f', aluminium: '#d8dad8', cupronickel: '#8a8d8a', nickel: '#8a8d8a', silverplate: '#8a7a56' };
function blob(c: CanvasRenderingContext2D, r: Rng, rad: number, rough: number, n = 14) { c.beginPath(); for (let i = 0; i <= n; i++) { const a = i / n * Math.PI * 2, k = rad * (1 + (r.next() - 0.5) * rough); const x = Math.cos(a) * k, y = Math.sin(a) * k; i ? c.lineTo(x, y) : c.moveTo(x, y); } c.closePath(); }
export interface DrawOpts { size?: number; legend?: boolean; bg?: string; xray?: boolean; showAll?: boolean }

export function drawFind(cv: HTMLCanvasElement, w: World, f: Find, t: Tools, o: DrawOpts = {}) {
  const S = o.size ?? cv.width; cv.width = S; cv.height = S; const c = cv.getContext('2d')!; c.clearRect(0, 0, S, S);
  c.fillStyle = o.bg ?? '#2b2a24'; c.fillRect(0, 0, S, S);
  if (f.kind === 'specimen') return drawSpecimen(c, S, f);
  const a = f.art!; const arch = ARC[a.arch]; const m = MAT[a.mat]; const r = new Rng(hash32(f.uid + a.id));
  const L = legibility(f); const enc = encrustLeft(f); const eff = clamp(L + t.read, 0, 1);
  c.save(); c.translate(S / 2, S / 2); const sc = S * 0.4; c.scale(sc, sc);
  // shadow
  c.save(); c.translate(0.05, 0.07); c.globalAlpha = 0.35; c.fillStyle = '#000'; drawShape(c, arch.render, a, r, true); c.restore();
  const clean = m.hex; const worn = PATINA[a.mat] ?? m.hex;
  const metalCol = mix(clean, worn, clamp(a.cond.corr * (1 - f.cleaning * 0.6), 0, 1) * 0.85);
  c.fillStyle = metalCol; c.strokeStyle = mix(clean, '#000000', 0.5); c.lineWidth = 0.03;
  drawShape(c, arch.render, a, r, false);
  // surface sheen for clean precious metals
  if (!m.organic && a.cond.corr < 0.2) { c.save(); c.globalAlpha = 0.25; const g = c.createLinearGradient(-1, -1, 1, 1); g.addColorStop(0, '#fff'); g.addColorStop(0.5, '#fff0'); g.addColorStop(1, '#0006'); c.fillStyle = g; drawShape(c, arch.render, a, r, false, true); c.restore(); }
  // marks
  if (arch.render === 'coin' || arch.render === 'disc' || arch.render === 'medal') drawCoinMarks(c, a, r, eff, m.hex);
  else if (a.marks.length) drawLabel(c, a, eff);
  // encrustation and corrosion pitting
  if (enc > 0.02) { c.save(); clipShape(c, arch.render, a, r); for (let i = 0; i < 60 * enc + 6; i++) { const x = (r.next() - 0.5) * 2, y = (r.next() - 0.5) * 2; c.globalAlpha = 0.22 + 0.5 * enc * r.next(); c.fillStyle = r.chance(0.5) ? '#5c4a30' : '#7b6643'; c.beginPath(); c.arc(x, y, 0.04 + 0.2 * enc * r.next(), 0, 7); c.fill(); } c.restore(); }
  if (a.cond.dmg > 0.12 || f.cleanDamage > 0.1) { c.save(); clipShape(c, arch.render, a, r); c.strokeStyle = '#0008'; c.lineWidth = 0.025; for (let i = 0; i < 3 + (a.cond.dmg + f.cleanDamage) * 10; i++) { c.beginPath(); const x = (r.next() - 0.5) * 1.8, y = (r.next() - 0.5) * 1.8; c.moveTo(x, y); c.lineTo(x + (r.next() - 0.5) * 0.5, y + (r.next() - 0.5) * 0.5); c.stroke(); } c.restore(); }
  c.restore();
}
function clipShape(c: CanvasRenderingContext2D, render: string, a: any, r: Rng) { const rr = new Rng(hash32('clip' + a.id)); c.beginPath(); shapePath(c, render, a, rr, true); c.clip(); }
function drawShape(c: CanvasRenderingContext2D, render: string, a: any, r: Rng, shadowOnly: boolean, noStroke = false) {
  const rr = new Rng(hash32('shape' + a.id)); c.beginPath(); shapePath(c, render, a, rr, false); c.fill(); if (!shadowOnly && !noStroke) c.stroke(); void r;
}
function ell(c: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, rot = 0) { c.moveTo(x + rx * Math.cos(rot), y + rx * Math.sin(rot)); c.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2); }
function rrect(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, rad: number) { c.moveTo(x + rad, y); c.arcTo(x + w, y, x + w, y + h, rad); c.arcTo(x + w, y + h, x, y + h, rad); c.arcTo(x, y + h, x, y, rad); c.arcTo(x, y, x + w, y, rad); c.closePath(); }
function shapePath(c: CanvasRenderingContext2D, render: string, a: any, r: Rng, _clip: boolean) {
  const asp = clamp(a.dims[1] / a.dims[0], 0.25, 1); const frag = a.cond.frag;
  const rough = (a.cond.corr * 0.2 + a.cond.dmg * 0.4 + (1 - frag) * 0.6);
  switch (render) {
    case 'coin': case 'disc': case 'medal': case 'cap': case 'tag': case 'badge': { const sq = a.marks.length && a.token && a.token && hash32(a.token) % 4 === 0; if (sq) { rrect(c, -0.8, -0.8, 1.6, 1.6, 0.18); } else blob(c, r, 0.85, rough * 0.35, 28); if (render === 'medal' || (render === 'disc' && hash32(a.id) % 7 === 0)) { c.moveTo(0.14, -0.88); c.arc(0, -0.95, 0.14, 0, 7); } if (render === 'cap') { c.moveTo(0.86, 0); for (let i = 0; i < 21; i++) { const an = i / 21 * Math.PI * 2; c.lineTo(Math.cos(an) * (i % 2 ? 0.8 : 0.9), Math.sin(an) * (i % 2 ? 0.8 : 0.9)); } } break; }
    case 'ring': { blob(c, r, 0.82, rough * 0.2, 28); c.moveTo(0.5, 0); c.arc(0, 0, 0.5, 0, 7, true); break; }
    case 'button': { blob(c, r, 0.7, rough * 0.3, 24); c.moveTo(0.1, 0); c.arc(0, 0, 0.1, 0, 7, true); break; }
    case 'brooch': { ell(c, 0, 0, 0.85, 0.45, -0.3); break; }
    case 'buckle': { rrect(c, -0.9, -0.6, 1.8, 1.2, 0.2); c.moveTo(0.6, 0.35); rrect(c, -0.6, -0.35, 1.2, 0.7, 0.1); break; }
    case 'key': { c.arc(-0.55, 0, 0.35, 0, 7); c.moveTo(-0.2, -0.07); c.rect(-0.2, -0.07, 1.05, 0.14); c.rect(0.55, 0, 0.12, 0.35); c.rect(0.75, 0, 0.1, 0.25); break; }
    case 'bottle': { rrect(c, -0.42, -0.2, 0.84, 1.1, 0.18); c.moveTo(-0.14, -0.2); c.rect(-0.14, -0.9, 0.28, 0.75); c.rect(-0.2, -0.95, 0.4, 0.14); if (frag < 0.7) { c.moveTo(0, 0); } break; }
    case 'shard': case 'cup': { c.moveTo(-0.8, 0.1); const n = 7; for (let i = 0; i < n; i++) { const an = Math.PI + i / n * Math.PI * 2; const k = 0.5 + r.next() * 0.45; c.lineTo(Math.cos(an) * k * 1.2, Math.sin(an) * k * 0.9); } c.closePath(); break; }
    case 'pipe': { c.moveTo(-0.9, 0.55); c.lineTo(0.2, -0.1); c.lineTo(0.5, -0.4); c.rect(0.35, -0.75, 0.4, 0.55); c.moveTo(-0.9, 0.5); c.lineTo(-0.9, 0.62); break; }
    case 'blade': { c.moveTo(-0.95, 0.12); c.quadraticCurveTo(0, -0.28, 0.95, -0.05); c.quadraticCurveTo(0.2, 0.3, -0.95, 0.12); c.rect(-0.95, 0.1, 0.35, 0.18); break; }
    case 'axe': case 'hammer': { c.rect(-0.7, -0.45, 1.4, 0.55); c.moveTo(0.7, -0.4); c.lineTo(0.95, -0.7); c.lineTo(0.95, 0.35); c.lineTo(0.7, 0.1); c.moveTo(-0.1, 0.1); c.rect(-0.15, 0.1, 0.3, 0.7); break; }
    case 'horseshoe': { c.arc(0, 0.1, 0.8, Math.PI * 0.1, Math.PI * 0.9, true); c.arc(0, 0.1, 0.5, Math.PI * 0.9, Math.PI * 0.1, false); c.closePath(); c.moveTo(0, 0); break; }
    case 'nail': case 'spike': case 'bolt': { const hd = render === 'bolt' ? 0.22 : 0.16; c.rect(-0.95, -hd, 0.22, hd * 2); c.rect(-0.75, -0.06, 1.6, 0.12); c.moveTo(0.85, -0.06); c.lineTo(1, 0); c.lineTo(0.85, 0.06); break; }
    case 'bar': { c.moveTo(-0.9, 0.35); c.lineTo(-0.7, -0.35); c.lineTo(0.7, -0.35); c.lineTo(0.9, 0.35); c.closePath(); break; }
    case 'can': case 'plate': case 'sheet': case 'lock': { const k = rough; c.moveTo(-0.8 + r.next() * k, -0.6 * asp - 0.1); c.lineTo(0.8 - r.next() * k, -0.6 * asp); c.lineTo(0.85 - r.next() * k, 0.6 * asp + 0.1); c.lineTo(-0.8 + r.next() * k, 0.6 * asp); c.closePath(); if (render === 'lock') { c.moveTo(0.25, -0.6); c.arc(0, -0.6, 0.25, 0, Math.PI, true); } break; }
    case 'tab': { ell(c, 0, 0, 0.8, 0.5, 0.4); c.moveTo(0.25, 0); c.arc(0.25, 0, 0.18, 0, 7, true); break; }
    case 'spoon': { ell(c, -0.5, 0, 0.42, 0.3, 0); c.moveTo(-0.1, -0.06); c.rect(-0.1, -0.07, 1.0, 0.14); break; }
    case 'thimble': { c.arc(0, 0, 0.7, Math.PI, 0); c.rect(-0.7, 0, 1.4, 0.5); break; }
    case 'watch': { blob(c, r, 0.75, rough * 0.2, 24); c.moveTo(0.1, -0.76); c.rect(-0.1, -1, 0.2, 0.3); break; }
    case 'lantern': case 'lamp': { c.rect(-0.45, -0.1, 0.9, 0.8); c.moveTo(-0.25, -0.1); c.rect(-0.25, -0.6, 0.5, 0.5); c.rect(-0.12, -0.9, 0.24, 0.3); break; }
    case 'chain': { for (let i = 0; i < 4; i++) ell(c, -0.7 + i * 0.5, 0, 0.32, 0.18, 0); break; }
    case 'wheel': case 'bell': { c.arc(0, 0, 0.82, 0, 7); c.moveTo(0.2, 0); c.arc(0, 0, 0.2, 0, 7, true); break; }
    case 'ball': { c.arc(0, 0, 0.55, 0, 7); break; }
    case 'cartridge': { c.rect(-0.28, -0.8, 0.56, 1.5); c.rect(-0.38, 0.6, 0.76, 0.16); break; }
    case 'toy': { ell(c, 0, -0.35, 0.28, 0.28); c.rect(-0.25, -0.1, 0.5, 0.9); break; }
    case 'comb': { c.rect(-0.8, -0.35, 1.6, 0.3); for (let i = 0; i < 9; i++) c.rect(-0.78 + i * 0.19, -0.05, 0.1, 0.5); break; }
    case 'weight': { rrect(c, -0.6, -0.45, 1.2, 0.9, 0.12); break; }
    case 'pot': { c.moveTo(-0.7, -0.35); c.quadraticCurveTo(-0.9, 0.55, -0.4, 0.75); c.lineTo(0.4, 0.75); c.quadraticCurveTo(0.9, 0.55, 0.7, -0.35); c.closePath(); break; }
    case 'hook': { c.arc(0, 0, 0.55, Math.PI * 0.2, Math.PI * 1.7); c.arc(0, 0, 0.38, Math.PI * 1.7, Math.PI * 0.2, true); break; }
    case 'wire': { c.moveTo(-0.9, 0.2); c.bezierCurveTo(-0.4, -0.6, 0.1, 0.8, 0.9, -0.2); c.bezierCurveTo(0.1, 0.9, -0.4, -0.5, -0.9, 0.25); break; }
    case 'bead': { c.arc(0, 0, 0.4, 0, 7); break; }
    default: { blob(c, r, 0.7, 0.9 + rough, 11); }
  }
}
function drawCoinMarks(c: CanvasRenderingContext2D, a: any, r: Rng, eff: number, hex: string) {
  const col = '#00000066'; const light = '#ffffff44';
  c.save(); c.lineWidth = 0.035; c.strokeStyle = col; c.beginPath(); c.arc(0, 0, 0.72, 0, 7); c.stroke(); c.strokeStyle = light; c.beginPath(); c.arc(0.02, 0.02, 0.75, 0, 7); c.stroke();
  const read = (kind: string) => { const m = a.marks.find((q: any) => q.kind === kind); return m && eff >= m.need ? m.text as string : null; };
  const motif = read('motif');
  c.fillStyle = col; c.strokeStyle = col;
  if (motif) { const h = hash32(motif); c.lineWidth = 0.05; c.beginPath(); if (h % 3 === 0) { c.moveTo(-0.3, 0.2); c.lineTo(0.3, 0.2); c.lineTo(0, -0.35); c.closePath(); c.moveTo(0, -0.35); c.lineTo(0, -0.5); } else if (h % 3 === 1) { c.arc(0, -0.05, 0.28, 0, 7); c.moveTo(0, 0.23); c.lineTo(0, 0.45); } else { for (let i = 0; i < 5; i++) { const an = -Math.PI / 2 + i * Math.PI * 0.8; c.lineTo(Math.cos(an) * 0.34, Math.sin(an) * 0.34 - 0.05); } c.closePath(); } c.stroke(); }
  else if (eff > 0.15 && a.marks.length) { for (let i = 0; i < 7; i++) { c.beginPath(); c.arc((r.next() - 0.5) * 0.7, (r.next() - 0.5) * 0.7, 0.04 + r.next() * 0.06, 0, 7); c.fill(); } }
  const arcText = (txt: string, rad: number, start: number, size: number, flip = false) => { c.save(); c.font = `bold ${size}px Georgia`; c.textAlign = 'center'; c.fillStyle = col; const n = txt.length; const step = Math.min(0.2, 1.6 / n); for (let i = 0; i < n; i++) { const an = start + (i - (n - 1) / 2) * step * (flip ? -1 : 1); c.save(); c.rotate(an); c.translate(0, flip ? rad : -rad); if (flip) c.rotate(Math.PI); c.fillText(txt[i], 0, 0.04); c.restore(); } c.restore(); };
  const legend = read('legend'); if (legend) arcText(legend.length > 22 ? legend.slice(0, 22) : legend, 0.6, 0, 0.1);
  const denom = read('denom'); const date = read('date');
  c.font = 'bold 0.18px Georgia'; c.textAlign = 'center'; c.fillStyle = col;
  if (denom) c.fillText(denom.length > 10 ? denom.slice(0, 10) : denom, 0, 0.5); if (date) { c.font = 'bold 0.2px Georgia'; c.fillText(date, 0, 0.65); }
  if (!legend && !denom && !date && !motif) { c.fillStyle = '#00000022'; c.beginPath(); c.arc(0, 0, 0.55, 0, 7); c.fill(); }
  const others = a.marks.filter((q: any) => !['legend', 'denom', 'date', 'motif', 'mint'].includes(q.kind)); if (others.length) { c.font = 'bold 0.11px Georgia'; others.slice(0, 3).forEach((q: any, i: number) => { if (eff >= q.need) c.fillText(q.text.slice(0, 16), 0, -0.3 + i * 0.2); }); }
  void hex; c.restore();
}
function drawLabel(c: CanvasRenderingContext2D, a: any, eff: number) { c.save(); c.fillStyle = '#000000aa'; c.font = 'bold 0.12px Georgia'; c.textAlign = 'center'; const rd = a.marks.filter((m: any) => eff >= m.need); rd.slice(0, 3).forEach((m: any, i: number) => c.fillText(m.text.slice(0, 18), 0, -0.1 + i * 0.17)); if (!rd.length && a.marks.length) { c.fillStyle = '#00000033'; c.fillRect(-0.35, -0.08, 0.7, 0.12); } c.restore(); }
function drawSpecimen(c: CanvasRenderingContext2D, S: number, f: Find) {
  const s = f.spec!; const r = new Rng(hash32(s.id)); c.save(); c.translate(S / 2, S / 2); c.scale(S * 0.4, S * 0.4);
  c.fillStyle = '#00000055'; c.beginPath(); ell(c, 0.05, 0.08, 0.85, 0.7); c.fill();
  const hex = s.hex; c.fillStyle = hex; c.strokeStyle = '#0006'; c.lineWidth = 0.03;
  if (s.kind === 'fossil') { const t = TAXON[s.taxon!]; c.fillStyle = mix('#8a8270', '#c9bfa4', 0.3); blob(c, r, 0.85, 0.35, 13); c.fill(); c.stroke(); c.strokeStyle = '#3b352b'; c.fillStyle = hex; c.lineWidth = 0.04;
    if (t.group === 'cephalopod' && t.id === 'ammonite') { c.beginPath(); for (let a = 0; a < 18; a += 0.15) { const rad = 0.06 + a * 0.04; c.lineTo(Math.cos(a) * rad, Math.sin(a) * rad); } c.stroke(); for (let i = 0; i < 14; i++) { const a = i * 1.2; c.beginPath(); c.moveTo(Math.cos(a) * (0.06 + a * 0.04), Math.sin(a) * (0.06 + a * 0.04)); c.lineTo(Math.cos(a) * (0.1 + a * 0.04), Math.sin(a) * (0.1 + a * 0.04)); c.stroke(); } }
    else if (t.group === 'arthropod') { c.beginPath(); ell(c, 0, 0, 0.55, 0.3, 0); c.fill(); c.stroke(); for (let i = -3; i <= 3; i++) { c.beginPath(); c.moveTo(i * 0.14, -0.28); c.lineTo(i * 0.14, 0.28); c.stroke(); } c.beginPath(); ell(c, -0.55, 0, 0.18, 0.27); c.stroke(); }
    else if (t.how === 'tooth') { c.beginPath(); c.moveTo(-0.3, 0.4); c.lineTo(0, -0.55); c.lineTo(0.3, 0.4); c.closePath(); c.fillStyle = '#2b2620'; c.fill(); c.stroke(); }
    else if (t.how === 'impression' && t.group === 'plant') { c.beginPath(); c.moveTo(0, 0.6); c.lineTo(0, -0.6); c.stroke(); for (let i = 0; i < 8; i++) { const y = 0.5 - i * 0.14; c.beginPath(); c.moveTo(0, y); c.lineTo(0.3 - i * 0.02, y - 0.12); c.moveTo(0, y); c.lineTo(-0.3 + i * 0.02, y - 0.12); c.stroke(); } }
    else if (t.how === 'bone') { c.beginPath(); ell(c, 0, 0, 0.5, 0.18, 0.3); ell(c, -0.4, -0.12, 0.2, 0.2); ell(c, 0.4, 0.12, 0.2, 0.2); c.fillStyle = '#7a6a4c'; c.fill(); c.stroke(); }
    else if (t.group === 'coral' || t.group === 'echinoderm') { c.beginPath(); c.arc(0, 0, 0.4, 0, 7); c.stroke(); for (let i = 0; i < 5; i++) { c.beginPath(); c.moveTo(0, 0); const an = i * 1.2566; c.lineTo(Math.cos(an) * 0.4, Math.sin(an) * 0.4); c.stroke(); } }
    else { c.beginPath(); c.arc(0, 0, 0.45, Math.PI, 0); c.closePath(); c.fillStyle = hex; c.fill(); c.stroke(); for (let i = 1; i < 5; i++) { c.beginPath(); c.arc(0, 0, i * 0.09, Math.PI, 0); c.stroke(); } }
  } else if (s.kind === 'native' && s.mineral) { c.fillStyle = MIN[s.mineral].hex; c.beginPath(); blob(c, r, s.name.includes('nugget') ? 0.5 : 0.28, 0.7, 9); c.fill(); c.strokeStyle = '#6e5408'; c.stroke(); const g = c.createRadialGradient(-0.1, -0.1, 0, 0, 0, 0.5); g.addColorStop(0, '#fff8'); g.addColorStop(1, '#0000'); c.fillStyle = g; c.fill(); }
  else if (s.kind === 'mineral' || s.kind === 'ore' || s.kind === 'gem') { c.fillStyle = mix('#7d786a', hex, f.split ? 0.9 : 0.35); blob(c, r, 0.82, 0.45, 12); c.fill(); c.stroke(); const m = s.mineral ? MIN[s.mineral] : null; if (m) { c.fillStyle = m.hex; for (let i = 0; i < 3 + (f.split ? 4 : 0); i++) { c.beginPath(); const x = (r.next() - 0.5) * 0.8, y = (r.next() - 0.5) * 0.8; c.moveTo(x, y - 0.18); c.lineTo(x + 0.1, y + 0.1); c.lineTo(x - 0.1, y + 0.1); c.closePath(); c.fill(); } } }
  else { c.fillStyle = mix('#6f6b60', hex, f.split ? 0.9 : 0.55); blob(c, r, 0.85, 0.4, 12); c.fill(); c.stroke(); c.fillStyle = '#0003'; for (let i = 0; i < 14; i++) { c.beginPath(); c.arc((r.next() - 0.5) * 1.1, (r.next() - 0.5) * 1.1, 0.02 + r.next() * 0.05, 0, 7); c.fill(); } }
  c.restore();
}
export function typeIcon(cv: HTMLCanvasElement, w: World, f: Find, t: Tools) { drawFind(cv, w, f, t, { size: 128 }); }
