"""road-ahead-golden.py - run the Rectory kit's own Python on INVENTED
inputs, and write every answer to tests/fixtures/road-ahead-golden.json.

    python3 tools/road-ahead-golden.py <kit zip>

Why: the owner's figures are private, so CI can never check the port
against them. This can: the kit's code, the owner's numbers nowhere.
Every input below is made up - pay, savings, prices, places, paths - and
the fixture is committed, so every push proves the JavaScript engine
gives what the kit's Python gives, to the pound, on inputs it has never
seen. The private checksum gate then proves the real numbers.

WHERE THE KIT HARD-CODES A FIGURE THAT IS REALLY THE OWNER'S - the cash
ceiling, the verdict thresholds, the near-home radius, the walk-away
range, the day-one kit, the deposit - the code is parsed, those literals
are found by where they sit (tools/road_ahead_kit_ast.py) and replaced
with invented ones before it runs. The kit's logic runs; its private
figures never appear in this file or in the fixture. The
generic model constants (the SDLT bands, a 36-month refix, the stress
test rates) are left as the kit wrote them.

Needs only the kit zip and Python 3 with PyYAML. Run it again after any
change to the port's inputs; the fixture is the whole record.
"""
import ast, contextlib, copy, hashlib, io, json, os, random, sys, tempfile, zipfile

ZIP = sys.argv[1]
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', 'tests', 'fixtures', 'road-ahead-golden.json')

tmp = tempfile.mkdtemp(prefix='road-ahead-golden-')
with zipfile.ZipFile(ZIP) as z:
    for n in z.namelist():
        if n.startswith(('rectory/model/', 'rectory/data/')) and not n.endswith('/'):
            z.extract(n, tmp)
os.makedirs(os.path.join(tmp, 'rectory', 'results'), exist_ok=True)
MODEL = os.path.join(tmp, 'rectory', 'model')
sys.path.insert(0, MODEL)
with contextlib.redirect_stdout(io.StringIO()):
    import engine, roads_v3, roads_v4, register_v5  # noqa: E401

