// The house in view, as sections the Plan, Money and Handbook pages share.
//
// Every figure is read from a row - cost_rollup, ra_variables, rooms,
// house_facts, the decisions and contradictions - and shown with how far
// it can be trusted. Nothing here says "affordable": a total of drafted
// figures is a model, and the page says so beside the number.
import { escape, money, titleCase } from '../../core/format.js';
import { variable, cashPlan } from '../../engine/cash-plan.js';

const share = (s) => (s == null ? '' : `<span class="chip">${Math.round(Number(s) * 100)}% unconfirmed</span>`);
const row = (cells) => `<tr>${cells.map((c, i) => `<td${i ? ' class="num"' : ''}>${c}</td>`).join('')}</tr>`;

const ROLLUP_TITLES = {
  plan: 'The realistic plan, by step',
  room: 'Room by room',
  stage: 'Design stages (parked, R-14)',
  idea: 'By idea',
  case: 'Day one, by case',
  condition: 'Condition work',
  phase: 'By phase',
};
const ROLLUP_NOTES = {
  room: 'Each room brought up to scratch on its own: made good, stripped only where it has failed. The kitchen and bathroom carry their refits.',
  stage: 'Parked by R-14 (no extensions, no structural work); kept for comparison. S2a and S2b are two routes to one en-suite: never add them.',
  idea: 'Ideas share items (the rear range carries the boot room, the WC and the store at once), so these do not add up to a total.',
  case: 'Each case is the whole day-one list for one condition of the services: alternatives, not addends. The services answer picks one.',
};

/** Cost tables from cost_rollup, one per dimension asked for. */
export function costsHtml(rollup, dims = ['stage', 'idea', 'case', 'condition']) {
  const rows = rollup ?? [];
  if (!rows.length) return '<p class="lede">No costed work for the house in view yet.</p>';
  return dims.map((dim) => {
    const list = rows.filter((r) => r.dim === dim)
      .sort((a, b) => Number(b.cost_base ?? 0) - Number(a.cost_base ?? 0));
    if (!list.length) return '';
    return `<h3>${escape(ROLLUP_TITLES[dim] ?? titleCase(dim))}</h3>
      ${ROLLUP_NOTES[dim] ? `<p class="lede">${escape(ROLLUP_NOTES[dim])}</p>` : ''}
      <div class="table-wrap"><table class="table">
        <thead><tr><th>${escape(titleCase(dim))}</th><th class="num">Low</th><th class="num">Typical</th>
          <th class="num">High</th><th class="num">Items</th><th class="num">Trust</th></tr></thead>
        <tbody>${list.map((r) => row([
          escape(titleCase(String(r.key).replace(/-/g, ' '))),
          `<span class="value--provisional">${money(r.cost_low)}</span>`,
          `<span class="value--provisional">${money(r.cost_base)}</span>`,
          `<span class="value--provisional">${money(r.cost_high)}</span>`,
          `${r.items_costed}/${r.items}`,
          share(r.unconfirmed_share),
        ])).join('')}</tbody>
      </table></div>`;
  }).join('');
}

const when = (r, id) => r?.items.find((i) => i.id === id)?.month ?? null;
const monthName = (ym) => {
  if (!ym) return 'not within the horizon';
  const [y, m] = ym.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' });
};

/**
 * Whether the purchase and offer figures (Road Ahead variables, which are
 * the household's) belong to the house in view. offer.property_ref names
 * the house they were worked for; on any other house they are not shown,
 * so one house's tender can never be read as another's.
 */
export function isOfferHouse(vars, property, isDefault = true) {
  const ref = variable(vars, 'offer.property_ref');
  return ref ? ref === property?.ref : !!isDefault;
}

export const notForThisHouse = (property) => `<p class="lede">No purchase or offer has been modelled for
  ${escape(property?.name ?? 'this house')} yet. It is worked up from its own figures, never from another house's.</p>`;

/** The realistic cash plan for the house in view, with room names. */
export function realisticPlan(vars, rollup, rooms) {
  const roomNames = Object.fromEntries((rooms ?? []).map((r) => [r.key, r.name]));
  return cashPlan(vars ?? [], rollup ?? [], { roomNames });
}

