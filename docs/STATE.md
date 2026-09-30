# STATE

What is in flight. Overwritten in place, never appended to - git history
is the record of what changed, `docs/PLAN.md` is the design record, and
this file is only what is not yet finished. Keep it under 40 lines.

## In progress: Road Ahead

The Rectory PDF and kit (v5.0) become a tab and an engine. **The plan
is private**: read `source_documents` 'Road Ahead build plan' before
building. Phase 0 archived P-001 and P-002; no house is active.

**Phase 1 is done (30 Sep 2026).** The engine is `engine/road-ahead/`,
ported from the kit's Python and proven twice: `npm run test:checksums`
reproduces all 15,732 figures the kit published on the owner's inputs
(the kit's 43 tests included), and a committed golden master proves it
in CI on invented ones. Private inputs: `data/road-ahead/` (gitignored),
built by `tools/road-ahead-kit.mjs`. The owner's judgement sits beside the maths (`appraise().judgement`,
with its reason and its cost) and a calibration agenda ranks what to
confirm first (`node tools/road-ahead.mjs agenda`);
`docs/road-ahead/CALIBRATION.md` is how the model stays accurate and
grows. No owner figure is typed anywhere in the repository: the kit's
inline ones are located structurally, and the privacy guard reads its
markers from the private extract.

## Next steps

1. **Phase 2, the 21 October fast lane first:** the Pearsons lots on the
   Dashboard before T-14, Wednesday 7 October; then the tables, the seed
   from `data/road-ahead/kit-extract.json`, and `ra_assess` in SQL.
2. **Listing 93774177 becomes L29** once the owner pastes its text and
   floor plan: Rightmove is blocked from this environment.
3. Owed: a review of the four household contradictions, `regime-b-savings` first.

## Known and deliberately left

- `check-frontend.mjs` and `pages/house.js` exceed 400 lines (cohesive).
  Twelve live tables order columns unlike a fresh install; no view sees
  it. P-001's open contradictions stay with it, for a restore. Still
  open: the allocation curve, learning thresholds; CI cannot reach Supabase.
