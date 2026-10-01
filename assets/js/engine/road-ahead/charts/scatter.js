// scatter.js - the register as price against optimistic profit, with the
// ceilings and the profit target drawn from the variables. SVG: a point's
// position is the message. One series in one colour: in a scatter every
// pair of colours meets, which five road colours cannot survive, so each
// point is named by its listing's code instead and the table beside it
// has every figure. Each point has a 24px hover target. Pure: markup.

import { escape } from '../../../core/format.js';
import { linear, ticks, kilo } from './scale.js';

const W = 640;
const H = 380;
const M = { top: 16, right: 20, bottom: 44, left: 64 };
// Text boxes in user units, to keep labels apart: a code is in the
// monospace face, a line's name in the body face, both about 12 high.
const CODE_CH = 7.5;
const WORD_CH = 6.5;
const ROW = 14;

const overlaps = (a, b) => a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;
const shared = (a, b) => Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)) * Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));
const inPlot = (b) => b.x0 >= M.left && b.x1 <= W - M.right + 4 && b.y0 >= 0 && b.y1 <= H - M.bottom;

/** The places a code can sit around its point, most natural first. */
function spots(cx, cy, w) {
  const at = (x, y, anchor) => {
    const x0 = anchor === 'start' ? x : anchor === 'end' ? x - w : x - w / 2;
    return { x, y, anchor, box: { x0, x1: x0 + w, y0: y - 10, y1: y + 2 } };
  };
  return [at(cx + 8, cy + 4, 'start'), at(cx - 8, cy + 4, 'end'), at(cx, cy - 10, 'middle'), at(cx, cy + 19, 'middle'),
    at(cx + 6, cy - 8, 'start'), at(cx + 6, cy + 16, 'start'), at(cx - 6, cy - 8, 'end'), at(cx - 6, cy + 16, 'end')];
}

/**
 * Where each point's code goes, so that no label sits on another label or
 * on a point: to the right of its point, else the left, above, below or a
 * corner; where nothing is free, wherever it covers least. Greedy, left
 * to right across the plot.
 * @param {Array<{cx:number, cy:number, code:string}>} points in user units
 * @param {Array<{x0:number, x1:number, y0:number, y1:number}>} taken boxes already used, such as line labels
 * @returns {Array<{x:number, y:number, anchor:'start'|'end'|'middle', box:object}>} in the order given
 */
export function placeLabels(points, taken = []) {
  const boxes = [...taken, ...points.map((p) => ({ x0: p.cx - 6, x1: p.cx + 6, y0: p.cy - 6, y1: p.cy + 6 }))];
  const out = new Array(points.length);
  const order = points.map((p, i) => i).sort((a, b) => points[a].cx - points[b].cx || points[a].cy - points[b].cy);
  for (const i of order) {
    const { cx, cy, code } = points[i];
    const all = spots(cx, cy, code.length * CODE_CH).filter((s) => inPlot(s.box));
    const cost = (s) => boxes.reduce((n, b) => n + shared(s.box, b), 0);
    out[i] = all.find((s) => !boxes.some((b) => overlaps(s.box, b)))
      ?? all.reduce((best, s) => (best == null || cost(s) < cost(best) ? s : best), null)
      ?? spots(cx, cy, code.length * CODE_CH)[0];
    boxes.push(out[i].box);
  }
  return out;
}

/** The names of the upright lines, stacked in rows where two lines stand close. */
function uprightLabels(lines, x) {
  const ends = [];
  return [...lines].sort((a, b) => a.value - b.value).map((l) => {
    const at = x(l.value);
    const w = l.label.length * WORD_CH;
    const flip = at + 4 + w > W - M.right;
    const x0 = flip ? at - 4 - w : at + 4;
    let row = ends.findIndex((end) => x0 > end + 4);
    if (row < 0) { row = ends.length; ends.push(0); }
    ends[row] = x0 + w;
    const y = M.top + 12 + row * ROW;
    return { l, at, tx: flip ? at - 4 : at + 4, y, anchor: flip ? 'end' : 'start', box: { x0, x1: x0 + w, y0: y - 10, y1: y + 2 } };
  });
}

