# STATE

What is in flight. Overwritten in place, never appended to - git history
is the record of what changed, `docs/PLAN.md` is the design record, and
this file is only what is not yet finished. Keep it under 40 lines.

## In progress

Nothing. All seven gates green.

**The walkthrough now shows the whole building.** It was showing one
storey, because the orbit view's level filter survived the mode switch.
Dragging right also turned the view left. Both are fixed and both are
now checked by the front-end gate, which drives a real touch drag and
asserts the direction.

You can stand outside on any of the four sides, or in any room on either
floor, by name. External walls now run storey to storey, closing the
300mm band of daylight that showed round the building at joist level.

**Equipment positions from another building are no longer drawn.** The
register is household-level and its coordinates were authored against
whatever was modelled at the time: a freezer at x 15.4 sat seven metres
past this house's east wall. Those read `foreign` now - nothing drawn,
no reference - and the register says so.

**`rec`'s figures are carried.** 77 rows, all `pending`: the pot is still
400.00 drafted and outstanding 11062.50.

## Next steps

1. **Measure the house** if an offer is accepted. Envelope depth (280mm
   open), hall width (0.87m, a flight needs 0.77), the wing's offset.
2. **Re-record the equipment positions** against this building once one
   is bought. Until then they are room-level at best.
3. **Furniture collision in the walkthrough.** Deliberately absent: it
   cannot trap you, but it undersells the clearances the Survey reports.
4. **Surface the graph on the Roadmap.** `store.js` does not load
   `knowledge_links`, so the `realises` links cannot be shown.

## Open decisions

- **Allocation curve.** Decay 0.85, floor share 0.10.
- **Learning thresholds.** Tables exist; the derivation job does not.
- **Supabase unverified from CI.** The sandbox blocks supabase.co.
