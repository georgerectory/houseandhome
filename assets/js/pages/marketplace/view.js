// view.js - the Marketplace page as HTML, from the model. Pure strings:
// no DOM and no fetch, so every state can be rendered in a unit test,
// the empty ones included.
import { money, provenance, titleCase, escape } from '../../core/format.js';
import { emptyState } from '../../core/page.js';
import { referenceHtml } from './reference.js';

const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const pct = (f) => `${Math.round(f * 100)} per cent`;
const section = (id, title, body, lede = '') => `<section class="section" id="${id}">
  <div class="section__head"><h2>${escape(title)}</h2></div>
  ${lede ? `<p class="lede">${lede}</p>` : ''}
  ${body}
</section>`;

const HOUSE = {
  none: 'There is no house yet, so nothing large can be bought until contracts exchange. '
    + 'Large pieces are watched, to learn what they sell for.',
  exchanged: 'Contracts have exchanged: large pieces can be bought. Things fitted to the house itself wait for the move.',
  moved: null,
};

/** 1. Where things stand. */
function verdictHtml(m) {
  const h = m.head;
  const houseLine = HOUSE[m.state];
  return `<section class="verdict">
    <span class="verdict__label">Still to find, at the good price</span>
    <span class="verdict__value verdict__value--num ${h.trusted ? '' : 'value--provisional'}">${escape(money(h.to_find_good))}</span>
    <p class="verdict__note">
      ${h.purchases
        ? `${escape(money(h.spent))} spent on ${plural(h.purchases, 'purchase')}, travel included:
           ${escape(money(h.saved_vs_fair))} under the fair price and ${escape(money(h.saved_vs_new))} under buying new.`
        : 'Nothing has been bought yet, so there is nothing spent and nothing saved to report.'}
      ${h.trusted ? '' : `<br>${h.unconfirmed_share >= 0.995 ? 'All' : escape(pct(h.unconfirmed_share))} of that budget
        rests on price thresholds nobody has confirmed. It is the size of the job, not a budget.`}
      ${houseLine ? `<br>${escape(houseLine)}` : ''}
    </p>
  </section>`;
}

/** 2. This week. */
function weekHtml(m) {
  const alertRow = (a) => `<li>
    <span class="chip ${a.action === 'set' ? 'chip--accent' : ''}">${a.action === 'set' ? 'Set this' : 'Already set'}</span>
    <span class="mp-query">${escape(a.query)}</span>
    <span class="mp-dim">${escape(a.label)}${a.max_price ? ` · up to ${escape(money(a.max_price))}` : ''}${
      a.radius_km ? ` · ${escape(a.radius_km)} km` : ''}</span>
  </li>`;
  const due = m.sweeps.filter((s) => s.due);
  const alerts = m.alerts.on.length
    ? `<ol class="mp-list">${m.alerts.on.map(alertRow).join('')}</ol>
       ${m.alerts.retire.length ? `<p class="mp-note">Turn these off: ${m.alerts.retire.map((a) => escape(a.label)).join(', ')}.
         Their profile has filled or fallen out of the top ten.</p>` : ''}`
    : emptyState('No alerts to set: there is no search linked to anything still being hunted.');
  const sweeps = m.sweeps.length
    ? `<ul class="mp-list">${m.sweeps.map((s) => `<li>
        <span class="chip ${s.due ? 'chip--accent' : ''}">${s.due ? 'Due' : 'Done'}</span>
        <span class="mp-query">${escape(s.query)}</span>
        <span class="mp-dim">${escape(titleCase(s.cadence))}${s.days_since == null ? ' · never run'
          : ` · run ${s.days_since === 0 ? 'today' : `${plural(s.days_since, 'day')} ago`}`}</span>
      </li>`).join('')}</ul>`
    : emptyState('No sweeps are set up.');
  const auctions = m.auctions.filter((g) => g.schedule).length
    ? `<ul class="mp-list">${m.auctions.filter((g) => g.schedule).map((g) => `<li>
        <span class="mp-strong">${escape(g.name)}</span>
        <span class="mp-dim">${escape(g.schedule)}${g.buyer_premium_pct != null
          ? ` · premium ${escape(Number(g.buyer_premium_pct))} per cent` : ''}</span></li>`).join('')}</ul>`
    : emptyState('No sale dates recorded.');
  return section('week', 'This week', `
    ${m.fallbacksDue.length ? `<p class="notice notice--warn"><span class="notice__title">Patience has run out on
      ${m.fallbacksDue.map((q) => escape(q.name)).join(', ')}</span>
      ${m.fallbacksDue.map((q) => escape(q.fallback)).join(' ')}</p>` : ''}
    <h3>The alerts to have set (${m.alerts.on.length} of 10)</h3>
    <p class="mp-note">Alerts arrive late or not at all, which is why the sweeps exist. Type each search exactly as written.</p>
    ${alerts}
    <h3>Sweeps (${due.length} due)</h3>
    ${sweeps}
    <h3>Sales to watch</h3>
    ${auctions}`,
  'Answer alerts as they arrive. Two fifteen-minute sweeps a week, sorted by newest; the monthly ones on the first.');
}

