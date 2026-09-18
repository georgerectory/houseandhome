// house/toolbar.js - the controls above the drawing.
//
// The old toolbar was four stacked rows of buttons and two full-width
// selects, which on a phone pushed the drawing - the entire point of the
// page - below the fold. This one is a single sticky bar: what you are
// looking at, which version of the house, and one button for everything
// else.
//
// Markup only. Every handler is bound by the page, so this file can be
// read as "what the controls are" without chasing behaviour through it.

import { escape } from '../../core/format.js';
import { layersFor, hiddenCount } from './display.js';

export const VIEWS = [
  ['plan', 'Plan', 'The floor plan, drawn to scale'],
  ['model', '3D', 'Turn the house around and look into it'],
  ['walk', 'Walk', 'Stand inside it at eye height'],
  ['survey', 'Survey', 'Every stated figure against what the model computes'],
];

const chip = (k, label, hint, current, attr) =>
  `<button type="button" class="hv-tab${k === current ? ' is-on' : ''}"
    ${attr}="${escape(k)}" aria-pressed="${k === current}"
    title="${escape(hint ?? label)}">${escape(label)}</button>`;

/** The view switch. First, because it is the thing changed most often
 *  and the thing that decides what the rest of the bar means. */
export function viewTabs(view) {
  return `<div class="hv-tabs" role="group" aria-label="View">
    ${VIEWS.map(([k, label, hint]) => chip(k, label, hint, view, 'data-view')).join('')}
  </div>`;
}

/** Version and furniture, side by side. They are the two axes of the
 *  model and they belong together; stacking them full width made them
 *  look like two unrelated questions. */
export function pickers(model) {
  const stages = model?.manifest.stages ?? [];
  const variants = model?.entry.variants ?? [];
  const sel = (id, label, options, current) => `<label class="hv-pick">
    <span class="hv-pick__label">${escape(label)}</span>
    <select class="hv-pick__input" id="${id}" data-select="${id}">
      ${options.map((o) => `<option value="${escape(o.id)}"${o.id === current ? ' selected' : ''}>${
  escape(o.name)}</option>`).join('')}
    </select>
  </label>`;
  return `<div class="hv-picks">
    ${sel('stage', 'Version', stages, model?.entry.id)}
    ${variants.length > 1 ? sel('variant', 'Furniture', variants, model?.variantEntry?.id) : ''}
  </div>`;
}

/** Levels, the compare toggle and the Display button. Hidden on the
 *  Survey view, which has no drawing to control. */
export function levelRow(building, levelId, view, { parentStage, compare, display, levels }) {
  if (view === 'survey') return '';
  const walking = view === 'walk';
  const tabs = walking ? '' : `<div class="hv-tabs hv-tabs--quiet" role="group" aria-label="Level">
    ${levels.map((l) => chip(l.id, l.name, `Show ${l.name}`, levelId, 'data-level-id')).join('')}
  </div>`;
  const hidden = hiddenCount(display, view);
  return `<div class="hv-row">
    ${tabs}
    <div class="hv-row__end">
      ${parentStage && !walking ? `<button type="button" class="hv-ghost${compare ? ' is-on' : ''}"
        data-compare="1" aria-pressed="${compare}">Compare</button>` : ''}
      <button type="button" class="hv-ghost" data-display-open="1"
        aria-expanded="false" aria-controls="hv-display">Display${
  hidden ? `<span class="hv-ghost__count num">${hidden}</span>` : ''}</button>
    </div>
  </div>`;
}

/** The panel behind the Display button: one switch per layer that means
 *  something in the view on screen. */
export function displayPanel(view, display) {
  const layers = layersFor(view);
  if (!layers.length) return '';
  return `<div class="hv-display" id="hv-display" hidden>
    <fieldset class="hv-display__set">
      <legend class="hv-display__legend">Show</legend>
      ${layers.map((l) => `<label class="hv-switch">
        <input type="checkbox" data-layer="${escape(l.id)}"${display[l.id] ? ' checked' : ''}>
        <span>${escape(l.name)}</span>
      </label>`).join('')}
    </fieldset>
    <div class="hv-display__foot">
      <button type="button" class="hv-ghost" data-layer-all="on">Show all</button>
      <button type="button" class="hv-ghost" data-layer-all="off">Hide all</button>
    </div>
  </div>`;
}
