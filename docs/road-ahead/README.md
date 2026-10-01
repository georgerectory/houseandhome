# Road Ahead

Which house next, and why. The Road to the Rectory plan - the kit (v5.0)
and its 61-page PDF - as one live tab, `road.html`, and a tested engine.
The owner's figures live in Supabase behind RLS; this repository holds
the formulas, the variable schema and the code, never a value.

Read `CLAUDE.md` and `docs/STATE.md` first, as in any session.

## The boundary

| Road Ahead owns | The project system owns |
|---|---|
| Variables, scenarios, the roads and their steps, the rules; the listings register, appraisals, comparables and the owner's judgements; the auctions and every tracked lot's countdown; the owner's words (signals); the road's decisions | One property being worked up: its P-number and lifecycle, rooms, backlog, money pot, shopping, building model |

The two meet once. `ra_promote_listing('<household>', '<L-code>')` makes
a listing a candidate property through `new_property()`, with the
renovation template, and links the two. It never makes a house the
house: `make_active()` runs only on the owner's word. Every tracked
lot's countdown reaches the Dashboard through `whats_next`.

The register is the household's history. Completing a purchase leaves
it alone; only purging a property takes that property's listing with it.

## Where things are

| Path | What |
|---|---|
| `assets/js/engine/road-ahead/` | The engine, pure: `money`, `params`, `simulate` (the monthly roads), `roads`, `ladder` (the older route model), `sweep`, `appraise`, `fit`, `focus`, `sensitivity`, `provenance`, and `registry.js`: every key the engine reads, with its unit and meaning and no value. |
| `.../road-ahead/charts/` | The charts, as pure SVG builders. |
| `.../road-ahead/page/` | The page's logic, pure: the URL state, resolving a scenario, the model, the shortlist, the messages for Claude, the auctions, the figures and the record. |
| `assets/js/pages/road.js`, `pages/road/` | The page: Now, the scenario bar, the Shortlist, Register and its card, Assess, Auctions, Roads, Compare, Calibration, Decisions, Variables. |
| `assets/css/road*.css` | Its styles. |
| `supabase/schema/88_road_ahead.sql` | The tables. `89_road_ahead_logic.sql`: the SQL assessor, the register, the countdowns. `89_road_ahead_record.sql`: the record and the sit-down agenda. |
| `tools/road-ahead.mjs` | The command line, below. |
| `tools/road-ahead-kit.mjs`, `road-ahead-kit.py`, `road_ahead_kit_ast.py`, `road-ahead-seed*.mjs` | The one-off kit extract, and the load that seeded Supabase from it. |
| `tools/road-ahead-golden.py`, `tests/fixtures/road-ahead-golden.json` | The golden master: the kit's own Python, run on invented inputs. |
| `tools/build-road-fixture.mjs`, `tools/road-fixture/` | The demo data. All invented. |

## What never enters this repository

The owner's figures, the kit, its extract, the PDFs and the checksum
values. `data/road-ahead/` is gitignored and holds them on a machine
that has them. The secrets gate fails a commit that tracks any of it,
and, wherever the extract is present, any file carrying one of the
owner's private markers.

## Running it

The page: `npm run pages`, then serve the folder. The browser gate runs
it in demo mode, on invented data.

The command line runs on the frozen kit, or on today's live figures:
save `select road_ahead_inputs('<household>')` to `data/road-ahead/` and
pass `--extract <file>`.

    node tools/road-ahead.mjs roads [--scenario <key>]   every road's headline
    node tools/road-ahead.mjs assess <listing.json>  one listing, with any judgement beside the maths
    node tools/road-ahead.mjs sweep                  the Golden Egg's highest sustainable bid
    node tools/road-ahead.mjs agenda [--snapshot --household <uuid>]
                                                     what to confirm first
    node tools/road-ahead.mjs snapshot --household <uuid> --note "<the owner's words>"
                                                     accept today's runs
    node tools/road-ahead.mjs verify                 the checksum gate
    node tools/road-ahead.mjs docs                   regenerate VARIABLES.md

`agenda --snapshot` and `snapshot` write SQL to `data/road-ahead/out/`
to run through the connector.

## Testing

Every gate of `npm test` covers Road Ahead:

- **unit**: the engine module by module; the golden master, exact; the page's logic, the charts and the sections;
- **SQL**: the tables, guards and RLS isolation, the assessor, the countdowns in London days, the record's views;
- **parity**: the SQL assessor, and the page's reading of a listing, against the engine;
- **front end**: `road.html` at six widths in both themes, driven - a what-if, Copy, a sort, a filter, a card, the shortlist, Assess, Auctions, the record, a money ladder, a shared link;
- **checksums**: every figure the kit published, reproduced exactly from the private extract or a `road_ahead_export` file. It skips loudly without one, as CI always does.

After a schema change, the security advisor and the fingerprint, as
`CLAUDE.md` says.

## A session

**Start** with `select road_ahead_context('<household>')`. The household
is passed explicitly, because the connector has no signed-in user.

**Work:**

- search before adding: a listing by postcode, address or link;
- a money figure changes only with `house.change_why` (and `house.change_source`) set in the same statement;
- never assert a market fact without a dated source, and label every figure STATED, VERIFIED, ESTIMATE or CHECK;
- the portals are never fetched: the owner pastes a listing's text and floor plan.

**End:** re-read every write; accept new runs only on the owner's word
(`snapshot --note`), explaining every move of £1k or more; `npm test`;
update `docs/STATE.md`; commit and push.

| The owner wants | Read |
|---|---|
| A listing assessed | `ASSESS_PROPERTY.md` |
| A sit-down, a re-base, or a finer model | `CALIBRATION.md` |
| A rule changed | `RULES.md` |
| How a figure is worked out | `FORMULAS.md`, then `VARIABLES.md` |
| How the owner likes to work | `WORKING_STYLE.md` |

## Labels and trust

Every figure carries the kit's label beside the portal's confidence
(RA-03). STATED - the owner said it - lands confirmed and dated;
VERIFIED, a dated external source, is researched; ESTIMATE (modelled)
and CHECK (needs a professional) are drafted.

Road Ahead is a model, so it computes from all of them. What it never
does is let an estimate pass for a fact: every answer says how much of
it rests on figures nobody has confirmed, and no unconfirmed figure
becomes "you can afford this".

## The documents

The Rectory PDF v5.0 is retired as a working document. Its narrative
pages - the cover, A0, L (the plan and the roads), P (property fit), Z,
A (the handover) and H - are `document_sections` of the source
document 'Road to the Rectory, v5.0'; the rest of it is data, carried
row by row into the `ra_` tables and `decisions`, and the document's
source note maps each Part to its table. The brief, the kit's changelog
and its audit are sections too; the kit itself, the v4.0 archive and
the kit's working log are recorded by checksum. The frozen scenario
`kit-v5` holds the kit's complete inputs and published outputs, so the
engine can be proved again without the kit (`road_ahead_export`).
