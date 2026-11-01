# STATE

What is in flight. Overwritten in place, never appended to - git history
is the record of what changed, `docs/PLAN.md` is the design record, and
this file is only what is not yet finished. Keep it under 40 lines.

## Forest View (P-003): active, not bought

Active since 31 Oct 2026 (RA-05). The plan of record is
`docs/FOREST-VIEW-PLAN.md`; the property is `docs/properties/P-003/`.
The purchase comes first (R-10): nothing here touches the tender. Money
figures are private: Supabase only.

**Done (1 Nov):** A model, tools; B viewpoints, plot, map; C stages;
D 14 sourced rates, 25 items costed, day-one cases, 3 scope conflicts.
Photo review: E71-E76, room conditions, house facts; see `docs/properties/P-003/`.
Chat extraction ingested (E77-E81, S-87-S-92, budget lines, act-by
diary). D2: `cost_rollup` view (live, fingerprint matched) and the
`cash-over-time` engine. No template names a room type, so per-room
instantiation is a library gap, not built. E: Plan and Money show
costs and cash over time; the Handbook is the house document (purchase,
condition, drawings, costs, cash) and prints to A4 via `print.css`;
the browser gate prints it (PDF, <10 MB, >2 pages).

## Next steps

1. **F** the owner's sit-down agenda. Lead item: on the planned budget the
   cash-over-time engine funds day one, then little else for years; the
   restoration needs another funding route (DIY, further advance, uplift).

## Waiting on the owner

- Twelve open `fv-` contradictions; five act-by diary items from the chat.
- Four 31 Oct `scheduled_events` still `planned`; close or move them.
- The viewing: compass, a window reveal, ceiling heights, soil stack.

## Known and deliberately left

- The connector holds bare `update`s: use `insert ... on conflict`.
- Over 400: `check-frontend.mjs`, `pages/house.js`. Road Ahead review open.
