// roadmap-detail.js - the item drawer, and the export it can write.
// Pure: data in, HTML string or object out.
//
// Every bar and card on the board is clickable, and this is what opens.
// It is the whole record of an item in one panel: where it sits, what it
// buys the house, what it costs and how far its money has got, what it
// needs to be done, its children, and the reasoning recorded against it.

import {
  themeLabel, bandLabel, endBandLabel, progressOf, barKids, stepsOf,
  childStats, colStart, colEnd, BANDS,
} from './roadmap-model.js';
import { money, preciseMoney, duration, provenance, titleCase, escape } from '../core/format.js';

const row = (label, value) =>
  value == null || value === '' ? ''
    : `<div class="rmd-row"><dt>${escape(label)}</dt><dd>${value}</dd></div>`;

const note = (label, text) =>
  !text ? '' : `<section class="rmd-section"><h3>${escape(label)}</h3>
    <p class="rmd-note">${escape(text)}</p></section>`;

/** One clickable child row. Clicking swaps the drawer to that item
 *  rather than navigating, so a project can be explored without losing
 *  the board behind it. */
const stepRow = (k) => `<li class="rmv-step${k.status === 'done' ? ' rmv-step--done' : ''}"
  data-item-id="${escape(k.id)}" role="button" tabindex="0"
  ><span class="rmv-step-mark" aria-hidden="true"></span
  ><span class="rmv-step-title">${escape(k.title)}</span></li>`;

function progressCell(item) {
  const p = progressOf(item);
  // The fill width is a runtime value, so it rides a custom property
  // rather than a static inline style.
  return `<div class="rmd-progress" role="img" aria-label="Progress: ${escape(p.label)}">
    <div class="rmd-progress__track"><div class="rmd-progress__fill" style="--pct:${p.pct}%"></div></div>
    <span class="num">${p.pct}%</span></div>`;
}

/** Where this sits on the board, in words - so the drawer and the board
 *  never disagree about placement. */
function placementHtml(item) {
  const s = bandLabel(item);
  const e = endBandLabel(item);
  const span = colEnd(item) > colStart(item) ? `${s} through ${e}` : s;
  return row('On the board', escape(span));
}

function moneyHtml(item) {
  const target = item.cost_expected ?? item.cost_best;
  if (target == null) return '';
  const prov = provenance(item.cost_confidence);
  const bal = Number(item.allocated_balance ?? 0);
  const pct = target > 0 ? Math.min(100, (bal / target) * 100) : 0;
  return `<section class="rmd-section"><h3>Money</h3>
    <dl class="rmd-rows">
      ${row('Estimate', `<span class="num ${prov.valueCls}">${escape(money(target))}</span>`)}
      ${row('Range', escape(item.cost_best != null && item.cost_worst != null
        ? `${money(item.cost_best)} to ${money(item.cost_worst)}` : '—'))}
      ${row('Confidence', `<span class="${prov.cls}">${escape(prov.label)}</span>`)}
      ${row('Saved so far', `<span class="num">${escape(preciseMoney(bal))}</span>`)}
    </dl>
    <div class="fund"><div class="fund__track"><div class="fund__fill" style="--pct:${pct.toFixed(1)}%"></div></div></div>
    ${prov.trusted ? '' : '<p class="rmd-note">This estimate has not been confirmed, so it is not '
      + 'driving any decision yet.</p>'}</section>`;
}

/** What it takes to actually do the thing. This is the half a plain
 *  backlog leaves out, and the half that answers "can I do this now". */
