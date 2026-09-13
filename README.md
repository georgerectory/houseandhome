# House & Home

A single-source house manager: renovation roadmap, prioritised backlog, savings
allocation, floor plan and inventory, equipment register, and a house handbook.

**Status: planning.** Nothing is built yet. The system is being designed before a
property is bought, so that budgets, shopping lists and renovation work can be
planned in advance and then flex to whatever house is actually purchased.

## How this works

- **No interactive front end.** All input and editing happens through conversation
  with Claude. This site is a display surface only.
- **This repository is public; the data is not.** All real content lives in
  Supabase behind row-level security. Nothing sensitive is committed here.

## The plan

[`docs/PLAN.md`](docs/PLAN.md) is the living design document. It is versioned in
place, carries a changelog, and records every open question and unverified
assumption rather than papering over them.

It is built from a read-only review of two existing systems — a property-search
app and a work-roadmap tool — extracting the mechanisms worth reusing. A governing
principle of that review: mechanism is inherited, data is not. No figure carried
across from an earlier system is treated as current until it has been reviewed.
