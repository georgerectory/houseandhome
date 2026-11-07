# STATE

In flight; overwritten in place. Keep it under 40 lines.

## Search mode: no active house (7 Nov 2026)

P-003 archived (R-24); P-004 candidate. Leads: L55, then L65 (the viewing
must find why it always sells well under local per-m2). Wave 3 research
reports L62 and L64(a) Sold STC and recommends dropping L56 and L66 - the
owner decides; nothing was closed.

## The overhaul (`docs/OVERHAUL-PLAN.md`)

Done and live (fingerprint matches): Stage 0; Stage 2 core
(`92_brain.sql`: sources, listing facts, places, market stats, lenders,
forecasts, link strength, `brain_context` / `brain_about` /
`brain_search`; data backfilled; wave 3 loaded; loader takes
LISTING_FACTS and MARKET_STATS); Stage 3 schema (`criteria` +
`criterion_history`; 31 criteria seeded `drafted` with `drives` links).
Map: `docs/ARCHITECTURE.md`. **Next:** the owner reviews the matrix one
criterion at a time; then Stage 4 (scoring).

## Waiting on the owner

- Nine `w3-` contradictions: the research recalled a stale DIP, stale
  savings and a higher L55 ceiling than the confirmed walk-away. Its
  affordability table was NOT loaded; the confirmed figures stand.
- Close L62 / L64 (Sold STC)? Drop L56 / L66? The 13 Nov viewing booking
  names two houses reported Sold STC.
- Matrix review: 31 drafted criteria (C-01 to C-31); two `pm-`
  contradictions (non-standard construction; a semi for House 1).
- Eight open plan decisions; three non-house `fv-` contradictions.

## Known and deliberately left

- Front-end gate: 48 `house.html` failures are the gate's, not the page's
  (compares on the first floor; picks the empty variant). Deferred.
- Over 400 lines: `ingest-research.mjs` (441), `check-frontend.mjs`,
  `pages/house.js`. Connector: set a `statement_timeout`; it prompts on
  any DROP or DELETE, so schema files avoid both words.
