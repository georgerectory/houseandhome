# STATE

What is in flight. Overwritten in place, never appended to - git history
is the record of what changed, `docs/PLAN.md` is the design record, and
this file is only what is not yet finished. Keep it under 40 lines.

## In progress

Nothing. Live: Supabase connected, schema applied, seed data loaded,
sign-in working and verified against the live auth service, roadmap
readable as a board, a timeline or a list, all five gates green.

## Next steps

1. **Refine the data.** All 68 items, their costs and the £400 monthly
   contribution are `drafted` - none has been checked. Until the
   contribution is confirmed, `run_deposit_allocation()` refuses to move
   real money, which is deliberate. Confirming is a conversation, not a
   build task.
2. **Enable leaked-password protection** in Supabase Auth settings. The
   advisor flags it and it is a dashboard toggle, not a migration.
3. **Bind a property** when one is bought: create the `properties` row,
   replace the template rooms with real ones, re-scope the estimates.

## Open decisions

- **Allocation curve shape.** Shipped at decay 0.85 with a 0.10 floor
  share, tunable per household in `allocation_settings`. The current
  values give rank 1 about 15% of a deposit and keep the bottom of a
  120-item list above a penny per £250. Worth revisiting against a real
  list, which is why they are a row and not a constant.
- **Learning thresholds.** `learned_factors` and `learning_runs` exist
  and the discipline is written down, but the derivation job is not
  built: with no completed work there is nothing to learn from, and
  guessing the thresholds now would bake in numbers nobody could defend.
  Build it once there are real outcomes, and calibrate from `gate_stats`.
- **Browser-to-Supabase path is unverified from CI.** The sandbox blocks
  egress to supabase.co and jsdelivr, so the live sign-in flow could not
  be driven there. The credential itself is verified at the database
  level, and the guard now fails closed if the client cannot load.
  Confirm the real flow in a browser after any auth change.
