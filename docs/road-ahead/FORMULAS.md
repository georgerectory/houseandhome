# Road Ahead formulas

How every figure is worked out, exactly as the engine does it, ported
from the Rectory kit (v5.0) and proved against it. Figures are named by
their variable keys (`VARIABLES.md` has every key, its unit and its
meaning); the values are the owner's and live only in Supabase. Code
references are under `assets/js/engine/road-ahead/`.

Money is in pounds; a month is `[year, month]`; "today's money" means
deflated to the model's start month by the base house-price path.

## Rounding

Python's: half to even, on the exact value (`pyRound` in `money.js`,
`ra_round_even` in SQL). It matters: works of £42,500 round to £42,000,
and rounding half up would move a listing's figures by £1,000.

## Pay (`money.js`)

- **Salary** in a month = `income.gross_salary_now`, plus
  `income.pay_rise_2027` from `income.pay_rise_month`, plus
  `income.annual_rise_from_2028` for each April from 2028 up to that
  month.
- **Take-home** = `income.net_pay_now` + `income.net_per_3k_gross` x
  (salary - `income.gross_salary_now`) / 3,000; from
  `income.student_loan_end`, plus `income.student_loan_rate` x
  max(0, salary - `income.student_loan_threshold`) / 12.
- **Lender income** = salary - `income.salary_sacrifice_annual` x
  `mortgage.lender_uses_post_sacrifice`.

## Stamp duty (England, from 1 April 2025; `sdlt`)

- First-time buyer and price at most £500,000: 5% of the part above
  £300,000.
- Otherwise by band: nothing to £125,000, then 2% to £250,000, 5% to
  £925,000, 10% to £1.5m, 12% above.
- A Modern Method of Auction fee charged as a percentage is part of the
  price for stamp duty; a fixed administration fee is not.

## Borrowing

- **Payment** on a loan L at annual rate r over n months =
  L x (r/12) / (1 - (1 + r/12)^-n).
- **The lender's cap** (`endgameMaxLoan`) has two parts:
  - **income**: lender income (plus any partner's) x
    `mortgage.endgame_income_multiple`;
  - **affordability**: what the month's surplus can service at
    `mortgage.stress_rate` over `mortgage.endgame_term_years` - the
    present value of take-home less the lender's living allowances
    (`mortgage.lender_expenditure_adult`, plus `..._child` for each of
    `costs.children` from `costs.family_from`), inflated from the start.
  The route model caps at the lower of the two.
- **On a road**, every loan - House 1's and the forever home's alike -
  is capped at the lower of the affordability part and salary x
  `mortgage.house1_max_multiple`. That multiple is derived: the mortgage
  in principle (`mortgage.mip_amount`) over the salary it was given on
  (`mortgage.mip_salary`). Whether the forever home should use the
  endgame multiple instead, as a decision plans, is an open
  contradiction; the roads reproduce the kit until it is settled.
- **The dearest price** (`maxEndgamePrice`, a stage priced `max`): the
  largest p with p - min(cap, LTV x p) + stamp duty(p) + buying costs +
  the reserve no more than the cash, found by bisection; on a road, by
  stepping down from the cap price in £1,000 steps.

## Prices and costs

- **House prices** (`growthIndex`): each year's rate from a market path
  (`market.base`, `.flat`, `.up`, `.fall`, the last year carried on),
  compounded monthly over every month but the last.
- **Cost inflation** from the start: (1 + `costs.cost_inflation`)^(years
  + months / 12).
- **Today's money** = a price / the house-price index from the start
  to that month.

## A road, month by month (`simulate.js`)

A road is data: steps (rent, buy, sell, the forever purchase), each at a
month. Every month, the events first - a sale before the purchase it
pays for - then the month's cash.

1. **A purchase**: deposit (default 10%), stamp duty, buying costs
   (`transaction.buy_costs`, `transaction.day_one_kit`), any auction
   fee (a percentage with `fees.mmoa_min` as its floor); the rate rises
   by `mortgage.rate_premium_95` above 90% loan to value; the payment is
   over `mortgage.term_years`, and refixes at `mortgage.refix_rate`
   after `roads.fix_months`. The finished value grows with house prices
   from the start. First-time relief ends after the first purchase.
2. **The month's cash**: during the family stay (to the month before
   `timeline.bridge_from`), take-home less `cash.pre_purchase_spend`;
   renting, take-home less living costs and `costs.bridge_rent`; owning,
   take-home less living costs (`costs.living_after_move`), the house's
   bills, the payment and any child costs (`costs.family_cost` per
   child from `costs.family_from`), all inflated from the start.
