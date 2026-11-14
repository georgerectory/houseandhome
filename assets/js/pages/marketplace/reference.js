// reference.js - the lower half of the Marketplace page: where to
// look, what was bought, what the buying has taught, and the brief.
// Pure strings, like view.js.
import { money, provenance, titleCase, escape } from '../../core/format.js';
import { emptyState } from '../../core/page.js';

const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const section = (id, title, body, lede = '') => `<section class="section" id="${id}">
  <div class="section__head"><h2>${escape(title)}</h2></div>
  ${lede ? `<p class="lede">${lede}</p>` : ''}
  ${body}
</section>`;
const rule = (m, key) => (m.brief?.rules ?? []).find((r) => r.key === key);

/** 5. Where to look. */
function groundsHtml(m) {
  const bands = m.brief?.travel_bands ?? [];
  const trip = rule(m, 'trip_cost');
  const bandTable = bands.length ? `<div class="table-wrap"><table class="table">
    <thead><tr><th>Band</th><th class="num">Minutes</th><th class="num">Miles</th><th class="num">Worth it from</th><th>Use for</th></tr></thead>
    <tbody>${bands.map((b) => `<tr><td>${escape(b.band)}</td><td class="num">${escape(b.minutes_max)}</td>
      <td class="num">${escape(b.miles_max)}</td><td class="num">${escape(money(b.min_saving))}</td>
      <td>${escape(b.use_for)}</td></tr>`).join('')}</tbody></table></div>` : '';
  const order = ['A', 'B', 'C', 'D', 'online'];
  const groups = order.map((band) => [band, m.grounds.filter((g) => (g.band ?? 'online') === band)])
    .filter(([, list]) => list.length);
  const body = groups.length ? groups.map(([band, list]) => `<h3>${band === 'online' ? 'Online' : `Band ${escape(band)}`}</h3>
    <ul class="mp-list">${list.map((g) => `<li>
      <span class="mp-strong">${escape(g.name)}</span>
      <span class="chip">${escape(titleCase(g.kind))}</span>
      ${g.drive_minutes != null ? `<span class="chip">${escape(g.drive_minutes)} min</span>` : ''}
      ${g.buyer_premium_pct != null ? `<span class="chip">Premium ${escape(Number(g.buyer_premium_pct))}%</span>` : ''}
      <span class="mp-dim">${escape([g.schedule, g.good_for, g.tactics].filter(Boolean).join(' '))}</span>
    </li>`).join('')}</ul>`).join('')
    : emptyState('No grounds recorded yet.');
  return section('grounds', 'Where to look', `
    ${trip ? `<p class="notice"><span class="notice__title">The trip rule</span>${escape(trip.rule)} ${escape(trip.why ?? '')}</p>` : ''}
    ${bandTable}${body}`,
  m.brief?.home_base ? `Distances are estimates from ${escape(m.brief.home_base)}; none has been routed.` : '');
}

const ledgerTable = (rows) => `<div class="table-wrap"><table class="table">
  <thead><tr><th>Bought</th><th>Grade</th><th class="num">Paid</th><th class="num">Under fair</th><th class="num">Under new</th></tr></thead>
  <tbody>${rows.map((l) => `<tr>
    <td>${escape(l.title)}<span class="mp-dim mp-block">${escape(l.bought_on ?? '')}${l.maker_name ? ` · ${escape(l.maker_name)}` : ''}${
      Number(l.haggled_off) > 0 ? ` · ${escape(money(l.haggled_off))} haggled off` : ''}</span></td>
    <td>${escape(l.quality_grade ?? 'None')}</td>
    <td class="num">${escape(money(l.paid))}</td>
    <td class="num">${escape(money(l.saved_vs_fair))}</td>
    <td class="num">${escape(money(l.saved_vs_new))}</td></tr>`).join('')}</tbody></table></div>`;

/** 6. Bought. */
function boughtHtml(m) {
  const real = m.real.length ? ledgerTable(m.real)
    : emptyState('Nothing bought yet. When something is, say "I bought it" and it lands here with what it saved.');
  const stand = m.placeholders.length ? `<h3>In use until the real one turns up</h3>
    <p class="mp-note">A stand-in bought under a fallback. It does not fill its profile, and its price teaches nothing about the real thing.</p>
    ${ledgerTable(m.placeholders)}` : '';
  return section('bought', 'Bought', real + stand, 'Savings are net of the cost of the trip.');
}

