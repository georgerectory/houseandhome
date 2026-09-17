// floorplan-svg/annotate.js - everything that tells you what you are
// looking at: room names and sizes, the grid and its letters, the
// stairs, built-in features, a north arrow and a scale bar.
//
// The scale bar is not decoration. Every length in this drawing is a
// real length, so a plan printed at a known scale can be measured with a
// ruler - and a bar that measures a metre is how you prove the drawing
// was not stretched on the way to the paper.

import {
  roomsOn, roomRects, axis, featuresOn, stairsOn, largestRect, roomArea,
} from '../floorplan.js';
import { n, fitSize } from './geom.js';
import { escape } from '../../core/format.js';

const NAME_SIZE = 0.3;
const DIM_SIZE = 0.22;

export function gridHtml(bnds, building) {
  const { cols, rows } = axis(bnds, building);
  const lines = [
    ...cols.map((c) => `<line class="fp-grid" x1="${n(c.x1)}" y1="${n(bnds.y1)}"
      x2="${n(c.x1)}" y2="${n(bnds.y2)}"></line>`),
    ...rows.map((r) => `<line class="fp-grid" x1="${n(bnds.x1)}" y1="${n(r.y1)}"
      x2="${n(bnds.x2)}" y2="${n(r.y1)}"></line>`),
  ].join('');
  const labels = [
    ...cols.map((c) => `<text class="fp-axis" x="${n((c.x1 + c.x2) / 2)}"
      y="${n(bnds.y1 - 0.25)}">${escape(c.label)}</text>`),
    ...rows.map((r) => `<text class="fp-axis fp-axis--row" x="${n(bnds.x1 - 0.3)}"
      y="${n((r.y1 + r.y2) / 2)}">${escape(r.label)}</text>`),
  ].join('');
  return `<g aria-hidden="true">${lines}${labels}</g>`;
}

/** The floor of every room: the rectangles, filled. Drawn early, so
 *  everything else in the drawing sits on top of them. */
export function roomsHtml(building, levelId) {
  return roomsOn(building, levelId).map((r) => {
    const shapes = roomRects(r).map(([x1, y1, x2, y2]) =>
      `<rect x="${n(x1)}" y="${n(y1)}" width="${n(x2 - x1)}" height="${n(y2 - y1)}" rx="0.02"></rect>`).join('');
    return `<g class="fp-room${r.roomKey ? '' : ' fp-room--untyped'}" data-room="${escape(r.id)}">
      ${shapes}</g>`;
  }).join('');
}

/**
 * What each room is called and how big it is. Drawn LAST, after the
 * furniture, because a name under a sofa is not a name - and the sofa is
 * the thing you can see the shape of anyway.
 *
 * THE DRAWING USES THE ROOM'S OWN NAME, not the household's word for it.
 * The register resolves through `roomKey` and still answers "where is the
 * cooker" in the household's vocabulary, but a STAGE renames rooms on
 * purpose - the design study calls the dining room a snug and the second
 * bedroom a master - and overriding that would make the drawing disagree
 * with the document it was drawn from. Only a room with no name of its
 * own falls back to the household's.
 */
export function roomLabelsHtml(building, levelId, roomNames, opts = {}) {
  return roomsOn(building, levelId).map((r) => {
    const rects = roomRects(r);
    const label = r.name ?? roomNames?.[r.roomKey] ?? '';
    const big = largestRect(rects);
    const cx = (big[0] + big[2]) / 2;
    const cy = (big[1] + big[3]) / 2;
    const w = big[2] - big[0];
    const nameSize = fitSize(label, w, NAME_SIZE);
    const size = r.clearSize && rects.length === 1
      ? `${r.clearSize[0].toFixed(2)} x ${r.clearSize[1].toFixed(2)}m`
      : `${roomArea(r).toFixed(1)} m2`;
    const dimSize = fitSize(size, w, DIM_SIZE);
    // A dimension that has to shrink below legibility is dropped rather
    // than drawn as a smear; the name always survives, because a room
    // the reader cannot name is not a plan.
    const showDim = opts.sizes !== false && dimSize >= 0.13;
    // Only the computed size crosses into the style attribute, as a
    // custom property, which is what the no-inline-style lint allows.
    return `<g class="fp-room-label" data-room-label="${escape(r.id)}">
      <text class="fp-room-name" x="${n(cx)}" y="${n(cy - 0.1)}"
        style="--fp-fs:${n(nameSize)}px">${escape(label)}</text>
      ${showDim ? `<text class="fp-room-dim" x="${n(cx)}" y="${n(cy + 0.28)}"
        style="--fp-fs:${n(dimSize)}px">${escape(size)}</text>` : ''}
    </g>`;
  }).join('');
}

/** Chimney breasts, fitted wardrobes, bulkheads, the porch: built in, so
 *  hatched rather than drawn as furniture, because they do not move. */
export function featuresHtml(building, levelId) {
  return featuresOn(building, levelId).map((f) => {
    const [x1, y1, x2, y2] = f.rect;
    return `<g class="fp-feature fp-feature--${escape(f.kind)}" data-feature="${escape(f.id)}">
      <rect x="${n(x1)}" y="${n(y1)}" width="${n(x2 - x1)}" height="${n(y2 - y1)}"></rect>
      <title>${escape(f.kind.replace(/_/g, ' '))}</title>
    </g>`;
  }).join('');
}

/** The flight, with its treads and the arrow that says which way is up.
 *  On the floor it arrives at, the same footprint is the stairwell. */