function doingHtml(item) {
  // An em dash is what the formatter returns for "nothing recorded", and
  // a row carrying only that is noise: it makes an empty section look
  // filled in. Absent stays absent, so the section appears only when
  // there is genuinely something to say about doing the job.
  const hasDuration = item.duration_min_minutes != null || item.duration_max_minutes != null;
  const rows = [
    row('Time', hasDuration
      ? escape(duration(item.duration_min_minutes, item.duration_max_minutes)) : ''),
    row('Shortest useful session', item.min_session_minutes
      ? escape(`${item.min_session_minutes} minutes`) : ''),
    row('Tools', (item.tools_required ?? []).length
      ? escape(item.tools_required.join(', ')) : ''),
    row('Materials ready', item.materials_ready === true ? 'Yes'
      : item.materials_ready === false ? 'No' : ''),
    row('Effort', item.physical_demand ? escape(titleCase(item.physical_demand)) : ''),
    row('Posture', (item.posture ?? []).length ? escape(item.posture.join(', ')) : ''),
    row('Where', item.setting ? escape(titleCase(item.setting)) : ''),
    row('Weather', (item.weather_needs ?? []).length ? escape(item.weather_needs.join(', ')) : ''),
    row('Needs daylight', item.needs_daylight ? 'Yes' : ''),
    row('Mess', item.mess_level ? escape(titleCase(item.mess_level)) : ''),
    row('Noise', item.noise_level ? escape(titleCase(item.noise_level)) : ''),
    row('Drying or curing', item.drying_or_curing_hours
      ? escape(`${item.drying_or_curing_hours} hours`) : ''),
    row('Season', (item.season_window ?? []).length ? escape(item.season_window.join(', ')) : ''),
    row('Two people', item.two_person_job ? 'Yes' : ''),
    row('Skill', item.skill_level ? escape(titleCase(item.skill_level)) : ''),
  ].filter(Boolean).join('');
  return rows ? `<section class="rmd-section"><h3>Doing it</h3><dl class="rmd-rows">${rows}</dl></section>` : '';
}

function benefitHtml(item) {
  if (!item.house_benefit && !item.benefit_type) return '';
  const drafted = item.benefit_status !== 'confirmed';
  return `<section class="rmd-section"><h3>What it buys the house</h3>
    ${item.benefit_type ? `<p><span class="chip chip--accent">${escape(titleCase(item.benefit_type))}</span></p>` : ''}
    ${item.house_benefit ? `<p class="rmd-note${drafted ? ' value--provisional' : ''}">${escape(item.house_benefit)}</p>` : ''}
    ${item.house_benefit ? `<p class="${drafted ? 'prov prov--unconfirmed' : 'prov prov--confirmed'}">${
      drafted ? 'Drafted, not yet confirmed' : 'Confirmed'}</p>` : ''}</section>`;
}

function filingHtml(item, ctx) {
  return `<section class="rmd-section"><h3>Filing</h3><dl class="rmd-rows">
    ${row('Room', item.room_name ? escape(item.room_name) : '')}
    ${row('Trade', item.trade ? escape(titleCase(item.trade)) : '')}
    ${row('Also touches', (item.associated_trades ?? []).length
      ? escape(item.associated_trades.map(titleCase).join(', ')) : '')}
    ${row('Intent', escape(themeLabel(item, ctx)))}
    ${row('Kind', item.kind ? escape(titleCase(item.kind)) : '')}
    ${row('Status', item.status ? escape(titleCase(item.status)) : '')}
    ${placementHtml(item)}
    ${row('Doing it', item.performed_by ? escape(titleCase(item.performed_by)) : '')}
    ${row('Assigned to', item.assignee ? escape(item.assignee) : '')}
  </dl></section>`;
}

/** Why this sits where it does. The board can always explain its own
 *  order, which is the point of computing priority rather than typing it. */
function priorityHtml(item) {
  const e = item.priority_explain;
  if (!e || !e.base) return '';
  const parts = [`room ${e.room_weight}/5 x intent ${e.theme_weight}/5 x benefit ${e.benefit_weight}/5 = ${e.base}`];
  if (e.unblocks) parts.push(`+${e.unblocks_bonus} for unblocking ${e.unblocks} item(s)`);
  if (e.decay_pressure) parts.push(`+${e.decay_pressure} for age`);
  if (e.blocked_by) parts.push(`${e.blocked_penalty} because ${e.blocked_by} item(s) block it`);
  return `<section class="rmd-section"><h3>Why it ranks here</h3>
    <p class="rmd-note">Priority ${item.priority}, score ${item.priority_score}.</p>
    <p class="rmd-note">${escape(parts.join(', '))}</p></section>`;
}

