# CLAUDE.md

Operating rules for any Claude session working in this repository. Read
this in full at the start of every session, then `docs/STATE.md` for
where the work actually is.

## What this is

A house manager: renovation roadmap, prioritised backlog, savings
allocation, floor plan, inventory and an equipment register. It runs
*before* a property is bought, through purchase and renovation, and
permanently afterwards.

**There is no interactive front end, and that is the product.**
Everything is added, edited and decided through conversation with
Claude, which writes to Supabase directly. The published site renders
the result. There is no form on it and no button that changes anything.

**The repository is public; the data is not.** Everything real lives in
Supabase behind row-level security.

## The active property

**P-001, 48 Ameysford Road, Ferndown BH22 9QA - active, a candidate. No
offer made.** Built in the 1950s (owner, 24 Sep 2026); walls cavity
expected, not yet seen.

The system is property-agnostic. Five scopes: **USER** (the household,
`property_id` null), **BRIEF** (what a house is looked for against),
**TEMPLATE** (`work_item_templates`, `work_phases`), **LIBRARY**
(`price_references`, dated and region-tagged) and **PROPERTY** (one
building, `property_id` set). A rate carries to every house; a quantity
belongs to one.

"The house", "the budget", "the roadmap" mean the active property. "My
bills", "my savings", "my tools" are USER. "Across the houses" is
`property_compare`, the only read of an archived property. **Never read
the property archive unless asked for a cross-property comparison.
Purged properties do not exist.** Lifecycle commands, the five scopes
and the rules behind them: `docs/RENOVATION-SYSTEM.md`.

**The standing scope is a FULL RESTORATION.** Every internal face comes
back to the brick, the house is replumbed and rewired, and it is made
watertight before anything goes back on. The house is 1950s, so the
plaster that goes back is gypsum on a cavity wall, lime only if the brick
bond shows solid - `walls.construction` in the building spec decides,
and the takeoff follows it. Not a redecoration with the
worst bits fixed. This is the assumption behind every quantity, total
and sequence in this system, and it is recorded as a `decision` row so
it can be argued with rather than inherited silently.

Two things follow from it, and neither is optional:

- **Sequence beats keenness.** Paint, carpet, grout and draught-proofing
  applied before a room is stripped is work that gets demolished. Where
  an existing row conflicts with the strip, SAY SO on the row - a `risk`
  note tagged `review:scope-conflict` - and let the owner decide. Do not
  quietly drop somebody else's job, and do not quietly do both.
- **The internal wall face is a quantity, not an impression.** 241 m2 of
  wall and 77 m2 of ceiling on this house. `npm run takeoff` derives the
  materials from the geometry and `--sql` writes them to
  `property_quantities`. Nothing about it is typed.

## Where the rest lives

This file is read IN FULL at the start of every session, so it holds
only what every session needs. The reference lives beside it and is read
when the work touches it:

| File | When to read it |
|---|---|
| `docs/STATE.md` | Always, straight after this. What is in flight. |
| `docs/RENOVATION-SYSTEM.md` | Anything touching properties, the lifecycle, scopes, the template or the library. |
| `docs/properties/<ref>/` | One property's specifics. Archived ones move to `docs/properties-archive/`. |
| `docs/DECISIONS.md` | Priority, money, the roadmap, the shopping list, quantities, stockpiles, links. |
| `docs/REVIEW.md` | A review session. |
| `docs/BUILDING-MODEL.md` | Anything under `model3d/`, `planner/` or `data/buildings/`. |
| `docs/SOURCE-FIDELITY.md` | Before changing any drawn geometry. The drawings decide; checkers report. |
| `docs/FRONTEND.md` | CSS, layout, tokens, breakpoints. |
| `docs/CARRY-OVER.md` | Loading the earlier system's figures. |
| `docs/GLOSSARY.md` | A word in this repo you do not recognise. |
| `docs/PLAN.md` | The design record: why things are the way they are. |

## Non-negotiable rules

1. **Never commit a credential.** The Supabase anon key in
   `assets/js/core/config.js` is the only one that may ever be here, and
   only because RLS is forced on every table. The service_role key must
   never appear anywhere: not in a file, a commit message or terminal
   output.
2. **A new table gets RLS and policies in the same change.** A table
   without a policy is readable by anyone holding the anon key.
3. **Nothing is ever deleted.** Rows close with a status and a
   resolution. The delete guard on `work_items` enforces this; a
   deliberate cleanup opts in with
   `set local house.allow_work_item_delete = 'on';`. This governs ROWS
   only - a dead column or an unused file should be removed, because
   leaving it means two mechanisms for one job. **The one named
   exception is `purge_property()`**: on the owner's explicit instruction
   naming the property, with its address typed, a property and
   everything it owns is deleted. It is irreversible and never run on
   Claude's own initiative.
4. **Unconfirmed data never drives a decision.** See below.
5. **`npm test` is green before every commit.**

## Acting without asking

**The owner has given standing permission for SQL.** Every query,
migration and advisor check through the Supabase connector is
pre-approved. Run it. Do not stop to ask whether a read is allowed, do
not narrate a statement and wait, and do not batch work up into a
request for approval. The instruction was given once and lives here so
it never has to be given again.

