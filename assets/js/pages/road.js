// Road Ahead. Which house next, and why.
//
// The Rectory kit's plan as a live page: the roads to the forever home,
// the listings register and every figure behind them, computed in the
// browser by the same engine the tests and the command line run. The
// scenario bar asks what-ifs of it and saves nothing (RA-02): what is
// worth keeping becomes a message for Claude, who records it with its
// reason. The state is the URL, so any view can be bookmarked or sent.
import { requireAuth } from '../core/auth.js';
import { mountShell, render } from '../core/shell.js';
import { loadRoadAhead, isDemo } from '../core/store.js';
import { escape } from '../core/format.js';
import { readState, writeState, control, parseValue, showValue, CONTROLS } from '../engine/road-ahead/page/state.js';
import { resolve, currentValues, defaultScenario } from '../engine/road-ahead/page/resolve.js';
import { runAll, registerRows, compare } from '../engine/road-ahead/page/model.js';
import { scenarioMessage, judgementMessage, assessMessage, sitDownMessage, rebaseMessage } from '../engine/road-ahead/page/message.js';
import { nowHtml } from './road/now.js';
import { barHtml, syncBar, syncSum, wireBar, copyMessage } from './road/bar.js';
import { registerHtml } from './road/register.js';
import { cardHtml } from './road/card.js';
import { roadsHtml } from './road/roads.js';
import { compareHtml } from './road/compare.js';
import { assessHtml } from './road/assess.js';
import { wireTips } from './road/tips.js';
import { auctionsHtml } from './road/auctions.js';
import { calibrationHtml } from './road/calibration.js';
import { decisionsHtml } from './road/decisions.js';
import { variablesHtml } from './road/variables.js';
import { londonToday } from '../engine/road-ahead/page/auctions.js';
import { sinceAccepted } from '../engine/road-ahead/page/record.js';

const user = await requireAuth();
if (!user) throw new Error('redirecting to login');
mountShell('road.html', { user });

const data = await loadRoadAhead();
if (!data) throw new Error('redirecting to login');

const fallback = defaultScenario(data.scenarios);
const known = { scenarios: data.scenarios.map((s) => s.key), listings: data.register.map((r) => r.code), fallback };
let state = readState(location.search, known);
let current = currentValues(data, state.scenario);
let focusRoadCode = null;
let last = null;

render('[data-page-root]', `
  ${isDemo() ? `<div class="notice" role="note"><span class="notice__title">Demo data</span>${escape(data.meta.note)}</div>` : ''}
  <nav class="rd-jump" aria-label="On this page">
    <a href="#now">Now</a><a href="#register">Register</a><a href="#assess">Assess</a><a href="#auctions">Auctions</a><a href="#roads">Roads</a><a href="#compare">Compare</a>
    <a href="#calibration">Calibration</a><a href="#decisions">Decisions</a><a href="#variables">Variables</a>
  </nav>
  <div data-rd="missing"></div>
  <section class="section rd-section" id="now" aria-labelledby="now-h"><h2 id="now-h">Now</h2><div data-rd="now"></div></section>
  <div class="rd-bar" data-rd="bar" role="region" aria-label="Scenario and what-ifs"></div>
  <section class="section rd-section" id="register" aria-labelledby="register-h"><h2 id="register-h">Register</h2>
    <div data-rd="card"></div><div data-rd="register"></div></section>
  <section class="section rd-section" id="assess" aria-labelledby="assess-h"><h2 id="assess-h">Assess</h2><div data-rd="assess"></div></section>
  <section class="section rd-section" id="auctions" aria-labelledby="auctions-h"><h2 id="auctions-h">Auctions</h2><div data-rd="auctions"></div></section>
  <section class="section rd-section" id="roads" aria-labelledby="roads-h"><h2 id="roads-h">Roads</h2><div data-rd="roads"></div></section>
  <section class="section rd-section" id="compare" aria-labelledby="compare-h"><h2 id="compare-h">Compare</h2><div data-rd="compare"></div></section>
  <section class="section rd-section" id="calibration" aria-labelledby="calibration-h"><h2 id="calibration-h">Calibration</h2><div data-rd="calibration"></div></section>
  <section class="section rd-section" id="decisions" aria-labelledby="decisions-h"><h2 id="decisions-h">Decisions</h2><div data-rd="decisions"></div></section>
  <section class="section rd-section" id="variables" aria-labelledby="variables-h"><h2 id="variables-h">Variables</h2><div data-rd="variables"></div></section>
`);
const host = (k) => document.querySelector(`[data-rd="${k}"]`);

