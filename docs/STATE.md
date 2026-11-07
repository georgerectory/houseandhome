# STATE

What is in flight. Overwritten in place, never appended to - git history
is the record of what changed, `docs/PLAN.md` is the design record, and
this file is only what is not yet finished. Keep it under 40 lines.

## Search mode: no active house (6 Nov 2026)

P-003 Forest View is archived (R-24, the lender refused it as security);
L45 is closed. P-004 (the parents' house) is a candidate. Road Ahead's
lead listings are L55, with L62 and L64 to view. Research waves are
paused (S-108): everything so far is loaded by `tools/ingest-research.mjs`.

## The overhaul (`docs/OVERHAUL-PLAN.md`)

**Stage 0 done (6 Nov):** decisions R-22 to R-25 written (scoring, link
intake, Forest View, naming); DF-2 retired and G-P01R superseded by
R-22; P-003 archived; 14 Forest View and P-001 events cancelled, the
5 Nov rate event done; 7 `fv-` contradictions superseded.

**Stage 2 in flight:** `supabase/schema/92_brain.sql` (sources, listing
facts, places, market stats, lending products, forecasts, link strength,
`brain_context`/`brain_about`/`brain_search`) is committed and tested but
NOT yet applied live - the connector's approval timed out. Apply it, check
the fingerprint, then backfill the data and extend the loader. Research
wave 3 prompt is with the owner (LISTING_FACTS, MARKET_STATS blocks).

## Waiting on the owner

- Eight open decisions in the plan; answer one at a time.
- Three `fv-` contradictions left open because they are not about the
  house: mortgage term, which DIP is live, the car cost.
- Dated actions still `planned`: the broker (40-year DIP, longer term),
  the finance review, solicitor quotes, parents' house questions
  (10-11 Nov), the L55/L62/L64 viewings (13 Nov), DIP expiry (9 Jan).
- "Ask the broker about a longer term" is still filed under P-003, so it
  is hidden from default views; move it to the household if still live.

## Known and deliberately left

- The front-end gate fails 48 `house.html` checks. The page is fine: the
  gate compares stages on whichever level its sweep left on screen (first
  floor, unchanged) and picks the last variant as "furnished". Fix the
  gate (compare every level; pick the non-empty variant). Deferred.
- Bare `update`s can hang in the connector; set a `statement_timeout`.
- Over 400 lines: `check-frontend.mjs`, `pages/house.js` (split in Stage 6).
