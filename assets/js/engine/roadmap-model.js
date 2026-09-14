// roadmap-model.js - placement, ordering and context for the roadmap.
// Pure: data in, values out. No DOM, no fetch, no clock except what is
// passed in, so it unit-tests without a browser.
//
// Ported from the roadmap tool this system is modelled on, with its
// vocabulary translated to a house. The structure is deliberately the
// same because it is proven; what changed is what the axes MEAN.
//
// THE CONTINUOUS AXIS. Six bands, and a bar SPANS the bands it runs
// across rather than sitting in one column:
//
//   previously | recently | now | next | later | parked
//
// Delivered work splits by recency - closed inside RECENT_DAYS reads as
// recently done, older as history - so a finished job does not vanish
// the moment it is ticked off, and a year of work does not pile up in
// one column either.
//
// Placement derives ENTIRELY from an item's own fields, which is what
// makes moving work between views a data edit rather than a copy:
//   Delivered = status 'done'
//   Parked    = status 'dropped', or horizon 'someday'
//   Active    = the rest, from horizon to end_horizon

export const BANDS = [
  { key: 'previously', label: 'Previously done' },
  { key: 'recently', label: 'Recently done' },
  { key: 'now', label: 'Now' },
  { key: 'next', label: 'Next' },
  { key: 'later', label: 'Later' },
  { key: 'parked', label: 'Parked' },
];
export const ACTIVE_MAX = 4;
export const PARKED = 5;
export const RECENT_DAYS = 90;

/** Levels are WHAT is on the board; layouts are how it is drawn. */
export const LEVELS = [
  { key: 'projects', label: 'Projects' },
  { key: 'trades', label: 'Trades' },
  { key: 'work', label: 'Work items' },
  { key: 'backlog', label: 'Backlog' },
];
export const LAYOUTS = [
  { key: 'timeline', label: 'Timeline' },
  { key: 'cascade', label: 'Cascade' },
];

const PRESENTATION = {
  current: 'Current focus', ongoing: 'Ongoing',
  wind: 'Wrapping up', bridge: 'Next horizon', sequenced: '',
};
export const presentationLabel = (p) => PRESENTATION[p] || '';

/** Tag each done item recent or historic. "now" is injected once here so
 *  every placement builder below stays deterministic and testable. */
export function markRecency(items, now) {
  const cutoff = (now ?? Date.now()) - RECENT_DAYS * 864e5;
  for (const i of items ?? []) {
    const t = i.status === 'done' ? (i.resolved_at || i.updated_at) : null;
    i._recentDone = !!t && Date.parse(t) >= cutoff;
  }
  return items;
}

const hzIdx = (h) => (h === 'now' ? 2 : h === 'next' ? 3 : h === 'later' ? 4 : PARKED);
const doneCol = (i) => (i._recentDone ? 1 : 0);

export function colStart(i) {
  if (i.status === 'done') return doneCol(i);
  if (i.status === 'dropped') return PARKED;
  return hzIdx(i.horizon);
}
export function colEnd(i) {
  if (i.status === 'done') return doneCol(i);
  if (i.status === 'dropped') return PARKED;
  const s = hzIdx(i.horizon);
  const e = hzIdx(i.end_horizon || i.horizon);
  return e < s ? s : e;
}
export const isParked = (i) => colStart(i) === PARKED;
export const isActive = (i) => { const s = colStart(i); return s >= 2 && s <= ACTIVE_MAX; };

/** An item belongs to its START band, so collapsing a band drops
 *  everything that begins in it - a now-to-later span leaves with Now. */
export const bandVisible = (i, hidden) => !hidden || !hidden[BANDS[colStart(i)].key];

// --- Membership ------------------------------------------------------

/** Only top-level, non-step rows are drawn as bars. A step is
 *  drawer-only detail: it lists under its parent and never takes a lane
 *  of its own, or the board becomes a task list. */
export const topLevel = (items) =>
  items.filter((i) => !i.parent_id && i.level !== 'step');

/** A project's children that draw as their own indented bars. Children
 *  of a plain job are steps by position and never become bars. */
export function barKids(parent, ctx) {
  if (!parent || parent.level !== 'project') return [];
  return (ctx.childrenByParent[parent.id] ?? []).filter((k) => k.level !== 'step');
}

/** Drawer-only detail: every child of a job, or the step-level children
 *  of a project. */
export function stepsOf(parent, ctx) {
  const kids = ctx.childrenByParent[parent.id] ?? [];
  if (parent.level !== 'project') return kids;
  return kids.filter((k) => k.level === 'step');
}

export const isDoneOrActive = (i) => i.status === 'done' || isActive(i);
export const workList = (items) => items.filter(isDoneOrActive);

/** A standalone quick job: no project above it, not a project itself, and
 *  of a maintenance-flavoured kind. The equivalent of the source
 *  system's "fixes" toggle - these carry the house but clutter a view of
 *  the strategic work, so they can be dropped from it. */
export const isQuickJob = (i) =>
  !i.parent_id && i.level !== 'project'
  && ['repair', 'maintenance', 'cleaning', 'admin'].includes(i.kind);

// --- Filtering by the axes a house actually has -----------------------

/** Does this item belong to a trade, as owner OR by association? The
 *  second half is the point: a bathroom rewire is owned by electrical,
 *  but a plastering view should still see it. */
export const inTrade = (i, trade) =>
  i.trade === trade || (i.associated_trades ?? []).includes(trade);

/**
 * Narrow to one trade, keeping families intact: a matching item stays; a
 * project stays if any child matches; a project matched DIRECTLY keeps
 * its whole family, one kept only through a child keeps just the
 * matching children. A falsy trade returns the data untouched.
 */
