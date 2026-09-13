// Backlog. Every open row, ranked, with filters that narrow rather than
// navigate - the whole list stays one page.
import { mountShell, render, confidenceBanner } from '../core/shell.js';
import { load, openItems, confidenceSummary } from '../core/store.js';
import { itemDetail, itemChips } from '../core/page.js';
import { money, duration, provenance, titleCase, escape } from '../core/format.js';

mountShell('backlog.html');

const d = await load();
const all = openItems(d).sort((a, b) => a.priority - b.priority);

const rooms = [...new Set(all.map((i) => i.room_name).filter(Boolean))].sort();
const kinds = [...new Set(all.map((i) => i.kind).filter(Boolean))].sort();

function rowsHtml(list) {
  if (!list.length) return `<tr><td colspan="5">Nothing matches those filters.</td></tr>`;
  return list.map((i) => {
    const prov = provenance(i.cost_confidence);
    return `<tr>
      <td class="num">${i.priority}</td>
      <td>
        <strong>${escape(i.title)}</strong>
        <div class="card__meta">${itemChips(i)}</div>
        ${itemDetail(i)}
      </td>
      <td class="num ${prov.valueCls}">${escape(money(i.cost_expected ?? i.cost_best))}</td>
      <td class="num">${escape(duration(i.duration_min_minutes, i.duration_max_minutes))}</td>
      <td>${escape(titleCase(i.horizon))}</td>
    </tr>`;
  }).join('');
}

render('[data-page-root]', `
  ${confidenceBanner(confidenceSummary(d))}
  <form class="section" id="filters" aria-label="Filter the backlog">
    <fieldset role="group" style="border:0;padding:0;margin:0 0 var(--space-3)">
      <legend class="visually-hidden">Filters</legend>
      <label for="f-room">Room</label>
      <select id="f-room" name="room">
        <option value="">All rooms</option>
        ${rooms.map((r) => `<option>${escape(r)}</option>`).join('')}
      </select>
      <label for="f-kind">Kind</label>
      <select id="f-kind" name="kind">
        <option value="">All kinds</option>
        ${kinds.map((k) => `<option value="${escape(k)}">${escape(titleCase(k))}</option>`).join('')}
      </select>
    </fieldset>
    <p class="lede" id="count" role="status">${all.length} items.</p>
  </form>
  <div class="table-wrap">
    <table class="table">
      <thead><tr><th>#</th><th>Item</th><th class="num">Cost</th><th class="num">Time</th><th>Band</th></tr></thead>
      <tbody id="rows">${rowsHtml(all)}</tbody>
    </table>
  </div>
`);

const form = document.getElementById('filters');
form.addEventListener('change', () => {
  const room = form.room.value;
  const kind = form.kind.value;
  const list = all.filter((i) => (!room || i.room_name === room) && (!kind || i.kind === kind));
  document.getElementById('rows').innerHTML = rowsHtml(list);
  document.getElementById('count').textContent = `${list.length} item${list.length === 1 ? '' : 's'}.`;
});
