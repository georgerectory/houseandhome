// heatmap.js - how well each listing fits each road: the owner's own
// score (0 to 3), shaded, with the number always written in the cell, and
// the computed check beside it where the road states its criteria. A
// real table, so it reads row by row. Pure: returns markup.

import { escape } from '../../../core/format.js';

/**
 * @param {Array<{code:string, name:string, fit:Array<{road:string, stored:number|null, computed:number|null, agrees:boolean|null}>}>} rows
 * @param {Array<{code:string, name:string}>} roads
 * @param {{caption:string}} opts
 */
export function fitHeatmap(rows, roads, { caption }) {
  const cell = (f) => {
    const s = f?.stored ?? 0;
    const check = f?.computed == null ? '' : `<span class="rd-heat__check${f.agrees === false ? ' rd-heat__check--differs' : ''}">check ${f.computed}${f.agrees === false ? ', differs' : ''}</span>`;
    return `<td class="rd-heat__cell rd-heat--${s}"><span class="num">${s}</span>${check}</td>`;
  };
  return `<div class="table-wrap"><table class="table rd-heat">
    <caption>${escape(caption)}</caption>
    <thead><tr><th scope="col">Listing</th>${roads.map((r) => `<th scope="col"><abbr title="${escape(r.name)}">${escape(r.code)}</abbr></th>`).join('')}</tr></thead>
    <tbody>${rows.map((r) => `<tr><th scope="row"><span class="rd-code">${escape(r.code)}</span> ${escape(r.name)}</th>
      ${roads.map((road) => cell(r.fit.find((f) => f.road === road.code))).join('')}</tr>`).join('')}</tbody>
  </table></div>`;
}
