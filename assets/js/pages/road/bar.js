// Road Ahead: the scenario bar. The Adjust panel and the scenario pills
// on one row, a status line and every road's forever-home budget under
// them. The panel holds the what-ifs and the two ways out: Reset, and
// Copy for Claude. Rendered once; syncBar() keeps it in step afterwards,
// so dragging a slider never rebuilds the slider being dragged.
import { escape } from '../../core/format.js';
import { CONTROLS, GROUPS, showValue, formatValue, control } from '../../engine/road-ahead/page/state.js';
import { kilo } from '../../engine/road-ahead/charts/scale.js';

/** A slider's bounds: the control's own, widened by the variable's range and the value itself. */
function bounds(c, variable, value) {
  const lo = [c.min, variable?.low, value].filter(Number.isFinite);
  const hi = [c.max, variable?.high, value].filter(Number.isFinite);
  return [Math.min(...lo), Math.max(...hi)];
}

function input(c, value, variable) {
  const id = `rd-${c.id}`;
  if (c.kind === 'month') {
    return `<input id="${id}" type="month" data-control="${c.id}" value="${value ? escape(formatValue(c, value)) : ''}">`;
  }
  const [min, max] = bounds(c, variable, value);
  return `<input id="${id}" type="range" data-control="${c.id}" min="${min}" max="${max}" step="${c.step}" value="${value ?? min}">`;
}

/**
 * @param {object} data loadRoadAhead()
 * @param {object} state readState()
 * @param {Object<string,*>} current each control's value before any what-if
 */
export function barHtml(data, state, current) {
  const variable = new Map(data.variables.map((v) => [v.key, v]));
  const pills = data.scenarios.map((s) => `<button type="button" class="seg rd-pill" data-scenario="${escape(s.key)}"
    aria-pressed="false" title="${escape(s.description ?? '')}">${escape(s.name)}</button>`).join('');
  const groups = GROUPS.map((g) => `<fieldset class="rd-adjust__group">
    <legend>${escape(g.label)}</legend>
    ${CONTROLS.filter((c) => c.group === g.key).map((c) => {
      const v = state.values[c.id] ?? current[c.id];
      const vr = c.target.startsWith('var:') ? variable.get(c.target.slice(4)) : null;
      return `<div class="rd-ctl" data-ctl="${c.id}">
        <label for="rd-${c.id}">${escape(c.label)}</label>
        <output for="rd-${c.id}" class="rd-ctl__out num">${escape(showValue(c, v))}</output>
        ${input(c, v, vr)}
        <span class="rd-ctl__was"></span>
      </div>`;
    }).join('')}
  </fieldset>`).join('');
  return `<div class="rd-bar__row">
      <details class="rd-adjust" data-adjust-panel>
        <summary>Adjust</summary>
        <div class="rd-adjust__sheet">
          <div class="rd-adjust__tools">
            <button type="button" class="btn btn--quiet" data-reset>Reset</button>
            <button type="button" class="btn" data-copy>Copy for Claude</button>
            <p class="rd-quiet">Nothing on this page saves. Copy for Claude makes a message asking Claude to keep
              these settings as a scenario, with your reason.</p>
          </div>
          <div class="rd-copy" data-copy-box hidden>
            <label for="rd-copy-text">Your browser would not copy it. Select this and send it to Claude:</label>
            <textarea id="rd-copy-text" readonly rows="7" data-copy-text></textarea>
          </div>
          <form class="rd-adjust__form" data-adjust>${groups}</form>
        </div>
      </details>
      <div class="rd-bar__pills" role="group" aria-label="Scenario">${pills}</div>
    </div>
    <p class="rd-bar__status" data-status role="status"></p>
    <p class="rd-bar__sum" data-sum></p>`;
}

/**
 * Bring the bar in line with the state without rebuilding it.
 * @param {HTMLElement} host
 * @param {object} state
 * @param {Object<string,*>} current
 * @param {string} scenarioName
 */
export function syncBar(host, state, current, scenarioName) {
  for (const b of host.querySelectorAll('[data-scenario]')) {
    const on = b.dataset.scenario === state.scenario;
    b.classList.toggle('is-on', on);
    b.setAttribute('aria-pressed', String(on));
  }
  let changed = 0;
  for (const el of host.querySelectorAll('[data-ctl]')) {
    const c = control(el.dataset.ctl);
    const set = state.values[c.id];
    const v = set ?? current[c.id];
    const moved = set != null && showValue(c, set) !== showValue(c, current[c.id]);
    if (moved) changed += 1;
    el.classList.toggle('is-changed', moved);
    el.querySelector('output').textContent = showValue(c, v);
    el.querySelector('.rd-ctl__was').textContent = moved ? `was ${showValue(c, current[c.id])}` : '';
    const inp = el.querySelector('input');
    if (document.activeElement !== inp && v != null) inp.value = formatValue(c, v);
  }
  host.querySelector('[data-status]').textContent = changed
    ? `${scenarioName}, with ${changed} what-if${changed === 1 ? '' : 's'}. Nothing is saved.`
    : `${scenarioName}. Nothing is saved.`;
}

/**
 * The forever-home budget of every road, in the bar, so a what-if shows
 * what it does while the Adjust panel covers the charts.
 * @param {HTMLElement} host
 * @param {Array<{road:{code:string}, head:{forever_today:number|null}}>} runs runAll()
 */
export function syncSum(host, runs) {
  const each = runs.map(({ road, head }) => `${road.code} ${head.forever_today == null ? 'none' : kilo(head.forever_today)}`);
  host.querySelector('[data-sum]').textContent = `Forever home, today's money: ${each.join(' · ')}`;
}

/**
 * Wire the bar's controls to the page.
 * @param {HTMLElement} host
 * @param {{scenario:(key:string)=>void, value:(id:string, raw:string)=>void, reset:()=>void, copy:()=>void}} on
 */
export function wireBar(host, on) {
  host.addEventListener('click', (e) => {
    const pill = e.target.closest('[data-scenario]');
    if (pill) on.scenario(pill.dataset.scenario);
    if (e.target.closest('[data-reset]')) on.reset();
    if (e.target.closest('[data-copy]')) on.copy();
  });
  host.addEventListener('input', (e) => {
    const el = e.target.closest('[data-control]');
    if (el) on.value(el.dataset.control, el.value);
  });
  host.querySelector('[data-adjust]').addEventListener('submit', (e) => e.preventDefault());
}

/**
 * Copy a message; when the browser will not, open the Adjust panel with
 * the message in it to copy by hand.
 * @param {HTMLElement} host the bar
 * @param {string} text
 * @param {string} what what the message keeps, for the status line
 */
export async function copyMessage(host, text, what = 'these settings') {
  const box = host.querySelector('[data-copy-box]');
  const area = host.querySelector('[data-copy-text]');
  area.value = text;
  try {
    await navigator.clipboard.writeText(text);
    host.querySelector('[data-status]').textContent = `Copied. Paste it to Claude to keep ${what}.`;
    box.hidden = true;
  } catch {
    host.querySelector('[data-adjust-panel]').open = true;
    box.hidden = false;
    area.focus();
    area.select();
  }
}
