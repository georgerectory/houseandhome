// roadmap-cascade.js - the Cascade layout: the same work as stacked
// stage bands, grouped by theme inside each. A card sits in FULL in its
// start band; a band it merely runs through gets a slim continuation
// strip, so a long job reads as continuing rather than repeating.
//
// A project's children render as inset cards right after it with a
// "Part of" eyebrow, so a nested job reads as owned. Steps never appear -
// they are drawer-only detail.

import {
  BANDS, ACTIVE_MAX, PARKED, colStart, colEnd, byOrder, childOrder,
  barKids, themeOf, themeClass, progressOf, topLevel, workList,
  bandVisible, isQuickJob, presentationLabel, groupBy,
} from './roadmap-model.js';
import { escape } from '../core/format.js';

function bandHead(label, key, off) {
  return `<button type="button" class="rmv-band-head rmv-band-head--${escape(key)} rmv-band-toggle${
    off ? ' rmv-band-toggle--off' : ''}" data-band="${escape(key)}" aria-pressed="${!!off}"
    >${escape(label)}</button>`;
}

const offBand = (idx) =>
  `<section class="rmv-band rmv-band--off">${bandHead(BANDS[idx].label, BANDS[idx].key, true)}</section>`;

/** A spanning card's appearance after its start band: title only, no
 *  summary or progress - those live on the start-band card. */
function contCard(item, theme, isChild, dot) {
  const project = item.level === 'project';
  return `<li class="rm-card rm-card--cont${project ? ' rm-card--project' : ''}${
    isChild ? ' rm-card--child' : ''}${themeClass(theme)}" data-item-id="${escape(item.id)}"
    >${project ? '<p class="rmv-project-tag">Project</p>' : ''}<h3>${escape(item.title)}</h3>${dot}</li>`;
}

function fullCard(item, theme, isChild, parentTitle, dot) {
  const band = colStart(item);
  const label = band === 2 ? presentationLabel(item.presentation) : '';
  const prog = progressOf(item);
  const project = item.level === 'project';
  const eyebrow = isChild && parentTitle
    ? `<p class="rmv-part-of">Part of ${escape(parentTitle)}</p>` : '';
  return `<li class="rm-card rm-card--${BANDS[band].key}${project ? ' rm-card--project' : ''}${
    isChild ? ' rm-card--child' : ''}${themeClass(theme)}" data-item-id="${escape(item.id)}"
    >${project ? '<p class="rmv-project-tag">Project</p>' : ''}${eyebrow}${
    label ? `<p class="rm-state rm-state--${escape(item.presentation)}">${escape(label)}</p>` : ''
    }<h3>${escape(item.title)}</h3>${
    item.summary ? `<p class="rm-card-sum">${escape(item.summary)}</p>` : ''
    }<div class="rm-card-progress rmv-prog-${prog.bucket}" role="img"
      aria-label="Progress: ${escape(prog.label)}"><span></span></div>${dot}</li>`;
}

function cardIn(item, ctx, idx, isChild, parentTitle, parent) {
  const own = themeOf(item, ctx);
  let theme = own;
  let dotFor = null;
  if (isChild && parent) {
    const pTheme = themeOf(parent, ctx);
    theme = pTheme;
    if (own && (!pTheme || pTheme.key !== own.key)) dotFor = own;
  }
  if (item.status === 'done' && !dotFor) dotFor = own;
  const dot = dotFor
    ? `<span class="rmv-theme-dot rm-theme-${escape(dotFor.key)}" aria-hidden="true"></span>` : '';
  return colStart(item) === idx
    ? fullCard(item, theme, isChild, parentTitle, dot)
    : contCard(item, theme, isChild, dot);
}

function themeSection(theme, cardsHtml) {
  const desc = theme?.description
    ? `<p class="rmv-theme-desc">${escape(theme.description)}</p>` : '';
  return `<section class="rmv-theme${themeClass(theme)}"><h3 class="rm-lane-label">${
    escape(theme ? theme.label : 'General')}</h3>${desc}<ul class="rmv-cards">${cardsHtml}</ul></section>`;
}