3. **Works** are spent evenly over the step's works months, never taking
   cash below `cash.works_buffer`; local help scales their cost and time
   (`help.near.*` within `help.near_minutes`, `help.far.*` beyond,
   never shorter than `help.min_months`).
4. **One further advance**, `fa.after_months` after a purchase, when
   works remain and cash will not cover them: the least of what is
   short, `fa.max_ltv` of the value less the loan, and the cap less the
   loan, drawn only above £1,000.
5. **A sale**: the value is the price plus the share of works done times
   the uplift to the finished value, grown with house prices; less
   `transaction.sell_pct` and `transaction.sell_fixed`. Profit is the
   sale less the price, stamp duty, fees, works spent and selling costs.
6. **The low point** is the first month with the lowest cash.

Each road's headline: the forever budget in cash and in today's money,
when it is bought, House 1's profit, the low point, whether a further
advance was used, the works done and left. The ledger rounds each field
as the kit did: deposit, stamp duty and fees to £100, loans and cash to
£1,000, the monthly payment to £10.

## Scenarios

A scenario is a set of overrides on the variables, plus a works factor
and whether help counts (`ra_scenarios`). The what-ifs on the page are
overrides of the same kind and save nothing. Optimistic multiplies the
works by its factor after help, each rounded to the thousand.

## A listing (`appraise.js`; `ra_assess` in SQL)

All as a first-time buyer, on today's variables:

- **Works** = the appraisal's DIY works x the help factor (near or far),
  rounded to the thousand; the optimistic works x the scenario's works
  factor (`appraisal.works_factor` by default), rounded again.
- **Fee** = max(buy x the percentage, the fixed fee) where there is a
  percentage, else the fixed fee.
- **Profit** = finished value - (buy + fee + stamp duty +
  `appraisal.buy_costs` + works + finished value x `appraisal.sell_pct`
  + `appraisal.sell_fixed`), to the thousand, with the finished value at
  the midpoint of the low and the high. Base takes the works after help,
  optimistic the optimistic works; one more, at the top, takes the high
  finished value with the optimistic works.
- **Walk-away** = the highest buy, searched upward from
  `appraisal.walk_from` in `appraisal.walk_step` steps to
  `appraisal.walk_to`, whose optimistic profit (the midpoint, the
  optimistic works, rounded to the thousand) still makes
  `appraisal.target_profit`.
- **Cash left** = `appraisal.cash_at_purchase` - (buy x
  `appraisal.deposit_pct` + stamp duty + `appraisal.buy_costs` +
  `appraisal.day_one_kit` + fee), to the thousand.
- **Verdict and bid limit**: `RULES.md`.
- **Best road** = the first road with the highest fit, in the stored
  order of the owner's fit scores; `fit.js` checks each road's criteria
  beside the owner's own score and reports a disagreement, never
  correcting it.
- **The owner's judgement**, a walk-away or a premium with its reason,
  is shown beside the maths with the profit at that price, the profit
  given up and the cash left; the bid stays within `ceiling.hard`.

## What to confirm first (`sensitivity.js`)

Each input is swung across its own low and high, or 10% either side,
and the change in each answer measured: every road's forever budget and
each live listing's walk-away. An input's score is its largest swing,
at a tenth when it is confirmed; the agenda is the top eight inputs,
each once, with every answer it moves (`ra_calibration_agenda`).

## The checks

`npm run test:checksums` reproduces, exactly, every figure the kit
published: each road under each scenario with its monthly traces, the
Golden Egg found later and its sustainability table, the optimistic
roads, every register listing's computed fields, the older route model,
and the kit's own tests. The figures themselves are private, in the
frozen `kit-v5` scenario. The golden master proves the same engine
against the kit's Python on invented inputs, in CI.
