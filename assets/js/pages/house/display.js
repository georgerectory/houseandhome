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
];

const DEFAULTS = Object.fromEntries(LAYERS.map((l) => [l.id, l.on]));

/** Read the remembered choices, falling back to the defaults for
 *  anything a previous version did not know about. */
export function loadDisplay() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS };
    const saved = JSON.parse(raw);
    return { ...DEFAULTS, ...Object.fromEntries(
      Object.entries(saved).filter(([k]) => k in DEFAULTS),
    ) };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveDisplay(state) {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* private mode */ }
}

/** The layers worth offering for the view on screen. */
export const layersFor = (view) => LAYERS.filter((l) => l.views.includes(view));

/** How many of them are switched off, for the button that opens the
 *  panel: "Display" alone gives no hint that three things are hidden. */
export const hiddenCount = (state, view) =>
  layersFor(view).filter((l) => !state[l.id]).length;