# ---------------------------------------------------------------
# Invented inputs. Keys are the kit's; not one value is the owner's.
# ---------------------------------------------------------------
PATHS = {
    'base': {2026: -0.02, 2027: 0.012, 2028: 0.04, 2029: 0.05, 2030: 0.045, 2031: 0.03, 2032: 0.03, 2033: 0.03, 2034: 0.03},
    'flat': {y: 0.0 for y in range(2026, 2035)},
    'up': {2026: -0.01, 2027: 0.025, 2028: 0.055, 2029: 0.06, 2030: 0.055, 2031: 0.04, 2032: 0.04, 2033: 0.035, 2034: 0.035},
    'fall': {2026: -0.03, 2027: -0.045, 2028: 0.005, 2029: 0.03, 2030: 0.04, 2031: 0.03, 2032: 0.03, 2033: 0.03, 2034: 0.03},
}
MIP = {'amount': 262000, 'salary': 52000}
VALUES = {
    'timeline.start': [2026, 7], 'timeline.end': [2036, 6], 'timeline.house1_keys': [2027, 4],
    'timeline.bridge_from': [2026, 12], 'roads.horizon': [2037, 12], 'roads.fix_months': 36,
    'income.gross_salary_now': 52000, 'income.net_pay_now': 2980, 'income.net_per_3k_gross': 125.0,
    'income.pay_rise_2027': 2500, 'income.pay_rise_month': [2027, 4], 'income.annual_rise_from_2028': 2000,
    'income.salary_sacrifice_annual': 1200, 'income.student_loan_rate': 0.09, 'income.student_loan_threshold': 28470,
    'income.student_loan_end': [2031, 4],
    'cash.start_cash': 41000, 'cash.works_buffer': 4000, 'cash.pre_purchase_spend': 1350,
    'costs.living_after_move': 960, 'costs.bills_house1': 480, 'costs.bills_endgame': 810, 'costs.bridge_rent': 1450,
    'costs.cost_inflation': 0.028, 'costs.family_from': [2028, 7], 'costs.children': 2, 'costs.family_cost': 430,
    'costs.household_contribution': 0, 'costs.contribution_from': [2028, 1],
    'mortgage.rate': 0.0475, 'mortgage.term_years': 30, 'mortgage.fix_years': 2, 'mortgage.refix_rate': 0.041,
    'mortgage.rate_premium_95': 0.0035, 'mortgage.mip_amount': MIP['amount'], 'mortgage.mip_salary': MIP['salary'],
    'mortgage.stress_rate': 0.08, 'mortgage.lender_expenditure_adult': 1050, 'mortgage.lender_expenditure_child': 380,
    'mortgage.lender_expenditure_adult2': 450, 'mortgage.partner_net_ratio': 0.72, 'mortgage.lender_uses_post_sacrifice': 1,
    'mortgage.endgame_term_years': 32, 'mortgage.endgame_income_multiple': 4.4, 'mortgage.partner_income': 0,
    'mortgage.endgame_max_ltv': 0.9, 'mortgage.endgame_reserve': 8000,
    'fa.after_months': 5, 'fa.max_ltv': 0.9, 'fees.mmoa_min': 6600,
    'transaction.buy_costs': 3200, 'transaction.day_one_kit': 2100, 'transaction.sell_pct': 0.0138, 'transaction.sell_fixed': 2200,
    'house1.price': 285000, 'house1.deposit_pct': 0.10, 'house1.works': 30000, 'house1.works_months': 20,
    'house1.works_efficient': 30000, 'house1.uplift': 1.35, 'house1.uplift_excess': 0.45, 'house1.motivated_discount': 0.025,
    'keeper.price': 340000, 'keeper.works': 42000, 'keeper.uplift': 1.15,
    'endgame.works': 52000, 'endgame.works_months': 40, 'endgame.uplift': 1.25, 'endgame.segment_premium': 0.004,
    'endgame.build_inflation': 0.028,
    'counterfactual.rent': 1650, 'counterfactual.rent_growth': 0.025, 'counterfactual.renter_bills': 320,
    'counterfactual.invest_amount': 35000, 'counterfactual.invest_month': [2026, 7], 'counterfactual.equity_return': 0.055,
    'help.near.cost': 0.9, 'help.near.time': 0.75, 'help.far.cost': 1.2, 'help.far.time': 1.3, 'help.min_months': 3,
    'help.near_minutes': 35,
    'appraisal.cash_at_purchase': 47000, 'appraisal.buy_costs': 3200, 'appraisal.day_one_kit': 2200,
    'appraisal.deposit_pct': 0.12, 'appraisal.sell_pct': 0.0138, 'appraisal.sell_fixed': 1400,
    'appraisal.target_profit': 35000, 'appraisal.works_factor': 0.75,
    'appraisal.walk_from': 90000, 'appraisal.walk_to': 650000, 'appraisal.walk_step': 250,
    'appraisal.stretch_below': 7000, 'ceiling.hard': 360000,
    'verdict.strong': 45000, 'verdict.worth': 25000, 'verdict.marginal': 12000,
}
for name, path in PATHS.items():
    VALUES[f'market.{name}'] = {str(y): g for y, g in path.items()}


def kit_params(overrides=None):
    """The same values in the kit's own P shape: tuples, int-keyed paths
    extended to 2040, the derived keys the kit's loader or BASE made."""
    P = {}
    for k, v in VALUES.items():
        if k.startswith('market.'):
            continue
        P[k] = tuple(v) if isinstance(v, list) else v
    P['market'] = {}
    for name, path in PATHS.items():
        d = dict(path); last = d[max(d)]
        for y in range(2026, 2041):
            d.setdefault(y, last)
        P['market'][name] = d
    P['mortgage.house1_max_multiple'] = MIP['amount'] / MIP['salary']
    for k, v in (overrides or {}).items():
        P[k] = tuple(v) if isinstance(v, list) else v
    return P


