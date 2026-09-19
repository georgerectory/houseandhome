// floorplan-svg/level.js - one level, assembled.
//
// Data in, string out. No DOM.
//
// The order the layers go down in IS the drawing: rooms are the floor,
// walls sit on them, openings cut the walls, what is built in sits on
// the floor, furniture sits on that, and the annotation goes over
// everything because it has to be readable whatever is underneath.
//
// Nothing carries a colour: every element takes a class and the
// stylesheet resolves it from tokens, so the plan is themed with the
// rest of the site rather than being a picture with colours baked in.

import { bounds, levelById } from '../floorplan.js';
import { n } from './geom.js';
import { wallsHtml, ghostHtml } from './walls.js';
import { openingsHtml } from './openings.js';
import { furnitureHtml } from './furniture.js';
import { clearanceHtml } from './clearance.js';
import {
  gridHtml, roomsHtml, roomLabelsHtml, featuresHtml, stairsHtml,
  compassHtml, scaleBarHtml, dimensionsHtml,
} from './annotate.js';
import { pinsHtml } from './pins.js';
import { plotHtml } from './plot.js';
import { escape } from '../../core/format.js';

/** Room labels and axis letters need room to sit in, so the drawing is
 *  given a gutter on the two labelled edges. */
export const GUTTER = 0.8;

/**
 * Draw one level.
 *
 * `placements` are already-resolved positions from floorplan.place(),
 * filtered to this level by the caller, so this function never has to
 * decide where anything is - only how to draw it.
 *
 * Options, all off-by-default where they add ink:
 *   roomNames   the household's word for each room, keyed by roomKey
 *   grid        the metre grid and its letters (default on)
 *   rooms       the room names (default on)
 *   sizes       room dimensions under the names (default on)
 *   furniture   the variant's furniture (default on when there is any)
 *   labels      names on the furniture (default on)
 *   swings      the leaf and arc on each door (default on)
 *   clearance   the circulation overlay
 *   dimensions  overall dimension lines
 *   ghost       another stage's walls drawn faint underneath
 *   plot        the site boundary, and the house's setbacks from it
 *
 * An opening is always CUT, whatever is switched off: a door you have
 * hidden the swing of is still a hole you can walk through, and drawing
 * it as solid wall would be a lie about the building rather than a
 * quieter picture of it.
 */
export function levelSvg(building, levelId, placements = [], opts = {}) {
  const b = bounds(building, levelId);
  if (!b) return '<p class="notice">This level has no geometry to draw.</p>';

  // With the boundary on, the drawing has to zoom out to about a fifth
  // of the scale to fit a 40m plot. That is the honest picture of where
  // the house sits, and it is why the layer is off by default: at that
  // scale the rooms are unreadable, so it answers a different question
  // and you turn it on to ask that one.
  const plot = opts.plot ? building.plot : null;
  const px1 = plot ? Math.min(b.x1, plot.originX) : b.x1;
  const py1 = plot ? Math.min(b.y1, plot.originY) : b.y1;
  const px2 = plot ? Math.max(b.x2, plot.originX + plot.widthM) : b.x2;
  const py2 = plot ? Math.max(b.y2, plot.originY + plot.depthM) : b.y2;

  const x = px1 - GUTTER;
  const y = py1 - GUTTER;
  const w = (px2 - px1) + GUTTER;
  const h = (py2 - py1) + GUTTER;
  const level = levelById(building, levelId);
  const title = opts.title ?? `${level?.name ?? 'Level'} floor plan`;

  return `<svg class="fp" viewBox="${n(x)} ${n(y)} ${n(w)} ${n(h)}"
    preserveAspectRatio="xMidYMid meet" role="img" aria-label="${escape(title)}">
    <title>${escape(title)}</title>
    ${plotHtml(plot, b, building.envelope)}
    ${opts.grid === false ? '' : gridHtml(b, building)}
    ${ghostHtml(opts.ghost, levelId)}
    ${roomsHtml(building, levelId)}
    ${featuresHtml(building, levelId)}
    ${stairsHtml(building, levelId)}
    ${wallsHtml(building, levelId)}
    ${openingsHtml(building, levelId, opts)}
    ${opts.furniture === false ? '' : furnitureHtml(building, levelId, opts)}
    ${opts.rooms === false ? '' : roomLabelsHtml(building, levelId, opts.roomNames, opts)}
    ${opts.clearance ? clearanceHtml(building, levelId) : ''}
    ${opts.dimensions ? dimensionsHtml(b, building) : ''}
    ${compassHtml(building, b)}
    ${scaleBarHtml(b)}
    ${pinsHtml(placements, building)}
  </svg>`;
}
