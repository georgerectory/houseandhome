// floorplan-svg.js - draw one level as SVG. Data in, string out. No DOM.
//
// The whole drawing works in METRES: the viewBox is the building's own
// extent, so an x of 3.5 in the model is an x of 3.5 in the picture and
// there is no scale factor to get wrong. Stroke widths and text sizes
// are metres too - a 0.05 stroke is a 5cm line, which is about what a
// drawn wall should look like.
//
// Nothing carries a colour: every element takes a class and the
// stylesheet resolves it from tokens, so the plan is themed with the
// rest of the site rather than being a picture with colours baked in.

import {
  bounds, roomsOn, wallsOn, openingsOn, openingSegment, axis,
  roomLabel, gridRef,
} from './floorplan.js';
import { escape } from '../core/format.js';

/** Room labels and axis letters need room to sit in, so the drawing is
 *  given a gutter on the two labelled edges. */
export const GUTTER = 0.8;

const n = (v) => Number(v).toFixed(3).replace(/\.?0+$/, '') || '0';

function gridHtml(bnds, building) {
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

/** The base room-name size in metres, and roughly how wide one glyph is
 *  at that size. Used only to decide whether a name fits: a plan that
 *  clips "Boiler room" to "Boiler ro" is worse than one that sets it a
 *  little smaller. */
const NAME_SIZE = 0.3;
const DIM_SIZE = 0.24;
const GLYPH_RATIO = 0.55;

/** The largest size at or below `base` that fits `text` across `width`,
 *  leaving a margin so a name never touches the wall. Returned rather
 *  than applied, so the caller decides what to do when it is very small. */
function fitSize(text, width, base) {
  const usable = Math.max(0, width - 0.24);
  const needed = String(text ?? '').length * GLYPH_RATIO * base;
  if (!needed || needed <= usable) return base;
  return Math.max(0.1, (usable / needed) * base);
}

function roomsHtml(building, levelId, roomNames) {
  return roomsOn(building, levelId).map((r) => {
    const [x1, y1, x2, y2] = r.rect;
    const label = roomLabel(r, roomNames);
    const cx = (x1 + x2) / 2;
    const cy = (y1 + y2) / 2;
    const w = x2 - x1;
    const nameSize = fitSize(label, w, NAME_SIZE);
    const dimSize = r.label ? fitSize(r.label, w, DIM_SIZE) : 0;
    // A dimension line that has to shrink below legibility is dropped
    // rather than drawn as a smear; the name always survives, because a
    // room the reader cannot name is not a plan.
    const showDim = !!r.label && dimSize >= 0.15;
    // Only the computed size crosses into the style attribute, as a
    // custom property, which is what the no-inline-style lint allows.
    return `<g class="fp-room${r.roomKey ? '' : ' fp-room--untyped'}" data-room="${escape(r.id)}">
      <rect x="${n(x1)}" y="${n(y1)}" width="${n(w)}" height="${n(y2 - y1)}" rx="0.03"></rect>
      <text class="fp-room-name" x="${n(cx)}" y="${n(cy - 0.12)}"
        style="--fp-fs:${n(nameSize)}px">${escape(label)}</text>
      ${showDim ? `<text class="fp-room-dim" x="${n(cx)}" y="${n(cy + 0.28)}"
        style="--fp-fs:${n(dimSize)}px">${escape(r.label)}</text>` : ''}
    </g>`;
  }).join('');
}

function wallsHtml(building, levelId) {
  return wallsOn(building, levelId).map((w) =>
    `<line class="fp-wall fp-wall--${escape(w.kind || 'internal')}"
      x1="${n(w.a[0])}" y1="${n(w.a[1])}" x2="${n(w.b[0])}" y2="${n(w.b[1])}"></line>`).join('');
}

/** An opening is drawn by cutting the wall: a light stroke over the dark
 *  one, so a door reads as a gap rather than as an extra mark. */
function openingsHtml(building, levelId) {
  return openingsOn(building, levelId).map((o) => {
    const seg = openingSegment(o, building);
    if (!seg) return '';
    return `<line class="fp-opening fp-opening--${escape(o.type || 'window')}"
      x1="${n(seg.a[0])}" y1="${n(seg.a[1])}" x2="${n(seg.b[0])}" y2="${n(seg.b[1])}"></line>`;
  }).join('');
}

/** One fixture. An inferred position is drawn hollow and dashed, because
 *  it is the centre of a room rather than where the thing actually is,
 *  and a plan that cannot tell you which is which is worse than one that
 *  leaves it off. */
function pinHtml(p, building, i) {
  const ref = gridRef(p.x, p.y, building);
  const label = `${p.thing.name}${ref ? ` (${ref})` : ''}`;
  return `<g class="fp-pin fp-pin--${escape(p.state)}" data-asset-id="${escape(p.thing.id)}"
    role="listitem" tabindex="0" aria-label="${escape(`${label}, ${p.state === 'inferred' ? 'approximate position' : 'placed'}`)}">
    <circle cx="${n(p.x)}" cy="${n(p.y)}" r="0.16"></circle>
    <text class="fp-pin-n" x="${n(p.x)}" y="${n(p.y + 0.08)}">${i + 1}</text>
    <title>${escape(label)}</title>
  </g>`;
}

/**
 * Draw one level.
 *
 * `placements` are already-resolved positions from floorplan.place(),
 * filtered to this level by the caller, so this function never has to
 * decide where anything is - only how to draw it.
 */
export function levelSvg(building, levelId, placements = [], opts = {}) {
  const b = bounds(building, levelId);
  if (!b) return '<p class="notice">This level has no geometry to draw.</p>';

  const x = b.x1 - GUTTER;
  const y = b.y1 - GUTTER;
  const w = (b.x2 - b.x1) + GUTTER;
  const h = (b.y2 - b.y1) + GUTTER;
  const title = opts.title ?? 'Floor plan';

  return `<svg class="fp" viewBox="${n(x)} ${n(y)} ${n(w)} ${n(h)}"
    preserveAspectRatio="xMidYMid meet" role="img" aria-label="${escape(title)}">
    <title>${escape(title)}</title>
    ${gridHtml(b, building)}
    ${roomsHtml(building, levelId, opts.roomNames)}
    ${wallsHtml(building, levelId)}
    ${openingsHtml(building, levelId)}
    <g class="fp-pins" role="list">${placements.map((p, i) => pinHtml(p, building, i)).join('')}</g>
  </svg>`;
}
