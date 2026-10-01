// Road Ahead: Auctions. What is coming, as a list by month and, with room,
// as the months themselves; each sale's tracked lots and the step each is
// on; what lots went for against their guides; the playbook; the houses
// followed. Every house date says when it was last checked, because
// auctioneers move them. A step reported done is gone from here and from
// the Dashboard; the listing's card keeps it. Returns markup.
import { escape, money } from '../../core/format.js';
import { dayName, monthName } from '../../engine/road-ahead/page/state.js';
import {
  agenda, monthGrid, sales, resultRows, playbookByKind, daysBetween,
} from '../../engine/road-ahead/page/auctions.js';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const when = (n) => (n === 0 ? 'today' : n === 1 ? 'tomorrow' : n < 0 ? `${-n} days ago` : `in ${n} days`);
const ym = (iso) => iso.slice(0, 7).split('-').map(Number);

function lists(items, today, year) {
  const byMonth = new Map();
  for (const i of items) {
    const k = i.on.slice(0, 7);
    if (!byMonth.has(k)) byMonth.set(k, []);
    byMonth.get(k).push(i);
  }
  return [...byMonth].map(([k, rows]) => `<h4 class="rd-card__h">${escape(monthName(ym(`${k}-01`)))}</h4>
    <ol class="rd-cal__list">${rows.map((r) => `<li class="rd-cal__item">
      <time class="rd-cal__when" datetime="${escape(r.on)}">${escape(dayName(r.on, year))}<br>
        <span class="rd-quiet">${escape(when(daysBetween(today, r.on)))}</span></time>
      <span>${escape(r.what)}${r.status === 'moved' ? ' <span class="chip">moved</span>' : ''}
        ${r.notes ? `<br><span class="rd-quiet">${escape(r.notes)}</span>` : ''}
        ${r.checked ? `<br><span class="rd-quiet">Checked ${escape(dayName(r.checked, year))}</span>` : ''}</span>
    </li>`).join('')}</ol>`).join('');
}

// The month as a picture of weeks, for a reader with room. The list beside
// it says everything the grid shows, so the grid is hidden from assistive
// technology rather than read twice.
function grid(year, month, items, today) {
  const weeks = monthGrid(year, month, items);
  return `<table class="rd-cal__grid" aria-hidden="true">
    <caption>${escape(monthName([year, month]))}</caption>
    <thead><tr>${WEEKDAYS.map((d) => `<th>${d}</th>`).join('')}</tr></thead>
    <tbody>${weeks.map((w) => `<tr>${w.map((c) => (c.date ? `<td class="${c.date === today ? 'is-today' : ''}">
      <span class="rd-cal__day">${Number(c.date.slice(8))}</span>
      ${c.items.map((i) => `<span class="rd-cal__ev rd-cal__ev--${escape(i.kind)}">${escape(i.short)}</span>`).join('')}</td>`
    : '<td></td>')).join('')}</tr>`).join('')}</tbody>
  </table>`;
}

function salesHtml(list, today, year) {
  if (!list.length) return '<p class="rd-quiet">No lot is being tracked for a sale still to come.</p>';
  return list.map((s) => `<div class="rd-sale">
    <h4 class="rd-sale__title">${escape(s.house)}, ${escape(dayName(s.on, year))}
      <span class="rd-quiet">${escape(when(s.days))}</span></h4>
    <div class="table-wrap"><table class="table rd-sale__lots">
      <caption class="visually-hidden">The lots tracked for ${escape(s.house)} on ${escape(dayName(s.on))}</caption>
      <thead><tr><th scope="col">Lot</th><th scope="col">Listing</th><th scope="col">The step it is on</th><th scope="col">Due</th></tr></thead>
      <tbody>${s.lots.map((l) => `<tr>
        <td class="num">${escape(l.lot ?? '—')}</td>
        <th scope="row"><button type="button" class="rd-open" data-listing="${escape(l.code)}"><span class="rd-code">${escape(l.code)}</span>
          ${escape(l.name)}</button></th>
        <td>${l.next ? escape(l.next.label) : 'Every step done'}
          ${l.overdue ? `<br><span class="rd-overdue">${l.overdue} overdue</span>` : ''}
          ${l.done ? `<br><span class="rd-quiet">${l.done} done</span>` : ''}</td>
        <td>${l.next ? `${escape(dayName(l.next.due_on, year))}<br><span class="rd-quiet">${escape(when(daysBetween(today, l.next.due_on)))}</span>` : ''}</td>
      </tr>`).join('')}</tbody>
    </table></div>
  </div>`).join('');
}