const BAND_WORD = { steal: 'A steal', good: 'A good price', fair: 'The going rate', high: 'High', over: 'Over the ceiling' };
const GRADE_WORD = { A: 'Grade A', B: 'Grade B', C: 'Grade C, unproven', X: 'Grade X, fails' };
const GRADE_CLASS = { A: 'mp-grade--a', B: 'mp-grade--b', C: 'mp-grade--c', X: 'mp-grade--x' };

/** Where the unit price sits between nothing and a little past the
 *  ceiling. The position is data, so it travels as a custom property. */
export function ladderHtml(p, unit) {
  const max = Number(p.price_max ?? p.price_fair ?? 0);
  if (!max) return '';
  const at = (v) => Math.max(0, Math.min(100, (Number(v) / (max * 1.2)) * 100)).toFixed(1);
  const rung = (label, v) => (v == null ? '' : `<span class="mp-ladder__rung" style="--at: ${at(v)}%">
    <span class="mp-ladder__label">${label}</span><span class="num">${escape(money(v))}</span></span>`);
  return `<div class="mp-ladder" role="img" aria-label="Price ladder: steal ${escape(money(p.price_steal))}, good ${
    escape(money(p.price_good))}, fair ${escape(money(p.price_fair))}, ceiling ${escape(money(p.price_max))}${
    unit == null ? '' : `; this one ${escape(money(unit))}`}">
    <div class="mp-ladder__track">${unit == null ? '' : `<span class="mp-ladder__mark" style="--at: ${at(unit)}%"></span>`}</div>
    <div class="mp-ladder__rungs">${rung('Steal', p.price_steal)}${rung('Good', p.price_good)}${
      rung('Fair', p.price_fair)}${rung('Stop', p.price_max)}</div>
  </div>`;
}

const gradeChip = (l) => (l.quality_grade
  ? `<span class="chip mp-grade ${GRADE_CLASS[l.quality_grade]}">${GRADE_WORD[l.quality_grade]}</span>`
  : '<span class="chip">No profile, no grade</span>');

