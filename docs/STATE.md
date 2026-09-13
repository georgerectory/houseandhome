# STATE

What is in flight. Overwritten in place, never appended to - git history
is the record of what changed, `docs/PLAN.md` is the design record, and
this file is only what is not yet finished. Keep it under 40 lines.

## In progress

Nothing. Version one is complete and all five test gates are green.

## Next steps

1. **Connect Supabase.** The schema is written and proven against a real
   Postgres but has never been applied to a hosted project. Needs the
   georgerectory project ref, and note the MCP connector is currently
   authenticated to a different account, so this is a credential change
   rather than a project switch.
2. **Apply the schema**, run the advisors, fill in
   `assets/js/core/config.js`. Every page then reads live rows with no
   other change.
3. **Refine the data.** Everything in `data/fixtures/demo.json` is
   drafted: the seed list, its costs and its priorities are all
   unverified. Confirming them is a conversation, not a build task, and
   the system is built to be useful and honest in the meantime.

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
