// Handbook. What this system is, how it decides things, and what has
// been decided. The reference a cold session reads to become competent.
import { requireAuth } from '../core/auth.js';
import { mountShell, showProperty, render } from '../core/shell.js';
import { load } from '../core/store.js';
import { openItems, confidenceSummary } from '../engine/selectors.js';
import { titleCase, escape } from '../core/format.js';
import { placeAll, roomLabel, spreadInferred } from '../engine/floorplan.js';
import { loadComposed } from '../core/building-data.js';

const user = await requireAuth();
if (!user) throw new Error('redirecting to login');

mountShell('handbook.html', { user });

const d = await load();
showProperty(d.property);
const conf = confidenceSummary(d);

// The building geometry is repo content. It is read here only to resolve
// grid references, so the handbook names a position in the same words the
// floor plan does - against the AS-BOUGHT stage, because that is the
// house the register describes today.
const model = await loadComposed(null, null);
const building = model?.composed ?? null;

const roomNames = Object.fromEntries((d.rooms ?? []).map((r) => [r.key, r.name]));
const fixtures = building
  ? spreadInferred(placeAll([
    ...(d.assets ?? []),
    ...(d.storage ?? []),
  ], building))
  : [];
const located = fixtures.filter((p) => p.fullRef).sort((a, b) =>
  String(a.fullRef).localeCompare(String(b.fullRef), undefined, { numeric: true }));
const kinds = {};
for (const i of openItems(d)) kinds[i.kind] = (kinds[i.kind] ?? 0) + 1;

render('[data-page-root]', `
  <section class="section">
    <h2>How this works</h2>
    <p>There is no interactive front end here, and that is deliberate. Everything
    is added, edited and decided through conversation with Claude, which writes to
    the database directly. This site renders the result and nothing more — there
    is no form on it, and no button that changes anything.</p>
    <p>The repository is public; none of the content is. Every real figure lives in
    Supabase behind row-level security, which is forced on every table and proven
    by test rather than assumed.</p>
  </section>

  <section class="section">
    <h2>Where things are</h2>
    <p>Every fixture carries a position in metres. The grid reference below is
      computed from that position, and so is the square it occupies on the floor
      plan and the marker in the 3D model — one number, three readings, which is
      why they cannot drift apart. A reference reads
      <span class="num">G-D7</span>: level, then column, then row, with each
      square one metre across.</p>
    ${located.length ? `<div class="table-wrap"><table class="table">
      <thead><tr><th class="num">Grid</th><th>Item</th><th>Room</th><th>Kind</th><th>Position</th></tr></thead>
      <tbody>${located.map((p) => `<tr>
        <td class="num">${escape(p.fullRef)}</td>
        <td>${escape(p.thing.name)}</td>
        <td>${escape(roomLabel(p.room, roomNames) ?? '—')}</td>
        <td>${escape(titleCase(p.thing.category ?? p.thing.kind ?? 'Fixture'))}</td>
        <td>${p.state === 'inferred'
          ? '<span class="prov prov--unconfirmed">Approximate: room centre</span>'
          : '<span class="prov prov--unconfirmed">Drafted position</span>'}</td>
      </tr>`).join('')}</tbody>
    </table></div>` : '<p class="empty">No plan is loaded, so nothing has a grid reference yet.</p>'}
    <p>Anything without a reference is either missing a position or sits in a room
      this version of the building does not have. Both are listed on the House page
      rather than quietly left out.</p>
  </section>

  <section class="section">
    <h2>How work is ordered</h2>
    <p>Priority is computed, never typed. Each item scores:</p>
    <div class="table-wrap"><table class="table">
      <thead><tr><th>Input</th><th>Scale</th><th>What it means</th></tr></thead>
      <tbody>
        <tr><td>Room weight</td><td class="num">1–5</td><td>How much this room matters right now.</td></tr>
        <tr><td>Theme weight</td><td class="num">1–5</td><td>Making the house safe outranks making it pretty.</td></tr>
        <tr><td>Benefit weight</td><td class="num">1–5</td><td>What the work buys the house.</td></tr>
      </tbody>
    </table></div>
    <p>The three multiply rather than add, so a low score on any one axis holds the
    whole item down — a cosmetic job in the best room should not outrank a
    make-safe job in the worst one. Items that unblock other work score higher;
    items waiting on something else score lower; preservation work grows more
    urgent with age. Every item stores the arithmetic that produced its rank, so
    the order can always explain itself.</p>
  </section>

  <section class="section">
    <h2>How money is distributed</h2>
    <p>One pot funds one list. Renovation work and things to buy are the same rows
    in the same table, competing for the same money, because separate pots drift
    out of proportion with each other.</p>
    <p>Every open, costed item receives a share of every deposit — the share falls
    geometrically by priority rank, so the top of the list moves fastest, and an
    equal floor share guarantees that nothing at the bottom ever reaches zero.
    Shares are settled in integer micro-pounds by largest remainder, so they sum to
    the deposit exactly rather than drifting by rounding.</p>
    <p>When an item completes it leaves the list and its share is redistributed, so
    everything remaining accelerates. Adding an item re-proportions the next deposit
    automatically; there is no rebalancing step.</p>
  </section>

  <section class="section">
    <h2>Confirmed and unconfirmed</h2>
    <p>Claude drafts nearly everything in this system, and a body of figures was
    carried over from an earlier one that has since gone stale. So every figure
    carries its provenance, and an unconfirmed number is never allowed to read —
    or compute — like a checked one.</p>
    <div class="table-wrap"><table class="table">
      <thead><tr><th>State</th><th>Drives decisions</th><th>Means</th></tr></thead>
      <tbody>
        <tr><td>Carried over</td><td>No</td><td>Migrated from the old system. Never verified here.</td></tr>
        <tr><td>Drafted</td><td>No</td><td>Claude wrote it. Not yet checked.</td></tr>
        <tr><td>Researched</td><td>No</td><td>Backed by a source, but not confirmed.</td></tr>
        <tr><td>Confirmed</td><td>Yes</td><td>Checked, with a date.</td></tr>
        <tr><td>Actual</td><td>Yes</td><td>Observed: a real receipt, a real duration.</td></tr>
      </tbody>
    </table></div>
    <p>The database enforces this rather than trusting anyone to remember it: an
    allocation run refuses to move real money against an unconfirmed contribution
    figure, and a stored benefit cannot exist without its drafted-or-confirmed
    state alongside it.</p>
    <p>Right now, <strong>${conf.unconfirmed} of ${conf.total}</strong> open items
    are unconfirmed. Refining that is a conversation for later; the system is built
    to be useful and honest in the meantime.</p>
  </section>

  <section class="section">
    <h2>What is on the list</h2>
    <div class="table-wrap"><table class="table">
      <thead><tr><th>Kind</th><th class="num">Open items</th></tr></thead>
      <tbody>${Object.entries(kinds).sort((a, b) => b[1] - a[1])
        .map(([k, n]) => `<tr><td>${escape(k)}</td><td class="num">${n}</td></tr>`).join('')}</tbody>
    </table></div>
  </section>
`);
