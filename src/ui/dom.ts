export const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, any> = {}, ...kids: Array<Node | string | null | undefined>): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) { if (v === undefined || v === null || v === false) continue; if (k === 'class') e.className = v; else if (k.startsWith('on')) e.addEventListener(k.slice(2).toLowerCase(), v); else if (k === 'html') e.innerHTML = v; else e.setAttribute(k, v === true ? '' : String(v)); }
  for (const kid of kids) if (kid !== null && kid !== undefined) e.append(kid);
  return e;
}
export const money = (v: number) => v >= 1000 ? `$${Math.round(v).toLocaleString()}` : v >= 100 ? `$${Math.round(v)}` : v >= 10 ? `$${v.toFixed(1)}` : `$${v.toFixed(2)}`;
