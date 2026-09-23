// House. The building model, what sits where on it, and the equipment
// register that the plan's grid references resolve against.
//
// The grid reference is the join. A fixture carries metric coordinates;
// the reference shown next to it in the register is COMPUTED from those
// coordinates, and so is the square it sits in on the plan and the
// marker in the 3D model. One position, three readings - never three
// places to keep in step.
//
// STAGE and VARIANT are the two axes of the model. A stage is a
// structural state of the house - as bought, after the extension - and a
// variant is an arrangement of furniture within one. "No furniture" is
// the empty variant rather than a rendering flag, so the empty house is
// a real thing you can look at, check and fork.
import { requireAuth } from '../core/auth.js';
import { mountShell, render, confidenceBanner } from '../core/shell.js';
import { load, openItems, confidenceSummary } from '../core/store.js';
import { emptyState } from '../core/page.js';
import { money, provenance, titleCase, escape } from '../core/format.js';
import {
  levels, levelById, placeAll, placedOn, roomLabel, roomsNotOnPlan, spreadInferred,
} from '../engine/floorplan.js';
import { loadComposed, loadStageOnly } from '../core/building-data.js';
import { surveyHtml } from './house/survey-view.js';
import { loadDisplay, saveDisplay, layersFor } from './house/display.js';
import { viewTabs, pickers, levelRow, displayPanel } from './house/toolbar.js';
import { canvasStage, planStage, walkControls } from './house/stage.js';
import * as store from '../core/prefs.js';

const user = await requireAuth();
if (!user) throw new Error('redirecting to login');
mountShell('house.html', { user });

const d = await load();

const KEY = { level: 'hh-house-level', view: 'hh-house-view', stage: 'hh-house-stage', variant: 'hh-house-variant' };
const display = loadDisplay();
let destinations = [];

let model = await loadComposed(store.get(KEY.stage), store.get(KEY.variant));
let parentStage = model?.entry.derivedFrom ? await loadStageOnly(model.entry.derivedFrom) : null;
let compare = false;

const open = openItems(d);
const byRoom = new Map();
for (const i of open) {
  const k = i.room_name ?? 'Unassigned';
  if (!byRoom.has(k)) byRoom.set(k, []);
  byRoom.get(k).push(i);
}
const rooms = [...d.rooms].sort((a, b) => b.room_weight - a.room_weight || a.name.localeCompare(b.name));
const roomNames = Object.fromEntries(d.rooms.map((r) => [r.key, r.name]));

// Everything that can be pinned: fixed equipment, and storage locations,
// which are positions in the same plan space rather than a separate
// scheme that has to be kept in step.
const pinnable = [
  ...(d.assets ?? []).map((a) => ({ ...a, _sort: 'Equipment' })),
  ...(d.storage ?? []).map((s) => ({ ...s, _sort: 'Storage' })),
];

let building = model?.composed ?? null;
let placements = building ? spreadInferred(placeAll(pinnable, building)) : [];
let unplaced = placements.filter((p) => p.state === 'unplaced' || p.state === 'foreign');
let missingRooms = building
  ? roomsNotOnPlan([...new Set(pinnable.map((t) => t.room_key).filter(Boolean))], building) : [];

const storedLevel = store.get(KEY.level);
let levelId = levels(building).some((l) => l.id === storedLevel)
  ? storedLevel : levels(building)[0]?.id ?? null;
let view = ['model', 'walk', 'survey'].includes(store.get(KEY.view)) ? store.get(KEY.view) : 'plan';

/** Re-place everything against whichever stage is on screen. A fixture's
 *  coordinates do not move, but which room contains them can: the
 *  extension puts the old kitchen inside a kitchen-diner. */
function rebind() {
  building = model?.composed ?? null;
  placements = building ? spreadInferred(placeAll(pinnable, building)) : [];
  unplaced = placements.filter((p) => p.state === 'unplaced' || p.state === 'foreign');
  missingRooms = building
    ? roomsNotOnPlan([...new Set(pinnable.map((t) => t.room_key).filter(Boolean))], building) : [];
  if (!levels(building).some((l) => l.id === levelId)) levelId = levels(building)[0]?.id ?? null;
}
rebind();

/** The control bar: what you are looking at, which version of the
 *  house, and one button for everything else. It is sticky, because
 *  scrolling down a long drawing and losing the way back to the level
 *  tabs is what made the old one tiring to use. */
