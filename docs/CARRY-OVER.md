# Carrying figures across from the earlier system

## The problem this solves

The figures worth carrying live in a Supabase project under one account.
This system lives under another. **A session can be authenticated to one
Supabase account at a time**, so the two databases can never be open at
once and nothing can be copied directly between them.

So the data crosses as a file, and the process is split in two halves
that happen in different sessions:

    Phase one   connector on the SOURCE account    read, write a JSON blob
    ----------  switch the connector  ------------------------------------
    Phase two   connector on THIS account          validate, load, verify

Everything below exists to make that switch survivable.

## The five rules

1. **The extract is read-only.** The source system is not ours to change.
   Nothing is created, altered, inserted, updated or deleted in it — not
   a table, not a function, not a row. If a step seems to need a write,
   it is the wrong step.

2. **The blob never enters this repository.** This repo is public and
   these figures are not. `data/carried/` is gitignored, and
   `npm test` fails if a blob is ever tracked by git — including one
   force-added past the gitignore. That gate is the only thing between
   the directory and a public commit.

3. **The load is idempotent.** An extract can be re-run and a load can be
   interrupted. The natural key is
   `(household_id, source_system, source_group, source_ref)`, so a second
   load updates in place instead of leaving a second copy.

4. **A reviewed line is never reopened.** The load refreshes the figures
   but deliberately does not touch `review_status`, `reviewed_at` or
   `superseded_note`. Re-importing must not drag a line the owner has
   already dealt with back onto their list.

5. **Nothing carried is true.** Every row lands `pending` and drives no
   total, projection or allocation. `carried_finance` is an archive and a
   prompt sheet, not a ledger. The Money page shows it under its own
   heading, counted separately and excluded from everything above it.

## Phase one — extract

With the connector on the source account:

    node tools/carry.mjs plan

prints the read-only steps and the blob's shape. In short: confirm which
project you are on, read the schema rather than trusting memory of it,
read each group, and shape every row to carry

| field | why |
|---|---|
| `source_ref` | its identity in the source. This is what makes a re-load safe rather than duplicating everything. |
| `label` | what a person would call it |
| `amount` | a number, or `null` if it genuinely has none |
| `cadence` | `monthly` / `annual` / `one_off` / `null` |
| `raw` | the original row, verbatim, so nothing is lost on the way in |

Write it to `data/carried/<name>.json`, then, **before the connector
moves**:

    node tools/carry.mjs seal  data/carried/<name>.json
    node tools/carry.mjs check data/carried/<name>.json

Do both while still on the source. If the file is wrong, that is the only
cheap moment to go back and read again.

`check` refuses a file that has an unknown group, a row without a
`source_ref`, a repeated `source_ref` inside a group, an amount that is a
string rather than a number, or contents that disagree with its own
checksum. A group missing from the source is simply omitted — an absent
group is honest, an invented empty one is not.

## Phase two — load

With the connector back on this account:

    select id, name from public.households;    -- the uuid to load into
    node tools/carry.mjs load data/carried/<name>.json <household-uuid>

That prints two statements and runs nothing itself. The first is a single
`INSERT ... ON CONFLICT DO UPDATE`, fed by the JSON as a dollar-quoted
literal rather than by generated SQL literals, so no value in the payload
— a quote, a semicolon, a stray `$$` in someone's bill description — can
change the shape of the statement. The second reports counts per group to
compare against the counts `check` printed.

They match, or the load is not finished.

## What happens next

Loading is not reviewing. The lines sit in `carried_finance` as
`pending`, visible on the Money page and counted in nothing, until the
**Finance review** and **Shopping review** sessions go through them
category by category: still real? right amount? right cadence? Each
answer moves a line into a table that does count, and marks the original
`superseded` with a note saying where it went.

A line that is no longer real is `dismissed` with a reason. It is never
deleted — the point of the archive is that nothing was thrown away.
