# STATE

What is in flight; overwritten in place. Git history is what changed,
`docs/PLAN.md` the design record. Keep it under 40 lines.

## Search mode: no active house (7 Nov 2026)

P-003 archived (R-24); P-004 candidate. Leads: L55, then L65 (the viewing
must find why it always sells well under local per-m2). Wave 3 research
reports L62 and L64(a) Sold STC and recommends dropping L56 and L66 - the
owner decides; nothing was closed.

## The overhaul (`docs/OVERHAUL-PLAN.md`)

**Stage 0 done (6 Nov).** **Stage 2 core done (7 Nov), live, fingerprint
matches:** `92_brain.sql` - sources, topics, listing_facts, places,
market_stats, lending_products, forecasts, link strength, and
`brain_context` / `brain_about` / `brain_search` / `refresh_brain_links`.
Backfilled: every evidence row sourced and topic-keyed; 86 places; JSON
blobs (villages, lenders, forecasts) and per-house / per-place keys moved
to rows; 37 moved variables retired with a reason. Wave 3 research loaded
by hand (source `doc:research_wave3_2026-11-07`). The loader now takes
LISTING_FACTS and MARKET_STATS. **Next:** Stage 1 docs (ARCHITECTURE,
rename ledgers), then the rename (R-25) and Stage 3 preference matrix -
12 recalled preferences are already evidence under topic `preference`.

## Waiting on the owner

- Nine `w3-` contradictions: the research recalled a stale DIP, stale
  savings and a higher L55 ceiling than the confirmed walk-away. Its
  affordability table was NOT loaded; the confirmed figures stand.
- Close L62 / L64 (Sold STC)? Drop L56 / L66? The 13 Nov viewing booking
  names two houses reported Sold STC.
- Eight open plan decisions; three non-house `fv-` contradictions.

## Known and deliberately left

- Front-end gate: 48 `house.html` failures are the gate's, not the page's
  (compares on the first floor; picks the empty variant). Deferred.
- Over 400 lines: `ingest-research.mjs` (441), `check-frontend.mjs`,
  `pages/house.js`. Connector: set a `statement_timeout`; it prompts on
  any DROP or DELETE, so schema files avoid both words.
