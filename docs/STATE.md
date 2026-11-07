# STATE

In flight; overwritten in place. Keep it under 40 lines.

## Search mode: no active house (7 Nov 2026)

P-003 archived (R-24); P-004 candidate. Leads: L55, then L65 (the viewing
must find why it always sells well under local per-m2). Wave 3 research
reports L62 and L64(a) Sold STC and recommends dropping L56 and L66 - the
owner decides; nothing was closed.

## The overhaul (`docs/OVERHAUL-PLAN.md`)

Live, fingerprint matching: Stage 0; Stage 2 core
(`92_brain.sql`: sources, listing facts, places, market stats, lenders,
forecasts, link strength, `brain_context` / `brain_about` /
`brain_search`; data backfilled; wave 3 loaded; loader takes
LISTING_FACTS and MARKET_STATS); Stage 3 (`criteria` + history; 31
criteria, 30 confirmed in review S-109 to S-119; G-D19 and G-D13
superseded by R-20 and R-26). Map: `docs/ARCHITECTURE.md`.
**Next:** Stage 4, the scoring and valuation engine.

## Waiting on the owner

- Nine `w3-` contradictions: the research recalled a stale DIP, stale
  savings and a higher L55 ceiling than the confirmed walk-away. Its
  affordability table was NOT loaded; the confirmed figures stand.
- Close L62 / L64 (Sold STC)? Drop L56 / L66? The 13 Nov viewing booking
  names two houses reported Sold STC.
- C-30 (House 1 net profit) is Claude's call at the owner's request:
  drafted until confirmed.
- Eight open plan decisions; three non-house `fv-` contradictions.

## Known and deliberately left

- Front-end gate: 48 `house.html` failures are the gate's, not the page's
  (compares on the first floor; picks the empty variant). Deferred.
- Over 400 lines: `ingest-research.mjs` (441), `check-frontend.mjs`,
  `pages/house.js`. Connector: set a `statement_timeout`; it prompts on
  any DROP or DELETE, so schema files avoid both words.