function findCard(l) {
  const lot = Number(l.quantity ?? 1) > 1 ? ` for ${escape(Number(l.quantity))}` : '';
  const trip = l.trip
    ? `<p class="mp-line">Trip: ${escape(money(l.trip.tripCost))} in the car${l.travel_band ? `, band ${escape(l.travel_band)}` : ''}.
        ${l.trip.margin > 0 ? `${escape(money(l.trip.margin))} left against the fair price.`
          : `${escape(money(-l.trip.margin))} WORSE than the fair price once the car is counted.`}</p>`
    : '<p class="mp-line mp-dim">Distance not recorded, so the trip is not costed.</p>';
  return `<article class="card mp-find">
    <div class="mp-find__head">
      <h3 class="card__title">${escape(l.title)}</h3>
      <span class="mp-find__price num">${l.asking_price == null ? 'No price' : escape(money(l.asking_price))}${lot}</span>
    </div>
    <p class="card__meta">
      <span class="chip chip--accent">${escape(titleCase(l.verdict ?? 'not judged'))}</span>
      ${l.price_band ? `<span class="chip">${BAND_WORD[l.price_band]}</span>` : ''}
      ${gradeChip(l)}
      ${l.style_fit ? `<span class="chip">Fit ${escape(l.style_fit)} of 5</span>` : '<span class="chip">Fit not scored</span>'}
      <span class="chip">${escape(titleCase(l.status))}</span>
    </p>
    ${l.verdict_stands ? '' : `<p class="shop-flag">This verdict no longer stands: the checks do not support it. Treat it as watch.</p>`}
    ${l.what_it_is ? `<p class="mp-line"><span class="spec__tag">It is</span>${escape(l.what_it_is)}</p>` : ''}
    ${l.verdict_reason ? `<p class="mp-line">${escape(l.verdict_reason)}</p>` : ''}
    ${l.profile_id ? ladderHtml(l, l.unit_asking) : ''}
    ${l.open != null && (l.acting === 'buy' || l.acting === 'offer') ? `<p class="mp-line mp-strong">${l.offer?.kind === 'accept' && l.opening_offer == null
      ? `Pay the asking price, ${escape(money(l.open))}, and go today.`
      : `Open at ${escape(money(l.open))}. Stop at ${escape(money(l.stop))}.`}</p>` : ''}
    ${trip}
    <p class="mp-line">${escape(l.gradeReasons.join(' '))}${l.maker_name
      ? ` Maker: ${escape(l.maker_name)} (${escape(l.maker_evidence ?? 'evidence not recorded')}).` : ''}</p>
    ${l.answered.length ? `<ul class="mp-checks">${l.answered.map((a) => `<li class="mp-check mp-check--${escape(a.answer)}">
      <span class="mp-check__mark">${escape(titleCase(a.answer))}</span> ${escape(a.question)}
      ${a.evidence ? `<span class="mp-dim">${escape(a.evidence)}</span>` : ''}</li>`).join('')}</ul>` : ''}
    ${l.questions.length ? `<p class="mp-line mp-strong">Still to settle</p>
      <ul class="mp-checks">${l.questions.map((q) => `<li class="mp-check mp-check--unseen">
        ${escape(q.question)} <span class="mp-dim">Settled by ${escape(q.settledBy)}.</span></li>`).join('')}</ul>` : ''}
    ${l.message ? `<details class="detail mp-fold"><summary>Message to send</summary>
      <div><p class="mp-message">${escape(l.message)}</p>
      <p class="mp-dim">Copy it and send it yourself. Never a deposit, never off the platform.</p></div></details>` : ''}
  </article>`;
}

/** 3. In play. */
function inPlayHtml(m) {
  const live = m.live.length
    ? `<div class="mp-finds">${m.live.map(findCard).join('')}</div>`
    : emptyState('Nothing is in play. Send a screenshot or a link of a listing and it will appear here, judged.');
  const down = m.turnedDown.length
    ? `<details class="detail mp-fold"><summary>Turned down or lost (${m.turnedDown.length})</summary><div>
        <ul class="mp-list">${m.turnedDown.map((l) => `<li>
          <span class="mp-strong">${escape(l.title)}</span>
          <span class="chip">${escape(titleCase(l.status))}</span>
          ${l.quality_grade ? gradeChip(l) : ''}
          <span class="mp-dim">${escape(l.verdict_reason ?? 'No reason recorded.')}</span></li>`).join('')}</ul>
      </div></details>`
    : '';
  return section('in-play', 'In play', live + down,
    'Buy first, then offer, then watch. What was turned down is kept with its reason: knowing why is how the eye is trained.');
}

const makerList = (label, list) => (list.length
  ? `<p class="mp-line"><span class="spec__tag">${label}</span>${list.map((k) => escape(k.name)).join(', ')}</p>` : '');

