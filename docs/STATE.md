# STATE

What is in flight. Overwritten in place, never appended to - git history
is the record of what changed, `docs/PLAN.md` is the design record, and
this file is only what is not yet finished. Keep it under 40 lines.

## In progress

Nothing. All seven gates green.

**A candidate property is modelled.** 48 Ameysford Road, Ferndown, guide
price 250000: not bought, not surveyed, no offer accepted. The
placeholder building is gone. The House page draws two STAGES - as bought
and after the extension - each with an empty variant and a furnished one,
switchable from a dropdown, with a Survey view that reports every figure
the source drawings state against what the geometry computes.

Everything in the model is `researched` or `drafted`. The three sources
disagree in places and the audit says where: the design study's stated
8.0m depth against a derived 7.72m is the largest, and its own
floor-area figure is what settles it at 7.72.

**`rec`'s figures are carried.** 77 rows across 9 groups, all `pending`,
driving nothing: the pot is still 400.00 drafted and outstanding 11062.50.

## Next steps

1. **Measure the house** if an offer is accepted. Four figures carry the
   rest: the envelope depth (280mm unresolved), the hall width (0.87m
   derived, and a stair needs 0.76 of it), the storey heights, and where
   the rear wing sits across the width.
2. **Refine the data.** All 68 items, their costs and the 400 monthly
   contribution are `drafted`. The five extension projects carry no cost
   at all and are not fundable, deliberately: an extension is not costed
   off a drawing.
3. **Surface the graph on the Roadmap.** `realises` links now join each
   extension job to the structural change it produces, and
   `recompute_priorities()` already reads them for ordering, but
   `store.js` does not load `knowledge_links` so the page cannot show
   them. That is the next thing worth building.
4. **Enable leaked-password protection** - a dashboard toggle, not a
   migration.

## Open decisions

- **Allocation curve.** Decay 0.85, floor share 0.10. Revisit against a
  real list.
- **Learning thresholds.** Tables exist; the derivation job does not.
- **Browser-to-Supabase unverified from CI.** The sandbox blocks
  supabase.co. Confirm in a real browser after any auth change.
