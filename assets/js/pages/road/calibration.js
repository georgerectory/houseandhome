// Road Ahead: Calibration. What a sit-down would cover, in its order
// (docs/road-ahead/CALIBRATION.md): the questions still open, where the
// model and the owner's own records disagree, the figures to confirm
// first, judgements due a second look, the owner's words the model has
// not yet taken in, and what has moved since the last accepted run.
// Every list is a view road_ahead_agenda() reads too, so the page and a
// sit-down agree. Nothing here changes a figure: the buttons copy a
// message for Claude. Returns markup.
import { escape, money } from '../../core/format.js';
import { dayName } from '../../engine/road-ahead/page/state.js';
import { kilo } from '../../engine/road-ahead/charts/scale.js';
import { ledgerRows, unreflected, movesText, judgementText } from '../../engine/road-ahead/page/record.js';
import { showFigure, unitOf } from '../../engine/road-ahead/page/figures.js';
import { londonToday } from '../../engine/road-ahead/page/auctions.js';
import { labelTag, trustTag } from './tags.js';

// The first few of a long list, the rest one interaction away.
const SHOWN = 5;
function some(items, render, rest) {
  const head = items.slice(0, SHOWN).map(render).join('');
  const tail = items.slice(SHOWN);
  return `<ol class="rd-items">${head}</ol>${tail.length ? `<details class="detail"><summary>${escape(rest(tail.length))}</summary>
    <ol class="rd-items" start="${SHOWN + 1}">${tail.map(render).join('')}</ol></details>` : ''}`;
}

const question = (c) => `<li class="rd-item">
  <p class="rd-item__title"><span class="rd-code">${escape(c.key)}</span> ${escape(c.topic)}</p>
  <dl class="rd-sides">
    <div><dt>${escape(c.source_a)}</dt><dd>${escape(c.position_a)}</dd></div>
    <div><dt>${escape(c.source_b)}</dt><dd>${escape(c.position_b)}</dd></div>
  </dl>
  <p class="rd-quiet">What it changes: ${escape(c.what_it_changes)}${c.value_at_stake != null
    ? `. At stake: ${escape(money(c.value_at_stake))}` : ''}</p>
</li>`;

function gaps(ledger, year) {
  const rows = ledgerRows(ledger).filter((l) => l.differs);
  if (!rows.length) return '<p class="rd-quiet">The model\'s cash and pay agree with your confirmed records.</p>';
  return `<ul class="rd-items">${rows.map((l) => `<li class="rd-item">
      <p class="rd-item__title">${escape(l.label)}</p>
      <p>The model runs on ${escape(money(l.model_value))}; your confirmed records say ${escape(money(l.ledger_value))}${
        l.ledger_as_of ? ` on ${escape(dayName(l.ledger_as_of, year))}` : ''}. A gap of ${escape(money(Math.abs(l.gap)))}.</p>
    </li>`).join('')}</ul>
    ${rows.some((l) => l.measure === 'cash') ? `<p><button type="button" class="btn btn--quiet" data-rebase>Copy: re-base to my records</button></p>` : ''}`;
}

function confirmFirst(calibrate, variables) {
  if (!calibrate.length) return '<p class="rd-quiet">No sensitivity snapshot yet: a session runs <code>tools/road-ahead.mjs agenda</code> to make one.</p>';
  const v = new Map(variables.map((x) => [x.key, x]));
  return `<ol class="rd-items">${calibrate.map((c) => {
    const row = v.get(c.variable_key);
    return `<li class="rd-item">
      <p class="rd-item__title">${escape(c.label ?? c.variable_key)} <span class="rd-code">${escape(c.variable_key)}</span></p>
      <p>Swings ${escape(movesText(c.moves))} by up to <strong>${escape(kilo(Number(c.swing)))}</strong>.</p>
      <p class="rd-quiet">${row ? `Now ${escape(showFigure(row.value, unitOf(row.key, row.unit)))}. ` : ''}${trustTag(c.confidence)}${labelTag(c.evidence)}</p>
    </li>`;
  }).join('')}</ol>`;
}

