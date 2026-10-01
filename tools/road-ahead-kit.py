"""road-ahead-kit.py - read the Rectory kit's own Python and data, and
write what Road Ahead needs as one JSON file.

Run by tools/road-ahead-kit.mjs, never by hand, against a TEMPORARY copy
of the kit (importing register_v5 re-runs the register and rewrites its
results files, so the kit itself is never the working copy):

    python3 tools/road-ahead-kit.py <unzipped kit root> <out.json>

WHY IMPORT RATHER THAN READ. The kit's constants - the road stages, the
help factors, the scenario overrides, the register rows - live in Python
source. Importing the modules takes them from the objects the kit itself
ran on, so nothing is copied by hand. The few literals written inline
inside a function body cannot be imported; they are found by where they
sit in the code (tools/road_ahead_kit_ast.py), because some are the
owner's own planning figures and none may be typed into this file.

Nothing is printed: the output is private and goes only to the file.
"""
import ast, contextlib, csv, inspect, io, json, os, sys

root, out_path = sys.argv[1], sys.argv[2]
model = os.path.join(root, 'model')
sys.path.insert(0, model)

with contextlib.redirect_stdout(io.StringIO()):
    import engine, roads_v3, roads_v4, register_v5  # noqa: E401  register_v5 runs on import

P0, A = engine.load_assumptions(os.path.join(root, 'data', 'assumptions.yaml'))

# The literals written inside function bodies, and the figures that live
# only in the kit's docs, located structurally (tools/road_ahead_kit_ast.py)
# so that none of them is ever typed into this public file.
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import road_ahead_kit_ast as kit_ast  # noqa: E402
INLINE = kit_ast.values(model)
DOCS = kit_ast.doc_variables(root)


def base_overrides():
    """The keys roads_v4 sets on BASE, read from its source; the values
    from the live BASE. The mortgage in principle is also taken apart:
    BASE sets the multiple as amount / salary, and both are kept."""
    tree = ast.parse(open(os.path.join(model, 'roads_v4.py')).read())
    keys, mip = [], None
    for node in ast.walk(tree):
        if (isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute)
                and node.func.attr == 'update' and getattr(node.func.value, 'id', None) == 'BASE'):
            d = node.args[0]
            for k, v in zip(d.keys, d.values):
                keys.append(k.value)
                if isinstance(v, ast.BinOp) and isinstance(v.op, ast.Div):
                    mip = {'amount': v.left.value, 'salary': v.right.value}
    return {k: roads_v4.BASE[k] for k in keys}, mip


def kit_tests():
    """The kit's own 43 tests, run by the kit on its own data: their
    names carry private figures, so they stay in the private output."""
    import tests
    with contextlib.redirect_stdout(io.StringIO()):
        return [[name, bool(ok)] for name, ok, _ in tests.run_tests()]


def read_data():
    """Every data file, as the kit's own loaders read them."""
    import yaml
    d = os.path.join(root, 'data')
    out = {}
    for name in ('decisions', 'preferences', 'appraisals', 'auctions', 'listing_queue', 'roads', 'routes'):
        out[name] = yaml.safe_load(open(os.path.join(d, name + '.yaml')))
    for name in ('evidence', 'listings'):
        out[name] = list(csv.reader(open(os.path.join(d, name + '.csv'), newline='')))
    return out


def fits_pairs(d):
    return [[k, v] for k, v in d.items()]


overrides, mip = base_overrides()
sig = inspect.signature(roads_v3.run).parameters
register_rows = []
for r in register_v5.R:
    (i, name, link, src, date, typ, beds, mins, buy, lo, hi, works, fee, pct, fits, flag, status) = r
    register_rows.append(dict(kit_ref=i, name=name, link=link, source=src, date=date, type=typ, beds=beds, mins=mins,
                              likely_buy=buy, fin_lo=lo, fin_hi=hi, works=works, fee=fee, pct=pct,
                              fits=fits_pairs(fits), flag=flag, status=status))

out = dict(
    P0=P0,
    assumptions=A,
    roads_v3=dict(family_until_default=list(sig['family_until'].default), CAREER=roads_v3.CAREER,
                  FA_AFTER=roads_v3.FA_AFTER, BILLS=roads_v3.BILLS, K27=roads_v3.K27, ROADS=roads_v3.ROADS),
    roads_v4=dict(BASE_overrides=overrides, MIP=mip, HELP_NEAR=roads_v4.HELP_NEAR, HELP_FAR=roads_v4.HELP_FAR,
                  PROMO=roads_v4.PROMO, DOWN=roads_v4.DOWN, NEAR=roads_v4.NEAR, ROADS=roads_v4.ROADS),
    register_v5=dict(V=register_v5.V, OPT=register_v5.OPT, rows=register_rows),
    inline=dict(
        variables={k: v for k, v in INLINE.items()
                   if not k.startswith(('scenario.', 'sweep.', 'register.')) and k != 'appraisal.walk_to_plus_one'},
        scenarios=dict(
            bad_luck=INLINE['scenario.bad_luck'],
            no_child={'costs.family_from': list(INLINE['scenario.no_child_from'])},
            family_longer={'timeline.bridge_from': list(engine.add_months(INLINE['scenario.family_until_longer'], 1))},
            ge_later_family={'timeline.bridge_from': list(engine.add_months(INLINE['scenario.ge_later_family_until'], 1))},
        ),
        ge_later_at=list(INLINE['scenario.ge_later_at']),
        sweep=[list(p) for p in INLINE['sweep.points']],
        overrides=INLINE['register.overrides'],
        doc_variables=DOCS),
    kit_tests=kit_tests(),
    data=read_data(),
)


def plain(o):
    # YAML reads bare dates as date objects; tuples and sets become lists.
    return o.isoformat() if hasattr(o, 'isoformat') else list(o)


json.dump(out, open(out_path, 'w'), indent=1, default=plain)
