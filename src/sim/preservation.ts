import { MAT } from './materials';
import { clamp } from './noise';

export interface BuryEnv { ph: number; moist: number; salt: number; depthCm: number; disturbed: number; temp: number; sed: number; }
export interface Preserved { corr: number; lost: boolean; encrust: number; frag: number; note: string; }

/** How much of an object's original substance has been transformed by corrosion or decay. Depends on the time
 *  buried (not the time since manufacture), the material and the soil. */
export function preserve(matId: string, yearsBuried: number, env: BuryEnv, u: number, thin: number): Preserved {
  const m = MAT[matId];
  const acidity = clamp((6.6 - env.ph) / 2.6, 0, 1.4) + clamp((env.ph - 8) / 1.5, 0, 0.3) * (matId === 'zinc' || matId === 'aluminium' || matId === 'lead' ? 1 : 0);
  const aeration = clamp((1 - env.depthCm / 160) * (1 - env.moist * 0.55), 0.05, 1);
  const waterlogged = env.moist > 0.82 && env.depthCm > 15;
  let k = m.decay * (1 + m.acid * acidity + Math.max(0, m.moist) * env.moist + m.salt * env.salt * 1.8 + m.oxy * aeration * 0.8);
  if (m.moist < 0) k *= 1 + m.moist * env.moist;        // wood, leather, paper rot fastest in damp aerobic soil
  if (m.organic && waterlogged) k *= 0.08;              // anaerobic mud preserves organics
  if (m.organic && env.temp < 3) k *= 0.5;
  k *= 1 + env.disturbed * 0.35;                         // ploughing and digging admit air and break objects
  const exposure = (yearsBuried / 100) * k * (0.6 + thin * 0.8);  // thin things corrode through sooner
  let corr = 1 - Math.exp(-exposure * 1.15);
  corr = clamp(corr * (0.85 + 0.3 * u), 0, 1);
  const lost = corr > (m.organic ? 0.92 : 0.985) ;
  const encrust = m.metal ? clamp(corr * (m.ferrous ? 1.1 : 0.7) + (m.id === 'copper' || m.id === 'bronze' || m.id === 'brass' ? 0.15 * Math.min(1, yearsBuried / 80) : 0), 0, 1) : clamp(0.12 + yearsBuried / 400 * 0.5 * (env.moist + 0.2), 0, 0.8);
  const frag = m.metal ? clamp(1 - Math.max(0, corr - 0.55) * 1.6, 0.25, 1) : m.fragile ? clamp(1 - env.disturbed * 0.5 * u - yearsBuried / 900, 0.15, 1) : 1;
  return { corr, lost, encrust, frag, note: waterlogged && m.organic ? 'waterlogged' : '' };
}
export function conditionLabel(corr: number, wear: number, dmg: number, frag: number): string {
  const q = corr * 0.6 + wear * 0.25 + dmg * 0.3 + (1 - frag) * 0.4;
  return q < 0.08 ? 'Fine' : q < 0.18 ? 'Very good' : q < 0.32 ? 'Good' : q < 0.5 ? 'Fair' : q < 0.7 ? 'Poor' : q < 0.88 ? 'Heavily corroded' : 'Fragment';
}
