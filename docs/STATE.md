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

**Next: Stage 1** - `docs/ARCHITECTURE.md`, the glossary, the variable-key
and topic rename ledgers, the dead-code list. Then Stage 2 (data model).

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

- The front-end gate fails 48 `house.html` 3D checks here (stage
  selection redraws the same building, no furniture). It predates the
  overhaul; Playwright here is 1.63 against a pinned 1.49.1. Not masked.
- Bare `update`s can hang in the connector; set a `statement_timeout`.
- Over 400 lines: `check-frontend.mjs`, `pages/house.js` (split in Stage 6).
