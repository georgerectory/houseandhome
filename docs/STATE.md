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

**`rec`'s figures are carried.** 77 rows across 9 groups, extracted
read-only (nothing written to `rec`: every touched table's `updated_at`
is unchanged), checksummed, and loaded idempotently. Every group
reconciles against the source on both count and total. All 77 are
`pending` and drive nothing: the pot is still 400.00 drafted and
outstanding still 11062.50.

Not carried, deliberately: income (NI number, payslip reference, tax
code), mortgage assumptions, the purchase goal, per-holding portfolio
composition. `rec` remains their home.

**Next: the Finance and Shopping reviews.** `rec` says the monthly
contribution goal was 2000 against an observed 12-month average of
2305.99 net; our pot is drafted at 400. That gap changes the whole
allocation and must not be closed by guessing.

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

- **Allocation curve.** Decay 0.85, floor share 0.10, tunable in
  `allocation_settings` rather than constant in code. Revisit against a
  real list.
- **Learning thresholds.** Tables exist; the derivation job does not.
  Nothing to learn from yet, and guessing bakes in numbers nobody could
  defend. Calibrate from `gate_stats` once there are real outcomes.
- **Browser-to-Supabase unverified from CI.** The sandbox blocks
  supabase.co. The credential is verified at the database level and the
  guard fails closed. Confirm in a real browser after any auth change.
