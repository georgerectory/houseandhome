// floorplan-svg/openings.js - doors and windows, drawn the way a plan
// draws them.
//
// An opening is first a HOLE: the wall is cut, by laying the paper
// colour back over the solid, so a door reads as a gap rather than as an
// extra mark on top of a wall.
//
// Then the leaf. A door's swing is not decoration - it is the single
// most useful thing on a floor plan, because it is what tells you the
// chest of drawers cannot go there. It is drawn from the same numbers
// the clearance check reserves the space with, so the picture and the
// check can never disagree about which way a door opens.

import { openingsOn } from '../floorplan.js';
import { openingFrame, pts, n } from './geom.js';
import { escape } from '../../core/format.js';

const NO_LEAF = new Set(['cased', 'opening', 'pocket']);

/** Which way the leaf swings, as a vector across the wall. A compass
 *  bearing rather than "in" or "out", because which side of an internal
 *  wall is inside is a matter of opinion and north is not. */
function swingSign(f, toward) {
  if (!toward) return 0;
  if (f.horizontal) return toward === 'south' ? 1 : toward === 'north' ? -1 : 0;
  return toward === 'east' ? 1 : toward === 'west' ? -1 : 0;
}

// The wall's own across-axis points which way in world terms? This
// resolves the bearing onto it, so a wall drawn right-to-left swings the
// same way as one drawn left-to-right.
const acrossSign = (f) => (f.horizontal ? Math.sign(f.m[1]) || 1 : Math.sign(f.m[0]) || 1);

function leafHtml(o, f, opts = {}) {
  if (opts.swings === false) return '';
  if (NO_LEAF.has(o.leaf)) return '';
  const dir = swingSign(f, o.swing?.toward);
  if (!dir) return '';
  const across = dir * acrossSign(f);
  const leaves = o.leaf === 'double' ? 2 : 1;
  const span = f.half * 2 / leaves;
  const out = [];
  for (let i = 0; i < leaves; i += 1) {
    // Hinged at the outer end of each leaf, so a double door opens from
    // the middle the way a double door does.
    const hingeAlong = leaves === 2
      ? (i === 0 ? -f.half : f.half)
      : (o.swing?.hinge === 'b' ? f.half : -f.half);
    const swingAlong = leaves === 2 ? (i === 0 ? -f.half + span : f.half - span) : -hingeAlong;
    const hinge = f.at(hingeAlong, 0);
    const shut = f.at(swingAlong, 0);
    const open = f.at(hingeAlong, across * span);
    out.push(`<path class="fp-swing" d="M ${n(shut[0])} ${n(shut[1])}
      A ${n(span)} ${n(span)} 0 0 ${across * (swingAlong > hingeAlong ? 1 : -1) > 0 ? 1 : 0}
      ${n(open[0])} ${n(open[1])}"></path>`);
    out.push(`<line class="fp-leaf" x1="${n(hinge[0])}" y1="${n(hinge[1])}"
      x2="${n(open[0])}" y2="${n(open[1])}"></line>`);
  }
  return out.join('');
}

function bifoldHtml(o, f) {
  if (o.leaf !== 'bifold') return '';
  const panels = Math.max(2, Math.round(o.width / 0.6));
  const step = (f.half * 2) / panels;
  return Array.from({ length: panels - 1 }, (_, i) => {
    const p = f.at(-f.half + step * (i + 1), 0);
    return `<circle class="fp-fold" cx="${n(p[0])}" cy="${n(p[1])}" r="0.045"></circle>`;
  }).join('');
}

export function openingsHtml(building, levelId, opts = {}) {
  return openingsOn(building, levelId).map((o) => {
    const f = openingFrame(o, building);
    if (!f) return '';
    // The hole, cut through the full thickness of the wall.
    const hole = pts([f.at(-f.half, -f.t), f.at(f.half, -f.t), f.at(f.half, f.t), f.at(-f.half, f.t)]);
    const glazing = o.type === 'window'
      ? `<line class="fp-glazing" x1="${n(f.at(-f.half, 0)[0])}" y1="${n(f.at(-f.half, 0)[1])}"
          x2="${n(f.at(f.half, 0)[0])}" y2="${n(f.at(f.half, 0)[1])}"></line>` : '';
    const label = `${o.type === 'door' ? 'Door' : 'Window'} ${escape(o.id)}`
      + `${o.leaf ? `, ${escape(o.leaf)}` : ''}`;
    return `<g class="fp-opening fp-opening--${escape(o.type || 'window')}"
      data-opening="${escape(o.id)}">
      <polygon class="fp-hole" points="${hole}"></polygon>
      ${glazing}${leafHtml(o, f, opts)}${bifoldHtml(o, f)}
      <title>${label}</title>
    </g>`;
  }).join('');
}
