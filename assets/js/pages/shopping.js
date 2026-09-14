// Shopping. The acquisitions list as trips, with what each run costs.
//
// This is the same rows as the Backlog and the Roadmap - purchases in
// work_items - read as a shopping list rather than as a plan, which is
// the point of one table with many projections.
//
// Nothing on this page is confirmed yet, and it says so rather than
// presenting a drafted total as a budget.
import { requireAuth } from '../core/auth.js';
import { mountShell, render, confidenceBanner } from '../core/shell.js';
import { load, confidenceSummary } from '../core/store.js';
import { emptyState } from '../core/page.js';
import { money, preciseMoney, provenance, titleCase, escape } from '../core/format.js';
import {
  TRIP_AXES, purchases, trips, totals, funding, readyToBuy, nextUp,
  benchmarks, estimateCheck, targetCost,
} from '../engine/shopping.js';

const user = await requireAuth();
if (!user) throw new Error('redirecting to login');
mountShell('shopping.html', { user });

const d = await load();
const refs = d.price_references ?? [];
const list = purchases(d.items ?? []);
const grand = totals(list);
const ready = readyToBuy(list);

const AXIS_KEY = 'hh-shop-axis';
const store = {
  get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
};
const stored = store.get(AXIS_KEY);
let axis = TRIP_AXES.some((a) => a.key === stored) ? stored : 'room';

const tabs = () => TRIP_AXES.map((a) =>
  `<button type="button" class="seg${a.key === axis ? ' is-on' : ''}"
    data-axis="${a.key}" aria-pressed="${a.key === axis}">${escape(a.label)}</button>`).join('');

/** One line of a trip. The shortfall is the number that decides whether
 *  the run happens, so it leads; the estimate sits behind it carrying
 *  its own provenance. */
function rowFor(i) {
  const f = funding(i);
  const prov = provenance(i.cost_confidence);
  const check = estimateCheck(i, refs);
  const marks = benchmarks(i, refs);
  const flag = check && check.verdict !== 'within'
    ? `<p class="shop-flag">Estimate sits ${escape(check.verdict)} the benchmark range
       (${escape(money(check.low))} to ${escape(money(check.high))}).</p>` : '';
  const marksHtml = marks.length
    ? `<ul class="shop-marks">${marks.map((r) => `<li>
        <span>${escape(titleCase(r.channel || 'unknown'))}</span>
        <span class="num">${escape(money(r.price_typical ?? r.price_low))}</span>
        <span class="shop-mark-age">${r.stale ? 'Stale' : `${r.ageDays}d old`}</span>
      </li>`).join('')}</ul>` : '';
  return `<tr>
    <td>${escape(i.title)}${flag}${marksHtml}</td>
    <td class="num ${prov.valueCls}">${escape(money(targetCost(i)))}</td>
    <td class="num">${escape(preciseMoney(f.saved))}</td>
    <td class="num">${f.funded ? 'Ready' : escape(money(f.shortfall))}</td>
    <td><span class="${prov.cls}">${escape(prov.label)}</span></td>
  </tr>`;
}

function tripHtml(g) {
  const t = g.totals;
  return `<section class="section shop-trip">
    <div class="section__head">
      <h3>${escape(titleCase(String(g.key)))}</h3>
      <span class="num value--provisional">${escape(money(t.expected))}</span>
    </div>
    <p class="lede">${t.count} item${t.count === 1 ? '' : 's'}${
      t.uncosted ? `, ${t.uncosted} with no price yet` : ''} ·
      range ${escape(money(t.low))} to ${escape(money(t.high))} ·
      ${escape(preciseMoney(t.saved))} saved</p>
    <div class="table-wrap"><table class="table">
      <thead><tr><th>Item</th><th class="num">Estimate</th><th class="num">Saved</th>
        <th class="num">Still needed</th><th>Confidence</th></tr></thead>
      <tbody>${g.items.map(rowFor).join('')}</tbody>
    </table></div>
  </section>`;
}

function body() {
  const groups = trips(list, axis);
  return `
  ${confidenceBanner(confidenceSummary(d))}

  <section class="verdict">
    <span class="verdict__label">Still to buy</span>
    <span class="verdict__value verdict__value--num value--provisional">${escape(money(grand.shortfall))}</span>
    <p class="verdict__note">${grand.count} item${grand.count === 1 ? '' : 's'} on the list,
      ${escape(money(grand.expected))} of estimates against ${escape(preciseMoney(grand.saved))} saved.
      ${grand.trusted
        ? ''
        : 'Not one price on this list has been confirmed, so this is the size of the job, not a budget.'}</p>
  </section>

  <section class="section">
    <div class="section__head"><h2>Ready to buy</h2></div>
    ${ready.length
      ? `<ul class="shop-ready">${ready.map((i) => `<li>
          <span>${escape(i.title)}</span>
          <span class="num value--provisional">${escape(money(targetCost(i)))}</span>
        </li>`).join('')}</ul>`
      : emptyState('Nothing is fully funded yet. Items become ready as deposits are allocated '
        + 'to them, which needs a confirmed monthly contribution first.')}
  </section>

  <section class="section">
    <div class="section__head"><h2>Next up</h2></div>
    <p class="lede">The highest-priority purchases, whatever their price. This is what
      the pot is saving toward - not what is affordable today.</p>
    ${list.length ? `<div class="table-wrap"><table class="table">
      <thead><tr><th>#</th><th>Item</th><th>Room</th><th class="num">Estimate</th><th class="num">Still needed</th></tr></thead>
      <tbody>${nextUp(list).map((i) => {
        const f = funding(i);
        return `<tr>
          <td class="num">${i.priority ?? ''}</td>
          <td>${escape(i.title)}</td>
          <td>${escape(i.room_name ?? '—')}</td>
          <td class="num value--provisional">${escape(money(targetCost(i)))}</td>
          <td class="num">${f.funded ? 'Ready' : escape(money(f.shortfall))}</td>
        </tr>`;
      }).join('')}</tbody>
    </table></div>` : emptyState('No purchases on the list.')}
  </section>

  <section class="section">
    <div class="section__head"><h2>By trip</h2></div>
    <p class="lede">One run, one list. Group the same items by the thing that decides
      when you actually go.</p>
    <div class="toolbar__row" role="group" aria-label="Group trips by">${tabs()}</div>
    ${groups.length ? groups.map(tripHtml).join('') : emptyState('Nothing to group.')}
  </section>

  ${refs.length ? '' : `<p class="notice"><span class="notice__title">No benchmark prices yet</span>
    Every estimate here was drafted rather than researched. Price references are rows in
    <code>price_references</code>, each with the channel it came from and the date it was
    captured, so a stale benchmark can never read as a current quote.</p>`}
`;
}

function paint() { render('[data-page-root]', body()); }
paint();

// Delegated from the document: paint() replaces the element the tabs
// live in, so a listener bound to it would survive one repaint.
document.addEventListener('click', (e) => {
  const t = e.target.closest('[data-axis]');
  if (!t) return;
  axis = t.dataset.axis;
  store.set(AXIS_KEY, axis);
  paint();
});
