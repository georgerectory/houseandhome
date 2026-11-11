# Architecture: the property brain

What the system is, at a glance. The plan that is building it is
`docs/OVERHAUL-PLAN.md`; what is in flight is `docs/STATE.md`. Every
figure lives in Supabase behind row-level security; this repository holds
the code, the schema and invented test data only.

## Three modes

| Mode | When | What the system is about |
|---|---|---|
| SEARCH | No active property (now) | Listings, places, the market, money, the preference matrix |
| FOCUS | A house is chosen and made active | That one house: building model, takeoff, works, shopping, offer, Handbook |
| OWN | After completion | The house manager, permanently |

## How an AI reaches it

Three calls, all SECURITY INVOKER (they read through the caller's own
row-level security), defined in `supabase/schema/92_brain.sql`:

| Call | Returns |
|---|---|
| `brain_context(household)` | The start of every session: mode, active house and candidates, lead listings, next dated actions, recent decisions and signals, open contradictions, the preference matrix summary, counts |
| `brain_about(household, ref)` | Everything about one thing, by the ref a person would use: `L55`, `P-004`, `R-22`, `S-107`, `E140`, `C-01`, a place key or name, a variable key. A listing comes back with its facts and their sources, comparables strongest first, evidence, appraisals, signals, contradictions and events |
| `brain_search(household, words)` | Ranked search over every entity: full text plus trigram similarity, the thing itself ranked above what is said about it |

A fourth call scores a house: `brain_score(household, listing,
'house1' | 'forever')` (`supabase/schema/93_scoring.sql`) returns fit and
money against the preference matrix, side by side and never blended,
the value band, the working for every criterion and a one-line verdict.

`brain_entities` (a view) is the index under all of them: one row per thing
the brain holds, with a type, a ref and the text search reads.
`refresh_brain_links(household)` re-derives the engine-set links.

## The entity model

| Entity | Table | Notes |
|---|---|---|
| Listing | `ra_listings` | Every house ever seen; L and G codes |
| Listing fact | `listing_facts` | One current fact per listing and attribute (EPC, heating, drainage, flood band, covenants...); a newer value supersedes, a confirmed one is never replaced |
| Property | `properties` | A house modelled in depth (P codes); linked from its listing |
| Place | `places` | Villages, towns, wards, postcode sectors and districts, counties |
| Market statistic | `market_stats` | A number about a place: metric, segment, period. Per-m2 quartiles are `median_price_m2` with segment `p25`/`p50`/`p75` |
| Comparable | `ra_comparables` | A real sale or listing used to value a listing, with beds and floor area |
| Lender product | `lending_products` | One row per product, dated |
| Forecast | `forecasts` | One row per forecaster, area, vintage and year |
| Source | `sources` | Where a fact came from: a page, an email, a research reply, the owner |
| Evidence | `ra_evidence` | A sourced claim, with a topic from `topics` and a STATED/VERIFIED/ESTIMATE/CHECK label |
| Assumption | `ra_variables` | A model input, keyed `<namespace>.<thing>`; never a computed answer, never a house or place name in the key |
| Signal | `ra_signals` | The owner's words (S codes) |
| Decision | `decisions` | The owner's choices (R, RA, G, P codes) |
| Contradiction | `contradictions` | Two sources that disagree, open until the owner rules |
| Criterion | `criteria` + `criterion_history` | The preference matrix (below) |
| Link | `knowledge_links` | Any entity to any other, with a kind, a strength 0-1 and the basis it was set on |

The house-manager tables (rooms, work items, money, stock, the building
model) are unchanged and described in `docs/DECISIONS.md` and
`docs/RENOVATION-SYSTEM.md`.

## The preference matrix

One row per criterion (`C-01`...). Each has:
- **scope:** `all`, `house1` (judged on numbers) or `forever` (judged on
  feel);
- **axis:** `fit` or `money`. R-22 keeps the two apart and never blends
  them;
- **attribute:** the listing fact or column it reads;
- **ranges:** an ideal range and an acceptable range (or ideal,
  acceptable and never value sets);
- **weight:** 0-10;
- **flexibility:** `none`, `low`, `medium` or `high`;
- **confidence:** it starts `drafted`; only the owner's word confirms it.

A value outside "acceptable" is a deal-breaker unless the flexibility lets
it be flexed: a flexed value passes, scores nothing on that criterion and
is flagged, so it only wins on exceptional numbers. A value in "never" is
absolute and is never flexed, whatever the flexibility (the hard rules:
never a flat, a terrace or a new-build, never a lodger). Where a
criterion came from is a `drives` link from the signal, decision or rule
that set it. Every change is written to
`criterion_history` by trigger, with its reason; a change without
`house.change_why` is refused, and history is never edited.

## Scoring

- **Value per criterion:** the listing row (beds, floor area, plot, drive
  time, type, condition, price), else its current listing fact. Free text
  goes through `brain_norm_value`, a short list of readable patterns
  ("oil-fired radiators" is oil central heating; "unknown..." stays
  unknown). The working shows the original text beside the mapped value.
- **Numeric:** ideal scores 1; acceptable falls from 1 at the ideal edge
  to 0.6 at the acceptable edge.
- **Category:** a whole-phrase match ("detached" is not in
  "semi-detached"). "Never" fails; ideal scores 1; acceptable 0.6.
- **Outside acceptable:** fail at flexibility none or low; flexed (0,
  flagged) at medium or high.
- **Unknown:** excluded and counted against coverage, never a fail.
- **Score:** sum(weight x s) / sum(weight) over the known criteria, 0-100,
  per axis.
- **Value band:** per m2 from the listing's comparables with a floor area
  and a strength of 0.3 or more (p25/p50/p75) x the listing's floor area;
  three or fewer fall back to the postcode district's quartiles; no floor
  area means no band, said plainly.

Every rule is proved on invented data in `tests/sql/scoring.test.sql`,
with each expected figure worked by hand in the comments.

## Links and strength

Engine-set links carry a strength and say which rule set it:
- `comparable_for` (`engine:comparable_v1`): kind (sold 1, guide 0.7,
  asking 0.6, estimate 0.3) x recency (falling to 0.3 over four years) x
  size match x bedroom match.
- `evidence_for` (`engine:evidence_v1`): label weight (VERIFIED or STATED
  1, ESTIMATE 0.5, CHECK 0.3, unlabelled 0.6), for every listing, property
  or decision the evidence names.
- `drives` (`claude:seed_matrix_v1`): owner's words to a criterion.

Links written by the owner or Claude are never touched by a refresh.

## Intake

Research replies load through `tools/ingest-research.mjs`. Its blocks map
to tables: `docs/road-ahead/ROUTES.md`. A fact about one house is a
`LISTING_FACTS` row and a number about a place is a `MARKET_STATS` row. A
confirmed figure is never overwritten; a disagreement becomes a
contradiction. A link the owner sends is read once, on request (R-23).

## Naming

- Tables are plural domain nouns. The `ra_` prefix is history: decision
  R-25 renames the core tables later, with views keeping the old names
  working for one stage.
- Codes: `L`/`G` listings, `P` properties, `S` signals,
  `R`/`RA`/`G`/`P` decisions, `E` evidence, `C` criteria.
- Assumption namespaces: `me`, `lending`, `tax`, `fees`, `costs`,
  `market`, `model`.
- No schema file contains DROP or DELETE: the connector stops to ask
  about any statement that does.