function resultsHtml(rows, houses, year) {
  if (!rows.length) return '<p class="rd-quiet">No results recorded yet.</p>';
  const house = new Map(houses.map((h) => [h.code, h.name]));
  return `<div class="table-wrap"><table class="table rd-results">
    <caption class="visually-hidden">What lots went for against their guides</caption>
    <thead><tr><th scope="col">When</th><th scope="col">House</th><th scope="col">Lot</th><th scope="col" class="num">Guide</th>
      <th scope="col" class="num">Sold</th><th scope="col" class="num">Against the guide</th><th scope="col">What it taught</th></tr></thead>
    <tbody>${rows.map((r) => `<tr>
      <td>${escape(dayName(r.sold_on, year))}</td>
      <td>${escape(house.get(r.house_code) ?? r.house_code)}</td>
      <td>${escape([r.lot ? `Lot ${r.lot}` : null, r.property_type, r.listing_code].filter(Boolean).join(', '))}</td>
      <td class="num">${r.guide ? escape(money(r.guide)) : '—'}</td>
      <td class="num">${r.sold ? escape(money(r.sold)) : escape(r.outcome.replace('_', ' '))}</td>
      <td class="num">${r.ratio ? `${Math.round(r.ratio * 100)}%` : '—'}</td>
      <td>${escape(r.lesson ?? '')}</td>
    </tr>`).join('')}</tbody>
  </table></div>`;
}

const playbookHtml = (lines) => {
  const groups = playbookByKind(lines);
  return groups.length ? `<div class="rd-playbook">${groups.map((g) => `<div><h4 class="rd-card__h">${escape(g.label)}</h4>
    <ul class="rd-list">${g.lines.map((l) => `<li>${escape(l.body)}</li>`).join('')}</ul></div>`).join('')}</div>`
    : '<p class="rd-quiet">No playbook yet.</p>';
};

const housesHtml = (houses) => `<div class="table-wrap"><table class="table rd-houses">
  <caption class="visually-hidden">The auction houses followed</caption>
  <thead><tr><th scope="col">House</th><th scope="col">How it sells</th><th scope="col">What it covers</th>
    <th scope="col">How often</th><th scope="col">Why it is followed</th></tr></thead>
  <tbody>${houses.map((h) => `<tr>
    <th scope="row">${h.link ? `<a href="${escape(h.link)}" rel="noopener noreferrer" target="_blank">${escape(h.name)}</a>` : escape(h.name)}</th>
    <td>${escape(h.format ?? '')}</td><td>${escape(h.covers ?? '')}</td><td>${escape(h.cadence ?? '')}</td><td>${escape(h.why ?? '')}</td>
  </tr>`).join('')}</tbody>
</table></div>`;

/**
 * @param {object} data loadRoadAhead()
 * @param {string} today 'YYYY-MM-DD', London's
 */
export function auctionsHtml(data, today) {
  const year = Number(today.slice(0, 4));
  const items = agenda(data, today);
  const [y, m] = ym(today);
  const [ny, nm] = m === 12 ? [y + 1, 1] : [y, m + 1];
  return `<div class="rd-cal">
      <div class="rd-cal__lists">${items.length ? lists(items, today, year)
        : '<p class="rd-quiet">Nothing dated in the next four months.</p>'}</div>
      <div class="rd-cal__grids">${grid(y, m, items, today)}${grid(ny, nm, items, today)}</div>
    </div>
    <h3 class="rd-sub">Tracked lots</h3>
    ${salesHtml(sales(data.pipeline, today), today, year)}
    <h3 class="rd-sub">Results</h3>
    ${resultsHtml(resultRows(data.results), data.houses, year)}
    <h3 class="rd-sub">The playbook</h3>
    ${playbookHtml(data.playbook)}
    <details class="detail"><summary>The houses followed</summary>${housesHtml(data.houses)}</details>`;
}
