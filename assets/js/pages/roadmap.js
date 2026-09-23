// Roadmap. Four levels, two layouts, one set of rows.
//
// Ported from the roadmap tool this system is modelled on: a continuous
// Previously|Recently|Now|Next|Later|Parked axis, bars that span the
// bands they run across with their title inside them, column headers
// that collapse, and a drawer on every item.
//
// The level and layout live in the URL hash (#level/layout) so a board is
// shareable; the open item lives in ?item=<id> so a drawer is too.
// Everything else - delivered, wide, filters - is a remembered
// preference rather than part of the link.
import { requireAuth } from '../core/auth.js';
import { mountShell, render, confidenceBanner } from '../core/shell.js';
import { load } from '../core/store.js';
import { confidenceSummary } from '../engine/selectors.js';
import { escape, titleCase } from '../core/format.js';
import {
  LEVELS, LAYOUTS, BANDS, context, markRecency, byTrade, byRoom, bySearch,
} from '../engine/roadmap-model.js';
import { timeline } from '../engine/roadmap-timeline.js';
import { cascade } from '../engine/roadmap-cascade.js';
import { summary } from '../engine/roadmap-summary.js';
import { drawerHtml, itemExport } from '../engine/roadmap-detail.js';
import { toCSV, toJSON } from '../engine/roadmap-export.js';
import * as store from '../core/prefs.js';

const user = await requireAuth();
if (!user) throw new Error('redirecting to login');
mountShell('roadmap.html', { user });

const d = await load();
markRecency(d.items ?? [], Date.now());

const THEMES = [
  ['make_safe', 'Make safe', 10], ['make_dry', 'Make dry', 20],
  ['make_secure', 'Make secure', 30], ['make_warm', 'Make warm', 40],
  ['make_working', 'Make working', 50], ['make_clean', 'Make clean', 60],
  ['systems_tech', 'Systems and tech', 70], ['storage', 'Storage', 80],
  ['cosmetic', 'Cosmetic', 90], ['outdoor', 'Outdoor', 100], ['comfort', 'Comfort', 110],
].map(([key, label, sort_order]) => ({ key, label, sort_order }));

const KEYS = {
  level: 'hh-rm-level', layout: 'hh-rm-layout', delivered: 'hh-rm-delivered',
  wide: 'hh-rm-wide', room: 'hh-rm-room', trade: 'hh-rm-trade',
  hideQuick: 'hh-rm-hidequick', bands: 'hh-rm-bands', search: 'hh-rm-search',
  expanded: 'hh-rm-expanded',
};

const known = (opts, v) => opts.some((o) => o.key === v);
// A stored choice is honoured only if it is still offered, so a retired
// level cannot strand a visitor on a view that no longer exists.
const readChoice = (key, opts, fallback) => {
  const v = store.get(KEYS[key]);
  return known(opts, v) ? v : fallback;
};

