# STATE

What is in flight. Overwritten in place, never appended to - git history
is the record of what changed, `docs/PLAN.md` is the design record, and
this file is only what is not yet finished. Keep it under 40 lines.

## In progress

Nothing half-done. The system is property-agnostic, and P-001 is loaded
from Plan v6.0 (23 Sep 2026).

**One live house, many drafts.** `properties` has a lifecycle (candidate,
active, committed, owned, sold, archived) and a P-number. Exactly one
property is "the house", enforced by one partial unique index, and every
default view filters to it plus the household's own rows through
`in_default_scope()`. Scope is `property_id`, not a column: set is
PROPERTY, null is USER. The commands are SQL functions in
`85_lifecycle.sql`: `new_property`, `make_active`, `set_property_status`,
`purge_property`, `finalise_property`. `docs/RENOVATION-SYSTEM.md` is the
reference.

**The lifecycle was proven on the live database.** A throwaway P-TEST was
created, made active, switched back, archived, restored and purged. P-001's
fingerprint was identical before and after, and no row names P-TEST.
The dry run found one gap: the purge left the name in P-001's change
log ("make P-TEST active"). The purge now redacts the name in surviving
rows, and `tests/sql/lifecycle.test.sql` covers it.

**The house is 1950s, not Victorian** (owner, 24 Sep 2026). The confirmed
"solid Victorian imperial brick" fact was the stockpile's brick, not the
house's. `spec.mjs` now carries `walls: cavity (drafted)`, and the takeoff
orders gypsum for cavity and lime for solid. The replaster is £3,000 on
gypsum, and the brick stockpile is back to `idea`. B2 is now only the
question of solid or cavity.

**P-001 is loaded.** 184 legacy rows are classified: 74 P-001, 110 USER,
each with a work phase and a funding stream. There are 40 drops (merges,
the gym, the permit) and 52 inserts. P-001 comes to £141k / £194k / £296k
(low / base / high). 25 rows are researched with a dated source; 10 are
NULL, forming the research queue. Every money change is in `change_log`.
The library holds 49 dated rates (6 Dorset). The template has 65 lines,
21 of them triggered.

**The savings finding.** `savings_by_regime` derives about £462/month
after the move, not the plan's £714. The plan omits £162.50 of committed
non-housing bills, and the renovation insurance uplift is new. It is
logged as a contradiction; nothing is confirmed on the owner's behalf.
The pot's £400 is now NULL, so the allocator refuses to run.

## Known and deliberately left

`tools/check-frontend.mjs` (793 lines) and `assets/js/pages/house.js`
(599) are both over the 400-line mark this repository keeps to. Neither
was split this round: check-frontend is one long cohesive list of checks
against a browser, and house.js is a page that already delegates to
`pages/house/`. Splitting either is mechanical churn with real
regression risk and little gain in readability, so it is a deliberate
debt rather than an oversight.

## Next steps

1. **Saturday 26 Sep, the open house:** check the brick bond (B2) and ask
   how long the house has been empty (B1). Then set `walls.construction`,
   re-run `node tools/takeoff.mjs --sql` and apply the output.
2. **A review session on the open contradictions**, eleven of them, led by
   `regime-b-savings`, `quoted-trust` and `family-contribution`. The
   questions are `work_notes` tagged `review`, including whether D1 still
   stands for a 1950s house.
3. **Load the plan file as document rows.** Only the system half is in the
   repo (`docs/RENOVATION-SYSTEM.md`). The full text, personal figures
   included, belongs in `source_documents` through
   `tools/ingest-document.mjs`, which reads the PDF and needs the file.
4. **Match more library rates to takeoff keys.** `priced_lines` prices
   only the skips today. The plaster rates are per m2, but the takeoff
   gives tonnes.
5. **The takeoff omits clearance waste** (joinery, kitchen, bathroom,
   garden, sheds), so it says 4 skips where the plan says 7. This is
   contradiction `skip-count`.
6. Carried from before: settle the extension build-up (cavity is now
   expected); record the brick shade; measure the house after an offer;
   the doors under 686mm; surface the link graph on the Roadmap.

## Open decisions

- **Allocation curve.** Decay 0.85, floor share 0.10.
- **Learning thresholds.** Tables exist; the derivation job does not.
- **Supabase unverified from CI.** The sandbox blocks supabase.co.
