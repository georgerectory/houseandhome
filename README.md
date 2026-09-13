# House & Home

A house manager: renovation roadmap, prioritised backlog, savings
allocation, floor plan, inventory and an equipment register. Built to
run *before* a property is bought, through purchase and renovation, and
permanently afterwards.

## How it works

**There is no interactive front end, and that is the point.** Everything
is added, edited and decided through conversation with Claude, which
writes to the database directly. This site renders the result — there is
no form on it and no button that changes anything.

**The repository is public; the data is not.** Everything real lives in
Supabase behind row-level security, forced on every table and proven by
test rather than assumed.

## What it does

- **One list, one pot.** Jobs and things to buy are the same table
  competing for the same money, because separate pots drift out of
  proportion with each other.
- **Priority is computed, never typed.** Room weight x theme weight x
  benefit weight, plus a bonus for unblocking other work and pressure on
  preservation jobs that are being left. Every item stores the
  arithmetic that produced its rank, so the order explains itself.
- **Every open item gets a share of every deposit.** Share follows
  priority rank rather than cost, so the top of the list moves fastest —
  and an equal floor share means nothing at the bottom ever reaches
  zero. Shares settle to the deposit exactly, to the micro-pound.
- **Cheap items still clear early.** Not a special rule: a small target
  fills quickly even on a small share.
- **Unconfirmed figures drive nothing.** Claude drafts almost
  everything, so every number carries its provenance and only confirmed
  or observed values feed a total, a projection or an allocation. The
  database enforces it: an allocation run refuses to move real money
  against an unconfirmed contribution.

## Running it

    npm install
    npm run serve      # http://localhost:8000
    npm test           # all five gates

With no database connected the site renders `data/fixtures/demo.json`,
so every page works — and is honest that nothing in it is confirmed.

### Tests

| Gate | Proves |
|---|---|
| `npm run lint` | No `100vw`, raw `vh`, `max-width` layout query, breakpoint in the iPad 600–800 band, inline style, emoji or hard-coded hex. |
| `npm run test:unit` | The allocation and priority engines behave as stated. |
| `npm run test:sql` | The schema applies to a real Postgres; guards, triggers and cross-household RLS isolation hold. |
| `npm run test:parity` | The JS engine and the SQL engine agree to the micro-pound. |
| `npm run test:frontend` | Real Chromium, six viewports, both themes: no horizontal scroll, no overflow, no target under 24px, no console errors. |

## Documentation

- [`CLAUDE.md`](CLAUDE.md) — operating rules for a Claude session.
- [`docs/PLAN.md`](docs/PLAN.md) — the design record and why things are
  shaped the way they are.
- [`docs/STATE.md`](docs/STATE.md) — what is in flight right now.

## Status

Version one. The schema, the engines and the interface are built and
tested; Supabase is not yet connected, and no figure in the seed data
has been confirmed.
