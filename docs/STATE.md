# STATE

What is in flight. Overwritten in place, never appended to - git history
is the record of what changed, `docs/PLAN.md` is the design record, and
this file is only what is not yet finished. Keep it under 40 lines.

## Road Ahead: built, waiting on the owner

All eight phases of the build are done (1 Oct 2026). `road.html` is in
the repository, the data in Supabase, and the engine proved against
every figure the Rectory kit published. Start from CLAUDE.md's Road
Ahead section and `docs/road-ahead/README.md`. **The plan is private**:
`source_documents` 'Road Ahead build plan'. No house is active.

## Next steps

1. **Not yet in Supabase** (1 Oct): the owner's new start cash, saving
   and renting month, the cash at purchase that follows, `ra-takehome-156`
   resolved (spent), and the chased listings' guide and asking prices
   moved from the kit's text into their columns for the Shortlist. The
   connector held every write that day, even to a temporary table. The
   private SQL is `data/road-ahead/out/2026-10-01-owner-cash.sql` if this
   container still has it, else the owner's 1 Oct message has the
   figures. Run it, re-read, refresh the sensitivity snapshot; accept
   new runs only on the owner's word.
2. **L29** (Rightmove 93774177) is the assessment protocol's first live
   run, once the owner pastes its text and floor plan.
3. **Open with the owner**, largest first, in a sit-down's order (the
   page's Calibration section lists them): the nine `ra-` kit
   contradictions, then the household four.
4. **The published site runs `main`.** Merging this branch puts Road
   Ahead live; a PR waits on the owner asking for one.

## Known and deliberately left

- No rent-and-invest line in Compare: the route model (`ladder.js`) and
  the roads disagree on one and the same plan, so it waits for an invest
  step in the roads (a Model decision). No live road states fit criteria.
- Over 400 lines: `check-frontend.mjs`, `pages/house.js`. Twelve live
  tables order columns unlike a fresh install (no view sees it).
