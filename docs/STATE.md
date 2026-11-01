# STATE

What is in flight. Overwritten in place, never appended to - git history
is the record of what changed, `docs/PLAN.md` is the design record, and
this file is only what is not yet finished. Keep it under 40 lines.

## Forest View (P-003): active, not bought

Active since 31 Oct 2026 (RA-05). The plan of record is
`docs/FOREST-VIEW-PLAN.md`; the property is `docs/properties/P-003/`.
The purchase comes first (R-10): nothing here touches the tender. Money
figures are private: Supabase only.

**Done (1 Nov):** A - model landed (private figures stripped before git),
tools building-aware, 13 rooms synced, five `fv-` contradictions raised.
B - viewpoints follow `orientation.frontFaces` (Front was showing the
garden) plus four bird's-eye corners and top-down; drafted plot zones,
parking and the overhead line (3D on poles); an on-demand OSM map
(Leaflet vendored); `plan_building_key` so pins measured at Ameysford
are never drawn as positions here (live, 14 backfilled, fingerprint ok).

## Next steps

1. **C** stages S1, S2a, S2b; `building_stages`, `building_changes`.
2. **D** six price references, per-room templates (PLAN D5), day one,
   cost roll-ups, cash over time.
3. **E** House, Plan, Money, the Handbook, print CSS and a PDF gate.
4. **F** the owner's sit-down agenda.

## Waiting on the owner

- The five open `fv-` contradictions (tender event vs R-10, the live DIP,
  cash now, mortgage term, garden quantities).
- Four 31 Oct `scheduled_events` still `planned`; close or move them.
- The viewing: compass, a window reveal, ceiling heights, soil stack.

## Known and deliberately left

- The connector holds bare `update`s: use `insert ... on conflict`.
- Over 400: `check-frontend.mjs`, `pages/house.js`. Road Ahead review open.
