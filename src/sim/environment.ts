import { hash01, hash32 } from './rng';
import { cellOf, CELL, SIZE } from './terrain';
import { clamp } from './noise';
import type { World } from './worldtypes';

export const GAME_START_YEAR = 2024;
export const START_DOY = 104; // 14 April
export interface Weather { tempC: number; rainMm: number; windAngle: number; windMs: number; storm: number; cloud: number; text: string; }
const dayOfYear = (day: number) => (START_DOY + day) % 365;
export const yearOfDay = (day: number) => GAME_START_YEAR + Math.floor((START_DOY + day) / 365);
export function calendar(day: number): { year: number; month: number; dom: number; doy: number } {
  const dim = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]; let doy = dayOfYear(day); const year = yearOfDay(day); let m = 0; while (doy >= dim[m]) { doy -= dim[m]; m++; } return { year, month: m + 1, dom: doy + 1, doy: dayOfYear(day) };
}
export function weatherOn(w: World, day: number, x = SIZE / 2, y = SIZE / 2): Weather {
  const c = cellOf(x, y); const doy = dayOfYear(day); const seasonal = -Math.cos((doy - 15) / 365 * Math.PI * 2);
  const h = (k: number) => hash01(hash32(w.seed + '|wx'), day, k);
  const ann = w.T.temp[c]; const amp = 7 + Math.max(0, 14 - ann) * 0.3;
  const tempC = ann + seasonal * amp + (h(1) - 0.5) * 7;
  const pWet = clamp(w.T.precip[c] / 2600 + 0.12 + (seasonal < -0.3 ? 0.06 : 0), 0.08, 0.55);
  const wet = h(2) < pWet; const rainMm = wet ? Math.pow(h(3), 2.2) * 36 * (w.T.precip[c] / 1100) : 0;
  const storm = h(4) > 0.965 ? 1 + h(5) * 3 : 0;
  const windMs = 2 + h(6) * 7 + storm * 6; const windAngle = w.T.traits.windAngle + (h(7) - 0.5) * 1.2;
  const cloud = wet ? 0.7 + h(8) * 0.3 : h(9) * 0.7;
  const text = storm ? 'Storm' : rainMm > 12 ? 'Heavy rain' : rainMm > 1 ? 'Rain' : cloud > 0.6 ? 'Overcast' : cloud > 0.25 ? 'Partly cloudy' : 'Clear';
  return { tempC, rainMm, windAngle, windMs, storm, cloud, text };
}
/** soil wetness 0..1 from the last three weeks of rain on top of the climate */
export function wetnessOn(w: World, day: number, base: number): number {
  let sum = 0; for (let i = 0; i < 21; i++) sum += weatherOn(w, day - i).rainMm * Math.pow(0.88, i);
  return clamp(base * 0.6 + sum / 55, 0, 1);
}
export interface PlayEvent { id: string; day: number; kind: 'storm' | 'flood'; severity: number; windAngle: number; }
/** Storms and floods of the play period, derived from the same weather as everything else. */
export function playEventsUntil(w: World, day: number): PlayEvent[] {
  const out: PlayEvent[] = []; let rain3 = 0; const win: number[] = [];
  for (let d = 0; d <= day; d++) {
    const wx = weatherOn(w, d); win.push(wx.rainMm); if (win.length > 4) win.shift(); rain3 = win.reduce((a, b) => a + b, 0);
    if (wx.storm > 0) out.push({ id: `pS${d}`, day: d, kind: 'storm', severity: wx.storm + 0.8, windAngle: wx.windAngle });
    if (rain3 > 70 * (w.T.precip[cellOf(SIZE / 2, SIZE / 2)] > 1500 ? 1.1 : 0.8)) out.push({ id: `pF${d}`, day: d, kind: 'flood', severity: 1.1 + rain3 / 90, windAngle: 0 });
  }
  return out;
}
export function tideHeight(hours: number, springNeap = 0): number { // metres about mean sea level; hours since game start
  return (0.55 + 0.2 * Math.cos(hours / 354.4 * Math.PI * 2 + springNeap)) * Math.cos(hours / 12.42 * Math.PI * 2) + 0.12 * Math.cos(hours / 12 * Math.PI * 2);
}
export function daylight(day: number): { rise: number; set: number } { const s = -Math.cos((dayOfYear(day) - 10) / 365 * Math.PI * 2); const half = 6.1 + s * 3.5; return { rise: (12 - half) * 60, set: (12 + half) * 60 }; }
export function lightLevel(day: number, minute: number): number { const { rise, set } = daylight(day); if (minute < rise - 40 || minute > set + 40) return 0.12; if (minute < rise + 40) return 0.12 + 0.88 * (minute - (rise - 40)) / 80; if (minute > set - 40) return 0.12 + 0.88 * ((set + 40) - minute) / 80; return 1; }
