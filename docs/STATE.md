# STATE

What is in flight. Overwritten in place, never appended to - git history
is the record of what changed, `docs/PLAN.md` is the design record, and
this file is only what is not yet finished. Keep it under 40 lines.

## In progress: Road Ahead

Road Ahead replaces the Road to the Rectory PDF and kit (v5.0) with a tab
and a decision engine: the Golden Egg auction track, the House 1 roads,
the forever home, the listings register, auctions, decisions and every
variable. It meets the project system at one promote step. **The build
plan is private** (it carries personal figures): read `source_documents`
titled 'Road Ahead build plan' through the connector before building.

**Phase 0 is done (30 Sep 2026).** The lifecycle and P-002 branches are
merged and the live schema is the repository (eight equal digests from
`tools/schema-fingerprint.sql`). Fixed on the way: seven tables whose
live policy allowed delete, two functions behind the repo, and stock
views that fresh installs built without their review columns. P-001 and
P-002 are archived (G-K09, G-K11); no house is active.

## Next steps

1. **Phase 1:** the kit extract, the engine port, the golden master and
   the checksum gate.
2. **Phase 2 opens with the 21 October fast lane:** the Pearsons lots on
   the Dashboard before T-14, Wednesday 7 October.
3. **Listing 93774177 becomes L29** once the owner pastes its text and
   floor plan: Rightmove is blocked from this environment.
4. Owed: a review of the four household contradictions, `regime-b-savings` first.

## Known and deliberately left

- `check-frontend.mjs` and `pages/house.js` exceed 400 lines; splitting
  cohesive files is churn with real risk.
- Twelve live tables order columns differently from a fresh install; no
  view sees it, so the fingerprint ignores position. P-001's seven open
  contradictions stay open with it, for a restore. Still open: the
  allocation curve, learning thresholds; CI cannot reach supabase.co.