let level;
let layout;
function readHash() {
  const parts = (location.hash || '').replace(/^#/, '').split('/');
  level = known(LEVELS, parts[0]) ? parts[0] : readChoice('level', LEVELS, 'work');
  layout = known(LAYOUTS, parts[1]) ? parts[1] : readChoice('layout', LAYOUTS, 'timeline');
}
const hashFor = () => `${level}/${layout}`;
readHash();

const prefs = {
  delivered: store.get(KEYS.delivered) !== 'hidden',
  wide: store.get(KEYS.wide) === 'on',
  hideQuick: store.get(KEYS.hideQuick) === 'on',
  expanded: store.get(KEYS.expanded) === 'on',
  room: store.get(KEYS.room) ?? '',
  trade: store.get(KEYS.trade) ?? '',
  search: store.get(KEYS.search) ?? '',
  bands: (() => { try { return JSON.parse(store.get(KEYS.bands) || '{}'); } catch { return {}; } })(),
};

const allItems = d.items ?? [];
const ctx = context({ items: allItems, themes: THEMES });
const rooms = [...new Set(allItems.map((i) => i.room_name).filter(Boolean))].sort();
const trades = [...new Set(allItems.flatMap((i) => [i.trade, ...(i.associated_trades ?? [])])
  .filter(Boolean))].sort();

function visibleItems() {
  let list = allItems;
  list = byRoom(list, prefs.room);
  list = byTrade(list, prefs.trade);
  list = bySearch(list, prefs.search);
  return list;
}

const tabs = (opts, active, group) => opts.map((o) =>
  `<button type="button" class="seg${o.key === active ? ' is-on' : ''}"
    data-${group}="${o.key}" aria-pressed="${o.key === active}">${escape(o.label)}</button>`).join('');

const sel = (id, label, value, options) => `<span class="control">
  <label for="${id}">${escape(label)}</label>
  <select id="${id}"><option value="">All</option>${options.map((o) =>
    `<option value="${escape(o)}"${o === value ? ' selected' : ''}>${escape(titleCase(o))}</option>`).join('')}</select>
</span>`;

const toggle = (id, label, on, title) =>
  `<button type="button" class="btn btn--quiet${on ? ' is-on' : ''}" id="${id}"
    aria-pressed="${on}" title="${escape(title)}">${escape(label)}</button>`;

function controlsHtml() {
  return `<form class="toolbar" id="rm-controls" aria-label="Roadmap view">
    <div class="toolbar__row" role="group" aria-label="Level">${tabs(LEVELS, level, 'level')}</div>
    ${level === 'trades' ? '' : `<div class="toolbar__row" role="group" aria-label="Layout">${
      tabs(LAYOUTS, layout, 'layout')}</div>`}
    <div class="toolbar__row">
      ${sel('rm-room', 'Room', prefs.room, rooms)}
      ${sel('rm-trade', 'Trade', prefs.trade, trades)}
      <span class="control control--grow">
        <label for="rm-search">Search</label>
        <input id="rm-search" type="search" value="${escape(prefs.search)}"
               placeholder="title, room, trade, tool">
      </span>
    </div>
    <div class="toolbar__row">
      ${toggle('rm-delivered', prefs.delivered ? 'Hide done' : 'Show done', !prefs.delivered,
        'Show or hide completed work')}
      ${toggle('rm-hidequick', 'Hide quick jobs', prefs.hideQuick,
        'Drop standalone repairs, maintenance, cleaning and admin')}
      ${level === 'trades'
        ? toggle('rm-expanded', 'Detailed', prefs.expanded, 'List the items under each intent')
        : toggle('rm-wide', 'Wide', prefs.wide, 'Widen the timeline so it scrolls sideways')}
      <button type="button" class="btn btn--quiet" id="rm-csv">Export CSV</button>
      <button type="button" class="btn btn--quiet" id="rm-json">Export JSON</button>
      <button type="button" class="btn btn--quiet" id="rm-reset">Reset</button>
    </div>
    <p class="lede" id="rm-summary" role="status"></p>
  </form>
  <div id="rm-board"></div>
  <div id="rm-scrim" class="rmd-scrim" hidden></div>
  <aside id="rm-drawer" class="rmd" hidden aria-label="Item detail" role="dialog" aria-modal="true">
    <div class="rmd-bar"><button type="button" class="btn btn--quiet" id="rmd-close">Close</button></div>
    <div id="rmd-body" class="rmd-body"></div>
  </aside>`;
}

function paint() {
  const items = visibleItems();
  const data = { items, themes: THEMES };
  const opts = {
    ctx, showDelivered: prefs.delivered, wide: prefs.wide,
    hiddenBands: prefs.bands, hideQuick: prefs.hideQuick,
  };
  opts.expanded = prefs.expanded;
  document.getElementById('rm-board').innerHTML =
    level === 'trades' ? summary(data, opts)
      : layout === 'cascade' ? cascade(data, level, opts)
        : timeline(data, level, opts);

  const hiddenCount = Object.values(prefs.bands).filter(Boolean).length;
  document.getElementById('rm-summary').textContent =
    `${items.length} of ${allItems.length} items`
    + (prefs.delivered ? '' : ' · done hidden')
    + (prefs.hideQuick ? ' · quick jobs hidden' : '')
    + (hiddenCount ? ` · ${hiddenCount} column${hiddenCount === 1 ? '' : 's'} collapsed` : '');

  for (const b of document.querySelectorAll('[data-level]')) {
    const on = b.dataset.level === level;
    b.classList.toggle('is-on', on); b.setAttribute('aria-pressed', String(on));
  }
  for (const b of document.querySelectorAll('[data-layout]')) {
    const on = b.dataset.layout === layout;
    b.classList.toggle('is-on', on); b.setAttribute('aria-pressed', String(on));
  }
}

// --- Drawer ----------------------------------------------------------

let lastFocus = null;
const byId = (id) => allItems.find((i) => i.id === id);

function setItemParam(id) {
  const url = new URL(location.href);
  if (id) url.searchParams.set('item', id); else url.searchParams.delete('item');
  history.replaceState(null, '', url.href);
}

function openDrawer(item) {
  if (!item) return;
  const drawer = document.getElementById('rm-drawer');
  const scrim = document.getElementById('rm-scrim');
  document.getElementById('rmd-body').innerHTML = drawerHtml(item, ctx);
  lastFocus = document.activeElement;
  drawer.hidden = false;
  scrim.hidden = false;
  document.body.classList.add('rmd-open');
  setItemParam(item.id);
  document.getElementById('rmd-close').focus();

  const ex = document.getElementById('rmd-export');
  if (ex) ex.addEventListener('click', () =>
    download(`${slug(item.title)}.json`, JSON.stringify(itemExport(item, ctx), null, 2), 'application/json'));
}

function closeDrawer() {
  document.getElementById('rm-drawer').hidden = true;
  document.getElementById('rm-scrim').hidden = true;
  document.body.classList.remove('rmd-open');
  setItemParam(null);
  lastFocus?.focus?.();
}

const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);