That permission is about INTERRUPTION, not about care. Everything else
in this file still binds, and three things in particular:

- **Nothing is deleted.** Rows close with a status and a resolution.
  Standing permission to run SQL is not permission to retire a row the
  owner wrote; it is permission to run the statement that closes it
  once they have said so.
- **A money figure never changes silently.** Set
  `house.change_why` (and `house.change_source`) before changing a cost,
  amount or balance; the trigger refuses otherwise and writes OLD, NEW,
  WHY and SOURCE to `change_log`.
- **Verify by re-reading.** A write that was not read back did not
  happen. This matters more under standing permission, not less,
  because nobody is reading the statement before it runs.
- **Drafted stays drafted.** Writing a row does not confirm it. Only
  the owner's explicit word moves `confidence` to `confirmed`.

The same standing permission covers reading the repository, `npm test`
and `npm run takeoff`. Something genuinely irreversible - dropping a
table, resetting a password, closing a row the owner authored - is a
decision to put to them, and a decision is not the same thing as a
permission.

## Confirmed and unconfirmed: the rule that matters most

Claude drafts almost everything here, and a body of figures was carried
over from an earlier system that has since gone stale. So every figure
carries a `confidence`, and only `confirmed` and `actual` may drive a
total, a projection or an allocation of real money.

| State | Trusted | Means |
|---|---|---|
| `carried_over` | No | Migrated from the old system. Never verified here. |
| `drafted` | No | Claude wrote it. Not checked. |
| `researched` | No | Backed by a source, not confirmed by the owner. |
| `confirmed` | Yes | The owner said so. `confirmed_at` records when. |
| `actual` | Yes | Observed: a real receipt, a real duration. |

In practice:

- **Never assert feasibility from an unconfirmed figure.** Do not say
  "you can afford this", "this will take N months" or "you already own
  that" on the strength of a `drafted` or `carried_over` row. Say the
  figure is unconfirmed and offer to confirm it.
- Anything you write starts `drafted`. Only the owner's explicit word
  moves it to `confirmed`.
- `carried_finance` is an archive, not a ledger. It is a prompt sheet of
  things once listed, excluded from every total until reviewed.

## Session shape

**Start:** read this file, then `docs/STATE.md`, then call
`house_context('<room>')` (or `house_context(null)`) for what already
exists. A session that writes before grounding is how duplicates get
created.

**Adding work:** ground, then search for an existing row, then act.
Prefer enriching an existing row over creating a near-duplicate - the
owner's better description belongs on the row that already has the
history. Record why in `work_notes` so the next session inherits the
judgement rather than re-deriving it. State the undo in your
confirmation.

**Recording spend:** match it to an open item, set `spent_actual`, close
the item, and let the outcome feed the learning tables.

**Running a deposit:** `run_deposit_allocation(deposit_id)`. It refuses
to run against an unconfirmed contribution figure, which is deliberate.

**End:** verify every write by re-reading it, update `docs/STATE.md`,
run `npm test`, then commit.

## How the system decides things

Four rules, each with its reasoning in `docs/DECISIONS.md`:

- **Priority is computed, never typed.** Room weight x theme weight x
  benefit weight, plus unblocking, minus blocked. Every row stores
  `priority_explain`.
- **Money follows priority, not cost.** One pot, one list; geometric by
  rank with an equal floor share, settled in integer micro-pounds.
- **The shopping list is DERIVED.** A thing is on it because a live job
  requires it, through `requires_material`. Move the job and the list
  follows; never hand-edit a total.
- **Quantities come from `npm run takeoff`**, never from a cell. The
  geometry is the authority.

Two more: a stockpile is a spec, a count and a reason - and a spec you
cannot hold a listing up against is not a spec. Relationships are rows
in `knowledge_links`, never a new column.

**`docs/DECISIONS.md` has all of it**, including the demand-state table,
the four stockpile rules and why the roadmap is one set of rows read
three ways.

## Review sessions

The owner says **"I wish to review this"**. That is a defined session
shape, not a conversation: ground first with `house_context()`, open by
saying what is in front of you rather than with a question, work
`review_queue` rather than the table, ask as CLICKABLE questions one row
at a time, and close each row with `mark_reviewed(id, note)`.

**Priority is never one of the questions** - it is computed, so a review
changes the AXES and then runs `recompute_priorities()`. The single most
valuable thing a review produces is `confidence` moving to `confirmed`.

**`docs/REVIEW.md` is the full protocol**, including which column each
answer writes.

## Testing

`npm test` runs seven gates. All must pass.