// Every what-if redraws most of the page, so the page is not one live
// region here: the bar's status line says what changed, once.
document.querySelector('[data-page-root]')?.removeAttribute('aria-live');

// The bar sticks under the site header, which is itself sticky and
// changes height as the navigation wraps; what the page scrolls to
// stops below both. Custom properties, read by road.css.
const setHeight = (el, prop) => {
  const set = () => document.documentElement.style.setProperty(prop, `${Math.ceil(el.getBoundingClientRect().height)}px`);
  new ResizeObserver(set).observe(el);
  set();
};
const header = document.querySelector('.site-header');
if (header) setHeight(header, '--rd-top');
setHeight(host('bar'), '--rd-bar-h');

// Now is where things stand, before any what-if.
const base = resolve(data, fallback);
render(host('now'), base.missing.length ? '' : nowHtml(data, base));

// The auctions and the record answer to the calendar and to what has
// been said, not to a scenario: drawn once, counting from London's today
// (the demo's own day in demo mode). What has moved since the last
// accepted run is today's figures, before any what-if, against it.
const today = isDemo() ? data.meta.generated : londonToday();
render(host('auctions'), auctionsHtml(data, today));
const since = base.missing.length ? [] : sinceAccepted(data.runs, runAll(base), fallback);
render(host('calibration'), calibrationHtml(data, since, today));
render(host('decisions'), decisionsHtml(data, today));
render(host('variables'), variablesHtml(data, today));

function cardFor(rows, ctx, runs) {
  const x = state.listing ? rows.find((r) => r.row.code === state.listing) : null;
  return x ? cardHtml(x, data, ctx, runs, focusRoadCode) : '';
}

// A repaint replaces the register, the card and the roads. Whoever was
// on a control keeps their place on its successor, and a money ladder
// that was open stays open.
const REFOCUS = ['data-sort', 'data-filter', 'data-listing', 'data-judge', 'data-assess-text', 'data-assess-copy'];
function focusKey() {
  const el = document.activeElement;
  if (!el?.closest('[data-rd]') || el.closest('[data-rd="bar"]')) return null;
  const a = REFOCUS.find((k) => el.hasAttribute(k));
  return a ? `[${a}="${CSS.escape(el.getAttribute(a))}"]` : null;
}

function paint() {
  const ctx = resolve(data, state.scenario, state.values);
  const keep = focusKey();
  const ladders = [...host('roads').querySelectorAll('details[open][data-keep]')].map((d) => d.dataset.keep);
  render(host('missing'), ctx.missing.length ? `<div class="notice notice--warn" role="alert">
    <span class="notice__title">Road Ahead cannot run: a variable is missing</span>${ctx.missing.map(escape).join('<br>')}</div>` : '');
  if (ctx.missing.length) return;
  const runs = runAll(ctx);
  const rows = registerRows(data.register, ctx, data.rules, base);
  last = { ctx, runs, rows };
  render(host('register'), registerHtml(rows, state, ctx));
  render(host('card'), cardFor(rows, ctx, runs));
  renderAssess(rows, ctx);
  render(host('roads'), roadsHtml(ctx, runs, data));
  render(host('compare'), compareHtml(ctx, runs, compare(data, state.values)));
  syncBar(host('bar'), state, current, ctx.row.name);
  syncSum(host('bar'), runs);
  for (const k of ladders) host('roads').querySelector(`details[data-keep="${CSS.escape(k)}"]`)?.setAttribute('open', '');
  if (keep) document.querySelector(keep)?.focus();
}

// The pasted text is the owner's typing: a repaint keeps it.
function renderAssess(rows, ctx) {
  const typed = host('assess').querySelector('[data-assess-text]')?.value ?? '';
  render(host('assess'), assessHtml(rows, data, ctx));
  host('assess').querySelector('[data-assess-text]').value = typed;
}

let queued = false;
function update(change) {
  const scenarioMoved = change.scenario != null && change.scenario !== state.scenario;
  state = { ...state, ...change };
  if (scenarioMoved) current = currentValues(data, state.scenario);
  history.replaceState(null, '', `${location.pathname}${writeState(state, { fallback, current })}${location.hash}`);
  if (queued) return;
  queued = true;
  requestAnimationFrame(() => { queued = false; paint(); });
}

