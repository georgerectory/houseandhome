# Glossary

The words this repository uses in a particular way. If a term here means
something slightly different from what it means elsewhere, that
difference is the whole reason it is listed.

## The money and the truth of it

**confidence** — the ladder every figure sits on: `carried_over`,
`drafted`, `researched`, `confirmed`, `actual`, `quoted`. Only
`confirmed`, `actual` and `quoted` are TRUSTED and may drive a total, a
projection or an allocation. Everything Claude writes starts `drafted`.

**carried_over** — migrated from the earlier system and never verified
here. An archive, not a ledger: excluded from every total until
reviewed.

**unconfirmed_cost** — how much of a total rests on a figure nobody has
checked. Reported beside the total, never folded into it, so a number
made of guesses says so on its own face.

**allocated_balance** — money the pot has already set aside for an item.
Different from affordable: a job can be affordable today and unfunded.

**micro-pounds** — the integer unit allocation is settled in, by largest
remainder, so shares sum to the deposit exactly rather than to a penny
either side of it.

## The work

**work_item** — one row for a job OR a purchase. Deliberately one table:
money follows priority across both, so a digger and a rewire compete on
the same list.

**horizon** — `now`, `next`, `later`, `someday`. How soon, as opposed to
how important.

**phase** — where in the project it falls: `before_purchase`, `move_in`,
`strip_out`, `extension`, `fit_out`, `garden`, `first_year`,
`second_year`.

**priority** — COMPUTED, never typed: room weight x theme weight x
benefit weight, plus a bonus for unblocking, minus a penalty for being
blocked. `priority_explain` stores the working.

**readiness** — why a job cannot be started yet, derived from the link
graph: `ready`, `waiting_on_work`, `waiting_on_materials`,
`waiting_on_money`, `blocked`, `not_decided`, `closed`. A different
question from priority: what is doable, not what matters most.

**demand_state** — why a purchase is on the shopping list: `live`,
`dormant`, `standalone`, `closed`. Derived from `requires_material`, so
no digging means no digger.

**acquisition** — `new`, `owned`, `hire`. `owned` costs nothing and
`hire` is never owned, so the totals split them.

## The graph

**knowledge_links** — every relationship, as rows rather than columns.
Thirteen typed kinds; links CLOSE with `valid_to` rather than deleting.
The two that do the most work:

- **requires_material** — a job needs a purchase. Turns the backlog into
  a shopping list.
- **must_precede** — one job has to happen before another. Turns the
  backlog into a readiness order.

**proposed** — a link Claude wrote. It stays proposed until the owner
confirms it.

## The building

**stage** — a structural state of the house (as bought, after the
extension). Owns levels, walls, openings, rooms, stairs, roof, chimneys,
features.

**variant** — a furniture arrangement belonging to one stage. Owns
nothing structural. Every stage has an `empty` variant.

**as-drawn** — a variant holding exactly what a source drawing shows and
nothing else. Never edited to make something look better; an inference
goes in its own variant, such as `post-extension--lived-in`.

**gridline** — a wall is a centreline and a thickness. A room names the
lines that bound it and its rectangle is COMPUTED from their inner
faces, so a room cannot drift from its own walls.

**takeoff** — quantities derived from the geometry by `npm run takeoff`.
A number in `stock_targets.quantity_needed` is only its shadow.

**residual** — the difference between a figure stated on a drawing and
what the model computes. Reported in millimetres by the Survey view and
never absorbed: both numbers stay on the page.

**plan space** — x runs east, y runs NORTH TO SOUTH. The 3D frame maps
plan `(x, y)` to world `(x, h, y)`; negating that last term is
left-handed and renders a perfect mirror of the house.

## The stockpile

**stock_target** — a spec, a count and a reason, in that order. Four
thousand reclaimed bricks is not a purchase, it is a quantity you count
toward over two years.

**reject_if** — what disqualifies a thing on sight. Half of a usable
spec: without it a stockpile becomes a pile of things that nearly match,
and you cannot build a wall out of nearly.

