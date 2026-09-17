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
 *   sizes       room dimensions under the names (default on)
 *   furniture   the variant's furniture (default on when there is any)
 *   clearance   the circulation overlay
 *   dimensions  overall dimension lines
 *   ghost       another stage's walls drawn faint underneath
 */
export function levelSvg(building, levelId, placements = [], opts = {}) {
  const b = bounds(building, levelId);
  if (!b) return '<p class="notice">This level has no geometry to draw.</p>';

  const x = b.x1 - GUTTER;
  const y = b.y1 - GUTTER;
  const w = (b.x2 - b.x1) + GUTTER;
  const h = (b.y2 - b.y1) + GUTTER;
  const level = levelById(building, levelId);
  const title = opts.title ?? `${level?.name ?? 'Level'} floor plan`;

  return `<svg class="fp" viewBox="${n(x)} ${n(y)} ${n(w)} ${n(h)}"
    preserveAspectRatio="xMidYMid meet" role="img" aria-label="${escape(title)}">
    <title>${escape(title)}</title>
    ${opts.grid === false ? '' : gridHtml(b, building)}
    ${ghostHtml(opts.ghost, levelId)}
    ${roomsHtml(building, levelId)}
    ${featuresHtml(building, levelId)}
    ${stairsHtml(building, levelId)}
    ${wallsHtml(building, levelId)}
    ${openingsHtml(building, levelId)}
    ${opts.furniture === false ? '' : furnitureHtml(building, levelId, opts)}
    ${roomLabelsHtml(building, levelId, opts.roomNames, opts)}
    ${opts.clearance ? clearanceHtml(building, levelId) : ''}
    ${opts.dimensions ? dimensionsHtml(b, building) : ''}
    ${compassHtml(building, b)}
    ${scaleBarHtml(b)}
    ${pinsHtml(placements, building)}
  </svg>`;
}
