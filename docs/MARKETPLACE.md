# Marketplace

Buying second hand, on purpose: a whole house furnished over a long
period, almost entirely with things that are genuinely good, for the
least that can be paid for them. The owner sends a screenshot or a link;
Claude says what the thing IS, whether to buy, what to offer and where
to stop, and writes it down; `marketplace.html` shows where things
stand.

Profiles, thresholds, finds, makers and grounds are the owner's and live
in Supabase only. This repository holds the schema, the engine and
invented fixtures. Nothing that names what the owner has looked at, where
he lives or which salerooms he uses belongs in a committed file.

## What it is built to prevent

| Failure | What prevents it |
|---|---|
| Something that looks right and is poor | The quality gate: no `buy` without a grade, and a grade needs evidence. |
| Overpaying | A ladder per profile, earned from dated SOLD prices; an opening offer and a ceiling on every find. |
| Losing a bargain by dithering | A verdict in one reply, a drafted message, and the rule that at or under the good price you pay it and go. |
| Buying in the wrong order | The hunt queue. |
| Buying too early | `buy_window` against the state of the house purchase. |
| Driving a long way to save a little | The trip margin, from `mp_brief.cost_per_mile` and the travel bands. |
| Things that do not go together | One brief, a `style_fit` on every find, and reject lists that are written down. |
| Waiting for ever while living without a bed | A fallback and a patience window on every day-one profile. |
| Losing track of the money | Bought and spent are derived; a purchase goes through one function. |
| Prices going stale | Every threshold has a date, a basis and a confidence, and every listing judged is a price observation. |

## The pieces

| Thing | Table or view | What it is |
|---|---|---|
| Brief | `mp_brief` | The look, the reject list, the travel bands, the rules, what a mile costs. |
| Profile | `mp_profiles` | One KIND of thing: spec, reject_if, a price ladder per unit, tier, supply, buy window, fallback, anchor. |
| Check | `mp_checks` | One question on a profile's checklist, with what a pass and a fail look like. |
| Maker | `mp_makers` | A name worth knowing - seek, acceptable or avoid - and how to tell it from a seller's claim. |
| Find | `mp_finds` | One listing looked at, from the screenshot to the collection, with its answers to the checks. |
| Price observation | `mp_price_obs` | One dated price: a hammer, a sold listing, an asking price, an estimate, a dealer, the owner's own purchase. |
| Search | `mp_searches` | A saved search: an alert on the phone, or a sweep run by hand. |
| Ground | `mp_grounds` | Somewhere worth looking, and how far away it is. |

Everything else is derived and nothing derived is stored: `mp_board`
(bought, outstanding, spent), `mp_find_ledger` (band, grade, unseen
checks, travel band, savings, whether the verdict stands), `mp_totals`,
`mp_price_evidence`, `mp_threshold_review`, `mp_hunt_queue`,
`mp_alerts_to_set`, `mp_line_benchmark`.

## The four things a find is judged on

- **The band is computed.** `steal`, `good`, `fair`, `high`, `over`: the
  unit price against the profile's ladder. Thresholds are per unit; a
  find is a lot.
- **The grade is computed** from the checks and the maker, never typed.
  `A`: every must-pass check passes and either a `seek` maker is
  evidenced or every `distinction` check passes. `B`: every must-pass
  passes. `C`: nothing has failed but a must-pass is unseen - or the
  profile has no checks, so nothing is proven. `X`: a must-pass fails,
  or the maker is one to avoid. The grade is about quality only.
- **The style fit is typed**, 1 to 5: whether it suits the house. A
  superb piece of the wrong period is a good thing that does not belong.
- **The verdict is typed, with its reason, and guarded.** `buy` needs
  grade A or B and a fit of 4 or 5. `offer` needs A, B or C and the same
  fit; at C the unseen checks are the questions to ask. An `X`, or a fit
  of 1 or 2, can only be `pass`. A trigger on `mp_finds` enforces it.

**The one exception.** `buy` at grade C when ALL of: the price is at or
under the steal price; the seller is in travel band A; and every unseen
check is a `doorstep` check. The reason must list those checks as the
walk-away list: go, look, and leave without it if one fails. An unknown
distance is not band A.