function toolbar() {
  return `<div class="hv-bar">
    <p class="hv-who"><span class="hv-who__name">${escape(building.name)}</span>
      <span class="hv-who__stage">${escape(building.stage.name)}</span></p>
    ${viewTabs(view)}
    ${pickers(model)}
    ${levelRow(building, levelId, view, {
    parentStage, compare, display, levels: levels(building),
  })}
  </div>
  ${displayPanel(view, display)}`;
}

/** The register for the level on screen, numbered to match the pins. */
function registerHtml(onLevel) {
  if (!onLevel.length) return emptyState('Nothing is placed on this level yet.');
  return `<div class="table-wrap"><table class="table">
    <thead><tr><th class="num">#</th><th>Item</th><th class="num">Grid</th>
      <th>Room</th><th>Kind</th><th>Position</th></tr></thead>
    <tbody>${onLevel.map((p, i) => {
      const t = p.thing;
      const prov = provenance(t.confidence);
      return `<tr class="fp-row" data-asset-id="${escape(t.id)}">
        <td class="num">${i + 1}</td>
        <td>${escape(t.name)}</td>
        <td class="num">${escape(p.fullRef ?? '—')}</td>
        <td>${escape(roomLabel(p.room, roomNames) ?? '—')}</td>
        <td>${escape(titleCase(t.category ?? t.kind ?? t._sort))}</td>
        <td>${p.coordsFrom === 'other-building'
          ? '<span class="prov prov--unconfirmed">Room only: the recorded position is in another building</span>'
          : p.state === 'inferred'
            ? '<span class="prov prov--unconfirmed">Approximate: room centre</span>'
            : `<span class="${prov.cls}">${escape(prov.label)}</span>`}</td>
      </tr>`;
    }).join('')}</tbody>
  </table></div>`;
}

function drawingHtml() {
  const onLevel = placedOn(placements, levelId);
  const level = levelById(building, levelId);
  const walking = view === 'walk';
  const coarse = window.matchMedia?.('(pointer: coarse)').matches ?? false;
  const stage = view === 'plan'
    ? planStage(building, levelId, onLevel, {
      display,
      roomNames,
      title: `${level?.name ?? 'Plan'}: ${building.stage.name}`,
      ghost: compare ? { ...parentStage, defaults: building.defaults } : null,
    })
    : canvasStage(building, {
      view, viewpoints, viewpointId, coarse, destinations,
    });
  return `${stage}
    ${walking ? '' : legendHtml(level)}
    ${walking ? '' : `<details class="hv-more__item"${onLevel.length ? '' : ''}>
      <summary>What is on this level<span class="hv-more__count num">${onLevel.length}</span></summary>
      <div class="hv-more__body">${registerHtml(onLevel)}</div>
    </details>`}`;
}

/** The key to the drawing. Only the parts that mean something in the
 *  view on screen, and only when the layer they describe is on. */
function legendHtml(level) {
  const items = [
    '<li><span class="fp-swatch fp-swatch--existing" aria-hidden="true"></span> Wall that is there today</li>',
    '<li><span class="fp-swatch fp-swatch--new" aria-hidden="true"></span> Wall that has to be built</li>',
  ];
  if (display.markers) {
    items.push('<li><span class="fp-swatch" aria-hidden="true"></span> Recorded position</li>');
    items.push(`<li><span class="fp-swatch fp-swatch--inferred" aria-hidden="true"></span> Room known,
      position not recorded</li>`);
  }
  if (view === 'plan' && display.grid) {
    items.push(`<li>Grid squares are 1 metre. A reference is written
      <span class="num">${escape(level?.code ?? 'G')}-A1</span>: level, then column, then row.</li>`);
  }
  return `<ul class="fp-legend">${items.join('')}</ul>`;
}

function body() {
  if (!building) {
    return `<p class="notice"><span class="notice__title">The model could not be loaded</span>
      The building lives at <code>data/buildings/48-ameysford-road/</code>.</p>`;
  }
  return `
  <section class="section section--flush">
    ${toolbar()}
    ${view === 'survey' ? surveyHtml(building, { parentStage }) : drawingHtml()}
  </section>
  ${view === 'survey' ? '' : moreHtml()}`;
}

