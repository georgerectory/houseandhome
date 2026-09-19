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
   leaving it means two mechanisms for one job.
4. **Unconfirmed data never drives a decision.** See below.
5. **`npm test` is green before every commit.**

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

**Priority is computed, never typed.** `recompute_priorities()` scores
each item as room weight x theme weight x benefit weight, plus a bonus
for unblocking other work, plus decay pressure on preservation work,
minus a penalty when it is itself blocked. The three axes multiply so a
low score on any one holds the item down. Every row stores
`priority_explain`, so the order can always explain itself.

**Money follows priority, not cost.** One pot funds one list; jobs and
purchases are the same table. Every open costed item gets a share of
every deposit - geometric by rank, plus an equal floor share so nothing
ever reaches zero. Settled in integer micro-pounds by largest remainder
so shares sum to the deposit exactly.

**The roadmap is one set of rows read three ways.** Board (swimlanes),
Timeline (a waterfall) and List are projections over the same
`work_items`, and grouping is by the axes a house has - room, trade,
intent, benefit, kind, horizon - never anything resembling a department.
The logic lives in `assets/js/engine/roadmap-views.js` and is pure, so it
is unit-tested; the page is a thin renderer over it. A trade filter
matches the owning trade OR an associated one, so an "electrical" view
shows everything electrical touches.

The Timeline's x-axis is **affordability, not dates**: a bar sits in the
month that item becomes fundable under the current allocation curve.
Work needing no money starts immediately; work that cannot be funded
inside the horizon is hatched and labelled rather than hidden. Because it
is computed from cost estimates, it is a projection whenever those are
unconfirmed, and the page says so.

**Relationships are rows in `knowledge_links`, never a new column.**
Thirteen typed kinds. `requires_material` is what turns a job into a
shopping list; `matches_style` is what keeps fittings consistent across
rooms. Links close (`valid_to`), never delete. A link you write is
`proposed` until the owner confirms it.

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

## The building model

**Stages and variants.** A STAGE is a structural state of the house - as
bought, after the extension - and owns levels, walls, openings, rooms,
stairs, roof, chimneys and features. A VARIANT is a furniture
arrangement belonging to one stage and owns nothing structural. Every
stage has an `empty` variant, so "no furniture" is a real thing you can
inspect and fork rather than a rendering flag.

**A fork is a copy.** A new stage or variant carries `derivedFrom` and a
`changes` narrative, but its geometry is its own: there is no delta to
merge. The narrative is for people; the geometric difference is COMPUTED
by `stageDiff()`, so if somebody writes "adds a bedroom" and the geometry
does not, the diff says so.

**The geometry is repo content, the registry is not.** Walls and rooms
live in `data/buildings/<id>/` because they are drawing data with nothing
private in them, they must be unit-testable from disk with no auth, and
git is a better version history than a table. Supabase holds only
`building_stages` and `building_changes` - the rows a `work_item` can
point at through a `realises` link, so the roadmap can say which jobs
turn one model into the other. The quantities on a change are measured by
`stageDiff()`, never typed, and they are `drafted`: they price nothing.

**Walls are gridlines, rooms are derived.** The spec names a centreline
and a thickness per wall; a room names the four lines that bound it and
its rectangle is computed from their inner faces. A room therefore cannot
drift from its own walls. `tools/build-building.mjs` does that arithmetic
and writes the JSON the site reads; the geometry gate re-runs it and
fails if the committed output has drifted.

**The 3D frame is right-handed, and that is not cosmetic.** Plan space
runs x east and y NORTH TO SOUTH; the model maps plan `(x, y)` to world
`(x, h, y)` in `model3d/geom.js`. Negating that last term makes `+Z`
north, which is LEFT-handed, and a left-handed frame does not fail
loudly - it renders a perfect mirror of the house, and from the garden
side the mirror and the viewpoint cancel out so it still looks right.
That shipped once. `tests/unit/model3d.test.mjs` pins it in arithmetic,
and the 3D view carries a compass for the same reason.

**Nothing in the model is measured.** Every figure is read off a drawing
or derived from one, and each carries the document it came from in
`sources` and `statedDimensions`. The Survey view compares every stated
figure against what the geometry computes and reports the difference in
millimetres. A residual is never absorbed: where a drawing and the model
disagree, both numbers stay on the page.

## The House page

Three views over one model, and a fourth over the figures behind it:
**Plan** (SVG, drawn to scale), **3D** (orbit the house from named
viewpoints), **Walk** (first person, eye height) and **Survey**.

The walkthrough is phone-first. The left two fifths of the view is a
movement stick that appears under the thumb wherever it lands; anywhere
else looks, and DRAG RIGHT LOOKS RIGHT. There was a switch for the other
convention; it is gone, because once this way round is right a switch is
only a way to set it wrong. A keyboard gets pointer lock and WASD. Collision is against
WALLS ONLY - furniture is walked through deliberately, so a sofa can
never trap someone in a corner - and the stair is a ramp derived from
the flight the model already carries, so which floor you are on follows
your feet. The maths is pure and lives in `assets/js/engine/walk.js`; the
input and the cameras are in `assets/js/core/planner/`.