def family_until(P):
    return engine.add_months(P['timeline.bridge_from'], -1)


# The kit reads a few settings from module globals; point them at the
# invented ones.
roads_v3.START = tuple(VALUES['timeline.start'])
roads_v3.FA_AFTER = VALUES['fa.after_months']
roads_v3.CAREER = {'income.annual_rise_from_2028': 5000}
roads_v4.HELP_NEAR = dict(cost=VALUES['help.near.cost'], time=VALUES['help.near.time'])
roads_v4.HELP_FAR = dict(cost=VALUES['help.far.cost'], time=VALUES['help.far.time'])

# ---------------------------------------------------------------
# The register, with its private literals swapped for invented ones.
# ---------------------------------------------------------------
sys.path.insert(0, HERE)
import road_ahead_kit_ast as kit_ast  # noqa: E402
# The register's inline figures - the cash ceiling, the verdict lines, the
# near-home radius, the walk-away range, the day-one kit, the deposit -
# found by where they sit, and replaced with invented ones.
trees = {}
found = kit_ast.locate(MODEL, trees)
INVENT = {
    'help.near_minutes': VALUES['help.near_minutes'], 'register.help_near_cost': 0.88, 'register.help_far_cost': 1.18,
    'verdict.strong': VALUES['verdict.strong'], 'verdict.worth': VALUES['verdict.worth'],
    'verdict.marginal': VALUES['verdict.marginal'], 'ceiling.hard': VALUES['ceiling.hard'],
    'appraisal.stretch_below': VALUES['appraisal.stretch_below'], 'appraisal.day_one_kit': VALUES['appraisal.day_one_kit'],
    'appraisal.deposit_pct': VALUES['appraisal.deposit_pct'], 'appraisal.walk_from': VALUES['appraisal.walk_from'],
    'appraisal.walk_to_plus_one': VALUES['appraisal.walk_to'] + 1, 'appraisal.walk_to': VALUES['appraisal.walk_to'],
    'appraisal.walk_step': VALUES['appraisal.walk_step'],
}
for key, value in INVENT.items():
    for node in found[key]:
        node.value = value

SYN_V = dict(cash_jan27=VALUES['appraisal.cash_at_purchase'], reserve=4000, buy_costs=VALUES['appraisal.buy_costs'],
             sell_pct=VALUES['appraisal.sell_pct'], sell_fixed=VALUES['appraisal.sell_fixed'],
             target_profit=VALUES['appraisal.target_profit'], opt_works=VALUES['appraisal.works_factor'])
tree = trees['register_v5.py']
defs = [n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name in ('profit', 'walk', 'cash_left')]
loop = next(n for n in tree.body if isinstance(n, ast.For) and getattr(n.iter, 'id', None) == 'R')
reg_ns = {'V': SYN_V, 'sdlt': engine.sdlt}
exec(compile(ast.fix_missing_locations(ast.Module(body=defs, type_ignores=[])), 'register_v5.py', 'exec'), reg_ns)
reg_loop = compile(ast.fix_missing_locations(ast.Module(body=[loop], type_ignores=[])), 'register_v5.py', 'exec')