**negative haul** — breakage, recorded as a haul with a negative
quantity. "Twelve turned out to be wirecut" is a fact worth keeping, and
nothing is ever deleted.

## The gates

**gate** — one of the eight checks `npm test` runs: lint, secrets, unit,
geometry, sql, parity, front end, checksums. All must pass before a
commit; the SQL and checksum gates skip loudly where their database or
private extract is missing.

**parity** — the check that the JS engine and the SQL engine agree to
the micro-pound. Some logic exists twice, because the site must render
offline in demo mode; parity is what stops the two copies drifting.

**demo mode** — the site running from `data/fixtures/demo.json` with no
database. The front-end gate forces it, so any new view needs a fixture
key or the page renders empty and the gate fails.

**security_invoker** — the setting every view must carry. Postgres views
default to definer semantics, and this repository is public and ships an
anon key, so a view without it is readable by anyone holding that key.

**Active property.** The one property that is "the house": status
active, committed or owned. `active_property_id()` returns it, and every
default view shows it plus USER rows.

**Scope.** Which of USER, BRIEF, TEMPLATE, LIBRARY or PROPERTY a row
belongs to. Not a column: a row with a `property_id` is PROPERTY, a row
without one is USER.

**P-number.** A property's stable handle (P-001). It is issued by a
counter, so a purged property leaves a gap rather than a reused number.

**Purge.** The one deliberate delete: `purge_property()` removes a
non-current property and everything it owns, redacts its name elsewhere,
and keeps library rates and kit. Irreversible.

**Funding stream.** Where a row's money comes from: pot, mortgage,
advance, build_finance or income. Only pot rows compete for deposits.

## Road Ahead

**Road Ahead** — the tab and engine for which house next, and why
(`docs/road-ahead/README.md`). The project system works one house up;
Road Ahead chooses it. They meet at `ra_promote_listing`.

**road** — one way from now to the forever home: a House 1 bought,
worked on and sold, then the forever purchase; or the Golden Egg (GE),
the forever home bought first and grown into. A road is data: steps at
months.

**step** — one move on a road: rent, buy, sell, the forever purchase.
Not a stage: a stage is a building's structural state.

**scenario** — a named set of overrides on the variables (Base,
Optimistic, Promotion, Job change...). Not a variant: a variant is a
furniture arrangement. A **what-if** is the page's own override; it
saves nothing until the owner sends it to Claude.

**forever budget** — the dearest forever home a road reaches, in cash
and in **today's money**: deflated to the model's start by the base
house-price path, so roads ending in different years compare.

**listings register** — every house looked at, with its latest
appraisal. Not the equipment register. **L-codes** (L01...) are the
listings scored by the kit's method; **G-codes** (G01...) the older
register's rows, kept as history and benchmarks.

**walk-away** — the most a listing is worth paying and still making the
target profit. The **bid limit** is the optimistic walk-away, never
above the hard cash ceiling.

**judgement** — the owner's own figure on a listing, beside the maths
and never over it: a walk-away or a premium, with a reason and its kind
(emotional, personal, strategic, information).

**signal** — the owner's words about a house, a road or the plan, kept
as said (S-); a **reaction** is to one listing (R1-), a **pattern**
runs across several (PT-). A signal is **taken in** once a road, rule,
variable or decision carries it.

**STATED, VERIFIED, ESTIMATE, CHECK** — the kit's evidence labels,
kept beside `confidence`: the owner said it (confirmed); a dated
external source (researched); modelled (drafted); needs a professional
(drafted).

**sit-down** — a session that makes the model more accurate, working
`road_ahead_agenda` in its order (`docs/road-ahead/CALIBRATION.md`).

**re-base** — moving the model's start month and cash to today's
trusted figures, on the owner's word.

**accepted run** — a road's results the owner has accepted, with their
words; today's figures are held against it, and a move of £1k or more
is named.

**kit-v5** — the frozen scenario holding the Rectory kit's complete
inputs and published outputs, so the engine can be proved again
without the kit.

**countdown** — a tracked lot's steps before its auction, T-21 to T+1,
each settling one question; counted in London days (`london_today()`).
