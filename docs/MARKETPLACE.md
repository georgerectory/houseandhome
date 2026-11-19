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

## Who does what

The owner is furnishing a house. He is not an antiques dealer and was
never meant to become one. So the line is drawn by KNOWLEDGE:

| The owner supplies | Claude supplies, and never asks him for |
|---|---|
| His taste: the style brief, once. | What a thing is, and whether it is any good. |
| His eyes: a screenshot or a link. | What it is worth: every price ladder, from sold prices. |
| His decision to spend, and the collecting. | The style fit score against the brief. |
| What the seller said. | The checks, the makers, the tells, and verifying them. |
| | What to offer, where to stop, and the words to send. |

A question to the owner is allowed when only he can answer it - does he
like it, has he room for it, what did the seller say. A question that
turns on knowing the market, the materials or the trade is Claude's to
research and answer, and to keep researching. "Confirm this price" is
never one of them.

**What the system can promise, and what it cannot.** It cannot promise
that good things will turn up; nobody can. It can promise a rule that
is kept on every purchase: while nothing is urgent, **nothing is bought
above the good price** - and the good price is the lower quartile of
what the same thing actually sold for. A purchase at or under it is
cheaper than three in four comparable sales. That is what "a steal"
means here, and it is measured, not felt. The trade is speed: a
ceiling that low fills the house more slowly.

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

**The bar is higher than the guard** (the owner's instruction, 15 Nov
2026; rule `the_bar` in `mp_brief`). The guard says what a verdict MAY
be; the bar says what is worth having. A thing is taken only when it is
the right piece - fit 4 or 5, solid materials, sound - AND at or under
the good price. Everything else is a `pass`, and a pass needs no
apology: ten sent and none taken is a normal day. Cheap, free, nearby
and nearly right are not reasons; a nearly-right piece takes the place,
the money and the storage of the right one. Reproduction, "vintage
style", 1930s oak and decorative brass are passes on sight. A rejection
on sight is said in one line and NOT logged as a find; only a piece
worth an offer, or worth watching, gets a row.

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
the house and the date, sold listings. Eight typical dated sales make
`price_confidence` `researched`; fewer leave it `drafted`. Check a
saleroom's current buyer's premium before relying on it.

`mp_price_evidence` takes typical sold prices from the last 24 months,
buyer's premium included, and says what they imply: **good** is the
lower quartile - what a patient buyer pays, not what the average bidder
does; **fair** is the median; the **ceiling** is the upper quartile,
held to one and a half times the median; a **steal** is half of good.
Asking prices and auction estimates are counted and NEVER drive a
threshold; dealer prices feed `price_new` only. Top-of-market lots,
group lots and placeholders are recorded with `is_typical = false`.

**Pricing is Claude's job, not the owner's** (his instruction, 15 Nov
2026). He does not know these markets and should never be asked to
confirm a price. A ladder with eight or more typical sold prices is SET
from them - `house.change_why` first, so the change is logged with its
reason - and marked `researched`. A ladder with fewer stays `drafted`
and is the next thing to research. `mp_threshold_review` is Claude's
own worklist: where it shows a row, set the ladder or find out why the
evidence is wrong; do not put it to him. A ladder captured over a year
ago shows as stale.

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
`grid`, for the catalogue platform many regional salerooms share: its
grid shows the hammer once a sale is over, so `results --reader grid`
reads sold prices from the results page, opening only the lot pages
whose first words name something hunted.

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

**First few, then the rest.** The list is sized for a three to four
bedroom house, so several kinds are wanted in numbers: three beds, three
wardrobes, ten pairs of curtains. `first_qty` says how many are needed
at the kind's own tier; once that many are bought, what is left ranks
no earlier than `first_year`. The second spare-room wardrobe is not
worth more than the only sofa. Large and small kinds share the one
queue, so they are weighed against each other and not within a size.

**Storage is part of the price** (rule `storage`). The whole list is
about 20 cubic metres. Small and medium things live at home. A large
piece before exchange is taken only at or under the steal price AND
with somewhere free and dry to stand. Paid storage starts only when the
pieces waiting have saved more than the rent they will cost: about 65 a
month for 25 sq ft (five or six large pieces), 110 for 50 sq ft, 190
for 100 sq ft, which holds the lot (trade survey averages, 2026;
ESTIMATE, no local quote taken). New-bought things - mattresses,
bedding, white goods - are not on this list at all.

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

## The budget against the consensus

A list that is cheap piece by piece can still be too long, so the whole
plan is held up against what other households spend
(`97_marketplace_budget.sql`; `engine/marketplace/budget.js` is its
copy, held equal by the parity gate).

- **`purpose`** on every profile: `utility` (sleeping, sitting, eating,
  storing, light, the kitchen, the hearth) or `aesthetic` (rugs,
  mirrors, pictures, clocks, ornament, the garden). Unset counts as
  utility. Utility is bought first; the aesthetic share is a number to
  watch.
- **`mp_new_buys`**: what is bought NEW and never hunted - mattresses,
  white goods, bedding and towels, kitchen basics, cleaning kit,
  sundries - each with a low, mid and high price per unit and why it is
  bought new. Leaving these out is how a furniture budget looks cheaper
  than the house it furnishes. A bought one counts at what was paid; a
  dropped one not at all. Prices are money: `house.change_why` first.
- **`mp_benchmarks`**: published figures for what households spend, each
  with its `sources` row, what it `covers` (furniture alone,
  furnishing, or furnishing and decorating), which home and on what
  basis.
- **`mp_budget_position`** is the plan in one row: second hand at
  steal, good, typical and new; utility against aesthetic; the new buys
  at low, mid and high; all in at each price point (steal with low,
  good with mid, typical with high); day one all in; and the shares of
  the good total that are aesthetic and unconfirmed.
