// budget.js - the whole plan as one sum, beside what other households
// spend. Pure strings, like view.js. The figures come from
// mp_budget_position and mp_budget_vs_benchmarks (or their copies in
// engine/marketplace/budget.js); nothing is worked out here.
import { money, escape } from '../../core/format.js';
import { emptyState } from '../../core/page.js';

const pct = (f) => `${Math.round(Number(f) * 100)} per cent`;
const COVERS = {
  furniture: 'Furniture only',
  furnishing: 'Furnishing',
  furnishing_and_decorating: 'Furnishing and decorating',
};
const WHERE = { below: 'Below', within: 'Within', above: 'Above' };
const VERDICT = {
  below: 'Below every published figure it can be held against.',
  within: 'Within the published range, and above none of it.',
  above: 'Above every published figure it can be held against: look again at the list.',
  mixed: 'Above some published figures and below others: read the rows, not the average.',
};
const range = (r) => {
  const parts = [r.amount_low, r.amount_mid, r.amount_high].filter((v) => v != null);
  if (r.amount_low != null && r.amount_high != null) return `${money(r.amount_low)} to ${money(r.amount_high)}`;
  return money(parts[0]);
};

/** The section, or an empty state when there is nothing to compare. */
export function budgetHtml(m) {
  const b = m.budget ?? {};
  const p = b.position;
  const head = '<div class="section__head"><h2>Against what others spend</h2></div>';
  if (!p) {
    return `<section class="section" id="budget">${head}
      ${emptyState('No budget to compare yet: nothing is being hunted and nothing is planned new.')}</section>`;
  }
  const rows = b.rows ?? [];
  const table = rows.length ? `<div class="table-wrap"><table class="table">
    <thead><tr><th>Published figure</th><th>Covers</th><th class="num">Their figure</th>
      <th class="num">Ours, good</th><th>Where</th></tr></thead>
    <tbody>${rows.map((r) => `<tr>
      <td>${escape(r.label)}<span class="mp-dim"> ${escape(r.home)}${r.published_on ? `, ${escape(String(r.published_on).slice(0, 4))}` : ''}</span></td>
      <td>${escape(COVERS[r.covers] ?? r.covers)}${r.includes_decorating ? '<span class="mp-dim"> (ours has no decorating)</span>' : ''}</td>
      <td class="num">${escape(range(r))}</td>
      <td class="num">${escape(money(r.ours_good))}</td>
      <td>${escape(WHERE[r.position] ?? r.position)}${r.ratio != null ? `<span class="mp-dim"> ${escape(pct(r.ratio))}</span>` : ''}</td>
    </tr>`).join('')}</tbody></table></div>` : emptyState('No published figures recorded to compare against.');
  return `<section class="section" id="budget">${head}
    <p class="lede">The whole plan as one sum, with what has to be bought new, beside what other households spend.
      A comparison of spending, never of what is in the bank.</p>
    <div class="table-wrap"><table class="table">
      <thead><tr><th></th><th class="num">Steal</th><th class="num">Good</th><th class="num">Typical</th></tr></thead>
      <tbody>
        <tr><td>Second hand, the whole list</td><td class="num">${escape(money(p.sh_steal))}</td>
          <td class="num">${escape(money(p.sh_good))}</td><td class="num">${escape(money(p.sh_fair))}</td></tr>
        <tr><td>Bought new (${escape(p.new_kinds)} kinds)</td><td class="num">${escape(money(p.new_low))}</td>
          <td class="num">${escape(money(p.new_mid))}</td><td class="num">${escape(money(p.new_high))}</td></tr>
        <tr><td class="mp-strong">All in</td><td class="num mp-strong">${escape(money(p.all_in_steal))}</td>
          <td class="num mp-strong">${escape(money(p.all_in_good))}</td><td class="num mp-strong">${escape(money(p.all_in_fair))}</td></tr>
      </tbody></table></div>
    <p class="mp-line">The same second-hand pieces new would cost ${escape(money(p.sh_new))}.
      ${p.aesthetic_share != null ? `${escape(pct(p.aesthetic_share))} of the good-price list is for looks rather than use.` : ''}
      Day one, all in at the good price: ${escape(money(p.day_one_all_in))}.
      ${Number(p.unconfirmed_share) > 0 ? `${escape(pct(p.unconfirmed_share))} of the second-hand figure still rests on estimates.` : ''}</p>
    ${b.verdict ? `<p class="mp-line mp-strong">${escape(VERDICT[b.verdict])}</p>` : ''}
    ${table}
  </section>`;
}