/** Everything that is not the drawing, folded away.
 *
 *  It is all still here and all still one tap from the drawing it
 *  describes - but a phone screen showed roughly one section of it at a
 *  time, so leaving eight of them open stacked five thousand pixels of
 *  table under a picture nobody had finished looking at. */
function moreHtml() {
  const sections = [];

  sections.push(['About this model', null, `
    ${confidenceBanner(confidenceSummary(d))}
    <p class="lede">No offer has been accepted and no survey has been done. Every dimension
      here is read off the agent's floor plan, a design study or the listing photograph, or
      derived from them, so none of it is confirmed and nothing measured here should size a
      real job or order a real material. The Survey view shows exactly where the model and
      those documents disagree.</p>
    ${building.assumptions?.length ? `<div class="table-wrap"><table class="table">
      <thead><tr><th>Severity</th><th>Assumption</th></tr></thead>
      <tbody>${building.assumptions.map((a) => `<tr>
        <td>${escape(titleCase(a.severity))}</td><td>${escape(a.note)}</td>
      </tr>`).join('')}</tbody>
    </table></div>` : ''}`]);

  if (building.variant?.changes?.length) {
    sections.push(['What this arrangement changes', building.variant.changes.length, `
      <p class="lede">A variant is a copy with things moved, and what moved is written
        down rather than remembered.</p>
      <ul class="fp-list">${building.variant.changes.map((c) => `<li>${escape(c)}</li>`).join('')}</ul>`]);
  }

  if (unplaced.length) {
    sections.push(['Not on the plan', unplaced.length, `
      <p class="lede">The equipment register belongs to the household, not to this
        building, and its coordinates were recorded against whichever building was
        modelled at the time. Where they fall outside this one they are not positions
        here, so nothing is drawn for them and no grid reference is computed.</p>
      <div class="table-wrap"><table class="table">
        <thead><tr><th>Item</th><th>Room</th><th>Why</th></tr></thead>
        <tbody>${unplaced.map((p) => `<tr>
          <td>${escape(p.thing.name)}</td>
          <td>${escape(roomNames[p.thing.room_key] ?? '\u2014')}</td>
          <td>${p.state === 'foreign'
    ? `Recorded at ${Number(p.thing.plan_x_m).toFixed(1)}, ${
      Number(p.thing.plan_y_m).toFixed(1)}m, which is outside this building`
    : missingRooms.includes(p.thing.room_key)
      ? 'That room has no footprint in this version'
      : 'No room recorded'}</td>
        </tr>`).join('')}</tbody>
      </table></div>`]);
  }

  sections.push(['Rooms', rooms.length, `
    <p class="lede">Room weight is how much a room matters right now, on a scale of 1 to 5.
      It is one of the three inputs to every item's priority, so changing it re-sorts the
      whole roadmap.</p>
    <div class="card-grid">${rooms.map((r) => {
    const items = byRoom.get(r.name) ?? [];
    const cost = items.reduce((sum, i) => sum + (i.cost_expected ?? 0), 0);
    const onPlan = (building.rooms ?? []).some((pr) => pr.roomKey === r.key);
    return `<article class="card">
        <div class="card__head">
          <h3 class="card__title">${escape(r.name)}</h3>
          <span class="chip chip--accent">weight ${r.room_weight}/5</span>
        </div>
        <div class="card__meta">
          <span class="chip">${escape(titleCase(r.room_type))}</span>
          <span class="chip">${items.length} open item${items.length === 1 ? '' : 's'}</span>
          ${onPlan ? '' : '<span class="chip">Not in this version</span>'}
        </div>
        <p class="card__body">Estimated spend in this room:
          <span class="num value--provisional">${escape(money(cost))}</span></p>
      </article>`;
  }).join('')}</div>`]);

  sections.push(['Storage', d.storage?.length ?? 0, d.storage?.length
    ? `<div class="table-wrap"><table class="table">
      <thead><tr><th>Location</th><th>Kind</th><th>Room</th><th>Label</th><th>Contents</th></tr></thead>
      <tbody>${d.storage.map((st) => {
    const contents = (d.inventory ?? []).filter((v) => v.storage === st.name);
    return `<tr>
          <td>${escape(st.name)}</td>
          <td>${escape(titleCase(st.kind))}</td>
          <td>${escape(roomNames[st.room_key] ?? '\u2014')}</td>
          <td class="num">${escape(st.label_code ?? '\u2014')}</td>
          <td>${contents.length ? contents.map((c) => escape(c.name)).join(', ') : '\u2014'}</td>
        </tr>`;
  }).join('')}</tbody>
    </table></div>` : emptyState('No storage locations recorded.')]);

  sections.push(['Equipment', d.assets?.length ?? 0, d.assets?.length
    ? `<div class="table-wrap"><table class="table">
      <thead><tr><th>Item</th><th>Category</th><th>Room</th><th class="num">Grid</th>
        <th>Status</th><th>Record</th></tr></thead>
      <tbody>${d.assets.map((a) => {
    const prov = provenance(a.confidence);
    const at = placements.find((q) => q.thing.id === a.id);
    return `<tr>
          <td>${escape(a.name)}</td>
          <td>${escape(titleCase(a.category))}</td>
          <td>${escape(roomLabel(at?.room, roomNames) ?? a.room_name ?? '\u2014')}</td>
          <td class="num">${escape(at?.fullRef ?? '\u2014')}</td>
          <td>${escape(titleCase(a.status))}</td>
          <td><span class="${prov.cls}">${escape(prov.label)}</span></td>
        </tr>`;
  }).join('')}</tbody>
    </table></div>` : emptyState('No equipment recorded.')]);

  return `<div class="hv-more">${sections.map(([name, count, html]) => `
    <details class="hv-more__item">
      <summary>${escape(name)}${count == null ? '' : `<span class="hv-more__count num">${count}</span>`}</summary>
      <div class="hv-more__body">${html}</div>
    </details>`).join('')}</div>`;
}

