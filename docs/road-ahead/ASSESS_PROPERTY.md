# Assessing a listing

When the owner sends a house, any Claude runs the same method: the
Rectory kit's Part P, through the connector (chat) or the engine (Code).
What comes out is a listing and an appraisal in Supabase, one answer in
a fixed format, and the owner's reaction recorded beside the maths. The
page picks it up on its next load: the answer in Assess, the listing in
the register. The owner starts one from Assess too, by pasting the
listing there and copying it for Claude.

Five rules bind it:

- **No scraping.** Rightmove and the other portals forbid it. The owner
  pastes the listing's text and a floor-plan screenshot. An auctioneer's
  catalogue or a lot page is read only when the owner asks, one page at
  a time, never crawled.
- **No invented market facts.** Every comparable has an address, a
  price, a date and a source. A figure worked out rather than found is
  labelled ESTIMATE, and the answer says so.
- **Numbers only (G-P01R).** The setting counts only through value,
  demand and the speed of a sale.
- **Search before adding.** A house already in the register gets a new
  appraisal, never a second listing.
- **Drafted stays drafted.** What Claude writes lands `drafted` or
  `researched`; only the owner's word confirms anything.

## 1. Ground

    select road_ahead_context('<household>');

That returns the variables (the target profit, the ceilings, the rules'
figures), the roads, the rules, the register and the next dated actions.
Everything below uses it.

## 2. Is it already here?

    select code, name, status, links from ra_listings
     where household_id = '<household>'
       and (postcode ilike '<postcode>%' or address ilike '%<street>%' or '<link>' = any (links));

If it is, carry on with that code. If not, the next free L-code:

    select 'L' || lpad((coalesce(max(substring(code from 2)::int), 0) + 1)::text, 2, '0')
      from ra_listings where household_id = '<household>' and code ~ '^L\d+$';

## 3. The rules, before any numbers

The hard rules are `ra_rules` where `kind = 'hard'`: never a lodger or a
house-share, never a flat, never a terrace (an end-terrace only as a rare
exception), never a new-build, and the distance limits (`rules.*`). A
house that breaks one is rejected before anything is priced: write the
listing as `dropped` with the rule as its `status_reason`, and answer in
one line naming the rule. A default rule (bedrooms, for one) is a
warning to state, not a reason to stop.

## 4. The inputs, each with its evidence

`ra_assess_inputs` takes a JSON object with these keys, and nothing else
matters to the numbers:

| Key | What it is | Where it comes from | Label |
|---|---|---|---|
| `likely_buy` | The price it will probably take | The guide or asking price, read with the auctioneer's or agent's record | ESTIMATE |
| `fin_lo`, `fin_hi` | The finished value, low and high | Same-street, same-type sold prices, adjusted to today, each a comparable row | VERIFIED when every one is dated and sourced; else ESTIMATE |
| `works` | The works, DIY cost, before local help | The floor plan, room by room; else the area at the rate of the nearest earlier appraisal of the same condition, naming it | ESTIMATE |
| `mins` | Minutes from home | The owner, or a route planner | STATED or VERIFIED |
| `fee`, `pct` | The buyer's fees: a fixed fee, or a share with its minimum | The auction's or the Modern Method of Auction's terms | VERIFIED |
| `fits` | Road fit, 0 to 3, as `[["GE",1],["H1",3],...]` in the roads' order | Each road's criteria, read against the house | ESTIMATE |

The engine applies local help and the optimistic share to the works, so
`works` is the plain DIY estimate. The trades cost may be quoted for
comparison, never as the input. The labels are the kit's own: STATED
(the owner said it), VERIFIED (a dated source), ESTIMATE (worked out),
CHECK (needed before it can drive a bid).

Comparables are rows, one per price:

    insert into ra_comparables (household_id, listing_id, address, property_type, price, kind, when_text, on_date, source, url)
    values ('<household>', <listing id or null>, '<address>', '<type>', <price>, 'sold',
            '<month year>', '<date>', '<where it was found>', '<url>');

A sold price the owner pastes from a portal is sourced to that portal and
the date it was pasted. Nothing comes from memory.

## 5. Compute

    select ra_assess_inputs('<household>', '<the inputs>'::jsonb, 'base');
    select ra_assess_inputs('<household>', '<the inputs>'::jsonb, 'optimistic');

