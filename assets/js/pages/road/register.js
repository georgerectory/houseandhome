// Road Ahead: the listings register. Filters, a sortable table of what
// each listing makes under the scenario, the road-fit heatmap and the
// price-against-profit scatter. Each listing opens its card (card.js).
// Returns markup; the page wires the clicks.
import { escape, money } from '../../core/format.js';
import { FILTERS, dayName } from '../../engine/road-ahead/page/state.js';
import { sortRows } from '../../engine/road-ahead/page/model.js';
import { kilo, seriesOf } from '../../engine/road-ahead/charts/scale.js';
import { fitHeatmap } from '../../engine/road-ahead/charts/heatmap.js';
import { scatter } from '../../engine/road-ahead/charts/scatter.js';

const COLUMNS = [
  ['name', 'Listing'], ['status', 'Status'], ['auction', 'Auction'], ['buy', 'Likely buy', 'num'],
  ['profit', 'Profit', 'num'], ['profit_opt', 'Optimistic', 'num'], ['bid', 'Bid limit', 'num'], ['verdict', 'Verdict'],
];

const statusText = (r) => `${r.status}${r.status_reason ? `: ${r.status_reason}` : ''}`;
const days = (n) => (n == null ? '' : n < 0 ? `${-n} days ago` : n === 0 ? 'today' : `in ${n} day${n === 1 ? '' : 's'}`);
const THIS_YEAR = new Date().getFullYear();

function cells(x, series, open) {
  const r = x.row;
  const n = x.now;
  const judged = n?.judgement ? `<span class="rd-judged">yours ${kilo(n.judgement.bid_limit)}</span>` : '';
  const broken = x.rules.filter((c) => c.pass === false);
  return `<tr class="${x.drift.length ? 'rd-moved' : ''}">
    <th scope="row"><button type="button" class="rd-open" data-listing="${escape(r.code)}" aria-expanded="${r.code === open}">
      <span class="rd-code">${escape(r.code)}</span> ${escape(r.name)}</button>
      ${broken.map((c) => `<span class="chip rd-rule rd-rule--${c.severity}">${escape(c.severity === 'block' ? 'Breaks' : 'Misses')} ${escape(c.code)}</span>`).join('')}
    </th>
    <td>${escape(statusText(r))}${r.next_step ? `<br><span class="rd-quiet">Next: ${escape(r.next_step.step)}, ${escape(days(r.next_step.days_until))}</span>` : ''}</td>
    <td class="rd-when">${r.auction_on ? `<time datetime="${escape(r.auction_on)}">${escape(dayName(r.auction_on, THIS_YEAR))}</time>
      <br><span class="rd-quiet">${escape(days(r.days_to_auction))}</span>` : '—'}</td>
    <td class="num">${escape(money(x.L?.likely_buy))}</td>
    <td class="num">${n ? kilo(n.profit_base) : '—'}</td>
    <td class="num">${n ? kilo(n.profit_opt) : '—'}</td>
    <td class="num">${n ? kilo(n.bid_limit) : '—'}${judged}</td>
    <td>${n ? `${escape(n.grade)}${n.best_road && n.best_road !== '—'
      ? ` <span class="chip rd-roadchip rd-s${series.get(n.best_road) ?? 1}">${escape(n.best_road)}</span>` : ''}` : '<span class="rd-quiet">Not appraised</span>'}
      ${x.drift.length ? `<br><span class="rd-quiet">Moved since ${escape(r.appraised_on ? dayName(r.appraised_on, THIS_YEAR) : 'its appraisal')}</span>` : ''}</td>
  </tr>`;
}

/**
 * @param {Array<object>} rows registerRows()
 * @param {object} state
 * @param {object} ctx resolve()
 */
export function registerHtml(rows, state, ctx) {
  const series = seriesOf(ctx.roads);
  const filter = FILTERS.find((f) => f.key === state.filter) ?? FILTERS[0];
  const shown = sortRows(rows.filter((x) => filter.test(x.row)), state.sort, state.dir);
  const sortAttr = (key) => (state.sort === key ? (state.dir === 'desc' ? 'descending' : 'ascending') : 'none');
  const chips = FILTERS.map((f) => `<button type="button" class="seg${f.key === filter.key ? ' is-on' : ''}" data-filter="${f.key}"
    aria-pressed="${f.key === filter.key}">${escape(f.label)} <span class="num">${rows.filter((x) => f.test(x.row)).length}</span></button>`)
    .join('');
  const scored = shown.filter((x) => x.now);
  return `<div class="rd-filters" role="group" aria-label="Show">${chips}</div>
    ${shown.length ? `<div class="table-wrap"><table class="table rd-reg">
      <caption class="visually-hidden">Listings, ${escape(filter.label.toLowerCase())}, under the scenario</caption>
      <thead><tr>${COLUMNS.map(([key, label, cls]) => `<th scope="col" class="${cls ?? ''}" aria-sort="${sortAttr(key)}">
        <button type="button" class="rd-sort" data-sort="${key}">${escape(label)}</button></th>`).join('')}</tr></thead>
      <tbody>${shown.map((x) => cells(x, series, state.listing)).join('')}</tbody>
    </table></div>` : '<p class="empty">No listings here.</p>'}
    <p class="rd-quiet">Profit and bid limit are worked out now, under the scenario and any what-ifs, from each
      listing's latest appraisal. A row marked as moved gives a different answer from that appraisal by £1,000 or more
      even before any scenario: the model has changed since, so it is due a fresh look.</p>
    ${scored.length ? fitHeatmap(scored.map((x) => ({ code: x.row.code, name: x.row.name, fit: x.fit })), ctx.roads,
      { caption: 'How well each listing fits each road: your score from 0 to 3, and the check worked out from the road\'s own criteria where it states them.' }) : ''}
    ${scored.length ? scatter(scored.map((x) => ({
      code: x.row.code, x: x.L.likely_buy, y: x.now.profit_opt, series: series.get(x.now.best_road) ?? null,
      title: `${x.row.code} ${x.row.name}: ${money(x.L.likely_buy)}, optimistic profit ${money(x.now.profit_opt)}`,
    })), {
      caption: 'Likely price against optimistic profit. Each point is coloured by its best road and named by its code.',
      xLabel: 'Likely buy', yLabel: 'Optimistic profit',
      xLines: [{ value: ctx.P['ceiling.practical'], label: 'Comfortable' }, { value: ctx.V.ceiling_hard, label: 'Ceiling' }]
        .filter((l) => Number.isFinite(l.value)),
      yLines: [{ value: ctx.V.target_profit, label: 'Target profit' }],
    }) : ''}`;
}
