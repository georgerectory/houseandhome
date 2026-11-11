# STATE

In flight; overwritten in place. Keep it under 40 lines.

## Search mode: no active house (7 Nov 2026)

P-003 archived (R-24); P-004 candidate. Leads: L55, then L65 (the viewing
must find why it always sells well under local per-m2). Wave 3 research
reports L62 and L64(a) Sold STC and recommends dropping L56 and L66 - the
owner decides; nothing was closed.

## The overhaul (`docs/OVERHAUL-PLAN.md`)

Live, fingerprint matching (map: `docs/ARCHITECTURE.md`): Stage 0;
Stage 2 core (`92_brain.sql`: the knowledge tables and `brain_context` /
`brain_about` / `brain_search`; data backfilled; wave 3 loaded); Stage 3
(31 criteria, 30 confirmed, S-109 to S-119; R-26 new); Stage 4 core
(`93_scoring.sql`: `brain_score` - fit, money, value band, working). **Pending live (connector login failing 11 Nov):** the 93_scoring
vocabulary update, and loading the Meadow Cottage reply (dry-run passed
as L69; re-run the loader on the owner's pasted reply).

## Waiting on the owner

- Nine `w3-` contradictions: the research recalled a stale DIP, stale
  savings and a higher L55 ceiling than the confirmed walk-away. Its
  affordability table was NOT loaded; the confirmed figures stand.
- Close L62 / L64 (Sold STC)? Drop L56 / L66? The 13 Nov viewing booking
  names two houses reported Sold STC.
- C-30 (House 1 net profit) is Claude's call at the owner's request:
  drafted until confirmed.
- Eight open plan decisions; three `fv-` contradictions.

## Known and deliberately left

- Front-end gate: 48 `house.html` failures are the gate's, not the page's
  (compares on the first floor; picks the empty variant). Deferred.
- Over 400 lines: `ingest-research.mjs` (441), `check-frontend.mjs`,
  `pages/house.js`. Connector: set a `statement_timeout`; it prompts on
  any DROP or DELETE, so schema files avoid both words.