REGISTER = [
    ('X01', 'near, fixed fee', 4, 12, 310000, 390000, 420000, 50000, 600, 0, {'A': 2, 'B': 3, 'C': 1}),
    ('X02', 'far, fixed fee', 3, 60, 250000, 330000, 350000, 30000, 1500, 0, {'B': 2}),
    ('X03', 'MMoA percentage, floor binds', 3, 20, 120000, 170000, 190000, 10000, 6000, 0.045, {'D': 1, 'C': 1}),
    ('X04', 'MMoA percentage, rate binds', 4, 30, 280000, 360000, 380000, 25000, 5000, 0.05, {'C': 2, 'A': 2}),
    ('X05', 'over the ceiling', 5, 25, 420000, 600000, 700000, 150000, 1800, 0, {'A': 2}),
    ('X06', 'cash goes negative', 4, 10, 355000, 480000, 520000, 60000, 1200, 0.06, {}),
    ('X07', 'stretch', 3, 15, 300000, 420000, 460000, 40000, 900, 0, {'B': 3, 'A': 3}),
    ('X08', 'walk away', 2, 50, 330000, 340000, 350000, 5000, 0, 0, {}),
    ('X09', 'works tie rounds to even', 3, 35, 200000, 290000, 310000, 50000, 0, 0, {'A': 1}),
    ('X10', 'works tie the other way', 3, 36, 200000, 290000, 310000, 12500, 0, 0, {'A': 1}),
    ('X11', 'first-time relief edge', 3, 20, 300000, 380000, 402000, 20000, 0, 0, {'B': 1}),
    ('X12', 'relief lost above 500k', 4, 20, 350000, 560000, 640000, 20000, 0, 0.02, {'C': 3}),
    ('X13', 'no works', 3, 5, 240000, 300000, 300000, 0, 300, 0, {}),
    ('X14', 'marginal', 3, 22, 260000, 330000, 347000, 25000, 700, 0, {'D': 2}),
    ('X15', 'walk-away never reached', 3, 5, 150000, 1500000, 1600000, 0, 0, 0, {'A': 1}),
    ('X16', 'walk-away below the range', 3, 5, 90000, 80000, 90000, 20000, 0, 0, {}),
]
reg_rows = [(i, f'Invented listing {i}', '', note, '', 'invented', beds, mins, buy, lo, hi, works, fee, pct, fits, note, 'Watch')
            for (i, note, beds, mins, buy, lo, hi, works, fee, pct, fits) in REGISTER]
ns = dict(reg_ns, R=reg_rows, out=[])
exec(reg_loop, ns)
register_cases = []
for row, got in zip(REGISTER, ns['out']):
    (i, note, beds, mins, buy, lo, hi, works, fee, pct, fits) = row
    register_cases.append(dict(
        listing=dict(kit_ref=i, likely_buy=buy, fin_lo=lo, fin_hi=hi, works=works, fee=fee, pct=pct, mins=mins,
                     fits=[[k, v] for k, v in fits.items()]),
        result={k: got[k] for k in ('near', 'works_base', 'works_opt', 'best_road', 'profit_base', 'profit_opt',
                                   'profit_opt_hi', 'walk_away_opt', 'cash_left', 'over_ceiling', 'grade')}))
APPRAISAL_V = dict(cash_at_purchase=VALUES['appraisal.cash_at_purchase'], buy_costs=VALUES['appraisal.buy_costs'],
                   day_one_kit=VALUES['appraisal.day_one_kit'], deposit_pct=VALUES['appraisal.deposit_pct'],
                   sell_pct=VALUES['appraisal.sell_pct'], sell_fixed=VALUES['appraisal.sell_fixed'],
                   target_profit=VALUES['appraisal.target_profit'], works_factor=VALUES['appraisal.works_factor'],
                   walk_from=VALUES['appraisal.walk_from'], walk_to=VALUES['appraisal.walk_to'],
                   walk_step=VALUES['appraisal.walk_step'], stretch_below=VALUES['appraisal.stretch_below'],
                   near_minutes=VALUES['help.near_minutes'], help_near_cost=0.88, help_far_cost=1.18,
                   ceiling_hard=VALUES['ceiling.hard'], verdict_strong=VALUES['verdict.strong'],
                   verdict_worth=VALUES['verdict.worth'], verdict_marginal=VALUES['verdict.marginal'])