export function stairsHtml(building, levelId) {
  return stairsOn(building, levelId).map((s) => {
    const room = (building.rooms ?? []).find((r) => r.id === s.from);
    const going = room?.level === levelId;
    const box = going ? s.footprint : (s.upperVoid ?? s.footprint);
    const [x1, y1, x2, y2] = box;
    const vertical = (s.direction ?? '-y').includes('y');
    const run = vertical ? y2 - y1 : x2 - x1;
    const count = Math.max(1, Math.round(run / (s.going ?? 0.22)));
    const treads = Array.from({ length: count - 1 }, (_, i) => {
      const at = (i + 1) * (run / count);
      return vertical
        ? `<line class="fp-tread" x1="${n(x1)}" y1="${n(y1 + at)}" x2="${n(x2)}" y2="${n(y1 + at)}"></line>`
        : `<line class="fp-tread" x1="${n(x1 + at)}" y1="${n(y1)}" x2="${n(x1 + at)}" y2="${n(y2)}"></line>`;
    }).join('');
    const up = (s.direction ?? '-y').startsWith('-');
    const mx = (x1 + x2) / 2;
    const arrow = vertical
      ? `<line class="fp-arrow" x1="${n(mx)}" y1="${n(up ? y2 - 0.15 : y1 + 0.15)}"
          x2="${n(mx)}" y2="${n(up ? y1 + 0.15 : y2 - 0.15)}"></line>`
      : `<line class="fp-arrow" x1="${n(up ? x2 - 0.15 : x1 + 0.15)}" y1="${n((y1 + y2) / 2)}"
          x2="${n(up ? x1 + 0.15 : x2 - 0.15)}" y2="${n((y1 + y2) / 2)}"></line>`;
    return `<g class="fp-stair${going ? '' : ' fp-stair--void'}" data-stair="${escape(s.id)}">
      <rect x="${n(x1)}" y="${n(y1)}" width="${n(x2 - x1)}" height="${n(y2 - y1)}"></rect>
      ${going ? treads + arrow : ''}
      <text class="fp-stair-label" x="${n(mx)}" y="${n(y1 - 0.08)}">${going ? 'UP' : 'DOWN'}</text>
      <title>${escape(`${s.risers} risers at ${s.rise}m`)}</title>
    </g>`;
  }).join('');
}

/** North, and a metre. Both drawn in the drawing's own units, at the
 *  top-left of the sheet where a drawing puts them. */
export function compassHtml(building, bnds) {
  const up = building.orientation?.planUpIs ?? 'north';
  const x = bnds.x2 - 0.55;
  const y = bnds.y1 + 0.15;
  return `<g class="fp-compass" aria-hidden="true">
    <line x1="${n(x)}" y1="${n(y + 0.9)}" x2="${n(x)}" y2="${n(y + 0.1)}"></line>
    <polygon points="${n(x)},${n(y)} ${n(x - 0.11)},${n(y + 0.24)} ${n(x + 0.11)},${n(y + 0.24)}"></polygon>
    <text class="fp-compass-label" x="${n(x)}" y="${n(y + 1.25)}">${escape(up.slice(0, 1).toUpperCase())}</text>
  </g>`;
}

export function scaleBarHtml(bnds) {
  const x = bnds.x1 + 0.1;
  const y = bnds.y2 - 0.22;
  const ticks = Array.from({ length: 6 }, (_, i) =>
    `<line class="fp-scale-tick" x1="${n(x + i)}" y1="${n(y - 0.08)}" x2="${n(x + i)}" y2="${n(y + 0.08)}"></line>`).join('');
  return `<g class="fp-scale" aria-hidden="true">
    <rect class="fp-scale-bar" x="${n(x)}" y="${n(y - 0.04)}" width="5" height="0.08"></rect>
    ${ticks}
    <text class="fp-scale-label" x="${n(x)}" y="${n(y + 0.36)}">0</text>
    <text class="fp-scale-label" x="${n(x + 5)}" y="${n(y + 0.36)}">5 m</text>
  </g>`;
}

/** Overall dimension lines across the top and down the side, with
 *  witness lines, the way a drawing carries them. */
export function dimensionsHtml(bnds, building) {
  const w = building.envelope?.widthM;
  const d = building.envelope?.depthM;
  if (!w || !d) return '';
  const top = bnds.y1 + 0.42;
  const side = bnds.x1 + 0.42;
  const tick = (x1, y1, x2, y2) => `<line class="fp-dim-tick" x1="${n(x1)}" y1="${n(y1)}" x2="${n(x2)}" y2="${n(y2)}"></line>`;
  return `<g class="fp-dims" aria-hidden="true">
    <line class="fp-dim" x1="0" y1="${n(top)}" x2="${n(w)}" y2="${n(top)}"></line>
    ${tick(0, top - 0.12, 0, top + 0.12)}${tick(w, top - 0.12, w, top + 0.12)}
    <text class="fp-dim-text" x="${n(w / 2)}" y="${n(top - 0.14)}">${w.toFixed(2)} m</text>
    <line class="fp-dim" x1="${n(side)}" y1="0" x2="${n(side)}" y2="${n(d)}"></line>
    ${tick(side - 0.12, 0, side + 0.12, 0)}${tick(side - 0.12, d, side + 0.12, d)}
    <text class="fp-dim-text fp-dim-text--side" x="${n(side - 0.14)}" y="${n(d / 2)}">${d.toFixed(2)} m</text>
  </g>`;
}
