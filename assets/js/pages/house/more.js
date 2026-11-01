// house/more.js - everything on the House page that is not the drawing,
// folded away. Moved out of pages/house.js (which had passed 400 lines)
// unchanged except that it takes its inputs as one object rather than
// reading the page module's variables.
import { confidenceBanner } from '../../core/shell.js';
import { confidenceSummary } from '../../engine/selectors.js';
import { emptyState } from '../../core/page.js';
import { money, provenance, titleCase, escape } from '../../core/format.js';
import { roomLabel } from '../../engine/floorplan.js';
import { locationHtml } from './location.js';

/** Everything that is not the drawing, folded away.
 *
 *  It is all still here and all still one tap from the drawing it
 *  describes - but a phone screen showed roughly one section of it at a
 *  time, so leaving eight of them open stacked five thousand pixels of
 *  table under a picture nobody had finished looking at. */
export function moreHtml({
  d, building, unplaced, missingRooms, rooms, byRoom, roomNames, placements,
}) {
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

  if (building.location) sections.push(['Where it is', null, locationHtml(building.location)]);

  sections.push(['Rooms', rooms.length, `
    <p class="lede">Room weight is how much a room matters right now, on a scale of 1 to 5.
      It is one of the three inputs to every item's priority, so changing it re-sorts the
      whole roadmap.</p>
    <div class="card-grid">${rooms.map((r) => {
    const items = byRoom.get(r.name) ?? [];
    const cost = items.reduce((sum, i) => sum + (i.cost_expected ?? 0), 0);
    // A room row is keyed by the geometry's room id (tools/rooms-sql.mjs)
    // or, for older rows, by the shared roomKey; either puts it on the plan.
    const onPlan = (building.rooms ?? []).some((pr) => pr.id === r.key || pr.roomKey === r.key);
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

