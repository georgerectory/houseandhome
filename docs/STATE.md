# STATE

What is in flight. Overwritten in place, never appended to - git history
is the record of what changed, `docs/PLAN.md` is the design record, and
this file is only what is not yet finished. Keep it under 40 lines.

## In progress: Road Ahead

The Rectory PDF and kit (v5.0) become a tab and an engine. **The plan
is private**: read `source_documents` 'Road Ahead build plan' before
building. Phase 0 archived P-001 and P-002; no house is active.

**Phases 1 to 5 are done (1 Oct 2026).** The engine reproduces all 15,773
kit figures (`npm run test:checksums`); the data is live and proven
(`88_`/`89_road_ahead*.sql`); `road.html` shows it (Now, a scenario bar
whose what-ifs save nothing, the register and card, Assess, Auctions,
the roads, Compare; countdowns in London days); any Claude assesses a
listing by `docs/road-ahead/ASSESS_PROPERTY.md` and promotes one with
`ra_promote_listing`. Start with `road_ahead_context('<household>')`;
a sit-down follows `road_ahead_agenda` (`docs/road-ahead/CALIBRATION.md`).

## Next steps

1. **L29** (Rightmove 93774177) is the protocol's first live run, once the
   owner pastes its text and floor plan.
2. **Phases 6 and 7:** decisions, signals, variables and the Calibration
   section; the hand-off docs and CLAUDE.md's sit-down shape.
3. **Open with the owner**, largest first: `ra-takehome-156` (whether the
   take-home above the old figure is spent or saved), the nine `ra-` kit
   contradictions, then the household four.

## Known and deliberately left

- No rent-and-invest line in Compare: the route model (`ladder.js`) and
  the roads disagree on one and the same plan, so it waits for an invest
  step in the roads (a Model decision). No live road states fit criteria.
- The published site runs `main` until this branch is merged. Over 400
  lines: `check-frontend.mjs`, `pages/house.js`. Twelve live tables order
  columns unlike a fresh install (no view sees it).
