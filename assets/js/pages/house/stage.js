// house/stage.js - the drawing, and the things drawn over it.
//
// One element holds whichever view is on: the plan as SVG, or the canvas
// the 3D model and the walkthrough share. The overlays are the reason
// this is its own file - a compass, the viewpoint chips, the touch stick
// and a status line - and every one of them exists because of something
// that went wrong without it.
//
// THE COMPASS is the important one. A floor plan has a north arrow, so
// you always know which way round you are looking. The 3D view had
// nothing, so the moment you dragged it round you had no way to tell
// east from west - and a mirrored model looked perfectly correct from
// one side. A heading you can read is what makes that impossible to
// miss again.

import { escape } from '../../core/format.js';
import { levelSvg } from '../../engine/floorplan-svg.js';

/** The compass. The needle turns with the camera and the bearing is
 *  spelled out in words beside it, because "north-east" is checkable at
 *  a glance and a rotated arrow on its own is not. */
export function compass() {
  return `<div class="hv-compass" data-compass aria-live="polite">
    <svg class="hv-compass__dial" viewBox="-12 -12 24 24" aria-hidden="true">
      <circle class="hv-compass__ring" cx="0" cy="0" r="10.5"></circle>
      <g data-compass-needle>
        <path class="hv-compass__n" d="M 0 -8 L 3.2 1.6 L 0 0 L -3.2 1.6 Z"></path>
        <path class="hv-compass__s" d="M 0 8 L 3.2 -1.6 L 0 0 L -3.2 -1.6 Z"></path>
      </g>
    </svg>
    <span class="hv-compass__word" data-compass-word>Facing north</span>
  </div>`;
}

/** Where to stand. Named after what you would see, not after an angle. */
export function viewpointBar(viewpoints, current) {
  return `<div class="hv-views" role="group" aria-label="Viewpoint">
    ${viewpoints.map((v) => `<button type="button"
      class="hv-view${v.id === current ? ' is-on' : ''}"
      data-viewpoint="${escape(v.id)}" aria-pressed="${v.id === current}">${escape(v.name)}</button>`).join('')}
  </div>`;
}

/** The touch stick. It has no fixed home: it appears under the thumb
 *  wherever the thumb lands in the left of the view, so it never has to
 *  be aimed at, and it is inert to pointer events so it cannot swallow
 *  the drag that summoned it. */
const stick = () => `<div class="hv-stick" data-stick aria-hidden="true">
  <span class="hv-stick__knob"></span>
</div>`;

const HINTS = {
  model: 'Drag to turn the house around, pinch or scroll to zoom.',
  walkTouch: 'Drag on the left to walk, anywhere else to look. Walk at the stairs to go up, and out of a door to see the house from outside.',
  walkKeys: 'Click the view to look around, then W A S D or the arrows to walk, Shift to hurry. Walk at the stairs to go up, and out of a door to see the house from outside. Escape releases the cursor.',
};

/**
 * The walkthrough's own controls, over the bottom of the view.
 *
 * One picker for where to stand - outside the house on any side, or any
 * room on either floor - because walking by thumb from the front door to
 * the master bedroom to check a wardrobe fits is a long way to go, and
 * standing back to look at the roof should not require finding the door
 * first. The walk out of a room is still there when the question is
 * whether you can get there at all.
 *
 */
export function walkControls(destinations) {
  const groups = [];
  for (const d of destinations) {
    const last = groups[groups.length - 1];
    if (last && last.name === d.group) last.items.push(d);
    else groups.push({ name: d.group, items: [d] });
  }
  return `<div class="hv-walkbar">
    <label class="hv-jump">
      <span class="hv-jump__label">Go to</span>
      <select class="hv-jump__input" data-goto>
        <option value="">Choose a place</option>
        ${groups.map((g) => `<optgroup label="${escape(g.name)}">${
  g.items.map((d) => `<option value="${escape(d.id)}">${escape(d.name)}</option>`).join('')
}</optgroup>`).join('')}
      </select>
    </label>
  </div>`;
}

/** The canvas the 3D model and the walkthrough share, with the overlays
 *  each mode needs. */
export function canvasStage(building, {
  view, viewpoints, viewpointId, coarse, destinations = [],
}) {
  const walking = view === 'walk';
  // The overlays are positioned against the VIEW, not against the stage:
  // anchoring them to the stage put the controls on top of the hint text
  // underneath it.
  return `<div class="hv-stage${walking ? ' hv-stage--walk' : ''}" data-stage>
    <div class="hv-view">
      <canvas class="hv-canvas" id="fp-canvas" tabindex="0"
        aria-label="${walking ? 'Walkthrough of' : '3D model of'} ${escape(building.name)}"></canvas>
      ${compass()}
      ${walking ? stick() + walkControls(destinations) : viewpointBar(viewpoints, viewpointId)}
    </div>
    <p class="hv-hint" id="fp-note">${escape(
    walking ? (coarse ? HINTS.walkTouch : HINTS.walkKeys) : HINTS.model,
  )}</p>
  </div>`;
}

/** The floor plan, with every layer the display panel has left on. */
export function planStage(building, levelId, placements, { display, roomNames, title, ghost }) {
  return `<div class="hv-stage hv-stage--plan">
    ${levelSvg(building, levelId, display.markers ? placements : [], {
    roomNames,
    title,
    ghost,
    rooms: display.rooms,
    sizes: display.sizes,
    grid: display.grid,
    furniture: display.furniture,
    labels: display.furnitureLabels,
    swings: display.openings,
    dimensions: display.dimensions,
    clearance: display.clearance,
    plot: display.plot,
  })}
  </div>`;
}
