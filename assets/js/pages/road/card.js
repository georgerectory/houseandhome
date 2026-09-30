// Road Ahead: one listing's card. The figures now, under the scenario,
// beside the ones its appraisal recorded; the owner's judgement beside
// the maths, with what it costs; the rules, the road fit, the pipeline
// countdown, comparables and Focus road - the listing dropped into a
// road to show what it does to the forever-home budget. Returns markup.
import { escape, money } from '../../core/format.js';
import { runRoad, headline } from '../../engine/road-ahead/roads.js';
import { focusRoad } from '../../engine/road-ahead/focus.js';
import { provenance as trace, trustLine, DEPENDS } from '../../engine/road-ahead/provenance.js';
import { kilo } from '../../engine/road-ahead/charts/scale.js';
import { shortMonth } from '../../engine/road-ahead/charts/timeline.js';
import { dayName } from '../../engine/road-ahead/page/state.js';

const KIND = { emotional: 'an emotional reason', personal: 'a personal reason', strategic: 'a strategic reason',
  information: 'new information' };
const list = (title, items) => (items?.length
  ? `<div><h4 class="rd-card__h">${escape(title)}</h4><ul class="rd-list">${items.map((i) => `<li>${escape(i)}</li>`).join('')}</ul></div>` : '');
const ym = (s) => (s ? shortMonth(s.split('-').map(Number)) : '—');
const THIS_YEAR = new Date().getFullYear();

const DRIFT = { profit_base: 'profit', profit_opt: 'optimistic profit', walk_away_opt: 'walk-away', cash_left: 'cash left',
  grade: 'verdict' };
const driftText = (m) => `${DRIFT[m.field] ?? m.field} ${m.field === 'grade' ? `"${m.now}"` : kilo(m.now)}, `
  + `was ${m.field === 'grade' ? `"${m.was}"` : kilo(m.was)}`;

/** The maths now beside the appraisal's own figures. */
function mathsTable(x) {
  const n = x.now;
  const s = x.row.outputs ?? {};
  const moved = new Set(x.moved.map((m) => m.field));
  const row = (label, key, fmt = kilo) => `<tr class="${moved.has(key) ? 'rd-moved' : ''}"><th scope="row">${escape(label)}</th>
    <td class="num">${n[key] == null ? '—' : escape(fmt(n[key]))}</td><td class="num">${s[key] == null ? '—' : escape(fmt(s[key]))}</td></tr>`;
  return `<div class="table-wrap"><table class="table rd-maths">
    <caption class="visually-hidden">The figures now and at the appraisal</caption>
    <thead><tr><th scope="col">Figure</th><th scope="col" class="num">Now</th>
      <th scope="col" class="num">Appraised${x.row.appraised_on ? ` ${escape(dayName(x.row.appraised_on, THIS_YEAR))}` : ''}</th></tr></thead>
    <tbody>
      <tr><th scope="row">Likely buy</th><td class="num">${kilo(x.L.likely_buy)}</td><td class="num">${kilo(s.likely_buy)}</td></tr>
      <tr><th scope="row">Finished value</th><td class="num">${kilo(x.L.fin_lo)} to ${kilo(x.L.fin_hi)}</td><td class="num">${s.fin_lo != null ? `${kilo(s.fin_lo)} to ${kilo(s.fin_hi)}` : '—'}</td></tr>
      ${row('Works, with local help', 'works_base')}
      ${row('Works, optimistic', 'works_opt')}
      ${row('Profit', 'profit_base')}
      ${row('Profit, optimistic', 'profit_opt')}
      ${row('Profit, optimistic and the high value', 'profit_opt_hi')}
      ${row('Walk-away price', 'walk_away_opt')}
      ${row('Bid limit', 'bid_limit')}
      ${row('Cash left after buying', 'cash_left')}
      ${row('Verdict', 'grade', String)}
    </tbody></table></div>`;
}