| Gate | What it proves |
|---|---|
| `npm run test:secrets` | Nothing private is tracked by a public repository: no carried-over extract, no service_role key, no JWT, no source drawing. |
| `npm run lint` | No `100vw`, raw `vh`, `max-width` layout query, breakpoint in the 600-800 iPad band, inline style, emoji or hard-coded hex. |
| `npm run test:unit` | The allocation, priority and geometry engines behave as stated. |
| `npm run test:geometry` | Every stage of every building IS a building - rooms that do not overlap, a shell that closes, a floor with something under it - and agrees with the drawings it was measured from. |
| `npm run test:sql` | The schema applies to a real Postgres; guards, triggers and RLS isolation all hold. |
| `npm run test:parity` | The JS engine and the SQL engine agree to the micro-pound. |
| `npm run test:frontend` | Real Chromium, six viewports, both themes: no horizontal scroll, no overflow, no target under 24px, no console errors, landmarks present. |

`npm run screenshots` writes the same renders to `tests/screenshots/`
(gitignored) when you want to look at something.

The SQL gate needs a local Postgres; without one it SKIPS loudly rather
than passing quietly.

## The building model, and the House page

A STAGE is a structural state of the house and owns the geometry; a
VARIANT is a furniture arrangement belonging to one stage. A fork is a
copy, not a delta, and `stageDiff()` computes the difference so a
narrative that disagrees with the geometry gets caught. The geometry is
repo content under `data/buildings/`; Supabase holds only the rows a
`work_item` can point at.

Two things never to get wrong: **the 3D frame is right-handed** - plan
`(x, y)` maps to world `(x, h, y)`, and negating that last term renders
a perfect mirror that still looks right from the garden - and **nothing
in the model is measured**, so every figure carries the drawing it came
from and the Survey view reports the residual rather than absorbing it.

**`docs/BUILDING-MODEL.md` is the full reference** - stages, variants,
the plot, the hedge, joinery, ceilings, the walkthrough and the
equipment register. Read it before touching `model3d/`, `planner/` or
`data/buildings/`. `docs/SOURCE-FIDELITY.md` is the contract for what
the drawings actually show: **the drawings decide the layout, and the
checkers only report.**

## Front end

Zero build step. Semantic HTML, plain CSS, ES modules. No framework, no
bundler. Every visual value comes from `assets/css/tokens.css`;
mobile-first, `min-width` only, and **no layout transition between 600
and 800px** because that is where iPad portrait sits. Targets 44px with
a 24px absolute floor. `100%` not `100vw`, `dvh`/`svh` not `vh`.
**No emojis anywhere** - not in the interface, docs, code comments or
commit messages. Pages are generated by `npm run pages`: edit the
template, not the HTML.

The lint gate enforces most of this. **`docs/FRONTEND.md` has the rest
and says why.**

## Layout

    assets/css/     tokens, base, components
    assets/js/core/ config, store, format, shell, shared renderers
    assets/js/engine/ pure allocation and priority - no DOM, no fetch
    assets/js/pages/  one module per page
    supabase/schema/  NN_domain.sql, applied in order
    tests/sql/      suites run against a real Postgres
    tests/unit/     the pure engines
    tools/          generators, lint and test runners
    docs/           PLAN.md (the design record), STATE.md (what is in flight)

Keep modules around 400 lines. Past that, split into a subfolder behind
a thin re-export shim so the import path does not change.

## Carrying data in from the earlier system

The figures worth carrying live under a different Supabase account, and a
session can only be authenticated to one at a time, so they cross as a
JSON file. The protocol is `docs/CARRY-OVER.md`; the tool is
`tools/carry.mjs`. Five rules govern it:

1. **The extract is read-only.** Nothing is ever written to the source.
2. **The blob never enters this repository.** `data/carried/` is
   gitignored and the Secrets gate fails if one is tracked, including
   force-added.
3. **The load is idempotent**, keyed on
   `(household_id, source_system, source_group, source_ref)`.
4. **A reviewed line is never reopened** - the load does not touch
   `review_status`, `reviewed_at` or `superseded_note`.
5. **Nothing carried is true.** Every row lands `pending` and drives no
   total, projection or allocation.

## Supabase

Connected. Project `fggexvcodgmpkxkgpxet` (`houseandhome`), eu-west-2,
organisation GeorgeRectory. The URL and publishable key are in
`assets/js/core/config.js`; the service_role key is not in this
repository and must never be.

Sign-in is Supabase Auth. The owner signs in by USERNAME, and the login
form maps it to an email: `homeowner` -> `homeowner@houseandhome.local`.
That rule has two homes that must stay in step -
`auth_email_for_username()` in `supabase/schema/05_auth.sql` and
`emailForUsername()` in `assets/js/core/auth.js`.

To create or reset the owner account, from an MCP session or the SQL
editor - never from the application:

    select public.bootstrap_owner('homeowner', '<the password>', 'House & Home');

It is idempotent: run again to reset the password. The function is
revoked from anon and authenticated, and takes the password as a
parameter so no password is ever written into this repository.

After any schema change: run the security advisor and require zero
tables without RLS and zero `anon`-executable SECURITY DEFINER
functions. Two `authenticated`-executable ones are expected and correct -
`is_household_member()` and `current_household()` - because every RLS
policy calls the first, and both only ever read the caller's own
`auth.uid()`.

The test suite forces demo mode by setting `globalThis.__HH_CONFIG__`
before the modules load, so it never touches the live database.
