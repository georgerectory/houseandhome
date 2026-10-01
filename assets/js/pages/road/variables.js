// Road Ahead: Variables. Every figure the model runs on, in its group and
// its own unit, with its range, how far it is trusted and where it came
// from; the model's figures beside the owner's own confirmed records; and
// every logged change - old, new, why, on whose word and when. Read-only:
// a figure changes through Claude, with its reason, and comes back here.
// Returns markup.
import { escape, money, isTrusted } from '../../core/format.js';
import { dayName } from '../../engine/road-ahead/page/state.js';
import { variableGroups } from '../../engine/road-ahead/page/figures.js';
import { ledgerRows, changeRows } from '../../engine/road-ahead/page/record.js';
import { labelTag, trustTag } from './tags.js';

const SHOWN_CHANGES = 12;

function besideLedger(ledger, year) {
  const rows = ledgerRows(ledger);
  if (!rows.length) return '';
  return `<div class="table-wrap"><table class="table rd-ledger">
    <caption class="visually-hidden">The model's figures beside your own confirmed records</caption>
    <thead><tr><th scope="col">Figure</th><th scope="col" class="num">The model</th>
      <th scope="col" class="num">Your records</th><th scope="col" class="num">Gap</th></tr></thead>
    <tbody>${rows.map((l) => `<tr${l.differs ? ' class="rd-differs"' : ''}>
      <th scope="row">${escape(l.label)}${l.key ? ` <span class="rd-code">${escape(l.key)}</span>` : ''}</th>
      <td class="num">${escape(money(l.model_value))}<br>${trustTag(l.model_confidence)}</td>
      <td class="num">${l.ledger_value == null ? 'None confirmed' : escape(money(l.ledger_value))}${
        l.ledger_as_of ? `<br><span class="rd-quiet">${escape(dayName(l.ledger_as_of, year))}</span>` : ''}</td>
      <td class="num">${l.gap == null ? '—' : escape(money(l.gap))}</td>
    </tr>`).join('')}</tbody>
  </table></div>
  ${rows.some((l) => l.measure === 'cash' && l.differs) ? `<p class="rd-quiet">The model has not been re-based to your records.
    A re-base moves its start to today's confirmed figures, with a reason, and the roads then answer from today.</p>
    <p><button type="button" class="btn btn--quiet" data-rebase>Copy: re-base to my records</button></p>` : ''}`;
}

const figureRow = (v, year) => `<tr>
  <th scope="row">${escape(v.label ?? v.key)}<br><span class="rd-code">${escape(v.key)}</span></th>
  <td class="${isTrusted(v.confidence) ? '' : 'value--provisional'}">${escape(v.shown)}${v.changed
    ? `<br><span class="rd-quiet">Changed ${escape(dayName(v.changed.on, year))}</span>` : ''}</td>
  <td>${v.range ? escape(v.range) : '—'}</td>
  <td>${trustTag(v.confidence)}${labelTag(v.evidence)}</td>
  <td>${escape(v.source ?? '')}${v.source_date ? `<br><span class="rd-quiet">${escape(dayName(v.source_date, year))}</span>` : ''}</td>
</tr>`;

const changeRow = (c, year) => `<tr>
  <td>${escape(dayName(c.on, year))}</td>
  <th scope="row"><span class="rd-code">${escape(c.code ?? '')}</span>${c.label ? `<br>${escape(c.label)}` : ''}</th>
  <td>${escape(c.what)}</td>
  <td>${escape(c.was)}</td>
  <td>${escape(c.now)}</td>
  <td>${escape(c.why ?? '')}${c.source ? `<br><span class="rd-quiet">${escape(c.source)}</span>` : ''}</td>
</tr>`;

const changeTable = (rows, year, caption) => `<div class="table-wrap"><table class="table rd-changes">
  <caption class="visually-hidden">${escape(caption)}</caption>
  <thead><tr><th scope="col">When</th><th scope="col">What</th><th scope="col">Field</th><th scope="col">Was</th>
    <th scope="col">Now</th><th scope="col">Why</th></tr></thead>
  <tbody>${rows.map((c) => changeRow(c, year)).join('')}</tbody>
</table></div>`;

/**
 * @param {object} data loadRoadAhead()
 * @param {string} today 'YYYY-MM-DD'
 */
export function variablesHtml(data, today) {
  const year = Number(today.slice(0, 4));
  const changes = changeRows(data.changes, data.variables);
  const groups = variableGroups(data.variables, changes);
  const trusted = data.variables.filter((v) => isTrusted(v.confidence)).length;
  const head = changes.slice(0, SHOWN_CHANGES);
  const tail = changes.slice(SHOWN_CHANGES);
  return `<p class="rd-lede">${data.variables.length} figures the model runs on; ${trusted} confirmed by you. Only a confirmed
      figure may drive real money: the rest are the model's assumptions until you say otherwise.</p>
    <h3 class="rd-sub">Beside your own records</h3>
    ${besideLedger(data.ledger, year)}
    <h3 class="rd-sub">Every figure</h3>
    <div class="rd-topics">${groups.map((g) => `<details class="detail" data-group="${escape(g.key)}">
      <summary>${escape(g.name)} <span class="rd-quiet">${g.rows.length} figure${g.rows.length === 1 ? '' : 's'}${g.unconfirmed
        ? `, ${g.unconfirmed} unconfirmed` : ''}</span></summary>
      <div class="table-wrap"><table class="table rd-vars">
        <caption class="visually-hidden">${escape(g.name)}: each figure, its range, its trust and its source</caption>
        <thead><tr><th scope="col">Figure</th><th scope="col">Value</th><th scope="col">Range</th>
          <th scope="col">Trust</th><th scope="col">Source</th></tr></thead>
        <tbody>${g.rows.map((v) => figureRow(v, year)).join('')}</tbody>
      </table></div>
    </details>`).join('')}</div>
    <h3 class="rd-sub">What changed <span class="rd-count">${changes.length}</span></h3>
    <p class="rd-quiet">Every change to a figure, a listing or a scenario, newest first, with the reason given.</p>
    ${changes.length ? changeTable(head, year, 'Every logged change, newest first') : '<p class="rd-quiet">Nothing has changed yet.</p>'}
    ${tail.length ? `<details class="detail"><summary>${tail.length} earlier changes</summary>${changeTable(tail, year, 'Earlier changes')}</details>` : ''}`;
}
