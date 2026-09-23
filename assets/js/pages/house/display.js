// house/display.js - what is drawn, and what is turned off.
//
// One place decides the visibility of every layer, for BOTH the plan and
// the 3D model, because a room label you switched off should stay off
// when you change view. Choices are remembered, so the page comes back
// the way you left it rather than resetting to a full-fat drawing every
// time.
//
// Each layer says which views it applies to, so the panel only ever
// offers a control that does something: there is no roof on a floor
// plan, and no grid inside the walkthrough.

import { getJSON, setJSON } from '../../core/prefs.js';

const KEY = 'hh-house-display';

export const LAYERS = [
  { id: 'rooms', name: 'Room names', views: ['plan', 'model', 'walk'], on: true },
  { id: 'sizes', name: 'Room sizes', views: ['plan'], on: true },
  { id: 'furniture', name: 'Furniture', views: ['plan', 'model', 'walk'], on: true },
  { id: 'furnitureLabels', name: 'Furniture names', views: ['plan'], on: true },
  { id: 'markers', name: 'Equipment pins', views: ['plan', 'model'], on: true },
  { id: 'openings', name: 'Door swings', views: ['plan'], on: true },
  { id: 'dimensions', name: 'Dimensions', views: ['plan'], on: true },
  { id: 'grid', name: 'Grid and references', views: ['plan'], on: true },
  { id: 'clearance', name: 'Circulation check', views: ['plan'], on: false },
  { id: 'roof', name: 'Roof', views: ['model', 'walk'], on: true },
  { id: 'glazing', name: 'Glass in the windows', views: ['model', 'walk'], on: true },
  { id: 'doorLeaves', name: 'Door leaves', views: ['model', 'walk'], on: true },
  // Off by default in the orbit view, on in the walkthrough. A ceiling
  // is a lid over the storey you are looking down into, and a room
  // without one is a pit you are standing in; no single default is
  // right for both, so each view gets its own.
  { id: 'ceilings', name: 'Ceilings', views: ['model', 'walk'], on: true },
  { id: 'plot', name: 'Plot boundary', views: ['plan', 'model', 'walk'], on: false },
];

const DEFAULTS = Object.fromEntries(LAYERS.map((l) => [l.id, l.on]));

/** Read the remembered choices, falling back to the defaults for
 *  anything a previous version did not know about. */
export function loadDisplay() {
  return getJSON(KEY, DEFAULTS);
}

export function saveDisplay(state) {
  setJSON(KEY, state);
}

/** The layers worth offering for the view on screen. */
export const layersFor = (view) => LAYERS.filter((l) => l.views.includes(view));

/** How many of them are switched off, for the button that opens the
 *  panel: "Display" alone gives no hint that three things are hidden. */
export const hiddenCount = (state, view) =>
  layersFor(view).filter((l) => !state[l.id]).length;