A seller's "antique", "solid wood" or "real leather" is a claim. A check
is answered `pass` or `fail` only from what was seen or what the seller
answered, with the evidence written beside it; otherwise it is `unseen`.
A maker is set only with `maker_evidence`: the stamp, the label, the
backstamp.

A check or a maker changed LATER does not re-fire the trigger, so the
ledger carries `verdict_stands`. Where it is false the page shows the
verdict as lapsed and treats it as `watch`.

## Prices are earned

Research rule for a profile: dated SOLD prices - auction results naming
the house and the date, sold listings. Three typical dated sales make
`price_confidence` `researched`; fewer leave it `drafted`. Check a
saleroom's current buyer's premium before relying on it.

`mp_price_evidence` takes typical sold prices from the last 24 months
and says what they imply: steal about half the median all-in, good the
median hammer, fair the median all-in, the ceiling the upper quartile.
Asking prices and auction estimates are counted and NEVER drive a
threshold; dealer prices feed `price_new` only. Top-of-market lots,
group lots and placeholders are recorded with `is_typical = false`.

Evidence suggests and never overwrites. `mp_threshold_review` lists a
threshold once five or more sold prices disagree with it by more than a
fifth. The owner decides; the change needs `house.change_why` and is
logged. A ladder captured over a year ago shows as stale.

Every find with a price lands as an `asking` observation and every
purchase as `own_purchase`, by trigger and by function, so nothing
depends on remembering.

### Where the evidence comes from

There is no current published index of ordinary antique furniture
prices: the long-running annual one ended in 2016. What exists instead
is better for this purpose. Some salerooms publish EVERY lot of a sale
with its hammer price and their premium, cheap lots beside dear ones,
so a year of those pages is an unbiased sample of what ordinary pieces
make - where a search engine's summary only surfaces the lots somebody
wrote about.

`tools/auction-lots.mjs` reads such pages, one request every two
seconds, and matches each lot to a profile by the profile's `lot_match`
and `lot_exclude` patterns. A lot that matches two profiles is given to
neither; a lot of several things is recorded `is_typical = false`. It
writes one idempotent statement to run through the connector. Which
saleroom to read is on the ground: `mp_grounds.url`, `reader`,
`results_section` and `catalogue_section`. There are two readers:
`rows`, for a saleroom that lists a row per lot with its price, and
`grid`, for the catalogue platform many regional salerooms share, where
only coming sales are read.

Two cautions. A match is made by pattern, not by eye, so a profile's
evidence is only as good as its patterns: read a sample before trusting
a median. And one saleroom is one market: a house that sells good
Georgian furniture will run above a general sale of house-clearance
lots, so its median is the price of a BETTER piece, not a reason on its
own to raise a ladder.

Read a site's robots rules before pointing the tool at it, and leave
alone any that bars automated agents. Several price guides and listing
sites do; a saleroom's own results pages usually do not.

## The hunt order

`mp_hunt_queue`, and `huntQueue()` in the engine, rank every profile
still outstanding by:

1. **Need** - the tier - pulled one tier earlier for `scarce` supply and
   two for `rare`, because those take months to turn up.
2. **Anchors first.** A profile with `anchor_of` waits behind the piece
   that sets its scale while that piece is still outstanding.
3. **The saving against new**, biggest first.

`mode` is `buy` or `watch`. With no house, `from_exchange` and
`after_move` profiles are WATCHED - to learn prices - not bought. The
state of the house purchase is read from the properties: `committed` is
exchanged, `owned` is moved.

**Patience.** A day-one profile carries a `fallback` and
`fallback_weeks`. `fallback_due` turns true once the weeks have passed
AND there is a house to need it in. A stand-in bought under a fallback
is a find with `is_placeholder`: it is in use, it does not fill the
profile, and its price teaches nothing.

**Alerts are rationed** to ten: `mp_alerts_to_set` says keep, set or
retire. A search written as an alert outranks a sweep; then day-one and
scarce profiles; then the queue. Saved-search alerts are known to arrive
late or not at all, which is why the sweeps exist. `last_run_on` is
written when the owner says a sweep is done, never by the page.

## Session shapes

Ground every one with `select mp_context('<household>')`.

### 1. "Is this a good deal?" - a screenshot or a link

1. `mp_context`.
2. Identify it: period, timber or material, construction, maker if
   shown - and what the photographs do NOT show.
