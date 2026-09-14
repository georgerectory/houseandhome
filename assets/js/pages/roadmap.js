// Roadmap. One set of rows, three readings.
//
// Board     the horizon bands, or any other grouping as swimlanes
// Timeline  a waterfall whose x-axis is affordability, not wishful dates
// List      everything at once, dense
//
// Grouping is by the axes a house actually has - room, trade, intent,
// benefit, kind - because a renovation backlog is not organised by
// department. View, grouping and filters persist, so the roadmap opens
// the way it was left.
import { requireAuth } from '../core/auth.js';
import { mountShell, render, confidenceBanner } from '../core/shell.js';
import { load, openItems, confidenceSummary } from '../core/store.js';
import { itemCard, itemDetail, itemChips, emptyState } from '../core/page.js';
import { money, duration, provenance, titleCase, escape, HORIZON_LABEL } from '../core/format.js';
import {
  VIEWS, GROUPINGS, groupItems, applyFilters, optionsFor,
  buildTimeline, toCSV, toJSON,
} from '../engine/roadmap-views.js';

const user = await requireAuth();
if (!user) throw new Error('redirecting to login');

mountShell('roadmap.html', { user });

const d = await load();
const all = d.items ?? [];
const PREFS_KEY = 'hh-roadmap-view';

const defaults = {
  view: 'board', group: 'horizon', room: '', trade: '', theme: '',
  kind: '', benefit: '', search: '', hideDone: true,
};
let prefs = { ...defaults };
try { prefs = { ...defaults, ...JSON.parse(localStorage.getItem(PREFS_KEY) || '{}') }; } catch { /* ignore */ }
const savePrefs = () => {
  try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch { /* private mode */ }
};

const monthly = Number(d.pot?.monthly_contribution ?? 0);
const potProv = provenance(d.pot?.contribution_confidence);
const curve = {
  decay: d.allocation_settings?.decay,
  floorShare: d.allocation_settings?.floor_share,
};

const activeFilterCount = () =>
  ['room', 'trade', 'theme', 'kind', 'benefit'].filter((k) => prefs[k]).length
  + (prefs.hideDone ? 0 : 1);

const select = (id, label, value, options, { includeAll = 'All' } = {}) => `
  <span class="control">
    <label for="${id}">${escape(label)}</label>
    <select id="${id}" name="${id}">
      ${includeAll ? `<option value="">${escape(includeAll)}</option>` : ''}
      ${options.map((o) => {
        const [val, text] = Array.isArray(o) ? o : [o, titleCase(o)];
        return `<option value="${escape(val)}"${val === value ? ' selected' : ''}>${escape(text)}</option>`;
      }).join('')}
    </select>
  </span>`;

function controls() {
  return `
  <form class="toolbar" id="controls" aria-label="Roadmap view options">
    <div class="toolbar__row" role="group" aria-label="View">
      ${VIEWS.map((v) => `
        <button type="button" class="seg${v.key === prefs.view ? ' is-on' : ''}"
                data-view="${v.key}" aria-pressed="${v.key === prefs.view}">${escape(v.label)}</button>
      `).join('')}
    </div>
    <div class="toolbar__row">
      ${select('group', 'Group by', prefs.group, GROUPINGS.map((g) => [g.key, g.label]), { includeAll: '' })}
      <span class="control control--grow">
        <label for="search">Search</label>
        <input id="search" name="search" type="search" value="${escape(prefs.search)}"
               placeholder="title, room, trade, tool">
      </span>
    </div>

    <!-- Six selects stacked is most of a phone screen, so the filters
         collapse behind a disclosure on small viewports and are always
         open from 768 up. The count on the summary is what stops a
         filter being left on and forgotten behind a closed panel. -->
    <details class="filters"${activeFilterCount() ? ' open' : ''}>
      <summary>Filters${activeFilterCount() ? ` <span class="chip chip--accent">${activeFilterCount()}</span>` : ''}</summary>
      <div class="toolbar__row filters__body">
        ${select('room', 'Room', prefs.room, optionsFor(all, 'room_name'))}
        ${select('trade', 'Trade', prefs.trade, optionsFor(all, 'trade'))}
        ${select('theme', 'Intent', prefs.theme, optionsFor(all, 'theme'))}
        ${select('kind', 'Kind', prefs.kind, optionsFor(all, 'kind'))}
        ${select('benefit', 'Benefit', prefs.benefit, optionsFor(all, 'benefit_type'))}
        <span class="control control--check">
          <input id="hideDone" name="hideDone" type="checkbox"${prefs.hideDone ? ' checked' : ''}>
          <label for="hideDone">Hide done</label>
        </span>
      </div>
    </details>

    <div class="toolbar__row">
      <button type="button" class="btn btn--quiet" id="export-csv">Export CSV</button>
      <button type="button" class="btn btn--quiet" id="export-json">Export JSON</button>
      <button type="button" class="btn btn--quiet" id="reset">Reset</button>
    </div>
    <p class="lede" id="summary" role="status"></p>
  </form>
  <div id="view"></div>`;
}