# ---------------------------------------------------------------
# Roads: invented stages, every kind of event, every variant.
# ---------------------------------------------------------------
R0 = dict(kind='rent', at=(2026, 12))
ROADS = {
    'SG1': dict(near=True, stages=[R0, dict(kind='forever', at=(2027, 5), label='invented large detached project', price='max', dep=0.05,
                                            cap_price=380000, keep_for_works=12000, works=120000, wm=60, bills=650)]),
    'SH1': dict(near=True, stages=[R0, dict(kind='buy', at=(2027, 5), label='invented character detached', price=330000, dep=0.05,
                                            works=50000, wm=14, E=470000, bills=520),
                                   dict(kind='sell', at=(2029, 8)), dict(kind='forever', at=(2029, 8), label='invented forever home', price='max', bills=650)]),
    'SH2': dict(near=False, stages=[R0, dict(kind='buy', at=(2027, 6), label='invented far project', price=270000, mmoa=0.045,
                                             works=36000, wm=10, E=365000, bills=500),
                                    dict(kind='sell', at=(2029, 3)), dict(kind='forever', at=(2029, 3), label='invented forever home', price='max', bills=650)]),
    'SH3': dict(near=True, stages=[R0, dict(kind='buy', at=(2027, 5), label='invented tired semi', price=255000, works=22000, wm=8, E=330000, bills=450),
                                   dict(kind='sell', at=(2029, 5)), dict(kind='forever', at=(2029, 5), label='invented forever home', price='max', bills=650)]),
    'SP': dict(near=True, stages=[R0, dict(kind='buy', at=(2027, 5), label='invented big plot', price=360000, dep=0.05, works=25000, wm=10, E=412000),
                                  dict(kind='plot_sale', at=(2029, 1), amount=120000, costs=15000, value_loss=25000),
                                  dict(kind='sell', at=(2030, 2)), dict(kind='forever', at=(2030, 2), label='invented forever home', price='max', bills=650)]),
    'SD': dict(near=True, stages=[R0, dict(kind='buy', at=(2027, 5), label='invented sprint one', price=255000, works=22000, wm=8, E=330000, bills=450),
                                  dict(kind='sell', at=(2029, 5)),
                                  dict(kind='buy', at=(2029, 5), label='invented sprint two', price='max', cap_price=415000, works=40000, wm=12, E=470000),
                                  dict(kind='sell', at=(2031, 5)), dict(kind='forever', at=(2031, 5), label='invented forever home', price='max', bills=650)]),
    'SX': dict(near=True, stages=[R0, dict(kind='buy', at=(2027, 5), label='invented stretch', price=420000, dep=0.05, works=30000, wm=10, E=480000),
                                  dict(kind='sell', at=(2029, 11)), dict(kind='forever', at=(2029, 11), label='invented forever home', price='max', bills=650)]),
    'SK': dict(near=False, horizon=(2035, 6), stages=[R0, dict(kind='forever', at=(2027, 9), label='invented keeper', price=300000, dep=0.10,
                                                              works=60000, wm=36)]),
}
STRESS = {'mortgage.rate': 0.066, 'mortgage.refix_rate': 0.060, 'income.pay_rise_2027': 0}
VARIANTS = {
    'base': {}, 'promotion': {'income.pay_rise_2027': 8000}, 'job_change': {'income.pay_rise_2027': -1500},
    'bad_luck': STRESS, 'no_child': {'costs.family_from': [2099, 1]}, 'family_longer': {'timeline.bridge_from': [2027, 4]},
    'career': roads_v3.CAREER, 'low_rate': {'mortgage.rate': 0.039, 'mortgage.refix_rate': 0.034},
}
TRACE_FOR = {'base', 'bad_luck'}


def plain_road(r):
    return json.loads(json.dumps({k: v for k, v in r.items() if k != 'near'}))


def works_factor(road, f):
    ro = copy.deepcopy(road)
    for st in ro['stages']:
        if st.get('works'):
            st['works'] = round(st['works'] * f, -3)
    return ro


