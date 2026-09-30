# STATE

What is in flight. Overwritten in place, never appended to - git history
is the record of what changed, `docs/PLAN.md` is the design record, and
this file is only what is not yet finished. Keep it under 40 lines.

## In progress: Road Ahead

The Rectory PDF and kit (v5.0) become a tab and an engine. **The plan
is private**: read `source_documents` 'Road Ahead build plan' before
building. Phase 0 archived P-001 and P-002; no house is active.

**Phases 1 to 3 are done (30 Sep 2026).** The engine reproduces all 15,773
kit figures (`npm run test:checksums`); the data is live and proven
(`88_`/`89_road_ahead*.sql`); and `road.html` shows it: Now, a sticky
scenario bar whose what-ifs recompute every road and listing in the
browser and save nothing (Copy for Claude does), the register and its
card (the maths beside the owner's judgement, Focus road), the roads and
Compare, driven by `tools/check-frontend-road.mjs`. Sessions start with
`road_ahead_context('<household>')`; a sit-down follows `road_ahead_agenda`
(`docs/road-ahead/CALIBRATION.md`).

## Next steps

1. **Phase 4, the assessor:** `docs/road-ahead/ASSESS_PROPERTY.md`,
   `ra_promote_listing`, the Assess section; first run L29 (Rightmove
   93774177), once the owner pastes its text and floor plan.
2. **Phases 5 to 7:** auctions; decisions, signals, variables and the
   Calibration section; the hand-off docs and CLAUDE.md's sit-down shape.
3. **Nine kit contradictions** (`ra-` keys) await the owner, largest first.

## Known and deliberately left

- No rent-and-invest line in Compare: the route model (`ladder.js`) and
  the roads disagree on one and the same plan, so it waits for an invest
  step in the roads (a Model decision). No live road states fit criteria.
- The published site runs `main` until this branch is merged. Over 400
  lines: `check-frontend.mjs`, `pages/house.js`. Twelve live tables order
  columns unlike a fresh install (no view sees it).
