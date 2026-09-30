// scale.js - the arithmetic every Road Ahead chart shares. Pure.

/** A linear map from a domain onto a range (0 to 100 by default: percent). */
export const linear = (d0, d1, r0 = 0, r1 = 100) =>
  (v) => (d1 === d0 ? r0 : r0 + ((v - d0) / (d1 - d0)) * (r1 - r0));

/** A percentage for a custom property, clamped to the track. */
export const pct = (x) => `${Math.max(0, Math.min(100, Number.isFinite(x) ? x : 0)).toFixed(2)}%`;

/** The next round number above v, for an axis: 1, 2 or 5 times a power of ten. */
export function niceCeil(v) {
  if (!(v > 0)) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  return [1, 2, 2.5, 5, 10].map((k) => k * p).find((k) => k >= v);
}

/** Round ticks from 0 (or lo) to hi. */
export function ticks(lo, hi, count = 4) {
  const step = niceCeil((hi - lo) / count);
  const out = [];
  for (let t = Math.ceil(lo / step) * step; t <= hi + 1e-9; t += step) out.push(Math.round(t * 1e6) / 1e6);
  return out;
}

/** '£418k', the kit's way of saying a big round figure. */
export const kilo = (v) => (v == null || !Number.isFinite(v) ? '—'
  : `${v < 0 ? '-' : ''}£${Math.round(Math.abs(v) / 1000).toLocaleString('en-GB')}k`);

/** Each road's colour in the series, by its order: 1 to 5, then round again. */
export const seriesOf = (roads) => new Map(roads.map((r, i) => [r.code, (i % 5) + 1]));
