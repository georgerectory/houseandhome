// Road Ahead: the roads. Each road as a card - what it buys, when, what
// House 1 makes, how low the cash goes and what it flags - with its money
// ladder (every purchase, sale and further advance, in order) and its
// cash line. Returns markup.
import { escape } from '../../core/format.js';
import { provenance as trace, trustLine, DEPENDS } from '../../engine/road-ahead/provenance.js';
import { kilo, seriesOf } from '../../engine/road-ahead/charts/scale.js';
import { cashSpark } from '../../engine/road-ahead/charts/spark.js';
import { shortMonth } from '../../engine/road-ahead/charts/timeline.js';

const ym = (s) => (s ? shortMonth(s.split('-').map(Number)) : '—');
const k = (v) => (v == null ? '—' : kilo(v));

/** The ledger as a table: every step the road takes, and the cash after it. */
function ladder(result) {
  const rows = result.ledger.map((e) => {
    const sale = e.sale != null;
    return `<tr>
      <td>${escape(ym(e.date))}</td>
      <td>${escape(e.step)}</td>
      <td class="num">${k(sale ? e.sale : e.price)}</td>
      <td class="num">${k(e.deposit)}</td>
      <td class="num">${k(sale ? e.loan_repaid : e.loan)}</td>
      <td class="num">${k(e.stamp)}</td>
      <td class="num">${k(sale ? e.sale_costs : e.fees)}</td>
      <td class="num">${e.monthly == null ? '—' : `£${Math.round(e.monthly).toLocaleString('en-GB')}`}</td>
      <td class="num">${k(e.profit)}</td>
      <td class="num">${k(e.cash_after)}</td>
      <td>${(e.flags ?? []).map((f) => `<span class="rd-flag">${escape(f)}</span>`).join(' ')}</td>
    </tr>`;
  }).join('');
  return `<div class="table-wrap"><table class="table rd-ladder">
    <caption class="visually-hidden">The money ladder, step by step</caption>
    <thead><tr><th scope="col">When</th><th scope="col">Step</th><th scope="col" class="num">Price or sale</th>
      <th scope="col" class="num">Deposit</th><th scope="col" class="num">Loan</th><th scope="col" class="num">Stamp duty</th>
      <th scope="col" class="num">Fees and costs</th><th scope="col" class="num">A month</th><th scope="col" class="num">Profit</th>
      <th scope="col" class="num">Cash after</th><th scope="col">Flags</th></tr></thead>
    <tbody>${rows}</tbody></table></div>`;
}

/**
 * @param {object} ctx resolve()
 * @param {Array<object>} runs runAll()
 * @param {object} data loadRoadAhead()
 */
export function roadsHtml(ctx, runs, data) {
  const series = seriesOf(ctx.roads);
  const labels = Object.fromEntries(data.variables.map((v) => [v.key, v]));
  const trust = trustLine(trace(DEPENDS.forever_budget, labels));
  const floor = ctx.P['cash.works_buffer'];
  return `<p class="rd-quiet">${escape(trust)}</p>
  <ol class="rd-roads">${runs.map(({ road, result, head }) => `<li class="rd-road rd-s${series.get(road.code)}">
    <h3 class="rd-road__title"><span class="rd-code">${escape(road.code)}</span> ${escape(road.name)}</h3>
    <p class="rd-quiet">${escape([road.rank_label, road.family, road.near ? 'Near home' : 'Further away'].filter(Boolean).join(' · '))}</p>
    <dl class="rd-road__figs">
      <div><dt>Forever home, today's money</dt><dd class="num">${k(head.forever_today)}</dd></div>
      <div><dt>Bought</dt><dd>${escape(ym(head.forever_when))}${head.forever_price != null ? ` for ${k(head.forever_price)}` : ''}</dd></div>
      <div><dt>House 1 makes</dt><dd class="num">${head.profits.length ? head.profits.map(k).join(', ') : '—'}</dd></div>
      <div><dt>Cash at its lowest</dt><dd class="num ${head.min_cash < 0 ? 'rd-neg' : ''}">${k(head.min_cash)}
        <span class="rd-quiet">${escape(ym(head.min_cash_when))}</span></dd></div>
      ${head.fa_used ? `<div><dt>Further advance</dt><dd class="num">${k(head.fa_used)}</dd></div>` : ''}
    </dl>
    ${head.flags.length ? `<ul class="rd-list rd-flags">${head.flags.map((f) => `<li>${escape(f)}</li>`).join('')}</ul>` : ''}
    ${head.min_cash < 0 ? `<p class="rd-warn">The cash goes below zero in ${escape(ym(head.min_cash_when))}: this road does not pay its way as set.</p>` : ''}
    ${cashSpark(result.trace, { floor, label: `${road.code} ${road.name}` })}
    <details class="detail" data-keep="${escape(road.code)}"><summary>Money ladder</summary>${ladder(result)}</details>
  </li>`).join('')}</ol>`;
}