In Claude Code the engine gives the same figures and one more: the house
dropped into its best road as House 1, with what that does to the
forever-home budget (Focus road, as on the page):

    node tools/road-ahead.mjs assess <listing.json> --extract <inputs file>

where the inputs file is `select road_ahead_inputs('<household>')` saved
to `data/road-ahead/` (gitignored), so the engine runs on today's figures.

The mortgage check is two lines: the loan at the likely price and at the
bid limit, `price x (1 - appraisal.deposit_pct)`, each against
`mortgage.mip_amount`; and whether a lender will take the house at all
(construction, tenure, condition), which is CHECK until a lender says so.

## 6. Write it, then read it back

The listing first (or the facts updated on the existing one), then the
appraisal. An appraisal is never edited: a new one is a new row.

    insert into ra_appraisals (household_id, listing_id, appraised_on, scenario_key, authored_by, protocol,
      engine_version, inputs, outputs, fits, verdict, positives, negatives, red_flags, next_checks, sources, labels)
    values ('<household>', <listing id>, current_date, 'base', 'claude_code', 'road-ahead-1', '<commit>',
      '<the inputs>', '<the base ra_assess_inputs result>', '<the fits>', '<the verdict line>',
      array['...'], array['...'], array['...'], array['...'],
      '[{"for":"fin_hi","what":"<address, type, sold>","price":<price>,"on":"<date>","source":"<source>","url":"<url>"}]',
      '{"likely_buy":"ESTIMATE","fin_lo":"VERIFIED","fin_hi":"VERIFIED","works":"ESTIMATE","mins":"STATED","fits":"ESTIMATE"}');

`authored_by` is `claude_chat` from the chat app. `verdict` is the
verdict line of the answer below, word for word. The database refuses an
appraisal by this protocol without its sources, a label from the four on
every labelled figure, the computed answer, or with more than three
positives, negatives or next checks. Then re-read:
`select ra_assess('<household>', '<code>')` must return the outputs just
written, and `ra_register` must show the listing with this appraisal.
For an auction lot, set `house_code`, `lot` and `auction_on` on the
listing and its countdown appears on the page and the Dashboard.

## 7. The answer

In this order, and no longer than this:

1. **The verdict line.** The grade and the best road, and whether it is
   optimal: optimal for a road when it breaks no rule, the verdict is
   Strong or Worth pursuing without a stretch, and it fits that road at
   2 or more. Otherwise sub-optimal, saying which of the three fails.
2. **Up to three positives, up to three negatives.** Numbers-led.
3. **The numbers:**

   | | |
   |---|---|
   | Asking or guide | |
   | Size | area, bedrooms, plot |
   | Finished value | low to high, and the comparable it rests on |
   | Works | DIY, then with local help and optimistic |
   | Profit | base and optimistic |
   | Walk-away | the optimistic walk-away for the target profit |
   | Bid limit | the walk-away, capped by the ceiling |
   | Cash left | after buying at the likely price |
   | Mortgage | the loan against the mortgage in principle, and the lender question |

4. **At most three next checks**, the one that could kill it first.

Say which figures are ESTIMATE. Never "you can afford this": a model
built on estimates says what it rests on.

## 8. Ask for the owner's reaction

End by asking what the owner makes of it. Their words are a signal, and
if they would pay more or less than the maths, a judgement beside it:

    select 'S-' || lpad((coalesce(max(substring(code from 3)::int), 0) + 1)::text, 2, '0')
      from ra_signals where household_id = '<household>' and code ~ '^S-\d+$';

    insert into ra_signals (household_id, code, kind, words, context, implies, said_on, source)
    values ('<household>', '<that code>', 'signal', '<their words>', '<code and name>', '<what it implies>',
            current_date, 'Owner, Road Ahead assessment');

The judgement is set out in `CALIBRATION.md`: a walk-away or a premium,
the reason and its kind, and the maths left as it is. A reason that
changes a rule, a fit criterion or a road is a decision for the owner,
asked as a clickable question.

## 9. Promotion, only when asked

When the owner wants to work the house up as a project:

    select ra_promote_listing('<household>', '<code>');

creates a candidate property with its template and links the listing to
it. `make_active()` runs only on the owner's word, never as part of an
assessment.
