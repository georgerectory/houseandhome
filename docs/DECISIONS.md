# How the system decides things

Extracted from CLAUDE.md so the file every session reads in full stays
short. This is the reference: priority, money, the roadmap's three
projections, the derived shopping list, quantities, stockpiles and the
link graph. Read it when touching any of those.

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
The logic lives in `assets/js/engine/roadmap-*.js` - `roadmap-model.js`
is the shared spine (placement, filters, grouping) and `-timeline`,
`-cascade` and `-summary` are the three projections over it, with
`-detail` and `-export` beside them. All pure, so all unit-tested; the
page is a thin renderer over them. A trade filter
matches the owning trade OR an associated one, so an "electrical" view
shows everything electrical touches.

The Timeline's x-axis is **affordability, not dates**: a bar sits in the
month that item becomes fundable under the current allocation curve.
Work needing no money starts immediately; work that cannot be funded
inside the horizon is hatched and labelled rather than hidden. Because it
is computed from cost estimates, it is a projection whenever those are
unconfirmed, and the page says so.

**A thing is on the shopping list because a live job needs it.** Not
because somebody thought of it. A renovation list written in one sitting
contains a mini digger on the day the keys are collected, and the total
at the bottom is therefore wrong by thousands in the direction that
makes the whole plan look unaffordable. So the list is DERIVED: a
`requires_material` link runs from the job to the purchase, and
`shopping_list.demand_state` computes what that means right now -

| State | Means |
|---|---|
| `live` | A job that requires it is ready, in progress, or planned in the `now`/`next` horizon. It costs money this round. |
| `dormant` | It is required, but only by work nobody has started. Cost excluded from the total and reported separately, never hidden. |
| `standalone` | Nothing requires it; it is its own reason. A bed. A fridge. |
| `closed` | Done or dropped. |

Move the foundations job from `idea` to `planned`/`next` and the digger,
the muck away, the breaker and the compactor all appear together. Drop
it and they all go. **That is the whole mechanism for "the list adapts
when the plans change", and it only works because nothing is stored.**
So when a plan moves, move the JOB and let the list follow; never
hand-edit a total. `shopping_totals` splits buy from hire (hire is never
owned), reports `dormant_cost` so parked money is visible, and reports
`unconfirmed_cost` so a total made of drafted estimates says so on its
own face.

**Quantities come from `npm run takeoff`, never from a cell.** The
geometry is the authority; a number in `stock_targets.quantity_needed`
is only its shadow, and a shadow goes stale the moment a wall moves. So
whenever the extension, the garden or the room plan changes: re-run the
takeoff, diff it against the stored targets, and reconcile the
difference DELIBERATELY - with the basis rewritten to match. Every
takeoff line carries its own working in words and is `drafted` however
precise the geometry underneath it, because the rates are trade
convention and nobody measured them at this house.

**A stockpile is a spec, a count and a reason - in that order.**
`stock_targets` exists because four thousand reclaimed bricks is not a
purchase: it is a quantity you count toward over two years, acquired
many times at different prices, and the running total is the sum of
`stock_acquisitions` and is NEVER stored on the target. Four rules:

- **A spec you cannot hold a listing up against is not a spec.**
  "Reclaimed brick" fails. "Imperial 9 x 4 3/8 x 2 5/8in, soft red,
  sand-struck, circa 1880" passes. `reject_if` does the other half of
  the job. Without both, a stockpile becomes a pile of things that
  nearly match, and you cannot build a wall out of nearly.
- **Breakage is a negative haul, not a deletion.** "Twelve turned out to
  be wirecut" is a fact worth keeping.
- **Collecting against an unidentified spec is the expensive mistake.**
  A target whose material has not been seen in the flesh stays `idea`,
  not `collecting`, however confident the quantity is.
- **Some things get worse by being bought early.** A sanitaryware set
  bought before the bathroom is designed is a set that may not fit.
  Where that is true, say so in `notes` and leave the status at `idea`.

**Relationships are rows in `knowledge_links`, never a new column.**
Thirteen typed kinds. `requires_material` is what turns a job into a
shopping list; `matches_style` is what keeps fittings consistent across
rooms. Links close (`valid_to`), never delete. A link you write is
`proposed` until the owner confirms it.