road_cases = []
for code, r0 in ROADS.items():
    base_road = {k: v for k, v in r0.items() if k != 'near'}
    for help_mode in ('help', 'none'):
        road = roads_v4.with_help(base_road, r0['near']) if help_mode == 'help' else copy.deepcopy(base_road)
        for vname, ov in VARIANTS.items():
            if help_mode == 'none' and vname not in ('base',):
                continue
            P = kit_params(ov)
            res = roads_v3.run(road, P=P, family_until=family_until(P))
            if vname not in TRACE_FOR:
                res = {k: v for k, v in res.items() if k != 'trace'}
            road_cases.append(dict(road=code, help=help_mode, near=r0['near'], works_factor=None, variant=vname,
                                   overrides=ov, road_as_run=plain_road(road), result=res))
    for f in (0.8, 0.7):
        road = works_factor(roads_v4.with_help(base_road, r0['near']), f)
        P = kit_params({'costs.family_cost': 215})
        res = roads_v3.run(road, P=P, family_until=family_until(P))
        road_cases.append(dict(road=code, help='help', near=r0['near'], works_factor=f, variant='optimistic',
                               overrides={'costs.family_cost': 215}, road_as_run=plain_road(road),
                               result={k: v for k, v in res.items() if k != 'trace'}))

# The sustainability sweep on the invented Golden Egg.
sweep = {}
for price, dep in [(330000, 0.05), (300000, 0.10), (280000, 0.10)]:
    g = roads_v4.with_help({k: v for k, v in ROADS['SG1'].items() if k != 'near'}, True)
    s = g['stages'][1]; s.update(price=price, dep=dep); s.pop('keep_for_works', None)
    for nm, ov in (('base', {}), ('promotion', VARIANTS['promotion'])):
        P = kit_params(ov)
        rr = roads_v3.run(g, P=P, family_until=family_until(P))
        sweep[f'{price}|{nm}'] = dict(min_cash=rr['min_cash'], works_done=rr['works_done'],
                                      monthly=[e['monthly'] for e in rr['ledger'] if e['step'].startswith('Buy')][0])

# ---------------------------------------------------------------
# The route model.
# ---------------------------------------------------------------
ROUTES = {
    'M1': dict(label='invented M1', sell=(2030, 9)), 'M2': dict(label='invented M2', sell=(2032, 9)),
    'M3': dict(label='invented keeper', sell=(2033, 9), keeper=True), 'MM': dict(label='invented motivated', sell=(2031, 9), motivated=True),
    'RI': dict(label='invented rent and invest', sell=(2034, 9), rent_invest=True),
    'RS': dict(label='invented rent, invest the surplus', sell=(2033, 9), rent_invest=True, invest_surplus=True),
    'MP': dict(label='invented route params', sell=(2031, 3), params={'house1.price': 300000, 'house1.works': 38000}),
}
route_cases = []
for code, route in ROUTES.items():
    for scen in ('base', 'flat', 'up', 'fall'):
        out, _ = engine.run(kit_params(), route, scen)
        route_cases.append(dict(route=code, spec=json.loads(json.dumps(route)), scen=scen, overrides=None, result=out))
for code, ov in (('M2', {'costs.household_contribution': 150}), ('M2', {'mortgage.endgame_reserve': 10 ** 7}),
                 ('M1', {'works_overrun': 1.25}), ('M1', {'motivated_draw': 0.02}), ('RI', {'equity_path': None})):
    out, _ = engine.run(kit_params(), ROUTES[code], 'base', ov)
    route_cases.append(dict(route=code, spec=json.loads(json.dumps(ROUTES[code])), scen='base', overrides=ov, result=out))
out, log = engine.run(kit_params(), ROUTES['M1'], 'base', None, monthly=True)
route_log = dict(route='M1', spec=json.loads(json.dumps(ROUTES['M1'])), scen='base', result=out, log=log)