// The 3D viewer is torn down and rebuilt with the page rather than
// being kept alive behind a hidden canvas: a WebGL context running
// invisibly costs the same as a visible one.
let planner = null;
// Survives a repaint so switching floors does not also snap the camera
// back to its opening angle.
let cameraState = null;
let viewpoints = [];
let viewpointId = 'front';

/** Turn the compass needle and say the bearing in words. Written
 *  straight to the DOM rather than through a repaint: it changes on
 *  every animation frame. */
function showHeading({ yaw, name }) {
  const needle = document.querySelector('[data-compass-needle]');
  const word = document.querySelector('[data-compass-word]');
  if (needle) needle.setAttribute('transform', `rotate(${(-yaw * 180) / Math.PI})`);
  if (word) word.textContent = `Facing ${name}`;
}

/** The touch stick follows the thumb, positioned entirely through custom
 *  properties so the stylesheet keeps every measurement. */
function showStick({ active, x, y, dx = 0, dy = 0 }) {
  const el = document.querySelector('[data-stick]');
  if (!el) return;
  el.classList.toggle('is-active', !!active);
  if (x !== undefined) {
    el.style.setProperty('--stick-x', `${x}px`);
    el.style.setProperty('--stick-y', `${y}px`);
  }
  el.style.setProperty('--knob-x', `${dx}px`);
  el.style.setProperty('--knob-y', `${dy}px`);
}

/**
 * Bring up the 3D view, in whichever mode was asked for.
 *
 * three.js is 670KB, so it is imported only when the reader actually
 * asks for it - a visitor who only wants the floor plan never downloads
 * it. Any failure degrades to a message and leaves the floor plan, which
 * is the view that matters, completely unaffected.
 */
