import { MAT } from './materials';
import { clamp } from './noise';
import { hash01, hash32 } from './rng';
import type { Gear } from './equipment';

export interface DetSetup { det: Gear; coil?: Gear; sens: number; reject: boolean[]; ironReject: boolean; ground: number; }
export interface Target { id: string; x: number; y: number; depth: number; mat: string; L: number; W: number; mass: number; hot?: boolean; }
export interface GroundInfo { mineral: number; moist: number; salt: number; interference: number; }
export interface Response { s: number; audible: boolean; vdi: number; iron: boolean; tone: number; nonferrousStrength: number; }

export const VDI_BINS = ['iron', 'foil', 'low', 'mid', 'high']; // 0-19, 20-39, 40-59, 60-79, 80-99
export const binOf = (vdi: number) => Math.min(4, Math.floor(vdi / 20));

export function noiseFloor(set: DetSetup, g: GroundInfo): number {
  const gb = Math.min(1, (set.det.s.gb as number) * (set.ground > 0 ? 1 : 0.6));
  const pi = !!set.det.s.pi;
  const salty = g.salt * (0.5 + g.moist);
  const ground = pi ? g.mineral * 0.05 + salty * 0.04 : (g.mineral * (1 - gb) * 0.55 + salty * (1 - gb) * 0.5 + g.mineral * 0.04) * (0.7 + g.moist * 0.8);
  return (0.04 + ground + g.interference) / clamp(set.sens, 0.4, 1.6);
}
export function reachM(set: DetSetup, t: Target): number {
  const base = (set.det.s.depth as number) / 100; const coilMult = set.coil ? (set.coil.s.depthMult as number) : 1;
  const eq = Math.sqrt(Math.max(1, t.L * t.W)); const size = Math.pow(clamp(eq / 25, 0.08, 6), 0.5);
  const m = MAT[t.mat]; const cond = m.ferrous ? 0.55 : 0.6 + 0.4 * m.conductivity;
  const small = set.coil && eq < 18 ? (set.coil.s.smallBonus as number) : 1;
  return base * coilMult * size * cond * small;
}
/** Signal strength of a target for a coil at planar offset (dx,dy) in metres. */
export function response(set: DetSetup, t: Target, dx: number, dy: number, g: GroundInfo, vdiNoiseSeed = 0): Response {
  const m = t.hot ? { conductivity: 0.35, ferrous: true, metal: true } as any : MAT[t.mat];
  if (!m.metal) return { s: 0, audible: false, vdi: 0, iron: false, tone: 0, nonferrousStrength: 0 };
  const coilR = set.coil ? (set.coil.s.r as number) : (set.det.s.coil as number);
  const lat = Math.hypot(dx, dy); const d = t.depth / 100; const r = Math.sqrt(d * d + lat * lat * (0.12 / coilR) ** 2 * 0.9);
  const reach = t.hot ? Math.max(0.05, (set.det.s.depth as number) / 100 * 0.35) : reachM(set, t);
  const eq = t.hot ? 80 : Math.sqrt(Math.max(1, t.L * t.W)); const A = Math.pow(clamp(eq / 25, 0.08, 6), 0.7);
  const cond = m.ferrous ? 0.55 : 0.5 + m.conductivity;
  const s = A * cond * 0.75 / (1 + Math.pow(r / (0.55 * Math.max(0.02, reach)), 3));
  const floor = noiseFloor(set, g);
  const vdi = vdiOf(t, s, floor, vdiNoiseSeed);
  const iron = vdi < 20 || m.ferrous;
  let audible = s > floor;
  if (audible && !set.det.s.pi) { // discrimination
    if (set.ironReject && iron && (set.det.s.ironReject as boolean)) audible = false;
    const bin = binOf(vdi); if (set.reject[bin] && (set.det.s.notches as number) > 0) audible = false;
  }
  return { s, audible, vdi, iron, tone: vdi, nonferrousStrength: iron ? 0 : s };
}
const VDI_BASE: Record<string, number> = { gold: 76, silver: 90, copper: 86, bronze: 82, brass: 76, cupronickel: 66, nickel: 46, zinc: 70, lead: 56, tin: 30, pewter: 48, aluminium: 36, silverplate: 80, goldfilled: 72, iron: 10, steel: 12 };
export function vdiOf(t: Target, s: number, floor: number, seed = 0): number {
  if (t.hot) return 4 + Math.floor(hash01(hash32(t.id), 3) * 14);
  const base = VDI_BASE[t.mat] ?? 50; const eq = Math.sqrt(t.L * t.W); const size = clamp(Math.log2(eq / 25) * 4, -14, 12);
  const jitter = (hash01(hash32(t.id), 9) - 0.5) * 8; // target-specific shape effects
  const wobble = (hash01(hash32(t.id), seed) - 0.5) * 2 * 14 * (1 - clamp((s - floor) / (floor * 7 + 0.3), 0, 1)); // weak signals read unreliably
  return clamp(Math.round(base + (MAT[t.mat].ferrous ? 0 : size) + jitter + wobble), 0, 99);
}
export function toneHz(vdi: number, iron: boolean): number { return iron ? 110 + vdi * 6 : 260 + (vdi - 20) * 9; }
/** hot rock and trash density as pseudo-targets are produced by the world layer; this is the ground info calculator */
export function groundInfo(L: { mineral: number; moist: number; salt: number }, interference: number, wetness: number): GroundInfo {
  return { mineral: L.mineral, moist: clamp(L.moist * 0.5 + wetness * 0.6, 0, 1), salt: L.salt, interference };
}
