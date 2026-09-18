# STATE

What is in flight. Overwritten in place, never appended to - git history
is the record of what changed, `docs/PLAN.md` is the design record, and
this file is only what is not yet finished. Keep it under 40 lines.

## In progress

Nothing. All seven gates green.

**The 3D model was mirrored, and is not any more.** `model3d/geom.js`
mapped plan y to world -Z, which is a LEFT-handed frame, and a
left-handed frame renders a perfect mirror of the house. From the garden
the mirror and the viewpoint cancelled out and it looked right; from the
road the west rooms appeared on the east. The frame is right-handed now,
`tests/unit/model3d.test.mjs` pins it in arithmetic, and the 3D view
carries a compass so it cannot go unnoticed again.

**The House page has been rebuilt.** Four views - Plan, 3D, Walk, Survey
- behind one sticky bar, everything else folded away. The WALKTHROUGH is
first person and phone-first: thumb stick to walk, drag to look, pointer
lock and WASD on a keyboard, wall collision only, and the stair carries
you up. Every layer switches off from one Display panel, remembered.

**`rec`'s figures are carried.** 77 rows, all `pending`: the pot is still
400.00 drafted and outstanding 11062.50.

## Next steps

1. **Measure the house** if an offer is accepted. Envelope depth (280mm
   open), hall width (0.87m, a flight needs 0.77), the wing's offset.
2. **Furniture collision in the walkthrough.** Deliberately absent: it
   cannot trap you, but it undersells the clearances the Survey reports.
3. **Surface the graph on the Roadmap.** `store.js` does not load
   `knowledge_links`, so the `realises` links cannot be shown.
4. **Enable leaked-password protection** - a dashboard toggle.

## Open decisions

- **Allocation curve.** Decay 0.85, floor share 0.10.
- **Learning thresholds.** Tables exist; the derivation job does not.
- **Supabase unverified from CI.** The sandbox blocks supabase.co.
