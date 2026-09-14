// House. The floor plan, what sits where on it, and the equipment
// register that the plan's grid references resolve against.
//
// The grid reference is the join. A fixture carries metric coordinates;
// the reference shown next to it in the register is COMPUTED from those
// coordinates, and so is the square it sits in on the plan and the
// marker in the 3D model. One position, three readings - never three
// places to keep in step.
import { requireAuth } from '../core/auth.js';
import { mountShell, render, confidenceBanner } from '../core/shell.js';
import { load, openItems, confidenceSummary } from '../core/store.js';
import { emptyState } from '../core/page.js';
import { money, provenance, titleCase, escape } from '../core/format.js';
import {
  levels, levelById, placeAll, placedOn, roomLabel, roomsNotOnPlan, spreadInferred,
} from '../engine/floorplan.js';
import { levelSvg } from '../engine/floorplan-svg.js';

const user = await requireAuth();
if (!user) throw new Error('redirecting to login');
mountShell('house.html', { user });

const d = await load();

// The building geometry is repo content, not household data: it is a
// placeholder that gets replaced wholesale when a real house is bought,
// and there is nothing private in it.
const building = await fetch(new URL('../../../data/buildings/placeholder.json', import.meta.url))
  .then((r) => (r.ok ? r.json() : null))
  .catch(() => null);

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
const placements = building ? spreadInferred(placeAll(pinnable, building)) : [];
const unplaced = placements.filter((p) => p.state === 'unplaced');
const missingRooms = building
  ? roomsNotOnPlan([...new Set(pinnable.map((t) => t.room_key).filter(Boolean))], building) : [];

const LEVEL_KEY = 'hh-house-level';
const store = {
  get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
};
const allLevels = levels(building);
const stored = store.get(LEVEL_KEY);
let levelId = allLevels.some((l) => l.id === stored) ? stored : allLevels[0]?.id ?? null;

const tabs = () => allLevels.map((l) =>
  `<button type="button" class="seg${l.id === levelId ? ' is-on' : ''}"
    data-level-id="${escape(l.id)}" aria-pressed="${l.id === levelId}">${escape(l.name)}</button>`).join('');

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
        <td>${p.state === 'inferred'
          ? '<span class="prov prov--unconfirmed">Approximate: room centre</span>'
          : `<span class="${prov.cls}">${escape(prov.label)}</span>`}</td>
      </tr>`;
    }).join('')}</tbody>
  </table></div>`;
}

const VIEW_KEY = 'hh-house-view';
let view = store.get(VIEW_KEY) === 'model' ? 'model' : 'plan';

const viewTabs = () => [['plan', 'Floor plan'], ['model', '3D model']].map(([k, label]) =>
  `<button type="button" class="seg${k === view ? ' is-on' : ''}"
    data-view="${k}" aria-pressed="${k === view}">${escape(label)}</button>`).join('');

function planHtml() {
  if (!building) {
    return `<p class="notice"><span class="notice__title">The plan could not be loaded</span>
      The building model lives at <code>data/buildings/placeholder.json</code>.</p>`;
  }
  const onLevel = placedOn(placements, levelId);
  const level = levelById(building, levelId);
  return `
    <div class="toolbar__row" role="group" aria-label="View">${viewTabs()}</div>
    <div class="toolbar__row" role="group" aria-label="Level">${tabs()}</div>
    ${view === 'model' ? `<div class="fp-stage">
      <canvas id="fp-canvas" aria-label="3D model of the placeholder house"></canvas>
      <p class="fp-stage__note" id="fp-note">Drag to orbit, scroll to zoom. Markers sit at the
        same coordinates as the pins on the floor plan.</p>
    </div>` : levelSvg(building, levelId, onLevel, { roomNames, title: `${level?.name ?? 'Plan'} floor plan` })}
    <ul class="fp-legend">
      <li><span class="fp-swatch" aria-hidden="true"></span> Recorded position${
  view === 'model' ? ' (solid marker)' : ''}</li>
      <li><span class="fp-swatch fp-swatch--inferred" aria-hidden="true"></span> Room known,
        position not recorded${view === 'model' ? ' (floating marker)' : ''}</li>
      <li>Grid squares are 1 metre. A reference is written
        <span class="num">${escape(level?.code ?? 'G')}-A1</span>: level, then column, then row.</li>
    </ul>
    <h3>What is on this level</h3>
    ${registerHtml(onLevel)}`;
}

