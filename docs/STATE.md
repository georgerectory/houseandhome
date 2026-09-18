# STATE

What is in flight. Overwritten in place, never appended to - git history
is the record of what changed, `docs/PLAN.md` is the design record, and
this file is only what is not yet finished. Keep it under 40 lines.

## In progress

Nothing. All seven gates green.

**48 Ameysford Road is modelled, and the model has been rebuilt.** Guide
250000: not bought, not surveyed, no offer accepted. Two stages, each
with an empty variant and a furnished one, plus a Survey view that
reports every stated figure against what the geometry computes.

**The first pass mapped the drawings wrongly.** Every wall, door, window
and item has been re-read off the source at 7x-18x, with wall positions
measured by scanning pixels rather than estimated.
`docs/SOURCE-FIDELITY.md` is the room-by-room contract that came out of
it, and is the thing to check a change against. The rule it enforces:
**the drawings decide the layout, the checker only reports.** The gate
fails only on geometry that cannot be built, and REPORTS what the
drawings draw - a hall the flight fills, a WC you cannot get into, two
doors under 0.6m, a kitchen-diner 1.1 m2 short of stated.

**`rec`'s figures are carried.** 77 rows, 9 groups, all `pending`: the
pot is still 400.00 drafted and outstanding 11062.50.

## Next steps

1. **Measure the house** if an offer is accepted. Four figures carry the
   rest: envelope depth (280mm open), hall width (0.87m derived, and a
   flight needs 0.77), storey heights, the wing's offset (73mm open).
2. **Refine the data.** 68 items, their costs and the 400 contribution
   are `drafted`. The extension projects are deliberately not fundable.
3. **Surface the graph on the Roadmap.** `store.js` does not load
   `knowledge_links`, so the `realises` links cannot be shown.
4. **Enable leaked-password protection** - a dashboard toggle.

## Open decisions

- **Allocation curve.** Decay 0.85, floor share 0.10.
- **Learning thresholds.** Tables exist; the derivation job does not.
- **Supabase unverified from CI.** The sandbox blocks supabase.co.