- **`mp_budget_vs_benchmarks`** sets each active benchmark beside our
  figure for the same ground - the second-hand plan alone against a
  furniture-only figure, the plan all in against the rest - with
  `position` (below, within or above its range) and `ratio`.

Reading it. A whole-house figure for a house our size is the fair
comparison; a first-year or one-bed figure is smaller by construction,
and above it is expected, not a warning. A figure that includes
decorating is larger by construction. It compares spending, never what
is in the bank: it is not "you can afford this". When the owner asks
whether the budget is sensible, read `mp_budget_vs_benchmarks` and say
which rows are like for like.

## The channels, and what each is for

No one channel fills a house. Each has a job, and the system treats
them differently because they fail differently.

| Channel | What it is good for | How listings arrive |
|---|---|---|
| Private sellers on Marketplace and the like | The real bargains: a seller who does not know what the thing is, priced to be gone by the weekend. Speed wins. | The owner's own alerts and sweeps; he shares the link or a screenshot, and gets a verdict in one reply. |
| Salerooms | Honest descriptions, a known premium, a viewing day, and the price evidence everything else is measured against. Rarely a steal, often fair. | The automated sweep (shape 5). |
| eBay | Named makers and small things that post well; collection-only furniture nobody else will drive for. | The official API, once the owner has made a free developer key. Live listings only: eBay does not release sold prices this way. |
| Charity furniture shops, car boots, fairs | Cheap, good, and in the hand, so every check can be answered on the spot. | In person; the page lists them by travel band. |

**Marketplace cannot be read by machine, and this system does not try.**
It shows listings only to a signed-in person and its terms forbid
automated collection; tools that log in as the owner risk the account,
and losing the account loses the channel. So the owner's part is kept
as small as it can honestly be: a dozen sharp alerts, not hundreds, two
short sweeps a week, and one tap to share anything that passes the
three-second test on the page (right material, right period, under the
ceiling). What makes that worth his time is on this side of the share:
the profile, the checks, the ladder and the message are already
written.

**How a naive listing reads.** A seller who does not know what he has
does not write "Georgian mahogany". He writes "old brown chest of
drawers", "grandad's desk", "heavy wooden wardrobe, needs gone". Each
profile's `misspellings` and the plain-word sweeps in `mp_searches`
exist to find those, and they are where the low offer that gets
accepted comes from.

## The reference shelf

Where a check, a maker or a rule can be verified. A maker or a check
stays `drafted` until one of these, or a source as good, stands behind
it; the `sources` row says which.

| For | Source |
|---|---|
| Furniture makers, 1640-1840 and later | British and Irish Furniture Makers Online (BIFMO), the Furniture History Society's free dictionary of makers. |
| Country chairs and regional work | The Regional Furniture Society, and its index of regional chair makers within BIFMO. |
| Upholstery fire labels | The Furniture and Furnishings (Fire) (Safety) Regulations 1988, on legislation.gov.uk: what must carry a label, and the pre-1950 exemption. |
| Silver and plate marks | The assay offices' own hallmark guides for sterling; makers' marks references for electroplate. |
| What a period piece looks like | Museum collections with dated, described objects - the V&A's furniture collection above all. |
| What things sell for | Salerooms' own published results (above). There has been no published furniture price index since 2016. |

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
7. Opening offer and ceiling by the offer rule (`offerRange`). While
   nothing is urgent - no house, or not a day-one need - the GOOD price
   is the ceiling: open at three quarters of good, stop at good, and at
   or under good pay the asking price and go today. Only a day-one need
   with a house waiting may pay up to fair.
8. The message to send, ready to copy (`sellerMessage`): the lowest
   offer and collection, nothing else - "Would you take X? I can collect
   this week and pay on collection." Never ask for more photographs,
   measurements or history: everything else is settled on the doorstep,
   where walking away is free. Only a prized piece at a steal earns one
   question first. Text only - the owner sends it. No deposits and no
   moving off the platform, ever.
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
   in - and that bid is where the bidding stops. Each is written once,
   by its URL.
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

- Ladders with too few sold prices are still estimates, and are the
  next thing to research. Makers and checks were seeded from general
  knowledge and are `drafted` until verified against a source, which is
  Claude's to do, not the owner's. 17 Nov 2026: 26 of 73 makers and the
  47 checks that rest on a factual claim are `researched`, each with its
  `sources` row, the four Sheffield and Birmingham platers among them.
  Where sources disagree on a founding date (Tetrad, Royal Crown Derby,
  Mauviel, Titchmarsh and Goodwin) the row says so and stays `drafted`;
  the mark, not the date, is what a find is judged on. A
  retailer's stamp (Maple, Shoolbred, Edwards and Roberts) is
  `acceptable`, never `seek`: it must not lift a grade by itself.
- Several loaded hammer prices were quoted in groups, without a house
  and date each, or without the house's premium. They are marked
  `drafted` and say so in their note.
- Drive times, miles and the travel bands are estimates; none was
  routed. They are measured from the present home and need re-basing
  after a move.
- The Marketplace search URL format has not been verified, so the page
  shows each query as selectable text and no link.
- Two salerooms' results are loaded: a fine-furniture house and the
  local general sale. Neither prices small things: a saleroom lots only
  the best lamp, stool, tray or picture singly and sells the rest by the
  boxful (twelve table lamps made 30), so those are NOT loaded and
  their ladders stay estimates until sold listings are read. The same
  boxes are the cheapest way to buy lamps.
- The storage figures are national survey averages, not a local quote.
- There is no house and no completion date: `needed_by` is null
  everywhere and every large piece waits.
