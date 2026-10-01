// spark.js - a road's cash, month by month, as a small line: where it
// goes lowest, and the floor the works may not dig below. SVG without
// text, so it scales to any width; the words are its aria-label and
// the figures beside it. The lowest month is a zero-length line with a
// round cap, which stays a dot however the chart is stretched, ringed in
// the surface colour. The page adds a crosshair from the series the chart
// carries. Pure: returns markup.

import { escape } from '../../../core/format.js';
import { linear, kilo } from './scale.js';

const W = 300;
const H = 72;
const PAD = 4;

/** The month a trace row names, as a person reads it. */
const when = (ym) => {
  const [y, m] = ym.split('-').map(Number);
  return `${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][m - 1]} ${y}`;
};

/**
 * @param {Array<[string, number, string]>} trace [month 'YYYY-MM', cash, phase], as simulate() gives it
 * @param {{floor?:number, label:string, range?:[number, number]}} opts floor: the cash the works stop
 *   at; range: a shared scale, so small multiples compare like with like
 */
export function cashSpark(trace, { floor = null, label, range = null }) {
  if (!trace?.length) return '';
  const cash = trace.map(([, c]) => c);
  const lo = Math.min(0, floor ?? 0, ...cash, range?.[0] ?? 0);
  const hi = Math.max(...cash, floor ?? 0, 1, range?.[1] ?? 1);
  const x = linear(0, Math.max(1, trace.length - 1), PAD, W - PAD);
  const y = linear(lo, hi, H - PAD, PAD);
  const path = trace.map(([, c], i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(c).toFixed(1)}`).join(' ');
  let low = 0;
  cash.forEach((c, i) => { if (c < cash[low]) low = i; });
  const said = `${label}: cash from ${kilo(cash[0])} in ${when(trace[0][0])} to ${kilo(cash.at(-1))} in ${when(trace.at(-1)[0])}; `
    + `lowest ${kilo(cash[low])} in ${when(trace[low][0])}${floor != null ? `; works stop at ${kilo(floor)}` : ''}.`;
  const lowAt = `x1="${x(low).toFixed(1)}" x2="${x(low).toFixed(1)}" y1="${y(cash[low]).toFixed(1)}" y2="${y(cash[low]).toFixed(1)}"`;
  // The months and the cash ride on the chart, so the page's crosshair can
  // read the month under the pointer without the chart being rebuilt.
  return `<svg class="rd-spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="${escape(said)}"
    data-spark="${escape(label)}" data-start="${escape(trace[0][0])}" data-cash="${cash.map((c) => Math.round(c)).join(',')}"
    data-pad="${PAD}" data-width="${W}">
    <line class="rd-spark__zero" x1="${PAD}" x2="${W - PAD}" y1="${y(0).toFixed(1)}" y2="${y(0).toFixed(1)}"/>
    ${floor != null ? `<line class="rd-spark__floor" x1="${PAD}" x2="${W - PAD}" y1="${y(floor).toFixed(1)}" y2="${y(floor).toFixed(1)}"/>` : ''}
    <path class="rd-spark__line" d="${path}"/>
    <line class="rd-spark__cross" x1="0" x2="0" y1="0" y2="${H}" visibility="hidden"/>
    <line class="rd-spark__ring" ${lowAt}/>
    <line class="rd-spark__low" ${lowAt}/>
  </svg>`;
}