export function byTrade(items, trade) {
  if (!trade) return items;
  const byId = new Map(items.map((i) => [i.id, i]));
  const kids = new Map();
  for (const i of items) {
    if (i.parent_id) {
      if (!kids.has(i.parent_id)) kids.set(i.parent_id, []);
      kids.get(i.parent_id).push(i);
    }
  }
  const keep = new Set();
  for (const i of items) if (inTrade(i, trade)) keep.add(i.id);
  for (const i of items) {
    if (i.level === 'project' && (kids.get(i.id) ?? []).some((k) => inTrade(k, trade))) keep.add(i.id);
  }
  for (const i of items) {
    if (i.parent_id && byId.has(i.parent_id) && inTrade(byId.get(i.parent_id), trade)) keep.add(i.id);
  }
  return items.filter((i) => keep.has(i.id));
}

/** Rooms nest nothing, so a room filter is a plain match. */
export const byRoom = (items, room) =>
  !room ? items : items.filter((i) => i.room_name === room);

export function bySearch(items, q) {
  const s = (q ?? '').trim().toLowerCase();
  if (!s) return items;
  return items.filter((i) =>
    `${i.title ?? ''} ${i.summary ?? ''} ${i.room_name ?? ''} ${i.trade ?? ''} ${(i.tools_required ?? []).join(' ')}`
      .toLowerCase().includes(s));
}

// --- Ordering --------------------------------------------------------

/** Quick jobs sink below considered work at the same level whatever
 *  their priority number, so the board reads as a plan rather than a
 *  chore list. Projects win ties, so at equal priority a project and its
 *  children lead unless something is deliberately promoted. */
const quickRank = (i) => (isQuickJob(i) ? 1 : 0);
const projectRank = (i) => (i.level === 'project' ? 0 : 1);

export function byOrder(a, b) {
  return (quickRank(a) - quickRank(b))
    || ((a.priority ?? 1e9) - (b.priority ?? 1e9))
    || (projectRank(a) - projectRank(b))
    || ((a.sort_order ?? 100) - (b.sort_order ?? 100));
}

/** Children stack under their project in stage order: start band first,
 *  then end band, so a run finishing sooner sits above one running
 *  longer. */
export const childOrder = (a, b) =>
  (colStart(a) - colStart(b)) || (colEnd(a) - colEnd(b)) || byOrder(a, b);

/** Board order: start band, quick jobs last in the band, then span
 *  length so work finishing in this band sits above a run spilling into
 *  the next, then priority, projects winning ties, then theme so the
 *  parked stack reads grouped rather than scattered. */
export function timelineOrder(a, b) {
  return (a._s - b._s)
    || (a._quick - b._quick)
    || ((a._e - a._s) - (b._e - b._s))
    || (a._pri - b._pri)
    || ((a._project ? 0 : 1) - (b._project ? 0 : 1))
    || (a._themeSo - b._themeSo)
    || (a._so - b._so);
}

// --- Context ---------------------------------------------------------

/** One pass over the dataset, so no builder below has to walk it again:
 *  themes by key, children by parent (pre-sorted), items by id for
 *  resolving a parent or a link endpoint back to a title. */
export function context(data) {
  const themeByKey = new Map((data.themes ?? []).map((t) => [t.key, t]));
  const childrenByParent = new Map();
  const itemById = new Map();
  for (const i of data.items ?? []) {
    itemById.set(i.id, i);
    if (i.parent_id) {
      if (!childrenByParent.has(i.parent_id)) childrenByParent.set(i.parent_id, []);
      childrenByParent.get(i.parent_id).push(i);
    }
  }
  for (const list of childrenByParent.values()) list.sort(byOrder);
  const themeSorted = [...(data.themes ?? [])]
    .sort((a, b) => (a.sort_order ?? 100) - (b.sort_order ?? 100));
  return {
    themeByKey,
    themeSorted,
    childrenByParent: Object.fromEntries(childrenByParent),
    itemById: Object.fromEntries(itemById),
  };
}

export const themeOf = (i, ctx) => ctx.themeByKey.get(i.theme) ?? null;
export const themeLabel = (i, ctx) => themeOf(i, ctx)?.label ?? 'General';
export const bandLabel = (i) => BANDS[colStart(i)].label;
export const endBandLabel = (i) => BANDS[colEnd(i)].label;
export const themeClass = (t) => (t ? ` rm-theme-${t.key}` : '');

/** Coarse progress snapped to checkpoints. The raw number is never shown
 *  on the board - progress there is a quiet signal, not a metric. */
const PROG_STOPS = [0, 25, 50, 75, 90, 100];
const PROG_LABELS = {
  0: 'Not started', 25: 'Started', 50: 'Halfway',
  75: 'Well underway', 90: 'Nearly done', 100: 'Complete',
};
export function progressOf(item) {
  const raw = item.status === 'done' ? 100
    : Math.max(0, Math.min(100, parseInt(item.progress, 10) || 0));
  let bucket = PROG_STOPS[0];
  for (const s of PROG_STOPS) if (Math.abs(s - raw) < Math.abs(bucket - raw)) bucket = s;
  return { pct: raw, bucket, label: PROG_LABELS[bucket] };
}

export function childStats(item, ctx) {
  const kids = ctx.childrenByParent[item.id] ?? [];
  return { total: kids.length, done: kids.filter((k) => k.status === 'done').length };
}

export const groupBy = (items, keyFn) => {
  const out = {};
  for (const i of items) {
    const k = keyFn(i) || 'none';
    (out[k] = out[k] ?? []).push(i);
  }
  return out;
};
