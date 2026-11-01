# STATE

What is in flight. Overwritten in place, never appended to - git history
is the record of what changed, `docs/PLAN.md` is the design record, and
this file is only what is not yet finished. Keep it under 40 lines.

## Forest View (P-003): active, not bought

Active since 31 Oct 2026 (RA-05). The plan of record is
`docs/FOREST-VIEW-PLAN.md`; the property is `docs/properties/P-003/`.
The purchase comes first (R-10): nothing here touches the tender. Money
figures are private: Supabase only.

**Done (1 Nov):** A - model landed, tools building-aware, rooms synced,
five `fv-` contradictions. B - true-front viewpoints, bird's-eye, plot
features, OSM map, `plan_building_key`. C - design stages S1
`ground-floor-open` (kitchen-diner 25.5 m2, boot room, WC, utility;
no island fits a 2.74m room), S2a `ensuite-within` (en-suite from bedroom
4's west end; bedroom 4 left about 6.1 m2, a study), S2b
`rear-two-storey` (+5.45 m2, DP36); stages, 14 measured changes and 20
stage quantities live (`tools/stages-sql.mjs`, `takeoff --stage`).

## Next steps

1. **D** six price references, per-room templates (PLAN D5), day one,
   cost roll-ups, cash over time.
2. **E** House, Plan, Money, the Handbook, print CSS and a PDF gate.
3. **F** the owner's sit-down agenda.

## Waiting on the owner

- The five open `fv-` contradictions (tender event vs R-10, the live DIP,
  cash now, mortgage term, garden quantities).
- Four 31 Oct `scheduled_events` still `planned`; close or move them.
- The viewing: compass, a window reveal, ceiling heights, soil stack.

## Known and deliberately left

- The connector holds bare `update`s: use `insert ... on conflict`.
- Over 400: `check-frontend.mjs`, `pages/house.js`. Road Ahead review open.