function revisit(rows, year) {
  if (!rows.length) return '<p class="rd-quiet">None: every judgement is recent, and no listing has been appraised since one was given.</p>';
  return `<ul class="rd-items">${rows.map((j) => `<li class="rd-item">
    <p class="rd-item__title"><span class="rd-code">${escape(j.listing_code)}</span> ${escape(j.listing_name)}: ${escape(judgementText(j))}</p>
    <p><q>${escape(j.reason)}</q> <span class="rd-quiet">(${escape(j.kind)}, ${escape(dayName(j.said_on, year))})</span></p>
    <p class="rd-quiet">${j.appraised_since ? `Appraised again on ${escape(dayName(j.appraised_since, year))}.` : 'Said more than three months ago.'}</p>
  </li>`).join('')}</ul>`;
}

const words = (s, year) => `<li class="rd-item">
  <p class="rd-item__title"><span class="rd-code">${escape(s.code)}</span>${s.said_on ? ` <span class="rd-quiet">${escape(dayName(s.said_on, year))}</span>` : ''}</p>
  <blockquote class="rd-words">${escape(s.words)}</blockquote>
  ${s.implies ? `<p class="rd-quiet">What it implies: ${escape(s.implies)}</p>` : ''}
  ${s.open_question ? `<p class="rd-quiet">Still to ask: ${escape(s.open_question)}</p>` : ''}
</li>`;

function moved(since, year) {
  const any = since.filter((r) => r.run);
  if (!any.length) return '<p class="rd-quiet">No run has been accepted yet.</p>';
  const cell = (f) => `<td class="num${f.moved ? ' rd-moved-cell' : ''}">${escape(kilo(f.was))} to ${escape(kilo(f.now))}${
    f.moved ? `<br><span class="rd-quiet">${f.now > f.was ? '+' : '-'}${escape(kilo(Math.abs(f.now - f.was)))}</span>` : ''}</td>`;
  const when = (r) => `${escape(dayName(londonToday(new Date(r.run.accepted_at)), year))}${r.run.source === 'kit' ? ', the kit' : ''}`;
  return `${since.some((r) => r.moved) ? '<p>Today\'s figures have moved by £1k or more since the last accepted run. What changed is under Variables; a new run is accepted only on your word.</p>'
    : '<p class="rd-quiet">Nothing has moved by £1k or more since the last accepted run.</p>'}
    <div class="table-wrap"><table class="table rd-since">
      <caption class="visually-hidden">Each road today against its last accepted run</caption>
      <thead><tr><th scope="col">Road</th><th scope="col">Accepted</th>
        ${any[0].fields.map((f) => `<th scope="col" class="num">${escape(f.label)}</th>`).join('')}</tr></thead>
      <tbody>${any.map((r) => `<tr><th scope="row"><span class="rd-code">${escape(r.code)}</span> ${escape(r.name)}</th>
        <td>${when(r)}</td>${r.fields.map(cell).join('')}</tr>`).join('')}</tbody>
    </table></div>`;
}

/**
 * @param {object} data loadRoadAhead()
 * @param {ReturnType<import('../../engine/road-ahead/page/record.js').sinceAccepted>} since
 * @param {string} today 'YYYY-MM-DD', London's
 */
export function calibrationHtml(data, since, today) {
  const year = Number(today.slice(0, 4));
  const waiting = unreflected(data.signals);
  return `<p class="rd-lede">What a sit-down would cover, in its order. Nothing here changes until you say so.</p>
    <p><button type="button" class="btn" data-sitdown>Copy: start a sit-down</button></p>
    <h3 class="rd-sub">Open questions <span class="rd-count">${data.contradictions.length}</span></h3>
    ${data.contradictions.length ? some(data.contradictions, question, (n) => `${n} more open questions`)
      : '<p class="rd-quiet">None open.</p>'}
    <h3 class="rd-sub">Where the model and your records disagree</h3>
    ${gaps(data.ledger, year)}
    <h3 class="rd-sub">Confirm these first</h3>
    <p class="rd-quiet">The figures that move the answer most while still unconfirmed; a confirmed one counts a tenth.</p>
    ${confirmFirst(data.calibrate, data.variables)}
    <h3 class="rd-sub">Judgements due a second look</h3>
    ${revisit(data.revisit, year)}
    <h3 class="rd-sub">Your words not yet taken in <span class="rd-count">${waiting.length}</span></h3>
    <p class="rd-quiet">Signals no road, rule, figure or decision carries yet. Newest first.</p>
    ${waiting.length ? some(waiting, (s) => words(s, year), (n) => `${n} more`) : '<p class="rd-quiet">None: every signal is reflected.</p>'}
    <h3 class="rd-sub">Since the last accepted run</h3>
    ${moved(since, year)}`;
}
