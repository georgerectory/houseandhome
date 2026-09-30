# STATE

What is in flight. Overwritten in place, never appended to - git history
is the record of what changed, `docs/PLAN.md` is the design record, and
this file is only what is not yet finished. Keep it under 40 lines.

## In progress: Road Ahead

The Rectory PDF and kit (v5.0) become a tab and an engine. **The plan
is private**: read `source_documents` 'Road Ahead build plan' before
building. Phase 0 archived P-001 and P-002; no house is active.

**Phases 1 and 2 are done (30 Sep 2026).** The engine (`engine/road-ahead/`)
reproduces all 15,773 figures the kit published (`npm run test:checksums`)
and a committed golden master proves it in CI. The data is live
(`88_road_ahead.sql`, `89_road_ahead_logic.sql`), seeded from the private
extract by `tools/road-ahead-seed.mjs` and verified table by table against
a local dry run: 63 listings, 111 variables, 13 scenarios (the frozen
`kit-v5` among them), 72 road decisions, 89 signals. `ra_assess` matches
the kit on all 25 register listings, `road_ahead_export()` passes the
checksum gate, and the Pearsons countdown is on the Dashboard. Every Road
Ahead session starts with `road_ahead_context('<household>')`; a sit-down
follows `road_ahead_agenda` (`docs/road-ahead/CALIBRATION.md`).

## Next steps

1. **Phase 3, the Road Ahead tab:** Now, the scenario bar, the register
   and its card, the road map and ladders, Compare.
2. **Nine kit contradictions** (`ra-` keys) await the owner, largest first
   (`ra-forever-loan-cap`); then the household four, `regime-b-savings` first.
3. **Listing 93774177 becomes L29** once the owner pastes its text and
   floor plan: Rightmove is blocked from this environment.

## Known and deliberately left

- `check-frontend.mjs` and `pages/house.js` exceed 400 lines (cohesive).
  Twelve live tables order columns unlike a fresh install; no view sees
  it. P-001's open contradictions stay with it, for a restore. Still
  open: the allocation curve, learning thresholds; CI cannot reach Supabase.
