// Road Ahead: Assess. The latest appraisals made by the protocol, in the
// answer it gives (docs/road-ahead/ASSESS_PROPERTY.md), and the way to
// ask for a new one: the listing's text pasted here and copied, with the
// protocol, into a message for Claude. The page keeps none of it; the
// pasted text lives only in this tab. Returns markup.
import { escape, money } from '../../core/format.js';
import { dayName } from '../../engine/road-ahead/page/state.js';
import { kilo } from '../../engine/road-ahead/charts/scale.js';
import { labelTag } from './tags.js';

/** The first of these figures' evidence labels, as a tag beside the figure. */
const tag = (labels, ...keys) => labelTag(keys.map((k) => labels?.[k]).find(Boolean));
const list = (title, items) => (items?.length
  ? `<div><h4 class="rd-card__h">${escape(title)}</h4><ul class="rd-list">${items.map((i) => `<li>${escape(i)}</li>`).join('')}</ul></div>` : '');

/** The loan at a price against the mortgage in principle. */
function mortgage(price, ctx) {
  const mip = ctx.P['mortgage.mip_amount'];
  const dep = ctx.V.deposit_pct;
  if (!Number.isFinite(price) || !Number.isFinite(mip) || !Number.isFinite(dep)) return '—';
  const loan = price * (1 - dep);
  return `${kilo(loan)} of ${kilo(mip)}: ${loan <= mip ? 'within' : 'over'} the mortgage in principle`;
}

function answer(x, data, ctx) {
  const r = x.row;
  const i = r.inputs ?? {};
  const o = r.outputs ?? {};
  const lb = r.labels ?? {};
  const comp = data.comparables.find((c) => c.listing_code === r.code && c.kind === 'sold');
  const size = [r.floor_area_m2 != null ? `${r.floor_area_m2} m²` : null, r.beds != null ? `${r.beds} bedrooms` : null,
    r.plot_acres != null ? `${r.plot_acres} acres` : null].filter(Boolean).join(', ') || '—';
  const row = (label, value) => `<tr><th scope="row">${escape(label)}</th><td>${value}</td></tr>`;
  return `<article class="rd-answer" aria-labelledby="rd-answer-${escape(r.code)}">
    <h3 class="rd-answer__title" id="rd-answer-${escape(r.code)}"><span class="rd-code">${escape(r.code)}</span> ${escape(r.name)}</h3>
    <p class="rd-answer__verdict">${escape(r.verdict ?? o.grade ?? 'No verdict yet')}</p>
    <p class="rd-quiet">Appraised ${escape(dayName(r.appraised_on))}. The answer as given; the register works it out again now.</p>
    <div class="rd-answer__lists">${list('Good', r.positives)}${list('Not so good', r.negatives)}</div>
    <div class="table-wrap"><table class="table rd-answer__nums">
      <caption class="visually-hidden">The numbers behind the answer on ${escape(r.code)}</caption>
      <tbody>
        ${row('Asking or guide', escape(money(r.guide_price ?? r.asking_price)))}
        ${row('Size', escape(size))}
        ${row('Finished value', `<span class="num">${kilo(i.fin_lo)} to ${kilo(i.fin_hi)}</span>${tag(lb, 'fin_hi', 'fin_lo')}${comp
          ? `<br><span class="rd-quiet">Rests on ${escape(comp.address)}, ${escape(money(comp.price))}${comp.when_text || comp.on_date
            ? `, ${escape(comp.when_text ?? dayName(comp.on_date))}` : ''}</span>` : ''}`)}
        ${row('Works', `<span class="num">${kilo(i.works)}</span> DIY; <span class="num">${kilo(o.works_base)}</span> with help,
          <span class="num">${kilo(o.works_opt)}</span> optimistic${tag(lb, 'works')}`)}
        ${row('Profit', `<span class="num">${kilo(o.profit_base)}</span>; optimistic <span class="num">${kilo(o.profit_opt)}</span>`)}
        ${row('Walk-away', `<span class="num">${kilo(o.walk_away_opt)}</span>`)}
        ${row('Bid limit', `<span class="num">${kilo(o.bid_limit)}</span>`)}
        ${row('Cash left', `<span class="num">${kilo(o.cash_left)}</span>`)}
        ${row('Mortgage', escape(mortgage(i.likely_buy, ctx)))}
      </tbody>
    </table></div>
    ${list('Check next', (r.next_checks ?? []).slice(0, 3))}
    <button type="button" class="btn btn--quiet" data-listing="${escape(r.code)}">Open ${escape(r.code)} in the register</button>
  </article>`;
}

/**
 * @param {Array<object>} rows registerRows()
 * @param {object} data loadRoadAhead()
 * @param {object} ctx resolve()
 * @param {number} [shown] how many of the latest to show
 */
export function assessHtml(rows, data, ctx, shown = 3) {
  const latest = rows.filter((x) => x.row.protocol === 'road-ahead-1' && x.row.appraised_on)
    .sort((a, b) => (b.row.appraised_on > a.row.appraised_on ? 1 : b.row.appraised_on < a.row.appraised_on ? -1
      : a.row.code.localeCompare(b.row.code)))
    .slice(0, shown);
  return `<div class="rd-assess">
      <p>Found a house? Paste its details here and copy them for Claude, who assesses it the kit's way: the rules
        first, dated comparables, the works from the floor plan, then the profit, the walk-away and the bid limit, with
        where every figure came from. Claude cannot open Rightmove, so paste the text and attach the floor plan.
        Nothing here is kept.</p>
      <label for="rd-assess-text">The listing, as pasted</label>
      <textarea id="rd-assess-text" rows="6" data-assess-text></textarea>
      <button type="button" class="btn" data-assess-copy>Copy for Claude to assess</button>
    </div>
    <h3 class="rd-sub">The latest answers</h3>
    ${latest.length ? `<div class="rd-answers">${latest.map((x) => answer(x, data, ctx)).join('')}</div>`
    : '<p class="rd-quiet">No listing has been assessed by the protocol yet. The kit\'s own appraisals are in the register.</p>'}`;
}
