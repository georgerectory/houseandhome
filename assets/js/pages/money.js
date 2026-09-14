// Money. The pot, what the next deposit does, and what is due.
//
// No isolated calculators: the split shown here, the projection below it
// and the dashboard's table all come from the same allocate() call on
// the same rows, so two pages can never disagree about the same money.
import { requireAuth } from '../core/auth.js';
import { mountShell, render, confidenceBanner } from '../core/shell.js';
import { load, fundable, totalOutstanding, confidenceSummary } from '../core/store.js';
import { emptyState } from '../core/page.js';
import { money, preciseMoney, provenance, titleCase, escape } from '../core/format.js';
import { allocate, projectFunding } from '../../js/engine/allocate.js';

/** What each carried group turns into once someone has been through it.
 *  Mirrors GROUPS in tools/carry-lib.mjs, which is what validates a blob
 *  on the way in. */
const CARRIED_MEANS = {
  shopping_list: 'Purchases on the shopping list.',
  one_time_costs: 'One-off setup costs.',
  ongoing_bills: 'Bills that count toward running costs.',
  subscriptions: 'Subscriptions, with a review date.',
  expenses: 'Recorded spending against items.',
  gift_cards: 'Held against a purchase, or dismissed.',
  savings: 'Informs the pot. Never sets it.',
  investments_history: 'Reference only.',
  debts: 'Informs affordability. Never sets it.',
};

const user = await requireAuth();
if (!user) throw new Error('redirecting to login');

mountShell('money.html', { user });

const d = await load();
const queue = fundable(d);
const monthly = d.pot?.monthly_contribution ?? 0;
const opts = { decay: d.allocation_settings?.decay, floorShare: d.allocation_settings?.floor_share };
const split = allocate(queue, monthly, opts);
const projection = projectFunding(queue, monthly, opts);
const outstanding = totalOutstanding(d);
const potProv = provenance(d.pot?.contribution_confidence);

const soonest = projection.filter((p) => p.monthsToFund).sort((a, b) => a.monthsToFund - b.monthsToFund);

// The carried-over archive. Grouped for display and NEVER summed into
// anything above: these are figures from an earlier system, captured
// during a search that has since moved on, and not one of them has been
// checked. They are a prompt sheet for a review conversation.
const carried = d.carried_finance ?? [];
const carriedGroups = [...carried.reduce((m, r) => {
  const g = r.source_group ?? 'other';
  if (!m.has(g)) m.set(g, []);
  m.get(g).push(r);
  return m;
}, new Map())].sort((a, b) => b[1].length - a[1].length);

render('[data-page-root]', `
  ${confidenceBanner(confidenceSummary(d))}

  ${!potProv.trusted ? `<div class="notice notice--warn" role="status">
    <span class="notice__title">The contribution figure is not confirmed</span>
    The pot is set to ${escape(money(monthly))} a month, but that figure is
    ${escape(potProv.label.toLowerCase())}. The database refuses to run a real
    allocation against an unconfirmed contribution, so everything below is a
    projection, not a plan.
  </div>` : ''}

  <section class="verdict">
    <span class="verdict__label">Outstanding across the whole list</span>
    <span class="verdict__value verdict__value--num value--provisional">${escape(money(outstanding))}</span>
    <p class="verdict__note">${monthly > 0
      ? `At ${escape(money(monthly))} a month that clears in about ${Math.ceil(outstanding / monthly)} months,
         assuming the list stops changing — which it will not.`
      : 'Set a monthly contribution to see a timeline.'}</p>
  </section>

  <section class="section">
    <div class="section__head"><h2>Where the next deposit goes</h2></div>
    <p class="lede">Share follows priority rank, not cost. A geometric curve puts
    most of the money at the top of the list, and an equal floor share keeps every
    item moving — the bottom of the list gets very little, but never nothing.</p>
    ${split.length ? `<div class="table-wrap"><table class="table">
      <thead><tr><th>#</th><th>Item</th><th class="num">Share</th><th class="num">%</th><th class="num">Saved after</th><th class="num">Target</th></tr></thead>
      <tbody>${split.map((r) => `<tr>
        <td class="num">${r.rank}</td>
        <td>${escape(r.title)}</td>
        <td class="num">${escape(preciseMoney(r.amount))}</td>
        <td class="num">${(r.weight * 100).toFixed(2)}</td>
        <td class="num">${escape(preciseMoney(r.balanceAfter))}</td>
        <td class="num value--provisional">${escape(money(r.targetCost))}</td>
      </tr>`).join('')}</tbody>
    </table></div>` : emptyState('Nothing costed to fund yet.')}
  </section>

  <section class="section">
    <div class="section__head"><h2>What completes first</h2></div>
    <p class="lede">Cheap items near the top of the list clear early even though
    their share is small, because their target is small. That is the fast-win
    behaviour falling out of the curve rather than being a special rule.</p>
    ${soonest.length ? `<div class="table-wrap"><table class="table">
      <thead><tr><th>Item</th><th class="num">Target</th><th class="num">Months</th></tr></thead>
      <tbody>${soonest.slice(0, 15).map((p) => `<tr>
        <td>${escape(p.title)}</td>
        <td class="num value--provisional">${escape(money(p.targetCost))}</td>
        <td class="num">${p.monthsToFund}</td>
      </tr>`).join('')}</tbody>
    </table></div>` : emptyState('No projection available.')}
  </section>

  ${carried.length ? `<section class="section">
    <div class="section__head"><h2>Carried over, not yet reviewed</h2>
      <span class="band__count num">${carried.length}</span></div>
    <p class="lede">Figures brought across from the earlier system. They were captured
      during a property search that has since moved on, so items have been bought,
      prices have changed and circumstances have shifted. <strong>None of them is
      counted in anything above</strong> — not the outstanding total, not the
      allocation, not the projection. They are here so nothing is forgotten, not so
      anything is assumed.</p>
    <div class="table-wrap"><table class="table">
      <thead><tr><th>Group</th><th class="num">Lines</th><th>What it becomes once reviewed</th></tr></thead>
      <tbody>${carriedGroups.map(([g, rows]) => `<tr>
        <td>${escape(titleCase(g))}</td>
        <td class="num">${rows.length}</td>
        <td>${escape(CARRIED_MEANS[g] ?? 'Reviewed, then kept or dismissed.')}</td>
      </tr>`).join('')}</tbody>
    </table></div>
    <p class="lede">Reviewing a line is a conversation, not a form: say what is still
      real and at what amount, and it moves to a table that does count.</p>
  </section>` : ''}

  <section class="section">
    <div class="section__head"><h2>Bills</h2></div>
    ${d.bills?.length ? `<div class="table-wrap"><table class="table">
      <thead><tr><th>Bill</th><th>Category</th><th>Cadence</th><th class="num">Amount</th><th>Status</th></tr></thead>
      <tbody>${d.bills.map((b) => {
        const p = provenance(b.confidence);
        return `<tr>
          <td>${escape(b.name)}</td>
          <td>${escape(titleCase(b.category))}</td>
          <td>${escape(titleCase(b.cadence))}</td>
          <td class="num ${p.valueCls}">${b.amount == null ? 'Not set' : escape(money(b.amount))}</td>
          <td><span class="${p.cls}">${escape(p.label)}</span></td>
        </tr>`;
      }).join('')}</tbody>
    </table></div>` : emptyState('No bills recorded.')}
  </section>
`);
