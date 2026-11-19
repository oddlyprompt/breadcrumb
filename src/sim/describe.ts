import { N, CELL, cellOf, cellCenter, SIZE } from './terrain';
import type { World } from './worldtypes';

const DIRS = ['east', 'south-east', 'south', 'south-west', 'west', 'north-west', 'north', 'north-east'];
export function bearing(dx: number, dy: number): string { const a = Math.atan2(dy, dx); return DIRS[((Math.round(a / (Math.PI / 4)) % 8) + 8) % 8]; }
export function distText(w: World, m: number): string {
  const miles = w.culture.id === 'anglic' || w.culture.id === 'celtic';
  if (miles) { const mi = m / 1609; return mi < 0.2 ? 'a few hundred yards' : mi < 1 ? `${Math.round(mi * 8) / 8 === 0.5 ? 'half a' : (Math.round(mi * 4) / 4)} mile${mi < 1.5 ? '' : 's'}` : `${Math.round(mi * 2) / 2} miles`; }
  return m < 300 ? 'a few hundred metres' : m < 1000 ? `${Math.round(m / 100) / 10} km` : `${Math.round(m / 500) / 2} km`;
}
/** Where is this, described the way a clerk of the day might write it. */
export function placeDescribe(w: World, x: number, y: number, exclude?: string): string {
  let best: { name: string; x: number; y: number; d: number } | null = null;
  for (const s of w.H.settlements) { if (s.kind === 'farmstead' || s.id === exclude) continue; const d = Math.hypot(s.x - x, s.y - y); if (!best || d < best.d - 600) best = { name: s.name, x: s.x, y: s.y, d }; }
  for (const f of w.geo.features) { if (f.kind === 'peak' || f.kind === 'lake' || f.kind === 'bay' || f.kind === 'headland') { const d = Math.hypot(f.x - x, f.y - y); if (!best || d < best.d - 400) best = { name: f.name, x: f.x, y: f.y, d }; } }
  if (!best) return 'in the district';
  if (best.d < 250) return `at ${best.name}`;
  return `${distText(w, best.d)} ${bearing(x - best.x, y - best.y)} of ${best.name}`;
}
export function nearestSettlement(w: World, x: number, y: number) { let best = w.H.settlements[0], bd = 1e12; for (const s of w.H.settlements) { if (s.kind === 'farmstead') continue; const d = Math.hypot(s.x - x, s.y - y); if (d < bd) { bd = d; best = s; } } return { s: best, d: bd }; }
export function streamNear(w: World, x: number, y: number): string | undefined {
  const c = cellOf(x, y); const cx = c % N, cy = (c / N) | 0; let best: { name: string; d: number } | undefined;
  for (const r of w.geo.rivers) for (const pc of r.path) { const [px, py] = cellCenter(pc); const d = Math.hypot(px - x, py - y); if (d < 1500 && (!best || d < best.d)) best = { name: r.name, d }; }
  void cx; void cy; return best?.name;
}
export const fmtDate = (y: number, m: number, d: number) => `${d} ${['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][m - 1]} ${y}`;
export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export { SIZE };