/** The owner's judgement beside the maths, or the way to give one. */
function judgementBlock(x) {
  const j = x.now.judgement;
  if (!j) {
    return `<p class="rd-quiet">No judgement of yours on this one yet. If it is worth more or less to you than the
      sums say, Claude records it beside them and the maths stays as it is.</p>
      <button type="button" class="btn btn--quiet" data-judge="${escape(x.row.code)}">Copy a judgement for Claude</button>`;
  }
  return `<div class="rd-judge">
    <p><strong>Your walk-away: ${escape(money(j.walk_away))}</strong>, ${escape(money(Math.abs(j.difference)))}
      ${j.difference >= 0 ? 'above' : 'below'} the maths, for ${escape(KIND[j.kind] ?? 'a reason of yours')}:
      "${escape(j.reason)}"</p>
    <dl class="dl">
      <dt>Your bid limit</dt><dd class="num">${escape(money(j.bid_limit))}${j.above_ceiling ? ' (the ceiling binds: a reason is not cash)' : ''}</dd>
      <dt>Profit at your price</dt><dd class="num">${escape(money(j.profit_opt))}</dd>
      <dt>What it costs</dt><dd class="num">${escape(money(j.cost))} of profit given up</dd>
      <dt>Cash left</dt><dd class="num">${escape(money(j.cash_left))}</dd>
    </dl>
  </div>`;
}

function steps(pipeline, code) {
  const rows = pipeline.filter((p) => p.code === code).sort((a, b) => a.sort_order - b.sort_order);
  if (!rows.length) return '';
  return `<div><h4 class="rd-card__h">Countdown</h4><ol class="rd-steps">${rows.map((p) => `<li class="${p.is_done ? 'is-done' : ''}">
    <time class="rd-steps__when" datetime="${escape(p.due_on)}">${escape(dayName(p.due_on, THIS_YEAR))}</time>
    <span>${escape(p.label)}${p.is_done ? ` - done: ${escape(p.outcome ?? '')}` : p.days_until < 0 ? ' - overdue' : ''}</span>
    <span class="rd-quiet">${escape(p.settles)}</span></li>`).join('')}</ol></div>`;
}

function comparables(rows, code) {
  const mine = rows.filter((c) => c.listing_code === code);
  if (!mine.length) return '';
  return `<div><h4 class="rd-card__h">Comparables</h4><div class="table-wrap"><table class="table">
    <thead><tr><th scope="col">Address</th><th scope="col">Kind</th><th scope="col" class="num">Price</th><th scope="col">When</th></tr></thead>
    <tbody>${mine.map((c) => `<tr><td>${escape(c.address)}${c.property_type ? `<br><span class="rd-quiet">${escape(c.property_type)}</span>` : ''}</td>
      <td>${escape(c.kind)}</td><td class="num">${escape(money(c.price))}</td><td>${escape(c.when_text ?? (c.on_date ? dayName(c.on_date) : ''))}</td></tr>`).join('')}</tbody>
  </table></div></div>`;
}

