# STATE

What is in flight. Overwritten in place, never appended to - git history
is the record of what changed, `docs/PLAN.md` is the design record, and
this file is only what is not yet finished. Keep it under 40 lines.

## In progress

Nothing. All seven gates green.

**Two doors were in the wrong wall.** The en-suite opened off the
landing; the study draws its west wall solid and puts the leaf in its
south wall, off the master. Bedroom 3 opened through the old rear wall
into bedroom 1; the study puts it in bedroom 3's east wall, off the
landing. Both re-measured off the drawing and both now pinned by
`tests/unit/doors.test.mjs`.

**Openings are joinery now.** Lined reveals, leaves hung at the recorded
hinge with stiles and a handle, and real glazing bars. Every room has a
ceiling. New walls read as plaster inside rather than as the near-black
the plan uses for new work.

**The plot is modelled** - 17.60 x 40.00m off the handbook's site plan,
switchable in all three views, off by default. Boundary only: no
hardstanding, no hedge, no shed.

**A doorway bug is fixed.** The walker's distance along a wall was
measured radially from the wall's start, which folded their standoff
into the answer and shifted every door - 80mm for one 0.7m along. Doors
had to be threaded. It projects now.

## Next steps

1. **Measure the house** if an offer is accepted. Envelope depth (280mm
   open - the study's floor-area figure turns out to be computed from
   its own depth, so it corroborates nothing), hall width, wing offset.
2. **Five doors are under 686mm** and three under 600: the WC at 0.59,
   the bathroom at 0.57 and bedroom 3's at 0.575, which is the whole
   width of the landing's west arm. Not buildable as drawn. Reported by
   the geometry gate, not corrected.
3. **Re-record the equipment positions** against this building.
4. **The snug's sofa is cut down.** The study's L does not fit the
   north-west corner between the chimney breast and the fitted store.
   Moving the store would let the whole thing across.
5. **Surface the graph on the Roadmap.** `store.js` does not load
   `knowledge_links`.

## Open decisions

- **Allocation curve.** Decay 0.85, floor share 0.10.
- **Learning thresholds.** Tables exist; the derivation job does not.
- **Supabase unverified from CI.** The sandbox blocks supabase.co.
