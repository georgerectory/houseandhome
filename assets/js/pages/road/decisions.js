// Road Ahead: Decisions. The road's decisions in force, by topic, with
// those still open first; the decisions they replaced, on demand; and
// the owner's own words - signals, patterns and reactions to listings -
// each with what it is joined to, and whether the model has taken it in.
// A replaced decision is never shown as current: ra_decision_history
// says which are in force, as ra_current_decisions does for a session.
// Returns markup.
import { escape } from '../../core/format.js';
import { dayName } from '../../engine/road-ahead/page/state.js';
import { decisionGroups, signalGroups, FIRMNESS } from '../../engine/road-ahead/page/record.js';
import { labelTag } from './tags.js';

const FIRM = new Map(FIRMNESS);
const DOOR = { 'one-way': 'one-way door', 'two-way': 'two-way door' };
const CERTAINTY = { H: 'high certainty', M: 'medium certainty', L: 'low certainty' };
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function decision(d, year) {
  const meta = [FIRM.get(d.firmness), d.decided_on ? `decided ${dayName(d.decided_on, year)}` : null,
    CERTAINTY[d.certainty], DOOR[d.door]].filter(Boolean).join(' · ');
  return `<li class="rd-item">
    <p class="rd-item__title"><span class="rd-code">${escape(d.code)}</span> ${escape(d.title)}</p>
    ${d.decided ? `<p class="rd-decided">${escape(d.decided)}</p>` : '<p class="rd-decided rd-quiet">Not decided yet.</p>'}
    <p class="rd-quiet">${escape(meta)}${labelTag(d.evidence)}</p>
    ${d.rationale ? `<p class="rd-quiet">Why: ${escape(d.rationale)}</p>` : ''}
    ${d.reopen_if ? `<p class="rd-quiet">Reopen if: ${escape(d.reopen_if)}</p>` : ''}
    ${d.checkpoint ? `<p class="rd-quiet">Checked at: ${escape(d.checkpoint)}</p>` : ''}
    ${d.supersedes?.length ? `<p class="rd-quiet">Replaces ${escape(d.supersedes.join(', '))}.</p>` : ''}
  </li>`;
}

const replaced = (d, year) => `<li class="rd-item">
  <p class="rd-item__title"><span class="rd-code">${escape(d.code)}</span> ${escape(d.title)}</p>
  ${d.decided ? `<p class="rd-decided rd-decided--old">${escape(d.decided)}</p>` : ''}
  <p class="rd-quiet">${d.superseded_by?.length ? `Replaced by ${escape(d.superseded_by.join(', '))}` : escape(d.status === 'reversed' ? 'Reversed' : 'Replaced')}${
    d.decided_on ? `; decided ${escape(dayName(d.decided_on, year))}` : ''}.</p>
</li>`;

const LINK_WORDS = { listing: 'listing', road: 'road', ra_rule: 'rule', ra_variable: 'figure', decision: 'decision',
  signal: 'signal', evidence: 'evidence' };

function signal(s, year) {
  const links = (s.links ?? []).filter((l) => l.code);
  return `<li class="rd-item">
    <p class="rd-item__title"><span class="rd-code">${escape(s.code)}</span>${s.said_on ? ` <span class="rd-quiet">${escape(dayName(s.said_on, year))}</span>` : ''}${
      s.kind === 'signal' ? ` <span class="chip${s.is_reflected ? ' chip--accent' : ''}">${s.is_reflected ? 'Taken in' : 'Not yet taken in'}</span>` : ''}</p>
    <blockquote class="rd-words">${escape(s.words)}</blockquote>
    ${s.context ? `<p class="rd-quiet">${escape(s.context)}</p>` : ''}
    ${s.implies ? `<p class="rd-quiet">What it implies: ${escape(s.implies)}</p>` : ''}
    ${s.open_question ? `<p class="rd-quiet">Still to ask: ${escape(s.open_question)}</p>` : ''}
    ${s.rating ? `<p class="rd-quiet">Rating: ${escape(s.rating)}</p>` : ''}
    ${links.length ? `<ul class="rd-chips rd-links">${links.map((l) => `<li class="chip">${escape(l.reads)} ${escape(LINK_WORDS[l.type] ?? l.type)} <span class="rd-code">${escape(l.code)}</span></li>`).join('')}</ul>` : ''}
  </li>`;
}

/**
 * @param {object} data loadRoadAhead()
 * @param {string} today 'YYYY-MM-DD'
 */
export function decisionsHtml(data, today) {
  const year = Number(today.slice(0, 4));
  const g = decisionGroups(data.decisions);
  const counts = FIRMNESS.map(([f, label]) => `${g.counts[f]} ${label.toLowerCase()}`).join(', ');
  return `<p class="rd-lede">${escape(plural(g.total, 'decision'))} in force: ${escape(counts)}. Locked is settled; leaning is the
      current view; open is still to decide. A decision changes only by a newer one replacing it.</p>
    <h3 class="rd-sub">Still open <span class="rd-count">${g.open.length}</span></h3>
    ${g.open.length ? `<ol class="rd-items">${g.open.map((d) => decision(d, year)).join('')}</ol>` : '<p class="rd-quiet">None open.</p>'}
    <h3 class="rd-sub">In force, by topic</h3>
    <div class="rd-topics">${g.topics.map((t) => `<details class="detail" data-topic="${escape(t.topic)}">
      <summary>${escape(t.topic)} <span class="rd-quiet">${escape([plural(t.rows.length, 'decision'),
        t.open ? `${t.open} open` : null, t.lean ? `${t.lean} leaning` : null].filter(Boolean).join(', '))}</span></summary>
      <ol class="rd-items">${t.rows.map((d) => decision(d, year)).join('')}</ol>
    </details>`).join('')}</div>
    ${g.replaced.length ? `<details class="detail"><summary>${escape(plural(g.replaced.length, 'replaced decision'))}</summary>
      <ol class="rd-items">${g.replaced.map((d) => replaced(d, year)).join('')}</ol></details>` : ''}
    <h3 class="rd-sub">In your words</h3>
    <p class="rd-quiet">What you have said about houses, roads and the plan, kept as you said it.</p>
    <div class="rd-topics">${signalGroups(data.signals).map((s) => `<details class="detail" data-signals="${escape(s.kind)}">
      <summary>${escape(s.label)} <span class="rd-quiet">${escape([String(s.rows.length),
        s.kind === 'signal' && s.waiting ? `${s.waiting} not yet taken in` : null].filter(Boolean).join(', '))}</span></summary>
      <ol class="rd-items">${s.rows.map((x) => signal(x, year)).join('')}</ol>
    </details>`).join('')}</div>`;
}