function download(name, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.append(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

// --- Wiring ----------------------------------------------------------

let painted = '';
render('[data-page-root]', `${confidenceBanner(confidenceSummary(d))}${controlsHtml()}`);
paint();
painted = hashFor();

// Delegated from the document, not bound to the toolbar: rerender()
// replaces the toolbar element, so a listener attached to it would
// survive exactly one re-render and then silently stop responding.
document.addEventListener('click', (e) => {
  if (!e.target.closest?.('#rm-controls')) return;
  const lv = e.target.closest('[data-level]');
  const ly = e.target.closest('[data-layout]');
  // The hash is the single home for level and layout. A tab click writes
  // it and nothing else; the render happens on the way back out of
  // route(), so the URL and the board can never disagree.
  if (lv) { store.set(KEYS.level, lv.dataset.level); go(lv.dataset.level, layout); return; }
  if (ly) { store.set(KEYS.layout, ly.dataset.layout); go(level, ly.dataset.layout); return; }

  const id = e.target.id;
  if (id === 'rm-delivered') { prefs.delivered = !prefs.delivered; store.set(KEYS.delivered, prefs.delivered ? 'shown' : 'hidden'); rerender(); }
  if (id === 'rm-hidequick') { prefs.hideQuick = !prefs.hideQuick; store.set(KEYS.hideQuick, prefs.hideQuick ? 'on' : 'off'); rerender(); }
  if (id === 'rm-wide') { prefs.wide = !prefs.wide; store.set(KEYS.wide, prefs.wide ? 'on' : 'off'); rerender(); }
  if (id === 'rm-expanded') { prefs.expanded = !prefs.expanded; store.set(KEYS.expanded, prefs.expanded ? 'on' : 'off'); rerender(); }
  if (id === 'rm-csv') download(`roadmap-${today()}.csv`, toCSV(visibleItems()), 'text/csv;charset=utf-8');
  if (id === 'rm-json') download(`roadmap-${today()}.json`, toJSON(visibleItems()), 'application/json');
  if (id === 'rm-reset') {
    Object.assign(prefs, { delivered: true, wide: false, hideQuick: false, expanded: false, room: '', trade: '', search: '', bands: {} });
    for (const k of Object.values(KEYS)) store.set(k, '');
    store.set(KEYS.bands, '{}');
    rerender();
  }
});

const today = () => new Date().toISOString().slice(0, 10);

function rerender() {
  render('[data-page-root]', `${confidenceBanner(confidenceSummary(d))}${controlsHtml()}`);
  paint();
  painted = hashFor();
}

document.addEventListener('change', (e) => {
  if (e.target.id === 'rm-room') { prefs.room = e.target.value; store.set(KEYS.room, prefs.room); paint(); }
  if (e.target.id === 'rm-trade') { prefs.trade = e.target.value; store.set(KEYS.trade, prefs.trade); paint(); }
});

let debounce;
document.addEventListener('input', (e) => {
  if (e.target.id !== 'rm-search') return;
  clearTimeout(debounce);
  debounce = setTimeout(() => {
    prefs.search = e.target.value; store.set(KEYS.search, prefs.search); paint();
  }, 150);
});

// Board clicks: a band header collapses its column; anything with an item
// id opens the drawer.
document.addEventListener('click', (e) => {
  const band = e.target.closest('[data-band]');
  if (band) {
    const k = band.dataset.band;
    prefs.bands[k] = !prefs.bands[k];
    store.set(KEYS.bands, JSON.stringify(prefs.bands));
    paint();
    return;
  }
  if (e.target.closest('#rmd-export')) return;
  const hit = e.target.closest('[data-item-id]');
  if (hit) { e.preventDefault(); openDrawer(byId(hit.dataset.itemId)); return; }
  if (e.target.id === 'rmd-close' || e.target.id === 'rm-scrim') closeDrawer();
});

// A step row is a list item, so it needs keyboard activation of its own.
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !document.getElementById('rm-drawer').hidden) { closeDrawer(); return; }
  if ((e.key === 'Enter' || e.key === ' ') && e.target.matches?.('.rmv-step, .rmv-sum-item')) {
    e.preventDefault();
    openDrawer(byId(e.target.dataset.itemId));
  }
});

/** Route to a level and layout by writing the hash. When the hash is
 *  already what we are asking for, no hashchange fires, so route() is
 *  called directly - otherwise re-selecting the current tab would do
 *  nothing at all. */
function go(nextLevel, nextLayout) {
  const want = `${nextLevel}/${nextLayout}`;
  if ((location.hash || '').replace(/^#/, '') === want) { route(); return; }
  location.hash = want;
}

/** Paint whatever the hash now asks for, if it is not already on screen.
 *  Compared against what was last PAINTED rather than against the
 *  variables, which route() is about to overwrite. */
function route() {
  readHash();
  if (hashFor() === painted) return;
  rerender();
}

window.addEventListener('hashchange', route);

// Deep link: ?item=<id> opens that drawer on load.
const wanted = new URLSearchParams(location.search).get('item');
if (wanted) openDrawer(byId(wanted));