function profileHtml(q) {
  const prov = provenance(q.price_confidence);
  return `<details class="detail mp-profile">
    <summary><span class="mp-profile__rank num">${q.queue_rank}</span>
      <span class="mp-profile__name">${escape(q.name)}</span>
      <span class="chip ${q.mode === 'buy' ? 'chip--accent' : ''}">${q.mode === 'buy' ? 'Buy' : 'Watch'}</span>
      <span class="num ${prov.valueCls}">${escape(money(q.price_good))}</span></summary>
    <div>
      <p class="mp-line">${q.reasons.map(escape).join(' ')}</p>
      <p class="mp-line">Wanted: ${escape(Number(q.qty_outstanding))} of ${escape(Number(q.wanted_qty))} ${escape(q.unit ?? 'each')}.
        Hunted for ${plural(q.weeks_hunted, 'week')}.${q.live_finds ? ` ${plural(q.live_finds, 'find')} in play.` : ''}
        ${q.placeholder_qty > 0 ? ' A stand-in is in use until the real one turns up.' : ''}</p>
      <p class="spec__buy"><span class="spec__tag">Buy</span>${escape(q.spec)}</p>
      ${q.reject_if ? `<p class="spec__reject"><span class="spec__tag">Reject</span>${escape(q.reject_if)}</p>` : ''}
      ${ladderHtml(q, null)}
      <p class="mp-line"><span class="${prov.cls}">${escape(prov.label)}</span>
        ${q.stale ? '<span class="prov prov--stale">Stale: priced over a year ago</span>' : ''}
        <span class="mp-dim">${escape(q.evidenceLine)}</span></p>
      ${q.checks.length ? `<ul class="mp-checks">${q.checks.map((c) => `<li class="mp-check">
        ${escape(c.question)} <span class="mp-dim">${c.must_pass ? 'Must pass.' : c.distinction ? 'Marks a better piece.' : 'Good to know.'}
        ${c.fail_looks_like ? `Fails if: ${escape(c.fail_looks_like)}` : ''}</span></li>`).join('')}</ul>`
        : '<p class="mp-line mp-dim">No checks yet, so nothing of this kind can be graded above C.</p>'}
      ${makerList('Seek', q.seek)}${makerList('Fine', q.acceptable)}${makerList('Avoid', q.avoid)}
      ${(q.keywords ?? []).length ? `<p class="mp-line"><span class="spec__tag">Search</span><span class="mp-query">${
        escape([...(q.keywords ?? []), ...(q.misspellings ?? [])].join(', '))}</span></p>` : ''}
      ${q.fallback ? `<p class="mp-line"><span class="spec__tag">If not</span>${escape(q.fallback)}
        ${q.fallback_from ? `<span class="mp-dim">From ${escape(q.fallback_from)}, once there is a house.</span>` : ''}</p>` : ''}
      ${q.list_title ? `<p class="mp-line mp-dim">Fills the shopping line "${escape(q.list_title)}".</p>` : ''}
    </div>
  </details>`;
}

/** 4. Next to hunt. */
function huntHtml(m) {
  if (!m.queue.length) {
    return section('hunt', 'Next to hunt', emptyState(m.hasProfiles
      ? 'Everything being hunted has been found.'
      : 'No profiles yet. A profile is one kind of thing with a spec, what disqualifies it and what it is worth.'));
  }
  const top = m.queue.slice(0, 10);
  const rest = m.queue.slice(10);
  const tiers = [...new Set(rest.map((q) => q.tier))];
  return section('hunt', 'Next to hunt', `
    ${top.map(profileHtml).join('')}
    ${tiers.map((t) => `<details class="detail mp-fold"><summary>${escape(titleCase(t))}: ${plural(rest.filter((q) => q.tier === t).length, 'more')}</summary>
      <div>${rest.filter((q) => q.tier === t).map(profileHtml).join('')}</div></details>`).join('')}`,
  'The order to look in: what the house needs first, started early where a thing is scarce, the big pieces before what is scaled to them. '
  + 'Watch means learn the prices and do not buy yet. The price shown is the good price, per unit.');
}

export function pageHtml(m) {
  return `${verdictHtml(m)}${weekHtml(m)}${inPlayHtml(m)}${huntHtml(m)}${referenceHtml(m)}`;
}