**The walkthrough shows the WHOLE building, every storey at once.** The
orbit view shows one floor at a time and the walkthrough must not: a
level filter that survives the mode switch leaves you climbing the
stairs into an empty sky. `setMode` re-applies visibility for that
reason. You can also stand outside on any of the four sides, and in any
room on any floor, by name - `planner/places.js` is pure and tested.

**A wall reaches the floor above, not its own ceiling.** The ground
floor's ceiling is 2.40 and the first floor starts at 2.70; a wall built
to the ceiling leaves a 300mm band of daylight round the whole building
where the joists are.

**Every room has a ceiling, and the two views want opposite things from
it.** The orbit view looks DOWN into a storey, so a ceiling is a lid
over everything it is there to show; the walkthrough is inside the room,
where a missing ceiling is a roofless box. Same geometry, shown in one
and not the other - `ceilingGroups` per level, switched by mode rather
than by a preference.

**An opening is joinery, not a hole.** A door gets a lined reveal and a
leaf hung at the hinge the spec records, swinging the way it records,
with stiles, rails and a handle; a window gets a cill, head, jambs and a
mullion every 550mm. Without them a doorway is a dark slab and a window
is a tinted rectangle with no scale - and the spec's `swing` field is a
record nobody can check. `model3d/doors.js` owns all of it, and
`tests/unit/doors.test.mjs` pins the hinge rule in arithmetic.

Joinery took the model past 400 boxes, so `geom.js` shares ONE MATERIAL
PER COLOUR. A material per mesh is a GPU state change per draw, and the
walk step is scaled by frame time, so the cost showed up as walking that
crawled rather than as a picture that stuttered.

**The PLOT is a property of the site, not of a stage:** an extension
changes the house, not the boundary. 17.60 x 40.00m, scaled off the
handbook's site plan, with the house anchored by its west and south
faces - the two a setting-out would work from - so the depth residual
falls in the 27m rear garden rather than the 5m front. It is a
switchable layer in all three views and OFF by default, because the plan
has to zoom out to a fifth of its scale to fit it.

**The HEDGE is on the boundary and is the only planting modelled**, at
1.83m high and 0.78m deep. It earns its place because it is not a
surface: it is six feet of solid green, so it decides what you can see
from the garden and whether the west side is a path or a passage. Its
depth is scaled off the site plan and agrees with the handbook's own two
setback statements; its HEIGHT is the owner's figure and nothing else,
recorded as `heightConfidence: 'confirmed'` rather than as an
observation. The plan therefore dimensions each setback twice - to the
line and clear of the hedge - because "2.7m to the boundary" and "1.9m
you can walk down" are different answers to different questions.

Nothing else inside the boundary is modelled: the source also colours in
grass, shrubs, hardstanding and sheds, every one traced off an aerial to
plus or minus a metre or two, and drawing those beside walls measured
off a floor plan would dress an estimate as a survey. The hedge is NOT a
collider either - the walkthrough stops against walls only, and the
viewpoint that stands you in front of the house is further out than the
front boundary, so a solid hedge would put you outside your own plot
with a wall in the way.

**The equipment register belongs to the household, not to a building.**
Its `plan_x_m` / `plan_y_m` were authored against whatever building was
modelled at the time, and they do not travel: a freezer at x 15.4 was in
a garage this house does not have, and 15.4 is seven metres past its
east wall. `place()` rejects a coordinate outside the building's
envelope - `state: 'foreign'` - so nothing is drawn for it and no grid
reference is computed. If its ROOM exists here it falls back to the room
centre, marked `coordsFrom: 'other-building'`. A reference printed from
a coordinate belonging to another house is a measurement that never
happened.

Every layer of the drawing can be switched off from one Display panel -
room names, sizes, furniture, furniture names, equipment pins, door
swings, dimensions, grid, the circulation overlay, roof, glazing, door
leaves, ceilings and the plot boundary - and the choice is remembered. A toggle NEVER repaints the page: it would
close the panel, lose the camera and, in the walkthrough, put you back at
the front door.

## Front end

Zero build step. Semantic HTML, plain CSS, ES modules. No framework, no
bundler.

- Every visual value comes from `assets/css/tokens.css`. Never a hex or
  an off-scale space in component CSS.
- Mobile-first. Breakpoints 480 / 768 / 1024 / 1280, `min-width` only.
  **No layout transition may land between 600 and 800px** - that is
  where iPad portrait sits.
- Light and dark are both first-class and share one hue ladder.
- Targets 44px, 24px absolute floor. Focus via `:focus-visible` using
  `box-shadow: var(--focus-ring)` - never as `outline`, which is invalid
  and silently removes the indicator.
- `100%` not `100vw`; `dvh`/`svh` not `vh`; safe-area insets on anything
  fixed, on all four sides, because the notch moves in landscape.
- Controls resolve to at least 16px on mobile or iOS zooms on focus.
- **No emojis anywhere.** Not in the interface, docs, code comments or
  commit messages.
- Pages are generated by `npm run pages` so the head and landmarks
  cannot drift. Edit the template, not the HTML.

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
