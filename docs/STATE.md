# STATE

What is in flight. Overwritten in place, never appended to - git history
is the record of what changed, `docs/PLAN.md` is the design record, and
this file is only what is not yet finished. Keep it under 40 lines.

## Forest View (P-003): active, not bought

Active since 31 Oct 2026 (RA-05). The plan of record is
`docs/FOREST-VIEW-PLAN.md`; the property is `docs/properties/P-003/`.
The purchase comes first (R-10): nothing here touches the tender. Money
figures are private: Supabase only.

**Done (phase A, 1 Nov):** as-bought model landed (patch f0ac4b6, with
its private figures stripped before it reached git); the browser gate
made building-aware; `takeoff.mjs` measures any building and stage
(`--stage`), garden opt-in; 13 rooms and 2 levels synced from the
geometry (`tools/rooms-sql.mjs`); five `fv-` contradictions raised.

## Next steps

1. **B** plot, overhead line, parking, bird's-eye viewpoints, OSM map.
2. **C** stages S1, S2a, S2b; `building_stages`, `building_changes`.
3. **D** six price references, per-room templates (PLAN D5), day one,
   cost roll-ups, cash over time.
4. **E** House, Plan, Money, the Handbook, print CSS and a PDF gate.
5. **F** the owner's sit-down agenda.

## Waiting on the owner

- The five open `fv-` contradictions (tender event vs R-10, the live DIP,
  cash now, mortgage term, garden quantities).
- Four 31 Oct `scheduled_events` still `planned`; close or move them.
- The viewing: compass, a window reveal, ceiling heights, soil stack.

## Known and deliberately left

- The connector holds bare `update`s: use `insert ... on conflict`.
- Over 400 lines: `check-frontend.mjs`, `pages/house.js`. Road Ahead's
  deferred dashboard review and kit contradictions stand.