/** When each group of work could be funded from the planned budget. */
export function cashHtml(plan) {
  if (!plan?.ready) {
    return `<p class="lede">Not enough recorded to model this yet. Missing: ${escape((plan?.missing ?? []).join('; '))}.</p>`;
  }
  const spareNow = plan.spare[0]?.amount;
  const spareLater = plan.spare[plan.spare.length - 1]?.amount;
  return `<p class="lede">A model, not a forecast. It starts with ${money(plan.startCash)} kept back on completion
      day, adds the planned monthly spare (${money(spareNow)} now, ${money(spareLater)} after the pay rise) and
      funds the work in this order, each group once the money exists. Every cost below rests on figures nobody
      has confirmed${plan.bonus ? `, and the second column also assumes a net bonus of ${money(plan.bonus)} every
      April, which is never guaranteed` : ''}.</p>
    <div class="table-wrap"><table class="table">
      <thead><tr><th>Work, in order</th><th class="num">Typical cost</th><th class="num">Planned budget only</th>
        ${plan.withBonus ? '<th class="num">With the bonus</th>' : ''}</tr></thead>
      <tbody>${plan.items.map((g) => row([
        escape(g.label),
        `<span class="value--provisional">${money(g.cost)}</span>`,
        escape(monthName(when(plan.plain, g.id))),
        ...(plan.withBonus ? [escape(monthName(when(plan.withBonus, g.id)))] : []),
      ])).join('')}</tbody>
    </table></div>
    <p class="lede">Read the gaps, not the dates: where a group lands years out or beyond the horizon, the
      restoration needs another route - more of the work done by hand, a further advance, or borrowing against
      the value the work adds - and that is a decision for the owner, not for this page.</p>`;
}

/** The purchase, from ra_variables and the current decisions. */
export function purchaseHtml(vars, decisions) {
  const v = (k) => variable(vars, k);
  const lines = [
    ['Decision in principle (31 Oct)', v('mortgage.dip_max_expected'), 'Nationwide, 35 years'],
    ['Savings now (ISA)', v('cash.isa_balance_est'), 'Owner, 30 Oct'],
    ['Kept back for day one', v('cash.works_buffer'), 'Owner'],
    ['Take-home pay', v('income.net_pay_now'), 'Payslips'],
    ['Planned monthly budget after the move', v('costs.planned_post_move')?.total, 'Owner, 31 Oct'],
  ].filter(([, value]) => value != null);
  const current = (decisions ?? []).filter((x) => (x.is_current ?? true) && /^R-|^RA-/.test(x.code ?? ''))
    .sort((a, b) => String(b.decided_on ?? '').localeCompare(String(a.decided_on ?? ''))).slice(0, 6);
  return `${lines.length ? `<div class="table-wrap"><table class="table">
      <thead><tr><th>Figure</th><th class="num">Value</th><th>Source</th></tr></thead>
      <tbody>${lines.map(([label, value, src]) => `<tr><td>${escape(label)}</td>
        <td class="num">${money(value)}</td><td>${escape(src)}</td></tr>`).join('')}</tbody>
    </table></div>` : '<p class="lede">No purchase figures recorded.</p>'}
    ${current.length ? `<h3>Current decisions</h3><ul class="fp-list">${current.map((x) =>
      `<li><strong>${escape(x.code)}</strong> ${escape(x.title ?? '')}: ${escape(x.decided ?? '')}</li>`).join('')}</ul>` : ''}`;
}

/** Condition from the rooms, the house facts and the open contradictions. */
export function conditionHtml(rooms, facts, contradictions) {
  const rated = (rooms ?? []).filter((r) => r.condition && r.condition !== 'unknown');
  const open = (contradictions ?? []).filter((c) => String(c.key ?? '').startsWith('fv-'));
  return `${rated.length ? `<div class="table-wrap"><table class="table">
      <thead><tr><th>Room</th><th>Condition</th></tr></thead>
      <tbody>${rated.map((r) => `<tr><td>${escape(r.name)}</td><td>${escape(titleCase(r.condition))}</td></tr>`).join('')}</tbody>
    </table></div>` : ''}
    ${(facts ?? []).length ? `<ul class="fp-list">${facts.map((f) =>
      `<li><strong>${escape(f.fact)}</strong>${f.detail ? ` - ${escape(f.detail)}` : ''}</li>`).join('')}</ul>` : ''}
    ${open.length ? `<h3>Open questions (${open.length})</h3><ul class="fp-list">${open.map((c) =>
      `<li><strong>${escape(c.topic)}</strong>: ${escape(c.position_a)} / ${escape(c.position_b)}</li>`).join('')}</ul>` : ''}`;
}
