// roadmap-summary.js - the Trades level: the board rolled up rather than
// drawn out. Data in, HTML string out. No DOM.
//
// Ported from the source system's Categories board, which groups live
// work by owning department and then by category, showing counts and
// expanding to items. Translated to the axes a house has:
//
//   trade (who does it) -> intent (what it is for) -> how many
//
// It answers a different question to the Timeline, which is why it is a
// level rather than a layout: not "when does this happen" but "how much
// electrical work is outstanding, and what is it all for". A trade with
// nine make-safe items and one cosmetic one is a different afternoon to
// the reverse, and neither timeline reads that off at a glance.
//
// Parked work is excluded on purpose. This is a view of live commitment;
// something deliberately shelved is not commitment, and counting it here
// would overstate every trade.

import {
  BANDS, PARKED, colStart, byOrder, groupBy, topLevel, childStats,
  themeOf, themeClass, isQuickJob,
} from './roadmap-model.js';
import { escape, titleCase } from '../core/format.js';

/** Live work only: never parked, and delivered only when it is being
 *  shown. Top-level rows alone, because a step counted separately from
 *  its parent would double-count the same job. */
export const liveWork = (items, show) =>
  topLevel(items).filter((i) => {
    if (colStart(i) === PARKED) return false;
    if (i.status === 'done') return show;
    return true;
  });

/** A trade owns an item; associated trades are deliberately NOT counted
 *  here. The trade filter widens to associations because there the
 *  question is "show me everything electrical touches"; a roll-up must
 *  not, because an item counted under three trades makes the totals lie. */
const tradeKey = (i) => i.trade || 'none';

export function tradeGroups(live, ctx) {
  const byTrade = groupBy(live, tradeKey);
  const keys = Object.keys(byTrade).filter((k) => k !== 'none').sort();
  if (byTrade.none) keys.push('none');
  return keys.map((k) => {
    const items = byTrade[k];
    const byTheme = groupBy(items, (i) => (themeOf(i, ctx) ? i.theme : 'none'));
    const themes = ctx.themeSorted.filter((t) => byTheme[t.key])
      .map((t) => ({ theme: t, items: byTheme[t.key] }));
    if (byTheme.none) themes.push({ theme: null, items: byTheme.none });
    return {
      key: k,
      label: k === 'none' ? 'No trade set' : titleCase(k),
      items,
      themes,
    };
  });
}

const countLabel = (n) => `${n} item${n === 1 ? '' : 's'}`;

/** One item inside an expanded intent line. Carries its band so the
 *  roll-up never loses the timing the other levels are built on, and
 *  stays clickable through to the same drawer. */
function itemRow(i, ctx) {
  const st = childStats(i, ctx);
  const band = BANDS[colStart(i)];
  const steps = st.total
    ? `<span class="rmv-sum-steps">${st.done} of ${st.total} done</span>` : '';
  return `<li class="rmv-sum-item rm-card--${escape(band.key)}"
    data-item-id="${escape(i.id)}" role="button" tabindex="0"
    ><span class="rmv-sum-item-title">${escape(i.title)}</span>${steps
    }<span class="rmv-sum-band">${escape(band.label)}</span></li>`;
}

function themeRow(entry, expanded, ctx) {
  const label = entry.theme ? entry.theme.label : 'General';
  const head = `<div class="rmv-sum-theme-head"
    ><span class="rmv-sum-theme-name">${escape(label)}</span
    ><span class="rmv-sum-count num">${escape(countLabel(entry.items.length))}</span></div>`;
  const list = expanded
    ? `<ul class="rmv-sum-items">${[...entry.items].sort(byOrder)
      .map((i) => itemRow(i, ctx)).join('')}</ul>`
    : '';
  return `<li class="rmv-sum-theme${themeClass(entry.theme)}">${head}${list}</li>`;
}

function tradeSection(g, expanded, ctx) {
  return `<section class="rmv-sum-trade"><h3 class="rmv-sum-trade-name">${escape(g.label)}
    <span class="rmv-sum-trade-count num">${escape(countLabel(g.items.length))}</span></h3>
    <ul class="rmv-sum-themes">${g.themes.map((t) => themeRow(t, expanded, ctx)).join('')}</ul>
    </section>`;
}

export function summary(data, opts = {}) {
  const show = opts.showDelivered !== false;
  const ctx = opts.ctx;
  let all = data.items ?? [];
  if (opts.hideQuick) all = all.filter((i) => !isQuickJob(i));

  const groups = tradeGroups(liveWork(all, show), ctx);
  if (!groups.length) {
    return '<p class="notice">No live work to summarise. Items appear here once they '
      + 'have a horizon of now, next or later.</p>';
  }
  return `<div class="rmv-sum">${
    groups.map((g) => tradeSection(g, !!opts.expanded, ctx)).join('')}</div>`;
}
