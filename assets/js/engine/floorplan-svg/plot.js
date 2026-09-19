// floorplan-svg/plot.js - the site boundary, the hedge on it, and the
// four gaps between it and the house.
//
// This layer answers one question: where does the house sit in its
// plot, and how much room is there on each side. So it draws the
// boundary, the hedge standing on it, and the four setbacks - and
// nothing else. The source site plan also colours in grass, shrubs,
// planting, hardstanding, sheds and open ground; every one of those
// outlines is traced off an aerial photograph to plus or minus a metre
// or two by the source's own admission, and putting them on a drawing
// set out to the millimetre would dress an estimate as a survey.
//
// The hedge earns its place because it is not a surface: it is 1.83m of
// solid green, so it is the difference between two metres of path down
// the west side and two metres of passage.
//
// The boundary is DASHED because the source labels it "Boundary
// (approx.)"; a solid line would claim a title plan nobody has seen.

import { n, fitSize } from './geom.js';
import { escape } from '../../core/format.js';

const TICK = 0.35;

const FIGURE = 0.52;

/**
 * One dimension line with its figure, along x or along y.
 *
 * The figure is SIZED TO ITS OWN LINE. A 2.7m setback carrying
 * "2.7 m / 1.9 clear" needs about 3.7m of text at the base size, so it
 * runs off the end of the dimension it belongs to and, on the west side,
 * straight off the edge of the drawing. Shrinking it to fit is the same
 * rule the room names already use.
 */
function setback(x1, y1, x2, y2, label) {
  const horizontal = Math.abs(y2 - y1) < 0.001;
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  const span = Math.hypot(x2 - x1, y2 - y1);
  const size = fitSize(label, span, FIGURE);
  const ends = horizontal
    ? `<line class="fp-plot-tick" x1="${n(x1)}" y1="${n(y1 - TICK)}" x2="${n(x1)}" y2="${n(y1 + TICK)}"></line>
       <line class="fp-plot-tick" x1="${n(x2)}" y1="${n(y2 - TICK)}" x2="${n(x2)}" y2="${n(y2 + TICK)}"></line>`
    : `<line class="fp-plot-tick" x1="${n(x1 - TICK)}" y1="${n(y1)}" x2="${n(x1 + TICK)}" y2="${n(y1)}"></line>
       <line class="fp-plot-tick" x1="${n(x2 - TICK)}" y1="${n(y2)}" x2="${n(x2 + TICK)}" y2="${n(y2)}"></line>`;
  return `<line class="fp-plot-dim" x1="${n(x1)}" y1="${n(y1)}" x2="${n(x2)}" y2="${n(y2)}"></line>
    ${ends}
    <text class="fp-plot-figure" x="${n(mx)}" y="${n(my)}" font-size="${n(size)}"
      ${horizontal ? '' : `transform="rotate(-90 ${n(mx)} ${n(my)})"`}>${escape(label)}</text>`;
}

/**
 * The boundary, with the four setbacks dimensioned.
 *
 * The setbacks are measured to the ENVELOPE - the rectangle the building
 * is set out in - and not to the drawing's own extent. Those are not the
 * same thing: the drawing extends past the envelope for a porch, a
 * chimney breast or a roof overhang, and measuring to it would report
 * the front garden as 3.8m because the porch sticks a metre into it.
 * The site plan's own setbacks are to the walls, so these are too, and
 * they then sum to the stated plot in both directions.
 */
export function plotHtml(plot, b, envelope) {
  if (!plot) return '';
  const house = envelope
    ? { x1: 0, y1: 0, x2: envelope.widthM, y2: envelope.depthM }
    : b;
  const x1 = plot.originX;
  const y1 = plot.originY;
  const x2 = x1 + plot.widthM;
  const y2 = y1 + plot.depthM;
  // Two figures, because they answer different questions. The setback
  // to the LINE is what a planning drawing wants; the clear distance to
  // the HEDGE is what tells you whether the west side takes a path and
  // the bins. The handbook's own headline is the second one - "about 2m
  // to the Pine Close hedge" - so a drawing that only showed 2.7 would
  // not obviously be describing the same gap.
  const d0 = plot.hedge?.depthM ?? 0;
  const m = (v) => (d0 > 0
    ? `${v.toFixed(1)} m / ${(v - d0).toFixed(1)} clear`
    : `${v.toFixed(1)} m`);

  const midX = (house.x1 + house.x2) / 2;
  const midY = (house.y1 + house.y2) / 2;
  // The hedge as a band inside the line: four rectangles rather than one
  // stroked outline, because a stroke centres on its path and would
  // straddle the boundary instead of standing inside it.
  const d = plot.hedge?.depthM ?? 0;
  const hedge = d > 0 ? [
    [x1, y1, x2, y1 + d],
    [x1, y2 - d, x2, y2],
    [x1, y1 + d, x1 + d, y2 - d],
    [x2 - d, y1 + d, x2, y2 - d],
  ].map(([a, b2, c, e]) => `<rect class="fp-plot-hedge" x="${n(a)}" y="${n(b2)}"
      width="${n(c - a)}" height="${n(e - b2)}"></rect>`).join('') : '';
  return `<g class="fp-plot" aria-hidden="true">
    <rect class="fp-plot-area" x="${n(x1)}" y="${n(y1)}"
      width="${n(plot.widthM)}" height="${n(plot.depthM)}"></rect>
    ${hedge}
    <rect class="fp-plot-line" x="${n(x1)}" y="${n(y1)}"
      width="${n(plot.widthM)}" height="${n(plot.depthM)}"></rect>
    ${setback(x1, midY, house.x1, midY, m(house.x1 - x1))}
    ${setback(house.x2, midY, x2, midY, m(x2 - house.x2))}
    ${setback(midX, y1, midX, house.y1, m(house.y1 - y1))}
    ${setback(midX, house.y2, midX, y2, m(y2 - house.y2))}
    <text class="fp-plot-name" x="${n(x1 + 0.4)}" y="${n(y1 - 0.5)}"
      >Plot ${escape(`${plot.widthM.toFixed(1)} x ${plot.depthM.toFixed(1)} m`)} (approx.)${
  plot.hedge ? escape(` - hedge ${plot.hedge.heightM.toFixed(2)}m high, ${plot.hedge.depthM.toFixed(2)}m deep`) : ''
}</text>
  </g>`;
}