/** 7. What the buying has taught. */
function lessonsHtml(m) {
  const l = m.lessons;
  const ratio = (g) => (g.paid_to_asking == null ? 'no asking price' : `${Math.round(g.paid_to_asking * 100)} per cent of asking`);
  const learned = l.enough
    ? `<h3>Paid against asking</h3>
       <ul class="mp-list">${l.byCategory.map((g) => `<li><span class="mp-strong">${escape(titleCase(g.label))}</span>
         <span class="mp-dim">${plural(g.purchases, 'purchase')}, ${escape(ratio(g))}</span></li>`).join('')}</ul>
       <h3>Where the purchases came from</h3>
       <ul class="mp-list">${l.byGround.map((g) => `<li><span class="mp-strong">${escape(titleCase(g.label))}</span>
         <span class="mp-dim">${plural(g.purchases, 'purchase')}</span></li>`).join('')}</ul>`
    : emptyState(`Not enough yet: ${plural(l.purchases, 'real purchase')} so far, and a pattern needs five. ${l.needed} to go.`);
  const review = m.review.length
    ? `<div class="table-wrap"><table class="table">
        <thead><tr><th>Threshold</th><th class="num">Typed</th><th class="num">Sold prices say</th><th class="num">Out by</th></tr></thead>
        <tbody>${m.review.map((r) => `<tr><td>${escape(r.name)}: ${escape(r.threshold)}
          <span class="mp-dim mp-block">${plural(r.sold_n, 'sold price')}</span></td>
          <td class="num">${escape(money(r.typed))}</td><td class="num">${escape(money(r.implied))}</td>
          <td class="num">${r.pct_out > 0 ? '+' : ''}${escape(r.pct_out)}%</td></tr>`).join('')}</tbody></table></div>
       <p class="mp-note">Nothing has been changed. A threshold moves only when you say so, and the change is logged with its reason.</p>`
    : emptyState('No threshold is disputed. The evidence suggests a change only once five sold prices disagree by more than a fifth.');
  return section('lessons', 'What the buying has taught', `
    ${learned}
    <h3>Thresholds the evidence says to revisit</h3>
    ${review}
    ${m.stale.length ? `<p class="mp-note">${plural(m.stale.length, 'ladder')} priced over a year ago and now stale:
      ${m.stale.map((q) => escape(q.name)).join(', ')}.</p>` : ''}`);
}

/** 8. The brief and the makers. */
function briefHtml(m) {
  if (!m.brief) return section('brief', 'The brief', emptyState('No brief yet: the look being bought for has not been written down.'));
  const prov = provenance(m.brief.confidence);
  const makerGroup = (standing, label) => {
    const list = m.makers.filter((k) => k.standing === standing);
    return list.length ? `<details class="detail mp-fold"><summary>${label} (${list.length})</summary><div>
      <ul class="mp-list">${list.map((k) => `<li><span class="mp-strong">${escape(k.name)}</span>
        <span class="chip">${escape(titleCase(k.category))}</span>
        ${provenance(k.confidence).trusted ? '' : '<span class="chip">Unchecked</span>'}
        <span class="mp-dim">${escape([k.what, k.how_to_tell ? `Tell: ${k.how_to_tell}` : null, k.price_effect].filter(Boolean).join(' '))}</span>
      </li>`).join('')}</ul></div></details>` : '';
  };
  return section('brief', 'The brief and the makers', `
    <p class="spec__buy"><span class="spec__tag">Buy</span>${escape(m.brief.style_brief)}</p>
    <p class="spec__reject"><span class="spec__tag">Reject</span>${escape(m.brief.reject_brief)}</p>
    <p class="mp-line"><span class="${prov.cls}">${escape(prov.label)}</span></p>
    ${(m.brief.rules ?? []).length ? `<ul class="mp-list">${m.brief.rules.map((r) => `<li>
      <span class="mp-strong">${escape(titleCase(r.key))}</span> ${escape(r.rule)}
      <span class="mp-dim">${escape(r.why ?? '')}</span></li>`).join('')}</ul>` : ''}
    <h3>Makers</h3>
    ${m.makers.length ? `<p class="mp-note">A maker counts only when its mark has been SEEN: a stamp, a label, a backstamp.
      A seller's word is a claim.</p>
      ${makerGroup('seek', 'Seek')}${makerGroup('acceptable', 'Fine at the right price')}${makerGroup('avoid', 'Avoid')}`
      : emptyState('No makers recorded yet.')}`);
}

export function referenceHtml(m) {
  return `${groundsHtml(m)}${boughtHtml(m)}${lessonsHtml(m)}${briefHtml(m)}`;
}