async function mountModel() {
  const canvas = document.getElementById('fp-canvas');
  if (!canvas || !building) return;
  try {
    const mod = await import('../core/planner.js');
    viewpoints = mod.VIEWPOINTS;
    planner = new mod.Planner(canvas);
    planner.onHeading = showHeading;
    planner.onStick = showStick;
    planner.setModel(building, display.markers ? placements : [], cameraState, {
      glazing: display.glazing,
      doorLeaves: display.doorLeaves,
    });
    planner.showLevel(levelId);
    planner.showRoof(display.roof);
    planner.showFurniture(display.furniture);
    planner.showCeilings(display.ceilings);
    planner.showPlot(display.plot);
    // The equipment pins are billboard labels sized to be read from
    // outside the house. At eye height in a 3.3m room they cover the
    // room, so the walkthrough never shows them - the plan and the 3D
    // view both carry them, and that is where they are legible.
    planner.showMarkers(display.markers && view !== 'walk');
    planner.setMode(view === 'walk' ? 'walk' : 'orbit');
    if (view === 'walk') {
      destinations = planner.walkDestinations();
      paintWalkControls();
    }
    // Where the walker is, in plan metres. The front-end gate holds a
    // key down and checks this moved: a walkthrough that renders but
    // does not walk looks exactly like a still picture, and only a
    // position read back from the running viewer can tell them apart.
    window.__hhWalkProbe = () => (planner ? planner.walkPlan() : null);
    // The whole viewer, for the front-end gate and for driving it from a
    // console. Read-only as far as the page is concerned.
    window.__hhPlanner = planner;
    if (view === 'model' && !cameraState) planner.viewpoint(viewpointId);
    planner.start();
    // The viewpoint chips are rendered before the module loads, so they
    // are filled in once it has.
    if (view === 'model') paintViewpoints();
  } catch {
    planner = null;
    const note = document.getElementById('fp-note');
    if (note) {
      note.textContent = 'The 3D view could not start in this browser, '
        + 'so the floor plan carries the same positions.';
    }
    canvas.hidden = true;
  }
}

/** The walk picker is rendered before the module that knows the places
 *  has loaded, so it is filled in once it has. */
function paintWalkControls() {
  const host = document.querySelector('.hv-walkbar');
  if (!host || !destinations.length) return;
  host.outerHTML = walkControls(destinations);
}

function paintViewpoints() {
  const host = document.querySelector('.hv-views');
  if (!host || !viewpoints.length) return;
  host.innerHTML = viewpoints.map((v) => `<button type="button"
    class="hv-view${v.id === viewpointId ? ' is-on' : ''}"
    data-viewpoint="${escape(v.id)}" aria-pressed="${v.id === viewpointId}">${escape(v.name)}</button>`).join('');
}

function paint() {
  if (planner) {
    cameraState = planner.cameraState();
    planner.dispose();
    planner = null;
  }
  render('[data-page-root]', body());
  if (view === 'model' || view === 'walk') mountModel();
}
paint();

async function reselect(stageId, variantId) {
  const next = await loadComposed(stageId, variantId);
  if (!next) return;
  model = next;
  parentStage = model.entry.derivedFrom ? await loadStageOnly(model.entry.derivedFrom) : null;
  if (!parentStage) compare = false;
  store.set(KEY.stage, model.entry.id);
  store.set(KEY.variant, model.variantEntry?.id ?? '');
  rebind();
  paint();
}

document.addEventListener('change', (e) => {
  const sel = e.target.closest('[data-select]');
  if (sel) {
    if (sel.dataset.select === 'stage') reselect(sel.value, null);
    else reselect(model?.entry.id, sel.value);
    return;
  }
  // A layer switch changes the drawing without rebuilding the page,
  // where the viewer can do it live - so toggling the roof in the
  // walkthrough does not put you back at the front door.
  const jump = e.target.closest('[data-goto]');
  if (jump) {
    if (jump.value && planner?.goTo(jump.value)) jump.blur();
    jump.value = '';
    return;
  }
  const layer = e.target.closest('[data-layer]');
  if (!layer) return;
  const id = layer.dataset.layer;
  display[id] = layer.checked;
  saveDisplay(display);
  applyLayer(id);
});

/**
 * Apply one layer, without repainting the page.
 *
 * A full repaint would close the panel you are standing in, lose the
 * camera and, in the walkthrough, put you back at the front door - so
 * switching the roof off to see into a room would walk you out of it.
 * The 3D view changes most layers in place; the plan is a string, so
 * only the drawing is redrawn.
 */
function applyLayer(id) {
  const liveIn3d = {
    roof: 'showRoof',
    furniture: 'showFurniture',
    markers: 'showMarkers',
    ceilings: 'showCeilings',
    plot: 'showPlot',
  };
  if (view === 'plan' && (id === 'plot' || !liveIn3d[id])) {
    redrawPlan();
  } else if (planner && liveIn3d[id]) {
    planner[liveIn3d[id]](display[id] && !(id === 'markers' && view === 'walk'));
  } else if (planner && (id === 'glazing' || id === 'doorLeaves')) {
    // Glass and door leaves are built into the wall meshes, so these two
    // need the model rebuilding - but the camera is handed back in, so
    // the view holds and the walkthrough stays where it was standing.
    const at = planner.cameraState();
    planner.setModel(building, display.markers ? placements : [], at, {
      glazing: display.glazing,
      doorLeaves: display.doorLeaves,
    });
    planner.showLevel(levelId);
    planner.showRoof(display.roof);
    planner.showFurniture(display.furniture);
    planner.showMarkers(display.markers && view !== 'walk');
    planner.showCeilings(display.ceilings);
    planner.showPlot(display.plot);
  } else if (view === 'plan') {
    redrawPlan();
  } else {
    paint();
    return;
  }
  updateDisplayCount();
}