// --- Views -----------------------------------------------------------

function boardView(groups) {
  if (!groups.length) return emptyState('Nothing matches those filters.');
  return `<div class="bands bands--auto">
    ${groups.map((g) => `
      <section class="band">
        <div class="band__head">
          <h2 class="band__title">${escape(g.key === g.label ? titleCase(HORIZON_LABEL[g.key] ?? g.label) : g.label)}</h2>
          <span class="band__count num">${g.count}</span>
        </div>
        ${g.count
          ? g.items.map((i) => itemCard(i, { showFunding: true })).join('')
          : '<p class="empty">Nothing here.</p>'}
      </section>`).join('')}
  </div>`;
}

function listView(groups) {
  if (!groups.length) return emptyState('Nothing matches those filters.');
  return groups.map((g) => `
    <section class="section">
      <div class="section__head">
        <h2>${escape(g.key === g.label ? titleCase(HORIZON_LABEL[g.key] ?? g.label) : g.label)}</h2>
        <span class="band__count num">${g.count} · ${escape(money(g.totalCost))}</span>
      </div>
      ${g.count ? `<div class="table-wrap"><table class="table">
        <thead><tr>
          <th>#</th><th>Item</th><th class="num">Cost</th>
          <th class="num">Time</th><th>When</th>
        </tr></thead>
        <tbody>${g.items.map((i) => {
          const p = provenance(i.cost_confidence);
          return `<tr>
            <td class="num">${i.priority ?? '—'}</td>
            <td>
              <strong>${escape(i.title)}</strong>
              <div class="card__meta">${itemChips(i)}</div>
              ${itemDetail(i)}
            </td>
            <td class="num ${p.valueCls}">${escape(money(i.cost_expected ?? i.cost_best))}</td>
            <td class="num">${escape(duration(i.duration_min_minutes, i.duration_max_minutes))}</td>
            <td>${escape(titleCase(i.horizon))}</td>
          </tr>`;
        }).join('')}</tbody>
      </table></div>` : '<p class="empty">Nothing here.</p>'}
    </section>`).join('');
}

function timelineView(groups, filtered) {
  const t = buildTimeline(filtered, { monthly, ...curve });

  if (!t.fundable) {
    return `<div class="notice notice--warn" role="status">
      <span class="notice__title">No monthly contribution set</span>
      This timeline places each item in the month it becomes affordable, so it
      needs a contribution figure to compute anything. Set one and it will fill in.
    </div>${boardView(groups)}`;
  }

  const byId = new Map(t.bars.map((b) => [b.item.id, b]));
  const axis = Array.from({ length: t.months }, (_, i) => i + 1);

  const lane = (b) => {
    const prov = provenance(b.item.cost_confidence);
    const start = b.beyond ? t.months + 1 : Math.max(1, b.start || 1);
    const span = b.beyond ? 1 : Math.min(b.span, t.months - start + 2);
    const cls = b.noCost ? 'gantt__bar gantt__bar--free'
      : b.beyond ? 'gantt__bar gantt__bar--beyond' : 'gantt__bar';
    const when = b.noCost ? 'No cost - can start now'
      : b.beyond ? `Not funded within ${t.horizonMonths} months`
      : `Funded in month ${b.fundedMonth}`;
    return `<div class="gantt__row">
      <div class="gantt__label">
        <span class="gantt__title">${escape(b.item.title)}</span>
        <span class="gantt__meta num ${prov.valueCls}">${escape(money(b.item.cost_expected ?? b.item.cost_best))}</span>
      </div>
      <div class="gantt__track" style="--months:${t.months + 1}">
        <div class="${cls}" style="--start:${start};--span:${Math.max(1, span)}"
             title="${escape(`${b.item.title} — ${when}`)}">
          <span class="visually-hidden">${escape(when)}</span>
        </div>
      </div>
    </div>`;
  };

  return `
    <div class="notice" role="status">
      <span class="notice__title">How to read this</span>
      The axis is months from now, and a bar sits in the month that item becomes
      affordable under the current savings curve — not a date anyone has promised.
      ${potProv.trusted ? '' : 'The contribution figure behind it is '
        + escape(potProv.label.toLowerCase()) + ', so treat the whole chart as a projection.'}
    </div>
    <div class="gantt-wrap">
      <div class="gantt">
        <div class="gantt__row gantt__row--axis">
          <div class="gantt__label"><span class="gantt__title">Item</span></div>
          <div class="gantt__track gantt__axis" style="--months:${t.months + 1}">
            ${axis.map((m) => `<span class="gantt__tick" style="--at:${m}">${m}</span>`).join('')}
            ${t.anyBeyond ? `<span class="gantt__tick gantt__tick--beyond" style="--at:${t.months + 1}">${t.horizonMonths}+</span>` : ''}
          </div>
        </div>
        ${groups.map((g) => g.count ? `
          <div class="gantt__group">
            <h3 class="gantt__group-title">${escape(g.key === g.label ? titleCase(HORIZON_LABEL[g.key] ?? g.label) : g.label)}
              <span class="band__count num">${g.count}</span></h3>
            ${g.items.map((i) => byId.get(i.id)).filter(Boolean).map(lane).join('')}
          </div>` : '').join('')}
      </div>
    </div>`;
}