function body() {
  return `
  ${confidenceBanner(confidenceSummary(d))}

  <div class="notice notice--warn" role="status">
    <span class="notice__title">This is a placeholder house, not the house</span>
    No property has been bought, so the plan below is a real measured building
    standing in for one. Every dimension in it is genuine and none of it is yours:
    it exists so the grid, the register and the 3D model have something true to
    draw against. It is replaced wholesale on purchase, and nothing measured here
    should size a real job or order a real material.
  </div>

  <section class="section">
    <div class="section__head"><h2>Floor plan</h2></div>
    <p class="lede">Positions are metres in the plan's own space. The grid reference
      beside each item is computed from those metres every time it is shown, never
      stored — so the plan, this register and the 3D model cannot drift apart.</p>
    ${planHtml()}
  </section>

  ${unplaced.length ? `<section class="section">
    <div class="section__head"><h2>Not on the plan</h2><span class="band__count num">${unplaced.length}</span></div>
    <p class="lede">These have no position, either because none was recorded or because
      the room they are in does not exist in this building. They keep their room and
      get a grid reference when a real property is bound.</p>
    <div class="table-wrap"><table class="table">
      <thead><tr><th>Item</th><th>Room</th><th>Why</th></tr></thead>
      <tbody>${unplaced.map((p) => `<tr>
        <td>${escape(p.thing.name)}</td>
        <td>${escape(roomNames[p.thing.room_key] ?? '—')}</td>
        <td>${missingRooms.includes(p.thing.room_key)
          ? 'That room has no footprint in this plan'
          : 'No room recorded'}</td>
      </tr>`).join('')}</tbody>
    </table></div>
  </section>` : ''}

  <section class="section">
    <div class="section__head"><h2>Rooms</h2><span class="band__count num">${rooms.length}</span></div>
    <p class="lede">Room weight is how much a room matters right now, on a scale of
      1 to 5. It is one of the three inputs to every item's priority, so changing it
      re-sorts the whole roadmap. A room marked "not in this plan" is a template room
      the placeholder building does not have.</p>
    <div class="card-grid">
      ${rooms.map((r) => {
        const items = byRoom.get(r.name) ?? [];
        const cost = items.reduce((s, i) => s + (i.cost_expected ?? 0), 0);
        const onPlan = (building?.rooms ?? []).some((pr) => pr.roomKey === r.key);
        return `<article class="card">
          <div class="card__head">
            <h3 class="card__title">${escape(r.name)}</h3>
            <span class="chip chip--accent">weight ${r.room_weight}/5</span>
          </div>
          <div class="card__meta">
            <span class="chip">${escape(titleCase(r.room_type))}</span>
            <span class="chip">${items.length} open item${items.length === 1 ? '' : 's'}</span>
            ${onPlan ? '' : '<span class="chip">Not in this plan</span>'}
          </div>
          <p class="card__body">Estimated spend in this room:
            <span class="num value--provisional">${escape(money(cost))}</span></p>
        </article>`;
      }).join('')}
    </div>
  </section>

  <section class="section">
    <div class="section__head"><h2>Storage</h2></div>
    <p class="lede">Locations are points in the same metric plan space the rooms use,
      so "where is it" resolves against the floor plan rather than a separate grid
      that has to be kept in step.</p>
    ${d.storage?.length ? `<div class="table-wrap"><table class="table">
      <thead><tr><th>Location</th><th>Kind</th><th>Room</th><th>Label</th><th>Contents</th></tr></thead>
      <tbody>${d.storage.map((s) => {
        const contents = (d.inventory ?? []).filter((v) => v.storage === s.name);
        return `<tr>
          <td>${escape(s.name)}</td>
          <td>${escape(titleCase(s.kind))}</td>
          <td>${escape(roomNames[s.room_key] ?? '—')}</td>
          <td class="num">${escape(s.label_code ?? '—')}</td>
          <td>${contents.length ? contents.map((c) => escape(c.name)).join(', ') : '—'}</td>
        </tr>`;
      }).join('')}</tbody>
    </table></div>` : emptyState('No storage locations recorded.')}
  </section>

  <section class="section">
    <div class="section__head"><h2>Equipment</h2></div>
    <p class="lede">Anything that can break and need fixing. Once a make and model
      are recorded, faults accumulate against the device, so the third time it does
      the same thing the fix is already written down.</p>
    ${d.assets?.length ? `<div class="table-wrap"><table class="table">
      <thead><tr><th>Item</th><th>Category</th><th>Room</th><th class="num">Grid</th><th>Status</th><th>Record</th></tr></thead>
      <tbody>${d.assets.map((a) => {
        const p = provenance(a.confidence);
        const at = placements.find((q) => q.thing.id === a.id);
        return `<tr>
          <td>${escape(a.name)}</td>
          <td>${escape(titleCase(a.category))}</td>
          <td>${escape(roomLabel(at?.room, roomNames) ?? a.room_name ?? '—')}</td>
          <td class="num">${escape(at?.fullRef ?? '—')}</td>
          <td>${escape(titleCase(a.status))}</td>
          <td><span class="${p.cls}">${escape(p.label)}</span></td>
        </tr>`;
      }).join('')}</tbody>
    </table></div>` : emptyState('No equipment recorded.')}
  </section>

  ${building?.assumptions?.length ? `<section class="section">
    <div class="section__head"><h2>What is assumed rather than measured</h2></div>
    <p class="lede">Recorded with a severity rather than left implicit, so a guess
      never reads as a survey.</p>
    <div class="table-wrap"><table class="table">
      <thead><tr><th>Severity</th><th>Assumption</th></tr></thead>
      <tbody>${building.assumptions.map((a) => `<tr>
        <td>${escape(titleCase(a.severity))}</td><td>${escape(a.note)}</td>
      </tr>`).join('')}</tbody>
    </table></div>
  </section>` : ''}
`;
}

