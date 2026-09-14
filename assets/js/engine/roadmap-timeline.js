// roadmap-timeline.js - the Timeline layout: a continuous
// Previously|Recently|Now|Next|Later|Parked axis where a bar SPANS the
// bands it runs across. Data in, HTML string out. No DOM.
//
// The bar IS the item: its title sits inside it, with the owner and a
// theme dot alongside, so the board is readable without opening
// anything. Column headers are collapse toggles - clicking one strikes
// its label, drops the work starting in that band, and shrinks the
// column to a seam so its neighbours reclaim the width.

import {
  BANDS, ACTIVE_MAX, PARKED, colStart, colEnd, timelineOrder, barKids,
  childOrder, themeOf, themeClass, progressOf, topLevel, workList,
  bandVisible, isQuickJob,
} from './roadmap-model.js';
import { escape } from '../core/format.js';

function bandHeadCell(bi, hidden) {
  const band = BANDS[bi];
  const off = !!hidden?.[band.key];
  return `<button type="button" class="rmv-tl-col rmv-band-toggle${off ? ' rmv-band-toggle--off rmv-tl-col--seam' : ''}"
    data-band="${escape(band.key)}" aria-pressed="${off}"${off ? ` title="Show ${escape(band.label)}"` : ''}
    >${escape(band.label)}</button>`;
}

/** One placed row. A child inherits its PARENT's theme colour so a
 *  project family reads as one block; where the child's own theme
 *  disagrees, that theme surfaces only as a faint dot at the bar's end -
 *  a quiet flag for spotting misfiled work without breaking the family. */
export function placeItem(i, ctx, child, parent) {
  const own = themeOf(i, ctx);
  let theme = own;
  let dot = null;
  if (child && parent) {
    const pTheme = themeOf(parent, ctx);
    theme = pTheme;
    if (own && (!pTheme || pTheme.key !== own.key)) dot = own;
  }
  // A delivered bar loses its lane fill and reads as settled history, so
  // its theme survives as a dot instead: the done columns stay coded.
  if (i.status === 'done' && !dot) dot = own;
  return {
    _s: colStart(i), _e: colEnd(i), _theme: theme, _dot: dot,
    _themeLabel: theme ? theme.label : 'General',
    _pri: i.priority ?? 1e9, _so: i.sort_order ?? 100,
    _quick: isQuickJob(i) ? 1 : 0,
    _themeSo: theme ? (theme.sort_order ?? 1e9) : 1e9,
    _project: i.level === 'project', _child: !!child,
    _assignee: i.assignee || '', _prog: progressOf(i),
    _room: i.room_name || '', _trade: i.trade || '',
    label: i.title, done: i.status === 'done', _id: i.id,
  };
}

