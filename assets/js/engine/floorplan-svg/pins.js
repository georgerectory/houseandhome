// floorplan-svg/pins.js - the things the register knows about, on the
// drawing.
//
// An inferred position is drawn hollow and dashed, because it is the
// centre of a room rather than where the thing actually is, and a plan
// that cannot tell you which is which is worse than one that leaves it
// off.

import { gridRef } from '../floorplan.js';
import { n } from './geom.js';
import { escape } from '../../core/format.js';

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

export const pinsHtml = (placements, building) =>
  `<g class="fp-pins" role="list">${(placements ?? [])
    .map((p, i) => pinHtml(p, building, i)).join('')}</g>`;
