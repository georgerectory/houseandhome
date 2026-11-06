# Routes and research ingest

## Two models, two questions

| Model | Answers | Where |
|---|---|---|
| **Roads** (`engine/road-ahead/`) | The long game: which road leads to the best forever home, over ten years, on the Rectory kit's rules. Golden-mastered against the kit. | `ra_roads`, the Road Ahead page |
| **Routes** (`engine/routes.js`) | The next step: from today's cash and pay, month by month, when does a £425k, £450k, £475k or £500k home come within reach on each route? What is held by a given month? | `routes.inputs`, the Money page |

Keep them apart. A route is near-term and monthly. A road is long-run and set by the kit. When the two disagree on a shared input (rent, the market path, the income multiple, the fix length), raise a `contradictions` row (`ra-*`) and let the owner settle it. Never quietly align one to the other.

## routes.inputs refers to figures; it never copies them

Every figure the household already holds is a reference, resolved by `resolveInputs()` against `ra_variables`:

    { "$var": "income.gross_salary_now" }
    { "$var": "cash.isa_balance_est", "plus": { "$var": "cash.saving_rate_observed", "times": 2 } }
    { "$var": "costs.planned_post_move", "path": "total", "plus": -2200 }

A reference to a missing or retired variable is shown on the page by name. It is never guessed. Change a figure in its own variable and every route moves with it.

Each route lists its terms:
- **Rent:** `rent`, `deposit`.
- **Buy:** `price`, `depositPct`, `maxLoan`, `rate`, `years`, `buyCosts`, `productFee`, `ercByYear`, `sell`, `saleFeePct`, `saleFixed`, `path`, and optionally `works {total, months}`.
- **Optional:** a `shared` override (for example, a later start with more cash).

Stamp duty follows first-time-buyer status. Renting keeps the relief; buying now spends it.

## Loading research

The routes research prompt returns fixed CSV blocks. `tools/ingest-research.mjs <reply.md> --household <uuid>` prints one transaction:

| Block | Lands in |
|---|---|
| VARIABLES | `ra_variables`. New keys are inserted. An unconfirmed key is updated, unless the reply's source date is older than the stored one. A confirmed key is NEVER overwritten: a `contradictions` row (`r-*`) is raised instead. Keys whose meaning differs from the stored key are renamed (`ALIASES`). |
| LENDERS | `ra_variables` `lending.products` |
| FORECASTS | `ra_variables` `forecast.<forecaster>_<area>_<vintage>` |
| CHART_SERIES | `ra_variables` `research.chart_series` |
| COMPARABLES | `ra_comparables`, on the listing named in the `for` column: P004 → L46, FOREST_VIEW → L45 (closed 6 Nov 2026, R-24), ROAD_GE/H1/H2/H3/H4 → L47–L51, ROAD_W1/W2/W3 → L52–L54, or an L code directly. Deduplicated on house and price. |
| LISTINGS | `ra_listings`. A new house becomes a candidate listing with the next L code, status `unreviewed` (the owner decides what to chase). A house already held, by name or postcode and first address line, only has a changed price recorded. |
| VILLAGES | `ra_variables` `area.west_villages`: one row per village. |
| EVIDENCE, RECALL_LEDGER, ROADS_RECALLED, ROUTE_RESULTS, BRIEF, QUESTIONS_FROM_RECALL, VERDICT, NOT_FOUND | `ra_evidence`, with codes continuing from the highest E-number. Topic `house: <name>` is filed under that house's listing code (`used_in`) and shows on its card on the Road page. |
| CONTRADICTIONS | `contradictions` (open) |
| SEARCH_LOG | `source_documents`: one row with the count |

Then read the SQL, run it through the connector, and read back the expected counts printed at the end. A recalled road updates `ra_roads` only on the owner's word. The reply itself is private and never enters this repository.
