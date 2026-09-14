// page.js - shared renderers. One definition per visual idea, used by
// every page, so a work item looks and reads the same everywhere it
// appears.
import { money, preciseMoney, range, duration, pct, provenance, titleCase, escape } from './format.js';

export function itemChips(i) {
  const chips = [];
  if (i.kind) chips.push(`<span class="chip">${escape(titleCase(i.kind))}</span>`);
  if (i.room_name) chips.push(`<span class="chip">${escape(i.room_name)}</span>`);
  if (i.trade) chips.push(`<span class="chip">${escape(titleCase(i.trade))}</span>`);
  if (i.theme) chips.push(`<span class="chip chip--accent">${escape(titleCase(i.theme))}</span>`);
  return chips.join(' ');
}

export function fundingBar(i) {
  const target = i.cost_expected ?? i.cost_best;
  if (target == null) return '';
  const bal = i.allocated_balance ?? 0;
  const p = pct(bal, target);
  return `<div class="fund">
    <div class="fund__track"><div class="fund__fill" style="--pct:${p.toFixed(1)}%"></div></div>
    <div class="fund__legend">
      <span class="num">${escape(preciseMoney(bal))} saved</span>
      <span class="num">${escape(money(target))} needed</span>
    </div>
  </div>`;
}

/** The full context of an item, one interaction away, never by default. */
export function itemDetail(i) {
  const prov = provenance(i.cost_confidence);
  const rows = [
    ['Priority', `#${i.priority}${i.priority_score ? ` (score ${i.priority_score})` : ''}`],
    ['Cost range', range(i.cost_best, i.cost_worst)],
    ['Working figure', `<span class="${prov.valueCls}">${escape(money(i.cost_expected))}</span>`],
    ['Cost confidence', `<span class="${prov.cls}">${escape(prov.label)}</span>`],
    ['Time', duration(i.duration_min_minutes, i.duration_max_minutes)],
    i.tools_required?.length ? ['Tools', i.tools_required.map(escape).join(', ')] : null,
    i.physical_demand ? ['Physical demand', titleCase(i.physical_demand)] : null,
    i.setting ? ['Setting', titleCase(i.setting)] : null,
    i.weather_needs?.length ? ['Weather', i.weather_needs.map(escape).join(', ')] : null,
    i.drying_or_curing_hours ? ['Drying time', `${i.drying_or_curing_hours}h`] : null,
    i.season_window?.length ? ['Season', i.season_window.map(escape).join(', ')] : null,
    i.benefit_type ? ['Benefit', titleCase(i.benefit_type)] : null,
  ].filter(Boolean);

  const e = i.priority_explain;
  const why = e?.base
    ? `<p class="card__body">Ranked by: room ${e.room_weight}/5 x theme ${e.theme_weight}/5 x benefit ${e.benefit_weight}/5 = ${e.base}.</p>`
    : '';

  return `<details class="detail">
    <summary>Detail</summary>
    <div>
      ${why}
      <dl class="dl">
        ${rows.map(([k, v]) => `<dt>${escape(k)}</dt><dd>${v}</dd>`).join('')}
      </dl>
    </div>
  </details>`;
}

export function itemCard(i, { showFunding = true } = {}) {
  const prov = provenance(i.cost_confidence);
  const target = i.cost_expected ?? i.cost_best;
  return `<article class="card">
    <div class="card__head">
      <h3 class="card__title">${escape(i.title)}</h3>
      <span class="num ${prov.valueCls}">${escape(money(target))}</span>
    </div>
    <div class="card__meta">${itemChips(i)}</div>
    ${showFunding ? fundingBar(i) : ''}
    ${itemDetail(i)}
  </article>`;
}

export function emptyState(message) {
  return `<p class="empty">${escape(message)}</p>`;
}
