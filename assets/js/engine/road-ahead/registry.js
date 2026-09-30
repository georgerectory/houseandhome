// registry.js - every variable the Road Ahead engine reads: its key, its
// unit and what it means. NO VALUES. The values are the owner's salary,
// savings and plans; they live in ra_variables behind RLS and never in
// this public repository.
//
// One list serves three jobs, so the three cannot drift apart:
//   * params.js refuses to run with a key missing or of the wrong kind;
//   * docs/road-ahead/VARIABLES.md is generated from it;
//   * a unit test proves every key the engine source reads is here.
//
// kind: 'number' | 'month' ([y, m]) | 'path' (a year -> rate map).
// used: which parts of the engine read it - roads (simulate.js),
// route (ladder.js), appraisal (appraise.js), lender (money.js, used by
// both simulators).

const K = (key, kind, unit, used, meaning) => ({ key, kind, unit, used, meaning });

export const REGISTRY = Object.freeze([
  // Time.
  K('timeline.start', 'month', '', 'roads route', 'The month the model starts from; moving it forward is the re-base.'),
  K('timeline.end', 'month', '', 'route', 'The last month the route model runs to.'),
  K('timeline.house1_keys', 'month', '', 'route', 'Route model: the month House 1 is bought.'),
  K('timeline.bridge_from', 'month', '', 'roads route', "The first month after the family stay; the roads derive the stay's last month from it."),
  K('roads.horizon', 'month', '', 'roads', 'Roads: the month every road is run to.'),
  K('roads.fix_months', 'number', 'months', 'roads', 'Roads: months until a mortgage bought on a road refixes.'),

  // Pay.
  K('income.gross_salary_now', 'number', '£/yr', 'lender', 'Gross salary today.'),
  K('income.net_pay_now', 'number', '£/mo', 'lender', 'Take-home pay today.'),
  K('income.net_per_3k_gross', 'number', '£/mo', 'lender', 'Extra take-home pay for each £3,000 of gross rise.'),
  K('income.pay_rise_2027', 'number', '£/yr', 'lender', 'The 2027 pay rise.'),
  K('income.pay_rise_month', 'month', '', 'lender', 'The month the 2027 rise lands.'),
  K('income.annual_rise_from_2028', 'number', '£/yr', 'lender', 'The rise each April from 2028.'),
  K('income.salary_sacrifice_annual', 'number', '£/yr', 'lender', 'Salary sacrificed, which a lender may not count.'),
  K('income.student_loan_rate', 'number', 'rate', 'lender', 'Student loan repayment rate above the threshold.'),
  K('income.student_loan_threshold', 'number', '£/yr', 'lender', 'Student loan repayment threshold.'),
  K('income.student_loan_end', 'month', '', 'lender', 'The month the student loan is cleared and repayments stop.'),

  // Cash.
  K('cash.start_cash', 'number', '£', 'roads route', 'Cash at the model start.'),
  K('cash.works_buffer', 'number', '£', 'roads route', 'Cash never spent on works; works pause below it.'),
  K('cash.pre_purchase_spend', 'number', '£/mo', 'roads route', 'Monthly spending while living with family.'),

  // Living costs.
  K('costs.living_after_move', 'number', '£/mo', 'roads route', 'Monthly living costs once moved out, before bills and housing.'),
  K('costs.bills_house1', 'number', '£/mo', 'route', 'Route model: House 1 bills.'),
  K('costs.bills_endgame', 'number', '£/mo', 'route', 'Route model: forever-home bills.'),
  K('costs.bridge_rent', 'number', '£/mo', 'roads route', 'Rent, bills included, between the family stay and the keys.'),
  K('costs.cost_inflation', 'number', '/yr', 'roads route', 'Inflation applied to every cost in the model.'),
  K('costs.family_from', 'month', '', 'lender roads route', 'The month child costs start.'),
  K('costs.children', 'number', 'count', 'lender', 'Children a lender counts in its affordability test.'),
  K('costs.family_cost', 'number', '£/mo', 'roads route', 'Monthly child costs, in model-start money.'),
  K('costs.household_contribution', 'number', '£/mo', 'route', 'Route model: a partner contribution to the household.'),
  K('costs.contribution_from', 'month', '', 'route', 'Route model: the month that contribution starts.'),

  // Borrowing.
  K('mortgage.rate', 'number', '/yr', 'roads route', 'Mortgage rate on a purchase.'),
  K('mortgage.term_years', 'number', 'years', 'roads route', 'Mortgage term.'),
  K('mortgage.fix_years', 'number', 'years', 'route', 'Route model: the fixed period.'),
  K('mortgage.refix_rate', 'number', '/yr', 'roads route', 'The rate after the fix ends.'),
  K('mortgage.rate_premium_95', 'number', '/yr', 'roads route', 'Rate premium for borrowing above 90% of the price.'),
  K('mortgage.mip_amount', 'number', '£', 'roads route', 'The mortgage in principle.'),
  K('mortgage.mip_salary', 'number', '£/yr', 'roads route', 'The salary the mortgage in principle was based on.'),
  K('mortgage.house1_max_multiple', 'number', 'x salary', 'roads route', 'The income multiple a lender allows; derived from the two above unless set.'),
  K('mortgage.stress_rate', 'number', '/yr', 'lender', 'The rate a lender stress-tests the payment at.'),
  K('mortgage.lender_expenditure_adult', 'number', '£/mo', 'lender', "A lender's living-cost allowance for one adult."),
  K('mortgage.lender_expenditure_child', 'number', '£/mo', 'lender', "A lender's living-cost allowance per child."),
  K('mortgage.lender_expenditure_adult2', 'number', '£/mo', 'lender', "A lender's allowance for a second adult when their income is used."),
  K('mortgage.partner_net_ratio', 'number', 'ratio', 'lender', "Share of a partner's gross income that is take-home."),
  K('mortgage.lender_uses_post_sacrifice', 'number', '0 or 1', 'lender', 'Whether a lender counts salary after sacrifice.'),
  K('mortgage.endgame_term_years', 'number', 'years', 'lender route', 'Term for the forever-home mortgage.'),
  K('mortgage.endgame_income_multiple', 'number', 'x salary', 'lender', 'Income multiple for the forever-home mortgage.'),
  K('mortgage.partner_income', 'number', '£/yr', 'lender', 'Partner income a lender may count.'),
  K('mortgage.endgame_max_ltv', 'number', 'ratio', 'route', 'Most a lender lends against the forever home, as a share of price.'),
  K('mortgage.endgame_reserve', 'number', '£', 'route', 'Cash kept back when the forever home is bought.'),
  K('fa.after_months', 'number', 'months', 'roads', 'Months after a purchase when a further advance can be drawn, once.'),
  K('fa.max_ltv', 'number', 'ratio', 'roads', 'Most a further advance can reach, as a share of current value.'),
  K('fees.mmoa_min', 'number', '£', 'roads', 'The smallest Modern Method of Auction reservation fee.'),

  // Buying and selling.
  K('transaction.buy_costs', 'number', '£', 'roads route', 'Legal, survey and searches on a purchase.'),
  K('transaction.day_one_kit', 'number', '£', 'roads route', 'Tools and kit bought on the first day of a project.'),
  K('transaction.sell_pct', 'number', 'ratio', 'roads route', "Agent's fee on a sale, VAT included."),
  K('transaction.sell_fixed', 'number', '£', 'roads route', 'Fixed costs of a sale: legal and removals.'),

  // The route model's houses.
  K('house1.price', 'number', '£', 'route', 'Route model: House 1 price.'),
  K('house1.deposit_pct', 'number', 'ratio', 'route', 'Route model: House 1 deposit.'),
  K('house1.works', 'number', '£', 'route', 'Route model: House 1 works.'),
  K('house1.works_months', 'number', 'months', 'route', 'Route model: months the House 1 works take.'),
  K('house1.works_efficient', 'number', '£', 'route', 'Route model: works spend that reaches a done standard.'),
  K('house1.uplift', 'number', '£ per £', 'route', 'Route model: value added per pound of works up to the done standard.'),
  K('house1.uplift_excess', 'number', '£ per £', 'route', 'Route model: value added per pound beyond it.'),
  K('house1.motivated_discount', 'number', 'ratio', 'route', 'Route model: discount from a motivated seller.'),
  K('keeper.price', 'number', '£', 'route', 'Route model: price of a house kept rather than sold.'),
  K('keeper.works', 'number', '£', 'route', 'Route model: works on the kept house.'),
  K('keeper.uplift', 'number', '£ per £', 'route', 'Route model: value added per pound on the kept house.'),
  K('endgame.works', 'number', '£', 'route', 'Route model: first-phase works on the forever home, model-start money.'),
  K('endgame.works_months', 'number', 'months', 'route', 'Route model: months those works take.'),
  K('endgame.uplift', 'number', '£ per £', 'route', 'Route model: value added per pound on the forever home.'),
  K('endgame.segment_premium', 'number', '/yr', 'route', "Route model: how much faster the forever home's market rises."),
  K('endgame.build_inflation', 'number', '/yr', 'route', 'Route model: building cost inflation.'),

  // Rent and invest instead.
  K('counterfactual.rent', 'number', '£/mo', 'route', 'Rent paid when renting and investing instead of buying.'),
  K('counterfactual.rent_growth', 'number', '/yr', 'route', 'Yearly rise in that rent.'),
  K('counterfactual.renter_bills', 'number', '£/mo', 'route', 'Bills while renting.'),
  K('counterfactual.invest_amount', 'number', '£', 'route', 'Sum invested instead of a deposit.'),
  K('counterfactual.invest_month', 'month', '', 'route', 'When it is invested.'),
  K('counterfactual.equity_return', 'number', '/yr', 'route', 'Return on the investment, after fees.'),

  // House prices.
  K('market.base', 'path', 'growth by year', 'roads route', 'House-price growth each year, the central path.'),
  K('market.flat', 'path', 'growth by year', 'route', 'House-price growth each year, flat.'),
  K('market.up', 'path', 'growth by year', 'route', 'House-price growth each year, stronger.'),
  K('market.fall', 'path', 'growth by year', 'route', 'House-price growth each year, a fall first.'),

  // Local help, per the owner's closer-to-home principle.
  K('help.near.cost', 'number', 'factor', 'roads appraisal', 'Works cost multiplier near home, where friends and family help.'),
  K('help.near.time', 'number', 'factor', 'roads', 'Works duration multiplier near home.'),
  K('help.far.cost', 'number', 'factor', 'roads appraisal', 'Works cost multiplier far from home.'),
  K('help.far.time', 'number', 'factor', 'roads', 'Works duration multiplier far from home.'),
  K('help.min_months', 'number', 'months', 'roads', 'The shortest a scaled works programme can be.'),
  K('help.near_minutes', 'number', 'minutes', 'appraisal', 'Within this many minutes of home, a project counts as near.'),

  // Appraising a listing.
  K('appraisal.cash_at_purchase', 'number', '£', 'appraisal', 'Cash expected at the House 1 purchase.'),
  K('appraisal.buy_costs', 'number', '£', 'appraisal', 'Legal, survey and searches on a purchase.'),
  K('appraisal.day_one_kit', 'number', '£', 'appraisal', 'Tools and kit on day one.'),
  K('appraisal.deposit_pct', 'number', 'ratio', 'appraisal', 'Deposit assumed when working out the cash left.'),
  K('appraisal.sell_pct', 'number', 'ratio', 'appraisal', "Agent's fee on the sale."),
  K('appraisal.sell_fixed', 'number', '£', 'appraisal', 'Fixed costs of the sale.'),
  K('appraisal.target_profit', 'number', '£', 'appraisal', 'The profit the walk-away price protects.'),
  K('appraisal.works_factor', 'number', 'factor', 'appraisal', 'The optimistic share of the works, after help.'),
  K('appraisal.walk_from', 'number', '£', 'appraisal', 'Where the walk-away search starts.'),
  K('appraisal.walk_to', 'number', '£', 'appraisal', 'Where it stops.'),
  K('appraisal.walk_step', 'number', '£', 'appraisal', 'Its step.'),
  K('appraisal.stretch_below', 'number', '£', 'appraisal', 'Cash left below which a good verdict is marked a stretch.'),
  K('ceiling.hard', 'number', '£', 'appraisal', 'The dearest purchase the cash allows at all; also caps the bid limit.'),
  K('verdict.strong', 'number', '£', 'appraisal', 'Optimistic profit for "Strong".'),
  K('verdict.worth', 'number', '£', 'appraisal', 'Optimistic profit for "Worth pursuing".'),
  K('verdict.marginal', 'number', '£', 'appraisal', 'Optimistic profit for "Marginal"; below it, "Walk away".'),
]);

export const REGISTRY_KEYS = Object.freeze(new Set(REGISTRY.map((r) => r.key)));

/** The registry entries a part of the engine needs. */
export const keysUsedBy = (part) => REGISTRY.filter((r) => r.used.split(' ').includes(part)).map((r) => r.key);