/** Redraw the floor plan in place, leaving the toolbar and the panel
 *  exactly where they are. */
function redrawPlan() {
  const host = document.querySelector('.hv-stage--plan');
  if (!host) { paint(); return; }
  const level = levelById(building, levelId);
  host.outerHTML = planStage(building, levelId, placedOn(placements, levelId), {
    display,
    roomNames,
    title: `${level?.name ?? 'Plan'}: ${building.stage.name}`,
    ghost: compare ? { ...parentStage, defaults: building.defaults } : null,
  });
  const legend = document.querySelector('.fp-legend');
  if (legend) legend.outerHTML = legendHtml(level);
}

/** Keep the count on the Display button honest without a repaint. */
function updateDisplayCount() {
  const btn = document.querySelector('[data-display-open]');
  if (!btn) return;
  const hidden = layersFor(view).filter((l) => !display[l.id]).length;
  btn.innerHTML = `Display${hidden ? `<span class="hv-ghost__count num">${hidden}</span>` : ''}`;
}

// Delegated from the document: paint() replaces the elements these live
// in, so a listener bound to one would survive exactly one repaint.
document.addEventListener('click', (e) => {
  const vw = e.target.closest('[data-view]');
  if (vw) {
    const was = view;
    view = vw.dataset.view;
    store.set(KEY.view, view);
    // Leaving the model forgets the angle: coming back later should
    // frame the house, not resume a view the reader has forgotten.
    if ((was === 'model' || was === 'walk') && view !== 'model' && view !== 'walk') cameraState = null;
    // Walking and orbiting do not share a camera, so neither inherits
    // the other's.
    if (was !== view && (was === 'walk' || view === 'walk')) cameraState = null;
    paint();
    return;
  }
  const lv = e.target.closest('[data-level-id]');
  if (lv) {
    levelId = lv.dataset.levelId;
    store.set(KEY.level, levelId);
    if (planner) {
      planner.showLevel(levelId);
      // Reframe: with one floor showing, the box worth filling the view
      // with is that floor, not the whole house.
      if (view === 'model') planner.viewpoint(viewpointId);
      updateDisplayCount();
    } else paint();
    if (view === 'plan') paint();
    return;
  }
  const vp = e.target.closest('[data-viewpoint]');
  if (vp) {
    viewpointId = vp.dataset.viewpoint;
    planner?.viewpoint(viewpointId);
    paintViewpoints();
    return;
  }
  const open = e.target.closest('[data-display-open]');
  if (open) {
    const panel = document.getElementById('hv-display');
    if (!panel) return;
    panel.hidden = !panel.hidden;
    open.setAttribute('aria-expanded', String(!panel.hidden));
    return;
  }
  const all = e.target.closest('[data-layer-all]');
  if (all) {
    const on = all.dataset.layerAll === 'on';
    for (const l of layersFor(view)) display[l.id] = on;
    saveDisplay(display);
    paint();
    const panel = document.getElementById('hv-display');
    if (panel) panel.hidden = false;
    document.querySelector('[data-display-open]')?.setAttribute('aria-expanded', 'true');
    return;
  }
  const cmp = e.target.closest('[data-compare]');
  if (cmp) { compare = !compare; paint(); return; }
  // A pin and its register row light up together, so a number on the
  // drawing can be read off the table without counting.
  const hit = e.target.closest('[data-asset-id]');
  const id = hit?.dataset.assetId ?? null;
  for (const el of document.querySelectorAll('.fp-pin, .fp-row')) {
    el.classList.toggle('is-on', !!id && el.dataset.assetId === id);
  }
});

document.addEventListener('keydown', (e) => {
  if ((e.key === 'Enter' || e.key === ' ') && e.target.matches?.('.fp-pin')) {
    e.preventDefault();
    e.target.click();
  }
});
