import './ui/style.css';
import { h, esc } from './ui/dom';
import { newGame, deserialize } from './sim/game';
import { listSaves, deleteSave, SaveRec } from './ui/storage';
import { App } from './ui/app';
import { Noise } from './sim/noise';
import { generateWorld } from './sim/world';
import type { World } from './sim/worldtypes';
import * as game from './sim/game';
import * as economy from './sim/economy';
import * as artifacts from './sim/artifacts';
import * as identify from './sim/identify';
import * as validate from './sim/validate';
(window as any).__bc = { game, economy, artifacts, identify, validate };

const root = document.getElementById('root')!;
const WORDS = ['Alder', 'Birch', 'Cairn', 'Dune', 'Ember', 'Fen', 'Gannet', 'Heron', 'Iron', 'Juniper', 'Kestrel', 'Lantern', 'Marl', 'Nettle', 'Oxbow', 'Pewter', 'Quarry', 'Reed', 'Slate', 'Tern', 'Umber', 'Vale', 'Wren', 'Yarrow'];
const randomSeed = () => `${WORDS[Math.floor(Math.random() * WORDS.length)]}-${WORDS[Math.floor(Math.random() * WORDS.length)]}-${Math.floor(Math.random() * 900 + 100)}`;

function genWorld(seed: string, onProgress: (m: string, f: number) => void): Promise<World> {
  return new Promise((resolve, reject) => {
    let done = false; const fallback = () => { setTimeout(() => { try { resolve(generateWorld(seed, onProgress)); } catch (e) { reject(e); } }, 30); };
    try {
      const wk = new Worker(new URL('./worker/gen.worker.ts', import.meta.url), { type: 'module' });
      wk.onmessage = e => { const m = e.data; if (m.type === 'progress') onProgress(m.msg, m.frac); else if (m.type === 'done') { done = true; wk.terminate(); resolve(m.world as World); } else if (m.type === 'error') { wk.terminate(); if (!done) { console.warn('worker failed, generating on main thread', m.message); fallback(); } } };
      wk.onerror = () => { if (!done) fallback(); };
      wk.postMessage({ seed });
    } catch { fallback(); }
  });
}
function bgCanvas(cv: HTMLCanvasElement) {
  const n = new Noise('title'); const W = cv.width = 900, H = cv.height = 560; const c = cv.getContext('2d')!; const img = c.createImageData(W, H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const e = n.fbm(x / 260, y / 260, 5) * 0.5 + 0.5; const k = Math.abs(((e * 14) % 1) - 0.5) * 2; const line = k < 0.07 ? 1 : 0; const o = (y * W + x) * 4; const v = 30 + e * 40 + line * 70; img.data[o] = v * 0.8; img.data[o + 1] = v * 1.1; img.data[o + 2] = v * 0.85; img.data[o + 3] = 255; }
  c.putImageData(img, 0, 0);
}
async function title() {
  root.innerHTML = ''; const wrap = h('div', { class: 'title' }); const cv = h('canvas', { class: 'bg' }) as HTMLCanvasElement; bgCanvas(cv); wrap.append(cv);
  const card = h('div', { class: 'card' }); card.append(h('h1', {}, 'BREADCRUMB'), h('div', { class: 'sub' }, 'Every discovery is a consequence of something that happened before you arrived.'));
  const seed = h('input', { type: 'text', value: randomSeed(), id: 'seed', spellcheck: 'false' }) as HTMLInputElement;
  card.append(h('label', {}, 'World seed'), h('div', { class: 'row' }, seed, h('button', { class: 'btn alt', onClick: () => { seed.value = randomSeed(); } }, 'Random')), h('p', { class: 'small muted' }, 'The same seed always makes the same world: its rocks, its four hundred years of history and everything lying in the ground. Different seeds make genuinely different regions.'));
  const prog = h('div', { class: 'progress', style: 'display:none' }, h('i', { style: 'width:0%' })); const msg = h('div', { class: 'small muted', style: 'min-height:20px;margin-top:6px' });
  const go = h('button', { class: 'btn', onClick: () => begin(seed.value.trim() || randomSeed(), null) }, 'Begin a new survey'); card.append(h('div', { class: 'row', style: 'margin-top:14px' }, go), prog, msg);
  async function begin(sd: string, rec: SaveRec | null) {
    go.setAttribute('disabled', ''); prog.style.display = 'block'; const bar = prog.firstChild as HTMLElement;
    try { const w = await genWorld(sd, (m, f) => { msg.textContent = m; bar.style.width = Math.round(f * 100) + '%'; });
      const g = rec ? deserialize(JSON.stringify(rec.state)) : newGame(w); const id = rec?.id ?? `save-${Date.now()}`; root.innerHTML = ''; (window as any).__app = new App(root, w, g, id, () => { title(); }); (window as any).__world = w;
    } catch (e: any) { msg.textContent = 'Generation failed: ' + e; go.removeAttribute('disabled'); console.error(e); }
  }
  card.append(h('div', { class: 'row', style: 'margin-top:8px' }, h('label', { class: 'btn alt small', style: 'margin:0;cursor:pointer;letter-spacing:0;text-transform:none' }, 'Import save…', h('input', { type: 'file', accept: '.json', style: 'display:none', onChange: async (e: Event) => { const f = (e.target as HTMLInputElement).files?.[0]; if (!f) return; try { const st = deserialize(await f.text()); await begin(st.seed, { id: `save-${Date.now()}`, name: '', seed: st.seed, genVersion: st.genVersion, saveVersion: st.v, updated: Date.now(), summary: '', state: st }); } catch { msg.textContent = 'That file is not a Breadcrumb save.'; } } }))));
  let saves: SaveRec[] = []; try { saves = await listSaves(); } catch { /* no storage */ }
  if (saves.length) { const box = h('div', { class: 'saves' }, h('label', { style: 'margin-top:10px' }, 'Continue')); for (const s of saves) box.append(h('div', { class: 'sv' }, h('div', {}, h('b', {}, s.name), h('div', { class: 'tiny muted' }, `${s.seed} · ${s.summary}`)), h('div', { class: 'row' }, h('button', { class: 'btn small', onClick: () => begin(s.seed, s) }, 'Resume'), h('button', { class: 'btn small alt', onClick: async () => { await deleteSave(s.id); title(); } }, '✕')))); card.append(box); }
  wrap.append(card); root.append(wrap);
  const q = new URLSearchParams(location.search); if (q.get('seed') && q.get('auto')) begin(q.get('seed')!, null);
}
title();
