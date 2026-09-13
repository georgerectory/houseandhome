// House. Rooms, what is stored where, and the equipment register.
import { mountShell, render, confidenceBanner } from '../core/shell.js';
import { load, openItems, confidenceSummary } from '../core/store.js';
import { emptyState } from '../core/page.js';
import { money, provenance, titleCase, escape } from '../core/format.js';

mountShell('house.html');

const d = await load();
const open = openItems(d);
const byRoom = new Map();
for (const i of open) {
  const k = i.room_name ?? 'Unassigned';
  if (!byRoom.has(k)) byRoom.set(k, []);
  byRoom.get(k).push(i);
}

const rooms = [...d.rooms].sort((a, b) => b.room_weight - a.room_weight || a.name.localeCompare(b.name));

render('[data-page-root]', `
  ${confidenceBanner(confidenceSummary(d))}

  <div class="notice" role="status">
    <span class="notice__title">No property is bound yet</span>
    These rooms are a template. When a house is actually bought, the real rooms
    replace them and every templated job re-scopes to their real dimensions —
    which is why the list works before the house is known.
  </div>

  <section class="section">
    <div class="section__head"><h2>Rooms</h2><span class="band__count num">${rooms.length}</span></div>
    <p class="lede">Room weight is how much a room matters right now, on a scale of
    1 to 5. It is one of the three inputs to every item's priority, so changing it
    re-sorts the whole roadmap.</p>
    <div class="card-grid">
      ${rooms.map((r) => {
        const items = byRoom.get(r.name) ?? [];
        const cost = items.reduce((s, i) => s + (i.cost_expected ?? 0), 0);
        return `<article class="card">
          <div class="card__head">
            <h3 class="card__title">${escape(r.name)}</h3>
            <span class="chip chip--accent">weight ${r.room_weight}/5</span>
          </div>
          <div class="card__meta">
            <span class="chip">${escape(titleCase(r.room_type))}</span>
            <span class="chip">${items.length} open item${items.length === 1 ? '' : 's'}</span>
          </div>
          <p class="card__body">Estimated spend in this room:
            <span class="num value--provisional">${escape(money(cost))}</span></p>
        </article>`;
      }).join('')}
    </div>
  </section>

  <section class="section">
    <div class="section__head"><h2>Storage</h2></div>
    <p class="lede">Locations are points in the same metric plan space the rooms
    use, so "where is it" resolves against the floor plan rather than a separate
    grid that has to be kept in step.</p>
    ${d.storage?.length ? `<div class="table-wrap"><table class="table">
      <thead><tr><th>Location</th><th>Kind</th><th>Room</th><th>Label</th><th>Contents</th></tr></thead>
      <tbody>${d.storage.map((s) => {
        const contents = (d.inventory ?? []).filter((v) => v.storage === s.name);
        return `<tr>
          <td>${escape(s.name)}</td>
          <td>${escape(titleCase(s.kind))}</td>
          <td>${escape(d.rooms.find((r) => r.key === s.room_key)?.name ?? '—')}</td>
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
      <thead><tr><th>Item</th><th>Category</th><th>Room</th><th>Status</th><th>Record</th></tr></thead>
      <tbody>${d.assets.map((a) => {
        const p = provenance(a.confidence);
        return `<tr>
          <td>${escape(a.name)}</td>
          <td>${escape(titleCase(a.category))}</td>
          <td>${escape(a.room_name ?? '—')}</td>
          <td>${escape(titleCase(a.status))}</td>
          <td><span class="${p.cls}">${escape(p.label)}</span></td>
        </tr>`;
      }).join('')}</tbody>
    </table></div>` : emptyState('No equipment recorded.')}
  </section>
`);
