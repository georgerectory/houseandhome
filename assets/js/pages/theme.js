// Theme. The specification, organised the way a shop is.
//
// This page answers one question: standing in front of a shelf, which
// one do I buy. So every row leads with what to BUY and what to REJECT,
// and the reasoning sits underneath in smaller type - because the
// reasoning is what you read once at home and the spec is what you read
// on your phone in an aisle.
//
// Organised by category rather than by room deliberately. "What paint
// goes in the back bedroom" is a question you answer once per room and
// then get wrong somewhere; "what paint may touch lime plaster anywhere
// in this house" is a rule that answers itself every time.
import { requireAuth } from '../core/auth.js';
import { mountShell, render } from '../core/shell.js';
import { load } from '../core/store.js';
import { emptyState } from '../core/page.js';
import { escape } from '../core/format.js';

const user = await requireAuth();
if (!user) throw new Error('redirecting to login');

mountShell('theme.html', { user });

const d = await load();
const rows = (d.theme_book ?? []).slice()
  .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));

// Fabric first, then what goes on it, then what hangs off it. A shop
// trip follows roughly this order and so does the build.
const ORDER = ['plaster', 'paint', 'timber', 'lighting', 'metalwork',
  'tile', 'stone', 'glass', 'textile', 'hardware'];
const LABEL = {
  plaster: 'Plaster', paint: 'Paint', timber: 'Timber', lighting: 'Lighting',
  metalwork: 'Metalwork', tile: 'Tile', stone: 'Stone', glass: 'Glass',
  textile: 'Textiles', hardware: 'Hardware',
};

const byCategory = new Map();
for (const r of rows) {
  if (!byCategory.has(r.category)) byCategory.set(r.category, []);
  byCategory.get(r.category).push(r);
}
const categories = [...byCategory.keys()]
  .sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b));

/** The two numbers that decide a bulb, and that no box puts on the front. */
const lightHtml = (r) => (r.kelvin || r.cri)
  ? `<p class="spec__light">
      ${r.kelvin ? `<span class="chip chip--accent">${r.kelvin}K</span>` : ''}
      ${r.cri ? `<span class="chip chip--accent">CRI ${r.cri}+</span>` : ''}
    </p>`
  : '';

// A swatch is set through a custom property rather than a static inline
// style: the colour is data, it cannot be a class, and the lint permits
// style= only when it carries a custom property.
const swatchHtml = (r) => r.hex
  ? `<span class="spec__swatch" style="--swatch: ${escape(r.hex)}" aria-hidden="true"></span>`
  : '';

const rowHtml = (r) => `<article class="spec">
  <h3 class="spec__name">${swatchHtml(r)}${escape(r.name)}</h3>
  <p class="spec__meta">
    <span class="chip">${escape(r.surface)}</span>
    <span class="chip">${escape(r.status)}</span>
    <span class="chip">${escape(r.confidence)}</span>
    ${r.room_name ? `<span class="chip">${escape(r.room_name)}</span>` : ''}
  </p>
  ${lightHtml(r)}
  ${r.spec ? `<p class="spec__buy"><span class="spec__tag">Buy</span>${escape(r.spec)}</p>` : ''}
  ${r.reject_if ? `<p class="spec__reject"><span class="spec__tag">Reject</span>${escape(r.reject_if)}</p>` : ''}
  ${r.rationale ? `<p class="spec__why">${escape(r.rationale)}</p>` : ''}
  ${r.notes ? `<p class="spec__why">${escape(r.notes)}</p>` : ''}
</article>`;

const shoppable = rows.filter((r) => r.is_shoppable).length;
const trusted = rows.filter((r) => r.is_trusted).length;

render('[data-page-root]', rows.length
  ? `<div class="doc">
      <p class="notice">
        <span class="notice__title">${rows.length} decisions, ${shoppable} shoppable</span>
        A decision is shoppable when it says what to reject as well as
        what to buy - without that half a scheme becomes a pile of things
        that nearly match. ${trusted} of these are confirmed; the rest are
        drafted, which means Claude wrote them and nobody has checked them.
      </p>
      <nav class="ck-toc" aria-label="Contents">
        <h3>Contents</h3>
        <ol>${categories.map((c) =>
          `<li><a href="#c-${c}">${escape(LABEL[c] ?? c)}</a>
           <span class="ck-count">${byCategory.get(c).length}</span></li>`).join('')}</ol>
      </nav>
      ${categories.map((c) => `<section id="c-${c}">
        <h2>${escape(LABEL[c] ?? c)}</h2>
        ${byCategory.get(c).map(rowHtml).join('')}
      </section>`).join('')}
    </div>`
  : emptyState('No specification yet',
    'Paint, timber, lighting and ironmongery decisions live in the palettes table. Add them through a conversation with Claude.'));
