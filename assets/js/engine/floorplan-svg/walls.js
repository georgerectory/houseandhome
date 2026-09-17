// floorplan-svg/walls.js - walls, drawn as the solids they are.
//
// Existing brickwork and new work are told apart, because that
// distinction is the whole content of a drawing for an extension: it is
// what says which twelve metres of wall somebody has to build.

import { wallsOn } from '../floorplan.js';
import { wallPolygon, pts } from './geom.js';
import { escape } from '../../core/format.js';

export function wallsHtml(building, levelId) {
  return wallsOn(building, levelId).map((w) => {
    const poly = wallPolygon(w, building);
    if (!poly) return '';
    const prov = w.provenance === 'new' ? ' fp-wall--new' : '';
    const title = w.provenance === 'new' ? 'New wall' : 'Existing wall';
    return `<polygon class="fp-wall fp-wall--${escape(w.kind || 'internal')}${prov}"
      points="${pts(poly)}"><title>${escape(title)}</title></polygon>`;
  }).join('');
}

/** The stage underneath, in compare mode: the walls that are there today
 *  drawn faint under the walls that would be there afterwards, so what
 *  the extension actually does is visible rather than described. */
export function ghostHtml(ghost, levelId) {
  if (!ghost) return '';
  const walls = wallsOn(ghost, levelId).map((w) => {
    const poly = wallPolygon(w, ghost);
    return poly ? `<polygon class="fp-ghost" points="${pts(poly)}"></polygon>` : '';
  }).join('');
  return `<g class="fp-ghosts" aria-hidden="true">${walls}</g>`;
}