# ---------------------------------------------------------------
# Primitives, including Python's rounding at its ties.
# ---------------------------------------------------------------
rng = random.Random(20260930)
rounding = []
for nd in (-3, -2, -1, 0, 1, 2, 3):
    for _ in range(300):
        x = rng.choice([rng.uniform(-1e6, 1e6), rng.uniform(-10, 10), rng.randint(-2000, 2000) * 0.5 * 10 ** (-nd)])
        rounding.append([x, nd, round(x, nd)])
for x in (42500.0, 43500.0, 0.125, 0.375, 2.675, 2.5, 3.5, -2.5, 1.15, -0.4, -500.0, -1500.0, 4.125, 18250.0, 0.5, 1.5, -0.5):
    for nd in (-3, -2, -1, 0, 1, 2):
        rounding.append([x, nd, round(x, nd)])
ints = [[x, round(x)] for x in (2.5, 3.5, -2.5, -0.4, 0.5, 123456.5, -7.5, 1e15 + 0.5)]
P = kit_params()
prices = sorted({p + d for p in (0, 125000, 250000, 300000, 500000, 925000, 1500000) for d in (-1, 0, 1)} | {372500, 612345.67, 2_000_000})
primitives = dict(
    sdlt=[[p, ftb, engine.sdlt(p, ftb)] for p in prices if p >= 0 for ftb in (False, True)],
    pmt=[[L, r, n, engine.pmt_n(L, r, n)] for L in (150000, 287654.32) for r in (0.0, 0.035, 0.0475, 0.069) for n in (1, 120, 318, 360)],
    annuity=[[pay, r, n, engine.annuity_pv(pay, r, n)] for pay in (900.0, 1234.56) for r in (0.0, 0.08) for n in (1, 360, 420)],
    growth=[[s, u, engine.growth_index(P, 'base', tuple(s), tuple(u))] for s, u in (([2026, 7], [2026, 7]), ([2026, 7], [2029, 11]),
                                                                                  ([2027, 3], [2037, 12]), ([2030, 1], [2029, 1]))],
    pay=[[y, m, engine.salary(P, y, m), engine.net_pay(P, y, m), engine.lender_income(P, y, m)]
         for y in range(2026, 2037) for m in (1, 3, 4, 7, 12)],
    max_loan=[[y, m, f, list(engine.endgame_max_loan(P, y, m, f))] for (y, m, f) in ((2027, 5, 1.01), (2028, 6, 1.05), (2028, 7, 1.05), (2031, 4, 1.13))],
    max_price=[[cash, cap, ftb, engine.max_endgame_price(P, cash, cap, ftb)]
               for cash in (5000, 60000, 180000) for cap in (0, 250000, 420000) for ftb in (False, True)],
)

zsha = hashlib.sha256(open(ZIP, 'rb').read()).hexdigest()
fixture = dict(
    format='road-ahead-golden/1',
    note='Invented inputs run through the Rectory kit v5.0 Python. No figure here is the owner\'s.',
    kit_sha256=zsha, python=sys.version.split()[0],
    variables=VALUES, appraisal=APPRAISAL_V,
    raw_roads={code: plain_road(r) for code, r in ROADS.items()},
    rounding=rounding, rounding_int=ints, primitives=primitives,
    roads=road_cases, sweep=dict(points=[[330000, 0.05], [300000, 0.10], [280000, 0.10]],
                                 pays=dict(base={}, promotion=VARIANTS['promotion']), result=sweep),
    routes=route_cases, route_log=route_log, register=register_cases,
)
os.makedirs(os.path.dirname(OUT), exist_ok=True)
with open(OUT, 'w') as fh:
    json.dump(fixture, fh, separators=(',', ':'))
    fh.write('\n')
print(f'golden master: {len(road_cases)} road runs, {len(route_cases) + 1} route runs, {len(register_cases)} listings, '
      f'{len(rounding) + len(ints)} roundings -> {os.path.relpath(OUT)}')