3. Match a profile and call `mp_profile_brief('<household>', '<key>')`
   for its checks, makers and evidence. If there is no profile, research
   one first (shape 2).
4. Answer every check from the photographs: `pass`, `fail` or `unseen`,
   each with its evidence. Let the grade fall out.
5. The band from the numbers. The trip margin from the location: record
   `distance_miles`, or the trip cannot be costed and band A cannot be
   claimed.
6. The verdict by the guard, with the reason in two sentences.
7. Opening offer and ceiling by the offer rule: above fair, open at the
   good price; between good and fair, 15 to 25 per cent under with a
   reason; at or under good, pay the asking price and go today.
8. The message to send, ready to copy; for a `watch`, the questions and
   the photographs that settle them. Text only - the owner sends it. No
   deposits and no moving off the platform, ever.
9. Write the find; read the ledger row back.
10. **One committed bottom line**, consistent with the numbers above it.

Several at once: a short table, best first, then one line each. Never a
verdict without its reason.

### 2. "What should this cost?" - a profile on the fly

The research rule above. Write the profile, its checks, any makers and
the observations with their sources; say which figures are evidenced and
which are judgement.

### 3. "I bought it"

    select mp_record_purchase('<find>', <paid>, '<date>', <travel cost>, '<why>');

It refuses a find already bought, a grade X, and anything not proven A
or B at a fit of 4 or 5 - so answer the checks first, now that the thing
has been in the hand. A stand-in is recorded with `is_placeholder`.
Read back the ledger and the shopping line; say what was saved against
fair and against new; propose the next alert.

**It never closes the shopping line.** A line can be wider than the
profiles that fill it. The result reports `nothing_outstanding`; closing
the row is the owner's decision.

### 4. "What should I be looking for?"

`mp_hunt_queue`: the next five and why, the alerts to have set, and
anything whose fallback is due.

### 5. The automated sweep - no owner present

A scheduled task runs this, in the cloud environment that allows the
salerooms' hosts, with the Supabase connector. It writes only what this
section names, and it never moves a verdict past `watch`.

1. `select id from households;` then `mp_context`.
2. Write the profiles that may be BOUGHT now to a file outside the
   repository - a piece that is only being watched for its price is not
   a lot to go and view:

       select json_agg(json_build_object('key', p.key, 'lot_match', p.lot_match,
         'lot_exclude', p.lot_exclude, 'price_good', p.price_good,
         'price_fair', p.price_fair, 'price_max', p.price_max))
         from mp_hunt_queue q join mp_profiles p on p.id = q.profile_id
        where p.lot_match is not null and q.mode = 'buy';

   For RESULTS use every profile with a pattern, hunted or not.
3. For each active ground with a `catalogue_section`: run the tool in
   `catalogue` mode (`--reader` from the ground's `reader`) and run
   `candidates.sql`. The best three coming lots per profile land as
   finds on `watch`, with the most to bid so the good price is met all
   in. Each is written once, by its URL.
4. For each active ground with a `results_section`: find the latest
   `observed_on` already held for it, run the tool in `results` mode
   with `--since` the day after, and run `observations.sql`.
5. Read back `mp_threshold_review` and the new finds.
6. Finish with a short report: lots worth viewing (saleroom, sale date,
   lot, what it is, the most to bid), sales loaded, and any threshold
   the evidence now disputes. If there is nothing new, say so in one
   line.

The sweep covers what salerooms publish. It does not and cannot cover
Facebook Marketplace, which shows listings only to a signed-in person
and forbids automated collection: those still arrive as the owner's own
alerts, and as the screenshots he sends.

## Known gaps

- Most profiles are `drafted`. Every maker and every check was seeded
  from general knowledge and is `drafted` until verified against a dated
  source.
- Several loaded hammer prices were quoted in groups, without a house
  and date each, or without the house's premium. They are marked
  `drafted` and say so in their note.
- Drive times, miles and the travel bands are estimates; none was
  routed. They are measured from the present home and need re-basing
  after a move.
- The Marketplace search URL format has not been verified, so the page
  shows each query as selectable text and no link.
- One saleroom's results are loaded so far, and it sells better pieces
  than a general sale: its medians run about twice the typed ladders.
- There is no house and no completion date: `needed_by` is null
  everywhere and every large piece waits.