export function drawerHtml(item, ctx) {
  const kids = barKids(item, ctx);
  const steps = stepsOf(item, ctx);
  const stats = childStats(item, ctx);

  const kidsSection = kids.length
    ? `<section class="rmd-section"><h3>Jobs in this project</h3>
       <ul class="rmv-step-list">${kids.map(stepRow).join('')}</ul></section>` : '';
  const stepsSection = steps.length
    ? `<section class="rmd-section"><h3>Steps</h3>
       <p class="rmv-steps-head">${stats.done} of ${steps.length} done</p>
       <ul class="rmv-step-list">${steps.map(stepRow).join('')}</ul></section>` : '';

  return `<div class="rmd-head">
      <span class="eyebrow">${escape(themeLabel(item, ctx))}</span>
      ${item.level === 'project' ? '<p class="rmv-project-tag">Project</p>' : ''}
      <h2>${escape(item.title)}</h2>
      ${progressCell(item)}
    </div>
    ${item.summary ? `<p class="rmd-summary">${escape(item.summary)}</p>` : ''}
    ${benefitHtml(item)}
    ${item.details ? `<section class="rmd-section"><h3>Detail</h3><p class="rmd-note">${escape(item.details)}</p></section>` : ''}
    ${moneyHtml(item)}
    ${doingHtml(item)}
    ${filingHtml(item, ctx)}
    ${priorityHtml(item)}
    ${kidsSection}
    ${stepsSection}
    ${note('Resolution', item.resolution)}
    <div class="rmd-actions">
      <button class="btn btn--quiet" type="button" id="rmd-export">Export this item</button>
    </div>`;
}

/** The same item as data, for handing to a person or another tool. Blank
 *  fields are dropped so the file stays readable. */
export function itemExport(item, ctx) {
  const out = {
    title: item.title,
    summary: item.summary,
    details: item.details,
    kind: item.kind,
    level: item.level,
    room: item.room_name,
    trade: item.trade,
    also_touches: (item.associated_trades ?? []).length ? item.associated_trades : null,
    intent: themeLabel(item, ctx),
    status: item.status,
    board_placement: colEnd(item) > colStart(item)
      ? `${bandLabel(item)} through ${endBandLabel(item)}` : bandLabel(item),
    priority: item.priority,
    priority_score: item.priority_score,
    priority_explain: item.priority_explain,
    benefit_type: item.benefit_type,
    house_benefit: item.house_benefit,
    benefit_status: item.benefit_status,
    cost_best: item.cost_best,
    cost_expected: item.cost_expected,
    cost_worst: item.cost_worst,
    cost_confidence: item.cost_confidence,
    allocated_balance: item.allocated_balance,
    duration_min_minutes: item.duration_min_minutes,
    duration_max_minutes: item.duration_max_minutes,
    tools_required: (item.tools_required ?? []).length ? item.tools_required : null,
    setting: item.setting,
    physical_demand: item.physical_demand,
    posture: (item.posture ?? []).length ? item.posture : null,
    weather_needs: (item.weather_needs ?? []).length ? item.weather_needs : null,
    season_window: (item.season_window ?? []).length ? item.season_window : null,
    resolution: item.resolution,
    jobs: barKids(item, ctx).map((k) => ({ title: k.title, status: k.status })),
    steps: stepsOf(item, ctx).map((k) => ({ title: k.title, status: k.status })),
  };
  return Object.fromEntries(Object.entries(out).filter(([, v]) =>
    v != null && v !== '' && !(Array.isArray(v) && !v.length)));
}

export { BANDS };
