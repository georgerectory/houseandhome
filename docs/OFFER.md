# The offer

What to bid for the active property, what that figure rests on, and how
it is kept honest while the offer stage runs. Read with `CLAUDE.md` (the
confidence rules) and `docs/road-ahead/CALIBRATION.md` (the sit-down this
mirrors). **No figure belongs in this file**: the repository is public and
every money figure lives in Supabase (RA-06).

## The rule (R-16, owner, 1 Nov 2026)

**Win it, then cover day one.** The offer is the highest price at which
the cash on completion day still pays the deposit, the stamp duty and
every buying cost, and leaves the day-one reserve (`cash.works_buffer`)
whole. R-10's gate still applies: nothing is submitted until the broker
confirms a lender will take the house as it is.

## The arithmetic (`assets/js/engine/offer.js`)

    need(P) = (P - loan(P)) + sdlt(P) + fees + reserve   <= cash on completion

- `loan(P)` is the decision in principle, capped at `offer.max_ltv` of the
  valuation. A valuation under the price lowers the loan, and the cash
  pays the gap.
- `sdlt(P)` is Road Ahead's `sdlt(price, ftb)`: first-time buyer relief,
  nil to the nil band, 5% to the relief limit, no relief above it (checked
  against gov.uk guidance, 1 Nov 2026; mirrored in SQL by `ra_sdlt`).
- `fees` are the `fees.*` variables (conveyancing, searches, Land
  Registry, survey, lender product and valuation fees, broker, insurance
  from exchange, removals), each with its own source and confidence.
- Cash on completion is `cash.isa_balance_est` plus
  `cash.saving_rate_observed` for each month from that balance's date to
  `offer.completion_month`.
- `need` rises with the price, so the maximum is found by bisection over
  whole pounds; it holds across stamp duty bands where a closed formula
  does not. The tender is the maximum rounded DOWN to a multiple of £50.

The engine also returns what moves the figure: a valuation 5% and 10%
under the price, a lender retention sized at the high day-one case,
completion a month earlier or later, the maximum by completion month,
the repayment at the rate and a point above it, and every input nobody
has confirmed. It never says the price is affordable.

The Money page ("The offer") and the Handbook (section 6) render it from
the live rows. Change an input row and the figure moves; nothing is typed.

## An offer sit-down

The owner says **"let's go through the offer"** (or "what should I bid").
A defined session shape, like a review or a Road Ahead sit-down:

1. **Ground.** `select road_ahead_context('<household>')`, the `fees.*`,
   `offer.*`, `cash.*` and `mortgage.*` variables, the open `scheduled_events`
   for the agent, the broker, the viewing and the tender form, and
   `cost_rollup` for the day-one cases.
2. **Open with the number** - the tender the engine gives today - and
   what moved it since the last sit-down. Say how many of its inputs are
   unconfirmed before saying anything else about it.
3. **Work the agenda in this order**, one clickable question at a time:
   - dated actions: the tender deadline, the DIP lapsing
     (`mortgage.dip_expires`), the viewing, the lender gate (R-10);
   - the inputs that move the figure most and are not confirmed: the
     decision in principle, the completion month, the monthly saving;
   - fees with a quote now in hand (a quote moves a fee to `confirmed`);
   - the shortcomings: down-valuation, retention, the repayment against
     the planned budget's mortgage line;
   - tender strategy: an odd figure, conditions attached, proof of funds,
     what the owner will and will not say to the agent (S-89: courteous,
     guidance-seeking, give nothing away).
4. **Write each answer as it is given** (`house.change_why` and
   `house.change_source` set; STATED lands `confirmed`, a quote or a
   verified source `researched`, an estimate `drafted`), read it back and
   re-run the engine before the next question.
5. **Close** with the tender figure, the inputs still unconfirmed and the
   next dated action. A figure the owner has not confirmed is never the
   one the owner is told to submit.

## Costs incurred later

The offer keeps only day one. Everything after it is the realistic plan
(R-14, R-15): the essentials, then the rooms in `plan.room_order`, each
funded from the monthly spare once the money exists (the cash plan on
the Plan and Money pages). A later cost never reaches back into the
offer; if a lender condition or a survey changes day one, the reserve
changes and the offer is re-run.
