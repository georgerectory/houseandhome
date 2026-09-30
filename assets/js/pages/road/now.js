// Road Ahead: Now. Where things stand before any what-if - the cash
// (the ledger's trusted figure beside the model's), the mortgage in
// principle, the pay path, the family stay and the renting, the rules
// no house may break, and the next dated actions. Returns markup.
import { escape, money, provenance } from '../../core/format.js';
import { monthName, dayName } from '../../engine/road-ahead/page/state.js';
import { keysMonth } from '../../engine/road-ahead/page/resolve.js';
import { monthIndex } from '../../engine/road-ahead/money.js';

/** A stored figure with its provenance: dotted when it is not confirmed. */
function figure(value, confidence, fmt = money) {
  const p = provenance(confidence);
  return `<span class="${p.valueCls}">${escape(fmt(value))}</span> <span class="${p.cls}">${escape(p.label)}</span>`;
}

const stat = (label, value, note = '') => `<div class="stat">
  <span class="stat__label">${escape(label)}</span>
  <span class="stat__value num">${value}</span>
  ${note ? `<span class="stat__note">${note}</span>` : ''}
</div>`;

/** A rule in words, with the figure it names. */
function ruleText(r, P) {
  const vals = (r.params ?? []).map((k) => P[k]).filter((v) => v != null);
  return vals.length ? `${r.rule}: ${vals.join(', ')}` : r.rule;
}

/**
 * @param {object} data loadRoadAhead()
 * @param {object} ctx resolve() under the default scenario, no what-ifs
 */
export function nowHtml(data, ctx) {
  const P = ctx.P;
  const variable = new Map(data.variables.map((v) => [v.key, v]));
  const conf = (k) => variable.get(k)?.confidence;
  const ledger = new Map(data.ledger.map((l) => [l.measure, l]));
  const cash = ledger.get('cash');
  const pay = ledger.get('net pay per month');

  const keys = keysMonth(ctx.roads);
  const rentFrom = P['timeline.bridge_from'];
  const rentMonths = keys && rentFrom ? Math.max(0, monthIndex(keys) - monthIndex(rentFrom)) : null;
  const maxRent = P['rules.rent_max_months'];
  const rentNote = rentMonths == null ? ''
    : `${rentMonths} month${rentMonths === 1 ? '' : 's'} of renting before the keys${maxRent != null && rentMonths > maxRent
      ? `: more than the ${maxRent} the rules allow` : ''}.`;

  const hard = data.rules.filter((r) => r.kind === 'hard');
  const next = data.next.slice(0, 3);

  const cashNote = cash?.ledger_value != null
    ? `Your accounts, confirmed: ${escape(money(cash.ledger_value))}${cash.ledger_as_of ? ` on ${escape(dayName(cash.ledger_as_of))}` : ''}.`
      + `${Math.abs(cash.ledger_value - cash.model_value) >= 1000 ? ' The model has not been re-based to it yet.' : ''}`
    : 'No confirmed account balance to set beside it.';
  const payNote = pay?.ledger_value != null ? `Your records, confirmed: ${escape(money(pay.ledger_value))} a month.` : '';

  return `<div class="stats rd-now__stats">
      ${stat('Cash, as the model starts', figure(P['cash.start_cash'], conf('cash.start_cash')), cashNote)}
      ${stat('Take-home pay a month', figure(P['income.net_pay_now'], conf('income.net_pay_now')), payNote)}
      ${stat('Mortgage in principle', figure(P['mortgage.mip_amount'], conf('mortgage.mip_amount')),
        `On a salary of ${escape(money(P['mortgage.mip_salary']))}.`)}
      ${stat('Pay', figure(P['income.gross_salary_now'], conf('income.gross_salary_now')),
        `Then ${escape(money(P['income.pay_rise_2027']))} more from ${escape(monthName(P['income.pay_rise_month']))}, `
        + `and ${escape(money(P['income.annual_rise_from_2028']))} each April from 2028.`)}
      ${stat('Family stay', escape(`to ${monthName(P['timeline.family_until'])}`),
        `Renting from ${escape(monthName(rentFrom))}; keys in ${escape(monthName(keys))}. ${escape(rentNote)}`)}
    </div>
    <h3 class="rd-sub">The rules no house breaks</h3>
    <ul class="rd-chips">${hard.map((r) => `<li class="chip">${escape(ruleText(r, P))}</li>`).join('')}</ul>
    <h3 class="rd-sub">Next</h3>
    ${next.length ? `<ol class="rd-next">${next.map((n) => `<li><span class="rd-next__when num">${n.days_until === 0 ? 'Today'
      : `${n.days_until} day${n.days_until === 1 ? '' : 's'}`}</span> <span>${escape(n.title)}</span></li>`).join('')}</ol>`
    : '<p class="rd-quiet">Nothing dated in the weeks ahead.</p>'}`;
}