// --- Wiring ----------------------------------------------------------

function currentFiltered() {
  return applyFilters(all, {
    room: prefs.room, trade: prefs.trade, theme: prefs.theme,
    kind: prefs.kind, benefit: prefs.benefit, search: prefs.search,
    hideDone: prefs.hideDone,
  });
}

function paint() {
  const filtered = currentFiltered();
  const groups = groupItems(filtered, prefs.group);
  const host = document.getElementById('view');

  host.innerHTML = prefs.view === 'timeline' ? timelineView(groups, filtered)
    : prefs.view === 'list' ? listView(groups)
    : boardView(groups);

  const cost = filtered.reduce((s, i) => s + Number(i.cost_expected ?? 0), 0);
  document.getElementById('summary').textContent =
    `${filtered.length} item${filtered.length === 1 ? '' : 's'} of ${all.length}`
    + ` · ${money(cost)} estimated` + (prefs.hideDone ? ' · done hidden' : '');

  for (const b of document.querySelectorAll('[data-view]')) {
    const on = b.dataset.view === prefs.view;
    b.classList.toggle('is-on', on);
    b.setAttribute('aria-pressed', String(on));
  }
}

function download(name, text, type) {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

render('[data-page-root]', `${confidenceBanner(confidenceSummary(d))}${controls()}`);
paint();

const form = document.getElementById('controls');

form.addEventListener('click', (e) => {
  const v = e.target.closest('[data-view]');
  if (v) { prefs.view = v.dataset.view; savePrefs(); paint(); return; }

  const stamp = new Date().toISOString().slice(0, 10);
  if (e.target.id === 'export-csv') {
    // Export what is on screen: an export that ignores the filters is a
    // different document to the one being looked at.
    download(`roadmap-${stamp}.csv`, toCSV(currentFiltered()), 'text/csv;charset=utf-8');
  }
  if (e.target.id === 'export-json') {
    download(`roadmap-${stamp}.json`, toJSON(currentFiltered()), 'application/json');
  }
  if (e.target.id === 'reset') {
    prefs = { ...defaults };
    savePrefs();
    render('[data-page-root]', `${confidenceBanner(confidenceSummary(d))}${controls()}`);
    paint();
    wire();
  }
});

function wire() {
  const f = document.getElementById('controls');
  f.addEventListener('change', onChange);
  f.addEventListener('input', onInput);
}
function onChange(e) {
  const t = e.target;
  if (t.type === 'checkbox') prefs[t.name] = t.checked;
  else if (t.name in prefs) prefs[t.name] = t.value;
  savePrefs();
  paint();
}
let debounce;
function onInput(e) {
  if (e.target.id !== 'search') return;
  clearTimeout(debounce);
  debounce = setTimeout(() => { prefs.search = e.target.value; savePrefs(); paint(); }, 150);
}
form.addEventListener('change', onChange);
form.addEventListener('input', onInput);
