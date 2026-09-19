# STATE

What is in flight. Overwritten in place, never appended to - git history
is the record of what changed, `docs/PLAN.md` is the design record, and
this file is only what is not yet finished. Keep it under 40 lines.

## In progress

Nothing. All seven gates green.

**The standing scope is a full restoration, stripped back to brick.**
Recorded as a decision row. It makes the internal wall face a quantity -
241 m2 of wall, 77 m2 of ceiling - and everything else follows: four
skips out, 10.6 t of lime plaster back, 38 points, 120 m of pipe.
`npm run takeoff` derives all of it from the geometry.

**The shopping list is derived, not typed.** A purchase is live because
a live job requires it, through `requires_material`. Move the
foundations job out of `idea` and the digger, the muck away, the breaker
and the compactor appear together; drop it and they go. 60 new rows:
PPE in both fits, hazard surveys, strip-out tools, containment, welfare,
waste, moving gear, plant hire, derived materials, windows, UFH.

**The stockpile is nine targets**, each with a spec tight enough to
match a listing against and a `reject_if` that does the other half.
Brick is deliberately `idea`, not `collecting`: the exact brick has not
been identified and the wall may yet be a cavity, which halves 6,882 to
3,441.

## Next steps

1. **Identify the brick.** Everything about the largest stockpile target
   waits on one brick in the hand. Until then the spec is a placeholder
   and collecting against it is how a pile of nearly-right brick
   happens.
2. **Nine existing rows conflict with the full strip.** Painting,
   carpeting, grouting and draught-proofing ahead of a strip-out. Each
   carries a `risk` note tagged `review:scope-conflict`. They are the
   first agenda for a review session; none has been dropped.
3. **Measure the house** if an offer is accepted. Envelope depth (280mm
   open), hall width, wing offset. Also the exposed garden corner and
   the hallway floor, both of which are stockpile quantities currently
   assumed rather than measured.
4. **Five doors are under 686mm** and three under 600. Not buildable as
   drawn. Reported by the geometry gate, not corrected.
5. **Re-record the equipment positions** against this building.
6. **The chimneys are on the backlog and nothing about them is known.**
   An inspection item is `now`; the repair after it is a placeholder
   until somebody has been up a ladder.
7. **Whether the external brickwork is rendered at all is open.** Lime
   is specified everywhere; covering sound facing brick is a separate
   question and repointing would get the breathability without it.
8. **Surface the graph on the Roadmap.** `store.js` does not load
   `knowledge_links`, so the demand links that drive the shopping list
   are invisible on the site.

## Open decisions

- **Solid 9in or cavity** for the extension. Halves or doubles the brick
  target.
- **Allocation curve.** Decay 0.85, floor share 0.10.
- **Learning thresholds.** Tables exist; the derivation job does not.
- **Supabase unverified from CI.** The sandbox blocks supabase.co.
