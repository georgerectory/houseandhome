# STATE

What is in flight. Overwritten in place, never appended to - git history
is the record of what changed, `docs/PLAN.md` is the design record, and
this file is only what is not yet finished. Keep it under 40 lines.

## In progress

Nothing. All seven gates green.

**The handbook is rows now, not a PDF.** All 54 pages of the plan and
project handbook are in `document_sections`, `document_figures` and
`document_claims`: 53 sections and 69,837 characters of body text, which
`plan.html` renders in page order as the document itself. Thirteen of
the 30 figures carry `replaced_by_view: 'house.html'` rather than a
bitmap, because this system COMPUTES those drawings and a stored copy
would go stale the moment a wall moved. The file itself is not stored;
a sha256 says whether the copy somebody is holding is the one ingested.

**Nine claims point at the job they price**, which is the only reason
the claims table exists, and the joins immediately disagree with us:
the handbook patches the roof for £800 where making it watertight under
a full restoration is £7,500, and replasters the front rooms and hall
for £2,500 where replastering throughout is £11,000. Both figures stay
on the page. The handbook is a different scope, not a cheaper quote.

**Furniture has parts now, not one box each.** A bed, a sofa, a WC and
a fridge were the same gesture at different sizes, so a room read as a
car park. `model3d/furniture-parts.js` gives each of 23 kinds its real
parts - a sofa is a plinth, two arms, a seat and a back; a WC is a pan,
a lid and a cistern - in a local frame where v runs front to back, so a
shape is written once and placed correctly in all four orientations. It
is pure, so it is tested from disk with no browser, and every part is
asserted to stay inside the rectangle the floor plan draws: that is the
1:1 guarantee, and an arm sticking out past its own rect would make the
plan's clearance a different number from the one you can walk through.

**The reported defects are reported, not silently corrected.** The
drawings decide the layout (docs/SOURCE-FIDELITY.md), so the survey now
names what is wrong instead of moving it: the downstairs WC pan is
0.39 x 0.52 where a close-coupled pan and cistern is 0.37 x 0.68 - and
the other two WCs in the same model are 0.40 x 0.70, so that one is
internally inconsistent - and seven internal doors give under 0.68m
clear against the 0.75m Part M looks for. The narrowest, the downstairs
WC door, gives 0.54m.

**The lounge is furnished in its own variant.** The study draws nothing
there but the stove, so `post-extension--lived-in` holds the seating and
`--as-drawn` stays exactly as drawn. Everything in it is placed off the
room's own geometry - clear of the hall door at the south end of the
west wall and the kitchen-diner door at x 6.12-6.92.

**The specification is a page now, organised like a shop.** `palettes`
grew from paint-shaped into the whole specification - timber, lighting,
metalwork, tile, stone, textile, plaster - and every row carries `spec`
and `reject_if`, borrowed from `stock_targets` for the same reason: a
spec you cannot hold a product up against is not a spec, and half the
job is naming what disqualifies a thing. 17 rows, all shoppable, all
drafted. `theme.html` leads with Buy and Reject because it is read on a
phone in an aisle; the reasoning sits underneath.

The rule that matters most there is the paint one. The standing scope
strips every internal face to the brick and puts lime back, and a solid
wall with no cavity and no damp-proof course manages water by letting it
evaporate inwards. A vinyl emulsion over that undoes the entire
replastering job, silently, over years.

**The money parser read a range as its first number.** `£72-115k` came
out as £72.00, because the multiplier sits after the SECOND number and
was dropped - three orders of magnitude out, in the one table whose job
is to be trustworthy enough to price a job. `tools/ingest-document.mjs`
now applies the suffix to both ends and emits each end as its own claim.

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
Brick is now `collecting`: the owner has confirmed solid red Victorian
IMPERIAL, so a listing can be held up against it.

**The brick rate was wrong and is now derived.** 60 bricks per square
metre is the figure every bricklayer quotes and it belongs to a METRIC
brick; an imperial is 229 x 67 rather than 215 x 65, so the same wall
takes 54.6 of them. `bricksPerM2Skin()` computes it from the brick's own
dimensions, and the takeoff dropped from 6,882 to 6,268 solid, 3,441 to
3,134 cavity.

## Next steps

1. **Settle the extension wall build-up.** The original is solid 9in
   and performs at about 2.1 W/m2K; a new extension has to meet Part L
   at around 0.18-0.26, so it CANNOT simply match. Cavity with a
   reclaimed outer skin needs 3,134 bricks, solid 9in with internal
   insulation needs 6,268. Collecting up to 3,134 is safe either way;
   past it is collecting on a guess.
2. **Record the brick SHADE.** The format is confirmed, the colour is
   not. Victorian reds run from soft orange to deep plum and a pile of
   two shades cannot be laid on one elevation. Match the first haul
   against a brick off the house and write the shade into the spec.
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

- **Allocation curve.** Decay 0.85, floor share 0.10.
- **Learning thresholds.** Tables exist; the derivation job does not.
- **Supabase unverified from CI.** The sandbox blocks supabase.co.
