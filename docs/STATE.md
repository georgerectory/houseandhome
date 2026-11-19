# STATE

In flight; overwritten in place. Keep it under 40 lines.

## Search mode: no active house (7 Nov 2026)

P-003 archived (R-24); P-004 candidate. Leads: L55, then L65. Wave 3
research reports L62 and L64(a) Sold STC and recommends dropping L56 and
L66 - the owner decides; nothing was closed. The overhaul
(`docs/OVERHAUL-PLAN.md`) is live through Stage 4 core.

## Marketplace - built, live, fingerprint matching

`94`-`97_marketplace*.sql`, `engine/marketplace.js`, `marketplace.html`;
protocol in `docs/MARKETPLACE.md`. Ground with `mp_context`. 45 profiles
for a 3-4 bed house (`first_qty` ranks the first few of a kind first);
27 ladders from 785 sold prices, 18 estimates. `mp_new_buys` and
`mp_budget_vs_benchmarks` set the plan all in against eight published UK
figures. The bar, the low-offer message and storage are in
`mp_brief.rules`. Four offers live. Sweeps Mon and Thu (shape 5).

## Waiting on the owner

- Marketplace: nothing that needs knowledge - prices, checks and makers
  are Claude's to research and set. The eBay keys, when he chooses.
  Sellers' replies on the mirror and the trunk (offers 55 and 70).
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
