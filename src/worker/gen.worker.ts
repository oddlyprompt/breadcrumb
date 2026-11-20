import { generateWorld } from '../sim/world';
self.onmessage = (e: MessageEvent<{ seed: string }>) => {
  try {
    const w = generateWorld(e.data.seed, (msg, frac) => (self as any).postMessage({ type: 'progress', msg, frac }));
    (self as any).postMessage({ type: 'done', world: w });
  } catch (err: any) { (self as any).postMessage({ type: 'error', message: String(err?.stack ?? err) }); }
};
