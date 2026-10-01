// Road Ahead: the charts' hover layer. One tooltip for the page. A mark
// carrying data-tip-value and data-tip-label shows them when the pointer
// is over it, or a finger on it - the value first, the label after - and
// a cash line shows the month under the pointer with a crosshair, from the
// series the chart carries. Tooltips add to the page and never gate it:
// every value is also written beside its mark or in a table. Labels can be
// anybody's text, so they go in as text, never as markup.
import { kilo } from '../../engine/road-ahead/charts/scale.js';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const monthAfter = (start, n) => {
  const [y, m] = start.split('-').map(Number);
  const k = y * 12 + (m - 1) + n;
  return `${MONTHS[k % 12]} ${Math.floor(k / 12)}`;
};

/** The month a pointer is over on a cash line, and where that month is drawn. */
export function sparkAt(svg, clientX) {
  const box = svg.getBoundingClientRect();
  const cash = svg.dataset.cash.split(',').map(Number);
  const pad = Number(svg.dataset.pad);
  const width = Number(svg.dataset.width);
  const span = Math.max(1, cash.length - 1);
  const ux = ((clientX - box.left) / Math.max(1, box.width)) * width;
  const i = Math.min(cash.length - 1, Math.max(0, Math.round(((ux - pad) / (width - 2 * pad)) * span)));
  return { i, x: pad + (i / span) * (width - 2 * pad), cash: cash[i], month: monthAfter(svg.dataset.start, i) };
}

/**
 * Give the marks inside these hosts their tooltips.
 * @param {HTMLElement[]} hosts
 */
export function wireTips(hosts) {
  const tip = document.createElement('div');
  tip.className = 'rd-tip';
  tip.setAttribute('role', 'tooltip');
  tip.hidden = true;
  const value = document.createElement('strong');
  const label = document.createElement('span');
  tip.append(value, label);
  document.body.append(tip);
  let cross = null;

  const hide = () => {
    tip.hidden = true;
    cross?.setAttribute('visibility', 'hidden');
    cross = null;
  };
  // Beside the pointer, kept inside the window whichever edge it is near.
  const show = (v, l, x, y) => {
    value.textContent = v;
    label.textContent = l;
    tip.hidden = false;
    const w = tip.offsetWidth;
    const h = tip.offsetHeight;
    const left = Math.min(Math.max(8, x + 12), window.innerWidth - w - 8);
    const top = y - h - 12 >= 8 ? y - h - 12 : Math.min(y + 16, window.innerHeight - h - 8);
    tip.style.setProperty('--tip-x', `${Math.round(left)}px`);
    tip.style.setProperty('--tip-y', `${Math.round(top)}px`);
  };
  const over = (e) => {
    const spark = e.target.closest?.('[data-spark]');
    if (spark) {
      const at = sparkAt(spark, e.clientX);
      const line = spark.querySelector('.rd-spark__cross');
      if (cross && cross !== line) cross.setAttribute('visibility', 'hidden');
      cross = line;
      line.setAttribute('x1', at.x.toFixed(1));
      line.setAttribute('x2', at.x.toFixed(1));
      line.setAttribute('visibility', 'visible');
      show(kilo(at.cash), `${at.month} · ${spark.dataset.spark}`, e.clientX, spark.getBoundingClientRect().top);
      return;
    }
    const mark = e.target.closest?.('[data-tip-value]');
    if (!mark) { hide(); return; }
    show(mark.dataset.tipValue, mark.dataset.tipLabel ?? '', e.clientX, e.clientY);
  };
  for (const host of hosts) {
    host.addEventListener('pointermove', over);
    host.addEventListener('pointerdown', over);
    host.addEventListener('pointerleave', hide);
  }
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') hide(); });
  window.addEventListener('scroll', hide, { passive: true });
}
