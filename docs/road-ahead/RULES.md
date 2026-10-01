# Road Ahead rules

What binds every answer Road Ahead gives. The rules themselves are rows
(`ra_rules`), and their figures are variables (`rules.*`, `ceiling.*`,
`verdict.*`, `appraisal.*`): this file says what kinds of rule there
are and how each one binds, never the owner's numbers. Read the rows
with `road_ahead_context('<household>')`.

## Hard rules

`kind = 'hard'`, severity `block`. A listing that breaks one goes no
further: it is recorded, dropped with the rule as its reason, and the
owner is told which rule it broke. Each applies to all houses, House 1,
the forever home or the renting between. The list is the owner's: the
kinds of property never bought, how far from home each house may be,
how long renting may last.

A hard rule with a figure names its variable in `params`
(`rules.house1_max_minutes`), so the figure can change with a reason
while the rule's words stay put.

## Defaults

`kind = 'default'`, severity `warn`: how the maths is done unless the
owner says otherwise for one house. Works at DIY cost, with a trade
cost shown only for comparison; location only through profit; the
House 1 bedroom minimum. A broken default is flagged, never refused.

## House 1 is judged on the numbers

House 1 is the means to the forever home (decision G-P01R), judged on
evidence-based profit, cash safety and speed:

- location counts only through profit: the spread between the tired
  price and the finished value, the ceiling on that value, the time to
  sell, and the help nearby;
- a less popular area with a bigger spread beats a nicer one with a
  smaller;
- works are costed at DIY rates, then scaled by the help factor, near
  home or far from it.

The forever home is the other way round: it is chosen as a home, and
the roads exist to make its budget as large as they safely can.

## The sprint

Best-case but realistic timescales, with no padding; every step four
years or fewer; speed to the most money. Base and optimistic sit side
by side, and no risk is hidden.

## The verdict scale

From a listing's optimistic profit (`appraise.js`; `ra_verdict` in SQL):

- **Strong** at `verdict.strong` or more; **Worth pursuing** at
  `verdict.worth`; **Marginal** at `verdict.marginal`; **Walk away**
  below that.
- **Over budget**, whatever the profit, when the likely buy is above
  `ceiling.hard` or the cash left after buying would be below zero.
- **(stretch)** after Strong or Worth pursuing when the cash left is
  below `appraisal.stretch_below`: it can be bought, but it leaves too
  little for the works.
- The **bid limit** is the optimistic walk-away, never above
  `ceiling.hard`.
- A stored **override** - a grade, with its reason - replaces the
  computed grade for one listing; the computed grade stays visible.
- The owner's **judgement** - a walk-away or a premium, with its reason
  - sits beside the maths and never replaces it. The ceiling still
  binds (`CALIBRATION.md`).

## Stated and inferred

- **STATED**: the owner said it. It lands confirmed, dated to when it
  was said.
- **VERIFIED**: a dated external source - a sold price, a lender's
  published rate, a listing's own words.
- **ESTIMATE**: modelled or inferred - works from the floor area, a
  finished value from comparables.
- **CHECK**: needs a professional - a survey, a solicitor, a lender.

An inference is never presented as stated. A comparable is a real sale
or listing with its date and source, or it is not used; a figure with
no source is an ESTIMATE and says so.

## Changing a rule

A rule changes only by a decision (`decisions`, domain road) on the
owner's word, with its reason; the old wording stays in the decision's
history. A figure inside a rule is a variable, and changes as every
figure does: with `house.change_why`, logged in `change_log`.