/** The listing on a road in place of its typical House 1. */
export function focusBlock(x, ctx, runs, roadCode) {
  const withBuy = ctx.roads.filter((r) => r.stages.some((s) => s.kind === 'buy'));
  if (!withBuy.length || !x.L) return '';
  const road = withBuy.find((r) => r.code === roadCode) ?? withBuy.find((r) => r.code === x.now.best_road) ?? withBuy[0];
  const focused = focusRoad(road, { name: x.row.name, likely_buy: x.L.likely_buy, works: x.L.works,
    fin_lo: x.L.fin_lo, fin_hi: x.L.fin_hi, fee: x.L.fee, pct: x.L.pct });
  const mine = headline(runRoad(focused, road.near, ctx.P, ctx.scenario, ctx.help));
  const own = runs.find((r) => r.road.code === road.code)?.head;
  const diff = mine.forever_today != null && own?.forever_today != null ? mine.forever_today - own.forever_today : null;
  return `<div class="rd-focus">
    <h4 class="rd-card__h"><label for="rd-focus-road">Focus road</label></h4>
    <select id="rd-focus-road" data-focus="${escape(x.row.code)}">${withBuy.map((r) => `<option value="${escape(r.code)}"
      ${r.code === road.code ? 'selected' : ''}>${escape(`${r.code} ${r.name}`)}</option>`).join('')}</select>
    <p>Bought as House 1 on ${escape(road.code)}: the forever home is <strong>${kilo(mine.forever_today)}</strong> in today's money
      ${mine.forever_when ? `from ${escape(ym(mine.forever_when))}` : ''}${diff == null ? '' : `, ${kilo(Math.abs(diff))} ${diff >= 0 ? 'more' : 'less'}
      than the road's own House 1 gives`}. House 1 makes ${mine.profits.length ? kilo(mine.profits[0]) : '—'}; the cash is lowest at
      ${kilo(mine.min_cash)}${mine.min_cash_when ? ` in ${escape(ym(mine.min_cash_when))}` : ''}.</p>
    ${mine.flags.length ? `<ul class="rd-list rd-flags">${mine.flags.map((f) => `<li>${escape(f)}</li>`).join('')}</ul>` : ''}
  </div>`;
}

/**
 * @param {object} x a registerRows() row
 * @param {object} data loadRoadAhead()
 * @param {object} ctx resolve()
 * @param {Array<object>} runs runAll()
 * @param {string|null} focusCode the road picked for Focus road
 */
export function cardHtml(x, data, ctx, runs, focusCode) {
  const r = x.row;
  const labels = Object.fromEntries(data.variables.map((v) => [v.key, v]));
  const facts = [
    ['Address', r.address], ['Type', r.property_type], ['Bedrooms', r.beds],
    ['From home', r.minutes_from_home != null ? `${r.minutes_from_home} minutes` : null],
    ['Sale', [r.sale_method, r.house_code, r.lot ? `lot ${r.lot}` : null].filter(Boolean).join(', ')],
    ['Auction', r.auction_on ? dayName(r.auction_on) : null], ['Guide', r.guide_price != null ? money(r.guide_price) : null],
    ['Asking', r.asking_price != null ? money(r.asking_price) : null],
    ['Fees', r.fee_pct ? `${Math.round(r.fee_pct * 1000) / 10}%${r.fee ? ` (at least ${money(r.fee)})` : ''}` : r.fee ? money(r.fee) : null],
    ['Status', `${r.status}${r.status_reason ? `: ${r.status_reason}` : ''}`], ['Your reaction', r.reaction],
  ].filter(([, v]) => v != null && v !== '');
  return `<article class="rd-card" aria-labelledby="rd-card-title" tabindex="-1" data-card>
    <header class="rd-card__head">
      <h3 id="rd-card-title"><span class="rd-code">${escape(r.code)}</span> ${escape(r.name)}</h3>
      <button type="button" class="btn btn--quiet" data-close>Close</button>
    </header>
    <div class="rd-card__grid">
      <div>
        <dl class="dl">${facts.map(([k, v]) => `<dt>${escape(k)}</dt><dd>${escape(v)}</dd>`).join('')}</dl>
        ${r.links?.length ? `<ul class="rd-list">${r.links.map((u) => `<li><a href="${escape(u)}" rel="noopener noreferrer" target="_blank">${escape(u)}</a></li>`).join('')}</ul>` : ''}
        ${r.flag ? `<p class="notice">${escape(r.flag)}</p>` : ''}
        ${x.rules.length ? `<ul class="rd-chips">${x.rules.map((c) => `<li class="chip rd-rule ${c.pass === false ? `rd-rule--${c.severity}` : ''}">
          ${escape(c.code)}: ${escape(c.pass == null ? 'not known' : c.pass ? 'meets' : c.severity === 'block' ? 'breaks' : 'misses')}
          ${escape(c.rule.toLowerCase())} (${escape(c.value)})</li>`).join('')}</ul>` : ''}
      </div>
      ${x.now ? `<div>
        ${mathsTable(x)}
        ${x.drift.length ? `<p class="rd-warn">The model has changed since this appraisal: before any scenario it now gives
          ${escape(x.drift.map(driftText).join('; '))}. Ask Claude to look at it again.</p>` : ''}
        <p class="rd-quiet">${escape(trustLine(trace(DEPENDS.walk_away, labels)))}</p>
        ${judgementBlock(x)}
        ${r.override_grade ? `<p class="rd-quiet">The verdict "${escape(r.override_grade)}" is set by hand: ${escape(r.override_reason ?? '')}</p>` : ''}
      </div>` : '<p class="rd-quiet">Not appraised yet: there are no figures to work from.</p>'}
    </div>
    <div class="rd-card__grid">
      ${list('Good', r.positives)}${list('Not so good', r.negatives)}${list('Red flags', r.red_flags)}${list('Check next', r.next_checks)}
    </div>
    ${steps(data.pipeline, r.code)}
    ${comparables(data.comparables, r.code)}
    ${x.now ? focusBlock(x, ctx, runs, focusCode) : ''}
  </article>`;
}