const inBandFn = (idx) => (i) => colStart(i) <= idx && colEnd(i) >= idx;

function bandsSimple(list, ctx, maxBand, show, hidden) {
  let html = '';
  for (let idx = 0; idx <= maxBand; idx++) {
    if (idx <= 1 && !show) continue;
    if (hidden?.[BANDS[idx].key]) { html += offBand(idx); continue; }
    const inBand = list.filter(inBandFn(idx));
    if (!inBand.length) continue;
    const byTheme = groupBy(inBand, (i) => i.theme);
    const blocks = ctx.themeSorted.filter((t) => byTheme[t.key]).map((t) =>
      themeSection(t, [...byTheme[t.key]].sort(byOrder).map((i) => cardIn(i, ctx, idx)).join('')));
    if (byTheme.none) {
      blocks.push(themeSection(null, [...byTheme.none].sort(byOrder)
        .map((i) => cardIn(i, ctx, idx)).join('')));
    }
    html += `<section class="rmv-band">${bandHead(BANDS[idx].label, BANDS[idx].key)}
      <div class="rmv-themes">${blocks.join('')}</div></section>`;
  }
  return html;
}

function bandsGrouped(tops, ctx, maxBand, show, keepChild, hidden) {
  let html = '';
  const sortedTops = [...tops].sort(byOrder);
  for (let idx = 0; idx <= maxBand; idx++) {
    if (idx <= 1 && !show) continue;
    if (hidden?.[BANDS[idx].key]) { html += offBand(idx); continue; }
    const inBand = inBandFn(idx);
    const perTheme = {};
    for (const top of sortedTops) {
      const kids = barKids(top, ctx).filter((k) => !keepChild || keepChild(k));
      const topIn = inBand(top);
      const kidsIn = kids.filter(inBand).sort(childOrder);
      if (!topIn && !kidsIn.length) continue;
      const key = top.theme || 'none';
      const bucket = (perTheme[key] = perTheme[key] ?? []);
      if (topIn) bucket.push({ item: top });
      for (const k of kidsIn) {
        bucket.push({ item: k, child: true, parentTitle: top.title, parent: top });
      }
    }
    if (!Object.keys(perTheme).length) continue;
    const block = (theme, entries) => themeSection(theme, entries.map((e) =>
      cardIn(e.item, ctx, idx, e.child, e.parentTitle, e.parent)).join(''));
    const blocks = ctx.themeSorted.filter((t) => perTheme[t.key])
      .map((t) => block(t, perTheme[t.key]));
    if (perTheme.none) blocks.push(block(null, perTheme.none));
    html += `<section class="rmv-band">${bandHead(BANDS[idx].label, BANDS[idx].key)}
      <div class="rmv-themes">${blocks.join('')}</div></section>`;
  }
  return html;
}

export function cascade(data, level, opts = {}) {
  const show = opts.showDelivered !== false;
  const hidden = opts.hiddenBands || null;
  const ctx = opts.ctx;

  let all = data.items ?? [];
  if (opts.hideQuick) all = all.filter((i) => !isQuickJob(i));
  const anyHidden = !!(hidden && Object.keys(hidden).some((k) => hidden[k]));
  all = all.filter((i) => bandVisible(i, hidden));
  if (!all.length && !anyHidden) {
    return '<p class="notice">No work items yet. Add them through Claude.</p>';
  }

  const tops = topLevel(all);

  if (level === 'projects') {
    const list = workList(tops).filter((i) => i.level === 'project');
    return bandsSimple(list, ctx, ACTIVE_MAX, show, hidden)
      || '<p class="notice">No projects yet.</p>';
  }

  const list = level === 'backlog' ? tops : workList(tops);
  const maxBand = level === 'backlog' ? PARKED : ACTIVE_MAX;
  const keepChild = (k) => (level === 'backlog' || k.status === 'done' || colStart(k) <= ACTIVE_MAX)
    && bandVisible(k, hidden);
  return bandsGrouped(list, ctx, maxBand, show, keepChild, hidden)
    || '<p class="notice">Nothing in these bands.</p>';
}
