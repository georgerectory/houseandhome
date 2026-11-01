// The offer, as a section the Money page and the Handbook share.
//
// Everything comes out of engine/offer.js from ra_variables and
// cost_rollup. The page states the number, how it is made up, what moves
// it and what it rests on; it never says the price is affordable, and a
// figure nobody has confirmed is shown as provisional beside it.
import { escape, money } from '../../core/format.js';
import { offerInputs, offerPlan } from '../../engine/offer.js';

const monthName = (ym) => {
  const [y, m] = String(ym).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
};
const prov = (v) => `<span class="value--provisional">${money(v)}</span>`;
const tr = (cells) => `<tr>${cells.map((c, i) => `<td${i ? ' class="num"' : ''}>${c}</td>`).join('')}</tr>`;
const table = (head, rows) => `<div class="table-wrap"><table class="table">
    <thead><tr>${head.map((h, i) => `<th${i ? ' class="num"' : ''}>${escape(h)}</th>`).join('')}</tr></thead>
    <tbody>${rows.join('')}</tbody></table></div>`;

/** The offer section, or a plain statement of what is missing. */
export function offerHtml(vars, rollup) {
  const { ready, missing, inputs } = offerInputs(vars, rollup);
  if (!ready) return `<p class="lede">Not enough recorded to work out an offer. Missing: ${escape(missing.join('; '))}.</p>`;
  const p = offerPlan(inputs);
  if (p.tender == null) return '<p class="lede">On the recorded figures no price keeps the reserve whole.</p>';
  const b = p.atTender;
  return `<p class="lede">The most the recorded money supports with the day-one reserve kept whole, for completion in
      ${escape(monthName(p.completion))}. It is a model of the figures below, not a promise: every line marked
      provisional rests on a figure nobody has confirmed.</p>
    <p class="lede"><strong>Tender: ${money(p.tender)}</strong> (the maximum, ${money(p.max)}, rounded down to £50)</p>
    ${table(['On completion day', 'Amount'], [
      tr(['Cash available', prov(p.cash)]),
      tr([`Deposit (price less a loan of ${escape(money(b.loan))})`, prov(b.deposit)]),
      tr(['Stamp duty, first-time buyer', money(b.sdlt)]),
      ...inputs.fees.map((f) => tr([escape(f.label), f.confidence === 'confirmed' ? money(f.amount) : prov(f.amount)])),
      tr(['Kept back for day one', money(b.reserve)]),
      tr(['<strong>Left over</strong>', prov(b.margin)]),
    ])}
    <h3>What moves it</h3>
    ${table(['If', 'Short on the day', 'Most that would fund'], p.sensitivities.map((s) => tr([
      escape(s.label), s.shortfall > 0 ? prov(s.shortfall) : 'nothing', s.tender == null ? 'none' : prov(s.tender)])))}
    <h3>By completion month</h3>
    ${table(['Completion', 'Cash', 'Funded tender'], p.byMonth.map((m) => tr([
      escape(monthName(m.month)), prov(m.cash), m.tender == null ? 'none' : prov(m.tender)])))}
    ${p.payment ? `<p class="lede">Repayment on ${money(p.payment.loan)} over ${p.payment.years} years:
      ${prov(p.payment.monthly)} a month at ${(p.payment.rate * 100).toFixed(2)}%, ${prov(p.payment.plusOne)} if the
      rate is a point higher when the offer is issued.</p>` : ''}
    ${p.shortcomings.length ? `<h3>Shortcomings</h3><ul class="fp-list">${p.shortcomings.map((s) =>
      `<li>${escape(s)}</li>`).join('')}</ul>` : ''}`;
}