/**
 * @param {Array<{code:string, x:number, y:number, title:string, tipValue?:string}>} points
 * @param {{caption:string, xLines?:Array<{value:number, label:string}>, yLines?:Array<{value:number, label:string}>,
 *          xLabel:string, yLabel:string}} opts
 */
export function scatter(points, { caption, xLines = [], yLines = [], xLabel, yLabel }) {
  const xs = [...points.map((p) => p.x), ...xLines.map((l) => l.value)].filter(Number.isFinite);
  const ys = [...points.map((p) => p.y), ...yLines.map((l) => l.value), 0].filter(Number.isFinite);
  const [x0, x1] = [Math.min(...xs) * 0.9, Math.max(...xs) * 1.05];
  const [y0, y1] = [Math.min(...ys), Math.max(...ys) * 1.08 || 1];
  const x = linear(x0, x1, M.left, W - M.right);
  const y = linear(y0, y1, H - M.bottom, M.top);
  const xt = ticks(x0, x1, 5);
  const yt = ticks(y0, y1, 4);
  const upright = uprightLabels(xLines, x);
  const level = yLines.map((l) => {
    const at = y(l.value);
    const w = l.label.length * WORD_CH;
    return { l, at, box: { x0: W - M.right - 4 - w, x1: W - M.right - 4, y0: at - 14, y1: at - 2 } };
  });
  const cs = points.map((p) => ({ cx: x(p.x), cy: y(p.y), code: p.code }));
  const labels = placeLabels(cs, [...upright.map((u) => u.box), ...level.map((h) => h.box)]);
  const vline = (u) => `<g class="rd-sc__rule"><line x1="${u.at.toFixed(1)}" x2="${u.at.toFixed(1)}" y1="${M.top}" y2="${H - M.bottom}"/>
    <text x="${u.tx.toFixed(1)}" y="${u.y}"${u.anchor === 'end' ? ' text-anchor="end"' : ''}>${escape(u.l.label)}</text></g>`;
  const hline = (h) => `<g class="rd-sc__rule"><line x1="${M.left}" x2="${W - M.right}" y1="${h.at.toFixed(1)}" y2="${h.at.toFixed(1)}"/>
    <text x="${W - M.right - 4}" y="${(h.at - 4).toFixed(1)}" text-anchor="end">${escape(h.l.label)}</text></g>`;
  const dot = (p, i) => `<g class="rd-sc__pt" data-tip-value="${escape(p.tipValue ?? '')}" data-tip-label="${escape(p.title)}">
    <circle class="rd-sc__hit" cx="${cs[i].cx.toFixed(1)}" cy="${cs[i].cy.toFixed(1)}" r="12"/>
    <circle cx="${cs[i].cx.toFixed(1)}" cy="${cs[i].cy.toFixed(1)}" r="5"/>
    <text x="${labels[i].x.toFixed(1)}" y="${labels[i].y.toFixed(1)}"${labels[i].anchor === 'start' ? '' : ` text-anchor="${labels[i].anchor}"`}>${escape(p.code)}</text></g>`;
  return `<figure class="rd-sc">
    <figcaption>${escape(caption)}</figcaption>
    <div class="rd-sc__scroll">
      <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${escape(`${caption} ${points.length} listings.`)}">
        <g class="rd-sc__grid">${yt.map((t) => `<line x1="${M.left}" x2="${W - M.right}" y1="${y(t).toFixed(1)}" y2="${y(t).toFixed(1)}"/>`).join('')}</g>
        <g class="rd-sc__axis">
          ${yt.map((t) => `<text x="${M.left - 8}" y="${(y(t) + 4).toFixed(1)}" text-anchor="end">${kilo(t)}</text>`).join('')}
          ${xt.map((t) => `<text x="${x(t).toFixed(1)}" y="${H - M.bottom + 18}" text-anchor="middle">${kilo(t)}</text>`).join('')}
          <text x="${(M.left + W - M.right) / 2}" y="${H - 6}" text-anchor="middle">${escape(xLabel)}</text>
          <text transform="translate(14 ${(M.top + H - M.bottom) / 2}) rotate(-90)" text-anchor="middle">${escape(yLabel)}</text>
        </g>
        ${upright.map(vline).join('')}${level.map(hline).join('')}
        ${points.map(dot).join('')}
      </svg>
    </div>
  </figure>`;
}
