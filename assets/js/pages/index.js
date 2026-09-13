// Dashboard. Answers one question in the first viewport: what should I
// do next, and where do things stand.
import { mountShell, render, confidenceBanner } from '../core/shell.js';
import { load, openItems, byHorizon, fundable, totalOutstanding, confidenceSummary, isDemo } from '../core/store.js';
import { itemCard, emptyState } from '../core/page.js';
import { money, preciseMoney, escape } from '../core/format.js';
import { allocate } from '../../js/engine/allocate.js';

mountShell('index.html');

const d = await load();
const conf = confidenceSummary(d);
const now = byHorizon(d, 'now');
const queue = fundable(d);
const monthly = d.pot?.monthly_contribution ?? 0;
const split = allocate(queue, monthly, {
  decay: d.allocation_settings?.decay,
  floorShare: d.allocation_settings?.floor_share,
});
const outstanding = totalOutstanding(d);
const months = monthly > 0 ? Math.ceil(outstanding / monthly) : null;

const nextUp = now.length ? now : openItems(d).slice(0, 3);

render('[data-page-root]', `
  ${isDemo() ? `<div class="notice" role="status">
    <span class="notice__title">Demo data</span>
    No database is connected yet, so this is the seed list rendered from
    <code>data/fixtures/demo.json</code>. Connect Supabase in
    <code>assets/js/core/config.js</code> and every page reads live rows instead.
  </div>` : ''}
  ${confidenceBanner(conf)}

  <section class="verdict">
    <span class="verdict__label">Next up</span>
    <span class="verdict__value">${escape(nextUp[0]?.title ?? 'Nothing on the list')}</span>
    <p class="verdict__note">${nextUp[0]
      ? `Top of ${openItems(d).length} open items. ${escape(nextUp[0].room_name ?? 'No room set')}.`
      : 'Add work through Claude and it appears here.'}</p>
  </section>

  <div class="stats">
    <div class="stat">
      <span class="stat__label">Open items</span>
      <span class="stat__value num">${openItems(d).length}</span>
      <span class="stat__note">${now.length} in the Now band</span>
    </div>
    <div class="stat">
      <span class="stat__label">Still to fund</span>
      <span class="stat__value num value--provisional">${escape(money(outstanding))}</span>
      <span class="stat__note">across ${queue.length} costed items</span>
    </div>
    <div class="stat">
      <span class="stat__label">Monthly pot</span>
      <span class="stat__value num value--provisional">${escape(money(monthly))}</span>
      <span class="stat__note">${escape(d.pot?.contribution_confidence ?? 'unset')}</span>
    </div>
    <div class="stat">
      <span class="stat__label">At this rate</span>
      <span class="stat__value num">${months ? `${months}` : '—'}</span>
      <span class="stat__note">${months ? 'months to clear the list' : 'set a contribution'}</span>
    </div>
  </div>

  <section class="section">
    <div class="section__head"><h2>Now</h2><a href="roadmap.html">Full roadmap</a></div>
    ${nextUp.length ? `<div class="card-grid">${nextUp.slice(0, 6).map((i) => itemCard(i)).join('')}</div>`
      : emptyState('Nothing in the Now band.')}
  </section>

  <section class="section">
    <div class="section__head">
      <h2>Where the next ${escape(money(monthly))} goes</h2>
      <a href="money.html">Money</a>
    </div>
    <p class="lede">Every open item gets a share of every deposit. Share follows
    priority, not cost, so the top of the list moves fastest while nothing at the
    bottom ever stops moving.</p>
    ${split.length ? `<div class="table-wrap"><table class="table">
      <thead><tr><th>#</th><th>Item</th><th class="num">Share</th><th class="num">Saved after</th><th class="num">Target</th></tr></thead>
      <tbody>${split.slice(0, 12).map((r) => `<tr>
        <td class="num">${r.rank}</td>
        <td>${escape(r.title)}</td>
        <td class="num">${escape(preciseMoney(r.amount))}</td>
        <td class="num">${escape(preciseMoney(r.balanceAfter))}</td>
        <td class="num">${escape(money(r.targetCost))}</td>
      </tr>`).join('')}</tbody>
    </table></div>
    ${split.length > 12 ? `<p class="lede">Showing the top 12 of ${split.length}. The smallest
      share this month is ${escape(preciseMoney(split[split.length - 1].amount))} — small, but never zero.</p>` : ''}`
      : emptyState('No costed items to fund yet.')}
  </section>
`);
