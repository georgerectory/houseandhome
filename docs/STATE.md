# STATE

What is in flight. Overwritten in place, never appended to - git history
is the record of what changed, `docs/PLAN.md` is the design record, and
this file is only what is not yet finished. Keep it under 40 lines.

## In progress

Nothing. All five gates green. Live: schema applied, seed data loaded,
sign-in verified against the real auth service. Roadmap rebuilt on the
source tool's design. Shopping live. House draws a floor plan and a 3D
model of a PLACEHOLDER building, with grid references computed from
metric coordinates rather than stored.

**`rec`'s figures are NOT ported yet, and the route in is now built.**
`docs/CARRY-OVER.md` and `tools/carry.mjs` do the two-phase carry: a
read-only extract while the connector is on `seanparkerai`, then a
checksummed, idempotent load once it is back here. Proven end to end
against the live database and covered by seven SQL tests. Nothing has
been invented in the meantime.

## Next steps

1. **Refine the data.** All 68 items, their costs and the £400 monthly
   contribution are `drafted`. `run_deposit_allocation()` refuses to move
   real money until the contribution is confirmed, which is deliberate.
2. **Enable leaked-password protection** - a dashboard toggle, not a
   migration. The two `authenticated` SECURITY DEFINER findings are
   expected and documented in CLAUDE.md.
3. **Bind a property** when one is bought: create `properties`, replace
   the template rooms, re-scope estimates, and replace
   `data/buildings/placeholder.json` with the real survey. The plan, the
   grid and the 3D model all read that one file.

## Open decisions

- **Allocation curve.** Decay 0.85, floor share 0.10, tunable per
  household in `allocation_settings` rather than constant in code.
  Revisit against a real list.
- **Learning thresholds.** Tables exist; the derivation job does not.
  With no completed work there is nothing to learn from, and guessing
  thresholds now bakes in numbers nobody could defend. Calibrate from
  `gate_stats` once there are real outcomes.
- **Browser-to-Supabase is unverified from CI.** The sandbox blocks
  supabase.co, so the live sign-in flow cannot be driven there. The
  credential is verified at the database level and the guard fails
  closed. Confirm in a real browser after any auth change.