function grid(placed, maxBand, showDelivered, emptyMsg, preordered, hidden, wide) {
  const visible = showDelivered ? placed : placed.filter((p) => p._e >= 2);
  const first = showDelivered ? 0 : 2;

  const tracks = [];
  let seams = 0;
  for (let bi = first; bi <= maxBand; bi++) {
    const off = !!hidden?.[BANDS[bi].key];
    tracks.push(off ? 'var(--tl-seam)' : 'var(--tl-col)');
    if (off) seams++;
  }
  const cols = maxBand - first + 1;
  // Nothing to show AND nothing collapsed is genuinely empty. With a
  // collapsed column, still draw the header so its struck toggle stays
  // clickable - never a dead-end board you cannot get back from.
  if (!visible.length && !seams) return emptyMsg;

  const head = `<div class="rmv-tl-head"><span class="rmv-tl-label"></span>${
    BANDS.slice(first, maxBand + 1).map((_, k) => bandHeadCell(first + k, hidden)).join('')}</div>`;

  const ordered = preordered ? visible : [...visible].sort(timelineOrder);
  let body = ordered.map((p) => {
    const s = Math.max(p._s, first);
    const e = Math.min(p._e, maxBand);
    // Grid line numbers, not offsets: a spanning bar pinches across a
    // collapsed column rather than sliding off its axis. Written inline
    // as literal custom properties so the no-inline-style lint can see
    // that only numbers cross the boundary.

    const dot = p._dot
      ? `<span class="rmv-theme-dot rm-theme-${escape(p._dot.key)}" aria-hidden="true"></span>` : '';
    const who = p._assignee
      ? `<span class="rmv-tl-who" title="Doing it">${escape(p._assignee)}</span>` : '';
    const bar = `<button type="button" class="rmv-tl-bar${p.done ? ' rmv-tl-bar--done' : ''}${
      p._s === PARKED ? ' rmv-tl-bar--parked' : ''}${p._project ? ' rmv-tl-bar--project' : ''}${
      themeClass(p._theme)} rmv-prog-${p._prog.bucket}" data-item-id="${escape(p._id)}"
      style="--from:${s - first + 2};--to:${e - first + 3}" title="${escape(`${p.label} — ${p._themeLabel}`)}"
      ><span class="rmv-tl-title">${escape(p.label)}</span>${who}${dot}</button>`;
    return `<div class="rmv-tl-row${p._child ? ' rmv-tl-row--child' : ''}"
      ><span class="rmv-tl-label" title="${escape(p._room || p._themeLabel)}">${
      escape(p._room || p._themeLabel)}</span>${bar}</div>`;
  }).join('');

  if (!visible.length) {
    body = '<p class="notice">Every column is hidden. Click a struck heading to bring one back.</p>';
  }

  // Only the track list and three integers cross into the style
  // attribute, and they are written as literal custom properties so the
  // no-inline-style lint can see that nothing else does.
  const seamVars = seams
    ? `;--tl-tracks:${tracks.join(' ')};--tl-full:${cols - seams};--tl-seams:${seams}` : '';
  return `<div class="rmv-tl${showDelivered ? '' : ' rmv-tl--nodelivered'}${wide ? ' rmv-tl--wide' : ''}"
    style="--tl-cols:${cols}${seamVars}">${head}${body}</div>`;
}

/** Top-level rows in board order, each project's children dropped in
 *  immediately beneath it so a family groups rather than scatters. */
export function placedWithChildren(tops, ctx, keepChild) {
  const placedTops = tops.map((i) => ({ p: placeItem(i, ctx), item: i }));
  placedTops.sort((a, b) => timelineOrder(a.p, b.p));
  const out = [];
  for (const entry of placedTops) {
    out.push(entry.p);
    barKids(entry.item, ctx)
      .filter((k) => !keepChild || keepChild(k))
      .sort(childOrder)
      .forEach((k) => out.push(placeItem(k, ctx, true, entry.item)));
  }
  return out;
}

const EMPTY_ACTIVE = '<p class="notice">No scheduled work. Items wait in the Backlog until '
  + 'they are given a horizon of now, next or later.</p>';
const EMPTY_ALL = '<p class="notice">No work items yet. They are rows in the work_items table; '
  + 'add them through Claude.</p>';

export function timeline(data, level, opts = {}) {
  const show = opts.showDelivered !== false;
  const wide = !!opts.wide;
  const hidden = opts.hiddenBands || null;
  const ctx = opts.ctx;

  let all = data.items ?? [];
  if (opts.hideQuick) all = all.filter((i) => !isQuickJob(i));
  const anyHidden = !!(hidden && Object.keys(hidden).some((k) => hidden[k]));
  all = all.filter((i) => bandVisible(i, hidden));
  if (!all.length && !anyHidden) return EMPTY_ALL;

  const tops = topLevel(all);

  if (level === 'projects') {
    const list = workList(tops).filter((i) => i.level === 'project');
    return grid(list.map((i) => placeItem(i, ctx)), ACTIVE_MAX, show,
      '<p class="notice">No projects yet. Mark a top-level item as a project to show it here.</p>',
      false, hidden, wide);
  }

  if (level === 'backlog') {
    return grid(placedWithChildren(tops, ctx, (k) => bandVisible(k, hidden)),
      PARKED, show, EMPTY_ALL, true, hidden, wide);
  }

  // Work items: projects in bold with their children indented, plus
  // standalone jobs. Steps never appear.
  const workTops = workList(tops);
  return grid(
    placedWithChildren(workTops, ctx, (k) => (k.status === 'done' || colStart(k) <= ACTIVE_MAX)
      && bandVisible(k, hidden)),
    ACTIVE_MAX, show, EMPTY_ACTIVE, true, hidden, wide);
}