/** Open a listing's card and take the reader to it. */
function openCard(code) {
  update({ listing: code });
  requestAnimationFrame(() => requestAnimationFrame(() => {
    const card = document.querySelector('[data-card]');
    card?.scrollIntoView({ block: 'start' });
    card?.focus({ preventScroll: true });
  }));
}

function whatIfMessage() {
  const changes = CONTROLS.filter((c) => state.values[c.id] != null && showValue(c, state.values[c.id]) !== showValue(c, current[c.id]))
    .map((c) => ({ control: c, was: current[c.id], now: state.values[c.id] }));
  const sc = data.scenarios.find((s) => s.key === state.scenario) ?? { key: state.scenario, name: state.scenario };
  return changes.length ? scenarioMessage(sc, changes, location.href) : null;
}

render(host('bar'), barHtml(data, state, current));
wireBar(host('bar'), {
  scenario: (key) => update({ scenario: key }),
  value: (id, raw) => {
    const v = parseValue(control(id), raw);
    if (v != null) update({ values: { ...state.values, [id]: v } });
  },
  reset: () => update({ values: {} }),
  copy: () => {
    const text = whatIfMessage();
    if (text) copyMessage(host('bar'), text);
    else host('bar').querySelector('[data-status]').textContent = 'No what-ifs yet: move a control under Adjust first.';
  },
});

// The charts' tooltips, wherever a chart is drawn.
wireTips([host('register'), host('roads'), host('compare')]);

const NUMERIC = new Set(['buy', 'profit', 'profit_opt', 'bid']);
host('register').addEventListener('click', (e) => {
  const f = e.target.closest('[data-filter]');
  if (f) update({ filter: f.dataset.filter });
  const s = e.target.closest('[data-sort]');
  if (s) {
    const key = s.dataset.sort;
    const dir = state.sort === key ? (state.dir === 'asc' ? 'desc' : 'asc') : NUMERIC.has(key) ? 'desc' : 'asc';
    update({ sort: key, dir });
  }
  const l = e.target.closest('[data-listing]');
  if (l) openCard(l.dataset.listing);
});

// A sit-down and a re-base are conversations with Claude: the page
// copies the message that starts each one.
function rebaseText() {
  const cash = data.ledger.find((l) => l.measure === 'cash');
  return rebaseMessage({ start: base.P['timeline.start'], model: base.P['cash.start_cash'], ledger: cash?.ledger_value,
    asOf: cash?.ledger_as_of ?? null, thisMonth: [Number(today.slice(0, 4)), Number(today.slice(5, 7))] });
}
for (const k of ['calibration', 'variables']) {
  host(k).addEventListener('click', (e) => {
    if (e.target.closest('[data-sitdown]')) copyMessage(host('bar'), sitDownMessage(), 'the sit-down');
    if (e.target.closest('[data-rebase]')) copyMessage(host('bar'), rebaseText(), 'the re-base');
  });
}

host('auctions').addEventListener('click', (e) => {
  const l = e.target.closest('[data-listing]');
  if (l) openCard(l.dataset.listing);
});

host('assess').addEventListener('click', (e) => {
  const l = e.target.closest('[data-listing]');
  if (l) openCard(l.dataset.listing);
  if (e.target.closest('[data-assess-copy]')) {
    copyMessage(host('bar'), assessMessage(host('assess').querySelector('[data-assess-text]').value), 'the listing for Claude to assess');
  }
});

host('card').addEventListener('click', (e) => {
  if (e.target.closest('[data-close]')) {
    const code = state.listing;
    update({ listing: null });
    requestAnimationFrame(() => requestAnimationFrame(() => document.querySelector(`[data-listing="${CSS.escape(code)}"]`)?.focus()));
  }
  const j = e.target.closest('[data-judge]');
  if (j && last) {
    const x = last.rows.find((r) => r.row.code === j.dataset.judge);
    if (x?.now) copyMessage(host('bar'), judgementMessage(x.row, x.now), `your judgement on ${x.row.code}`);
  }
});
host('card').addEventListener('change', (e) => {
  const sel = e.target.closest('[data-focus]');
  if (sel && last) {
    focusRoadCode = sel.value;
    render(host('card'), cardFor(last.rows, last.ctx, last.runs));
    document.querySelector('#rd-focus-road')?.focus();
  }
});

paint();
if (state.listing) {
  requestAnimationFrame(() => document.querySelector('[data-card]')?.scrollIntoView({ block: 'start' }));
}
