// Routes to the next home, as a section of the Money page.
//
// The inputs are one household variable, routes.inputs (shared pay,
// spending, the next-home targets and each route's terms), plus the
// routes engine. Nothing here types a figure; a route whose terms rest
// on an unconfirmed input is labelled as a model, never as affordable.
import { escape, money } from '../../core/format.js';
import { variable } from '../../engine/cash-plan.js';
import { walk, priceToMatch, resolveInputs } from '../../engine/routes.js';

const label = (m) => {
  if (!m) return 'not within the horizon';
  const [y, mo] = m.split('-').map(Number);
  return new Date(Date.UTC(y, mo - 1, 1)).toLocaleDateString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' });
};
const prov = (v) => `<span class="value--provisional">${money(v)}</span>`;

/** The routes section, or a plain note when nothing is recorded. */
export function routesHtml(vars) {
  const stored = variable(vars, 'routes.inputs');
  if (!stored?.routes?.length || !stored?.targets?.length) return '';
  const { value: inp, missing } = resolveInputs(stored, vars);
  if (missing.length) return `<p class="lede">The routes refer to figures that are not recorded: ${escape(missing.join('; '))}.</p>`;
  const head = inp.routes.map((r) => `<th class="num">${escape(r.name)}</th>`).join('');
  const rows = inp.targets.map((t) => {
    const results = inp.routes.map((r) => {
      const shared = { ...inp.shared, ...(r.shared ?? {}) };
      const next = { ...inp.next, price: t, multiple: r.nextMultiple ?? inp.next.multiple };
      return { r, res: walk(shared, r.terms, next), shared, next };
    });
    const rent = results.find((x) => x.r.terms.kind === 'rent');
    const cells = results.map(({ r, res, shared, next }) => {
      let match = '';
      if (r.terms.kind === 'buy' && rent?.res.reached) {
        const p = priceToMatch(shared, r.terms, next, rent.res.reached, { low: r.terms.price - 80000, high: r.terms.price + 20000 });
        match = `<br><small>beats renting at ${p ? prov(p) : 'no price'} or less</small>`;
      }
      return `<td class="num">${escape(label(res.reached))}${match}</td>`;
    }).join('');
    return `<tr><td>${money(t)}</td>${cells}</tr>`;
  }).join('');
  const at = inp.compareAt;
  const worth = at ? inp.routes.map((r) => {
    const res = walk({ ...inp.shared, ...(r.shared ?? {}) }, r.terms, null);
    const row = res.rows.find((x) => x.month === at);
    return row ? `<li><strong>${escape(r.name)}</strong>: ${prov(row.cash + (r.terms.kind === 'buy' && r.terms.sell ? row.saleNet : 0))}</li>` : '';
  }).join('') : '';
  return `<p class="lede">The earliest month each next home is within reach on each route, from the same
      starting cash and pay. A model of recorded figures, several of them unconfirmed: never a statement
      of what is affordable.</p>
    <div class="table-wrap"><table class="table">
      <thead><tr><th>Next home</th>${head}</tr></thead><tbody>${rows}</tbody></table></div>
    ${worth ? `<h3>What each route leaves you with by ${escape(label(at))}</h3><ul class="fp-list">${worth}</ul>` : ''}
    ${inp.note ? `<p class="lede">${escape(inp.note)}</p>` : ''}`;
}
