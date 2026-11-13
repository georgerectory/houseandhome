# STATE

In flight; overwritten in place. Keep it under 40 lines.

## Search mode: no active house (7 Nov 2026)

P-003 archived (R-24); P-004 candidate. Leads: L55, then L65. Wave 3
research reports L62 and L64(a) Sold STC and recommends dropping L56 and
L66 - the owner decides; nothing was closed. The overhaul
(`docs/OVERHAUL-PLAN.md`) is live through Stage 4 core.

## Marketplace (13 Nov 2026) - built, live, fingerprint matching

`94`-`96_marketplace*.sql`, `engine/marketplace.js`, `marketplace.html`;
protocol in `docs/MARKETPLACE.md`. Ground with `mp_context`. Live: 42
profiles (5 researched, 37 drafted), 125 checks and 73 makers (all
drafted), 7 finds regraded (none proven: 5 at C, 2 at X), 39 loaded
price observations. Six shopping lines added `drafted`
(`seed:marketplace`); 21 profiles linked to lines; no cost changed.

## Waiting on the owner

- Marketplace: confirm the style brief; confirm or correct the price
  ladders (two chests are disputed by their own evidence - see
  `mp_threshold_review`); a review of the lines listed below the good
  second-hand price. Distances on the seven finds were never recorded.
- Nine `w3-` contradictions; the confirmed figures stand.
- Close L62 / L64 (Sold STC)? Drop L56 / L66?
- C-30 (House 1 net profit) is drafted until confirmed.
- Eight open plan decisions; three `fv-` contradictions.

## Known and deliberately left

- Marketplace gaps are listed at the foot of `docs/MARKETPLACE.md`:
  makers and checks unverified, premiums missing on loaded hammer
  prices, travel bands unrouted, the search URL unverified (no link).
- Over 400 lines: `ingest-research.mjs`, `check-frontend.mjs`,
  `pages/house.js`. Connector: set a `statement_timeout`; it prompts on
  the bare words DROP and DELETE, in data too, so avoid both.
- The front-end gate needs Playwright resolvable from `node_modules`.