// The 3D viewer is torn down and rebuilt with the page rather than
// being kept alive behind a hidden canvas: a WebGL context running
// invisibly costs the same as a visible one.
let planner = null;
// Survives a repaint so switching floors does not also snap the camera
// back to its opening angle.
let cameraState = null;

/**
 * Bring up the 3D view.
 *
 * three.js is 670KB, so it is imported only when the reader actually
 * asks for the model - a visitor who only wants the floor plan never
 * downloads it. Any failure (no WebGL, a blocked module) degrades to a
 * message and leaves the floor plan, which is the view that matters,
 * completely unaffected.
 */
async function mountModel() {
  const canvas = document.getElementById('fp-canvas');
  if (!canvas || !building) return;
  try {
    const { Planner } = await import('../core/planner.js');
    planner = new Planner(canvas);
    planner.setModel(building, placements, cameraState);
    planner.showLevel(levelId);
    planner.start();
  } catch (err) {
    planner = null;
    const note = document.getElementById('fp-note');
    if (note) {
      note.textContent = 'The 3D view could not start in this browser, '
        + 'so the floor plan above carries the same positions.';
    }
    canvas.hidden = true;
  }
}

function paint() {
  if (planner) {
    cameraState = planner.cameraState();
    planner.dispose();
    planner = null;
  }
  render('[data-page-root]', body());
  if (view === 'model') mountModel();
}
paint();

// Delegated from the document: paint() replaces the element the level
// tabs live in, so a listener bound to it would survive one repaint.
document.addEventListener('click', (e) => {
  const vw = e.target.closest('[data-view]');
  if (vw) {
    const was = view;
    view = vw.dataset.view;
    store.set(VIEW_KEY, view);
    // Leaving the model forgets the angle: coming back later should
    // frame the house, not resume a view the reader has forgotten.
    if (was === 'model' && view !== 'model') cameraState = null;
    paint();
    return;
  }
  const lv = e.target.closest('[data-level-id]');
  if (lv) {
    levelId = lv.dataset.levelId;
    store.set(LEVEL_KEY, levelId);
    paint();
    return;
  }
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
