// timeline.js - every road on one time axis: the family stay, renting,
// each house kept and the forever home. HTML lanes positioned by custom
// properties, so the text stays text. Pure: returns markup.

import { escape } from '../../../core/format.js';
import { monthIndex, addMonths } from '../money.js';
import { linear, pct } from './scale.js';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const shortMonth = ([y, m]) => `${MONTHS[m - 1]} ${y}`;
const later = (a, b) => (monthIndex(a) >= monthIndex(b) ? a : b);

/**
 * The phases of one road, from its steps.
 * @param {{stages:object[]}} road with any what-ifs already applied
 * @param {{start:[number,number], familyUntil:[number,number], end:[number,number]}} span
 * @returns {Array<{kind:'family'|'rent'|'house'|'forever', from:[number,number], to:[number,number], label:string}>}
 */
export function roadPhases(road, { start, familyUntil, end }) {
  const out = [];
  const firstRent = road.stages.find((s) => s.kind === 'rent')?.at ?? null;
  const firstBuy = road.stages.find((s) => s.kind !== 'rent')?.at ?? end;
  const familyEnd = addMonths(familyUntil, 1);
  if (monthIndex(familyEnd) > monthIndex(start)) out.push({ kind: 'family', from: start, to: familyEnd, label: 'Family stay' });
  const rentFrom = later(firstRent ?? familyEnd, familyEnd);
  if (monthIndex(firstBuy) > monthIndex(rentFrom)) out.push({ kind: 'rent', from: rentFrom, to: firstBuy, label: 'Renting' });
  let n = 0;
  road.stages.forEach((s, i) => {
    if (s.kind === 'buy') {
      n += 1;
      const sold = road.stages.slice(i + 1).find((x) => x.kind === 'sell')?.at ?? end;
      out.push({ kind: 'house', from: s.at, to: sold, label: `House ${n}` });
    }
    if (s.kind === 'forever') out.push({ kind: 'forever', from: s.at, to: end, label: 'Forever home' });
  });
  return out;
}

/**
 * @param {Array<{code:string, name:string, series:number, phases:object[]}>} lanes
 * @param {{start:[number,number], end:[number,number], caption:string}} opts
 */
export function timeline(lanes, { start, end, caption }) {
  const x = linear(monthIndex(start), monthIndex(end));
  const years = [];
  for (let y = start[1] === 1 ? start[0] : start[0] + 1; y <= end[0]; y += 1) years.push(y);
  const seg = (p) => {
    const from = x(monthIndex(p.from));
    const to = x(monthIndex(p.to));
    return `<span class="rd-tl__seg rd-tl__seg--${p.kind}" style="--from:${pct(from)};--width:${pct(to - from)}"
      title="${escape(`${p.label}: ${shortMonth(p.from)} to ${shortMonth(p.to)}`)}"><span class="rd-tl__seg-label">${escape(p.label)}</span></span>`;
  };
  const words = (l) => l.phases.map((p) => `${p.label} ${shortMonth(p.from)} to ${shortMonth(p.to)}`).join('; ');
  return `<figure class="rd-tl">
    <figcaption>${escape(caption)}</figcaption>
    <div class="rd-tl__scroll">
      <div class="rd-tl__axis" aria-hidden="true">${years.map((y) => `<span class="rd-tl__year" style="--pos:${pct(x(monthIndex([y, 1])))}">${y}</span>`).join('')}</div>
      <ul class="rd-tl__lanes">${lanes.map((l) => `<li class="rd-tl__lane rd-s${l.series}">
        <span class="rd-tl__name"><span class="rd-code">${escape(l.code)}</span> ${escape(l.name)}</span>
        <span class="rd-tl__track" aria-hidden="true">${l.phases.map(seg).join('')}</span>
        <span class="visually-hidden">${escape(words(l))}</span>
      </li>`).join('')}</ul>
    </div>
  </figure>`;
}
