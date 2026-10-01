// bars.js - the forever-home budget, one bar per road, with where the
// other headline scenarios would put it. HTML, not SVG: a bar's label
// and its figures stay real text at any width, and a screen reader reads
// the list as a list. Each row is its bar's hover target, its tooltip the
// figures again, value first. Pure: returns markup.

import { escape } from '../../../core/format.js';
import { linear, pct, niceCeil, kilo } from './scale.js';

/**
 * @param {Array<{code:string, name:string, series:number, value:number|null,
 *                markers:Array<{key:string, label:string, value:number|null}>}>} rows
 * @param {{caption:string, target?:number|null, targetLabel?:string}} opts
 */
export function budgetBars(rows, { caption, target = null, targetLabel = 'Target' }) {
  const values = rows.flatMap((r) => [r.value, ...r.markers.map((m) => m.value)]).filter(Number.isFinite);
  const max = niceCeil(Math.max(target ?? 0, ...values, 1) * 1.04);
  const x = linear(0, max);
  const row = (r) => {
    const marks = r.markers.filter((m) => Number.isFinite(m.value));
    const tipLabel = [`${r.code} ${r.name}`, ...marks.map((m) => `${m.label} ${kilo(m.value)}`)].join(' · ');
    return `<li class="rd-bars__row rd-s${r.series}" data-tip-value="${Number.isFinite(r.value) ? kilo(r.value) : 'No forever home'}"
      data-tip-label="${escape(tipLabel)}">
      <span class="rd-bars__label"><span class="rd-code">${escape(r.code)}</span> ${escape(r.name)}</span>
      <span class="rd-bars__value num">${Number.isFinite(r.value) ? kilo(r.value) : 'no forever home'}</span>
      <span class="rd-bars__track" aria-hidden="true">
        ${Number.isFinite(r.value) ? `<span class="rd-bars__fill" style="--pct:${pct(x(r.value))}"></span>` : ''}
        ${marks.map((m) => `<span class="rd-bars__mark rd-bars__mark--${escape(m.key)}" style="--pos:${pct(x(m.value))}"></span>`).join('')}
        ${Number.isFinite(target) ? `<span class="rd-bars__target" style="--pos:${pct(x(target))}"></span>` : ''}
      </span>
      ${marks.length ? `<span class="rd-bars__marks">${marks.map((m) => `${escape(m.label)} ${kilo(m.value)}`).join(' · ')}</span>` : ''}
    </li>`;
  };
  return `<figure class="rd-bars">
    <figcaption>${escape(caption)}${Number.isFinite(target) ? ` The line is ${escape(targetLabel.toLowerCase())}: ${kilo(target)}.` : ''}</figcaption>
    <ul class="rd-bars__list">${rows.map(row).join('')}</ul>
  </figure>`;
}
