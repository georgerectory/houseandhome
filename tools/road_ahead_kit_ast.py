"""road_ahead_kit_ast.py - find the Rectory kit's inline figures by where
they sit in its code, never by what they are.

The kit writes a few of its figures as literals inside function bodies:
the cash ceiling, the verdict thresholds, the near-home radius, the
Golden Egg's sweep prices, the family-stay variants. Some of those are
the owner's own planning figures - a bid ceiling is exactly what an
auction counterparty would like to know - so they must never be typed
into this public repository, not even in a tool that reads them.

So each is located STRUCTURALLY: "the number `buy` is compared with",
"the list the sweep loop iterates", "the family_until passed for
family_longer". The values are read from the kit at run time and go
only into private output. If the kit's code changes shape, a locator
fails loudly rather than guessing.

Used by tools/road-ahead-kit.py (the private extract) and
tools/road-ahead-golden.py (which swaps these same literals for invented
ones before running the kit on invented inputs).
"""
import ast, os


class NotFound(Exception):
    pass


def _parse(model, name, trees=None):
    if trees is not None and name in trees:
        return trees[name]
    tree = ast.parse(open(os.path.join(model, name)).read())
    if trees is not None:
        trees[name] = tree
    return tree


def _func(tree, name):
    for n in tree.body:
        if isinstance(n, ast.FunctionDef) and n.name == name:
            return n
    raise NotFound(f'function {name}')


def _register_loop(tree):
    for n in tree.body:
        if isinstance(n, ast.For) and getattr(n.iter, 'id', None) == 'R':
            return n
    raise NotFound('the register loop over R')


def _compares(node, name, op):
    """Constants that Name(name) is compared against with op, in order."""
    out = []
    for n in ast.walk(node):
        if (isinstance(n, ast.Compare) and isinstance(n.left, ast.Name) and n.left.id == name
                and len(n.ops) == 1 and isinstance(n.ops[0], op) and isinstance(n.comparators[0], ast.Constant)):
            out.append(n.comparators[0])
    return out


def _one(nodes, what):
    vals = {n.value for n in nodes}
    if len(vals) != 1:
        raise NotFound(f'{what}: found {len(vals)} candidates')
    return nodes


def _call_kw(node, func_name, kw):
    """Keyword `kw` passed to calls of func_name under node."""
    for n in ast.walk(node):
        if isinstance(n, ast.Call) and getattr(n.func, 'id', None) == func_name:
            for k in n.keywords:
                if k.arg == kw:
                    return k.value
    raise NotFound(f'{func_name}(..., {kw}=...)')


def locate(model, trees=None):
    """Every inline figure Road Ahead needs, as the AST nodes that hold
    them: {name: [Constant nodes]} for single numbers, {name: node} for
    literals to evaluate. Nodes, so a caller can read OR replace them;
    pass a dict as trees to keep the parsed modules for recompiling."""
    reg = _parse(model, 'register_v5.py', trees)
    loop = _register_loop(reg)
    walk_fn = _func(reg, 'walk')
    cash_fn = _func(reg, 'cash_left')
    r3 = _parse(model, 'roads_v3.py', trees)
    run3 = _func(r3, 'run')
    r4 = _parse(model, 'roads_v4.py', trees)
    help_fn = _func(r4, 'with_help')
    allr = _func(r4, 'all_results')

    found = {}
    found['help.near_minutes'] = _one(_compares(loop, 'mins', ast.LtE), 'near radius')
    po = _compares(loop, 'po', ast.GtE)
    if len(po) != 3:
        raise NotFound('the three verdict thresholds')
    found['verdict.strong'], found['verdict.worth'], found['verdict.marginal'] = [po[0]], [po[1]], [po[2]]
    found['ceiling.hard'] = _one(_compares(loop, 'buy', ast.Gt), 'cash ceiling')
    help_ifs = [n for n in ast.walk(loop) if isinstance(n, ast.IfExp) and getattr(n.test, 'id', None) == 'near'
                and isinstance(n.body, ast.Constant) and isinstance(n.orelse, ast.Constant)]
    if len(help_ifs) != 1:
        raise NotFound('the register help factors')
    found['register.help_near_cost'], found['register.help_far_cost'] = [help_ifs[0].body], [help_ifs[0].orelse]
    found['appraisal.stretch_below'] = _one([c for c in _compares(loop, 'cl', ast.Lt) if c.value != 0], 'stretch')

    rng = next((n for n in ast.walk(walk_fn) if isinstance(n, ast.Call) and getattr(n.func, 'id', None) == 'range'), None)
    if rng is None or len(rng.args) != 3:
        raise NotFound('the walk-away range')
    found['appraisal.walk_from'] = [rng.args[0]]
    found['appraisal.walk_to_plus_one'] = [rng.args[1]]
    found['appraisal.walk_step'] = [rng.args[2]] + [n.right for n in ast.walk(walk_fn)
                                                    if isinstance(n, ast.BinOp) and isinstance(n.op, ast.Sub)
                                                    and isinstance(n.right, ast.Constant)]
    found['appraisal.walk_to'] = [n.value for n in ast.walk(walk_fn)
                                  if isinstance(n, ast.Return) and isinstance(n.value, ast.Constant)]
    dep_default = cash_fn.args.defaults[-1]
    found['appraisal.deposit_pct'] = [dep_default]
    kit = [n for n in ast.walk(cash_fn) if isinstance(n, ast.Constant) and type(n.value) in (int, float)
           and not isinstance(n.value, bool) and n.value not in (0, 3) and n is not dep_default]
    found['appraisal.day_one_kit'] = _one(kit, 'day-one kit')

    found['roads.horizon'] = next(n.args[1] for n in ast.walk(run3) if isinstance(n, ast.Call)
                                  and isinstance(n.func, ast.Attribute) and n.func.attr == 'get'
                                  and n.args and isinstance(n.args[0], ast.Constant) and n.args[0].value == 'horizon')
    found['roads.fix_months'] = [next(n.args[1] for n in ast.walk(run3) if isinstance(n, ast.Call)
                                      and getattr(n.func, 'id', None) == 'add_months')]
    found['fa.max_ltv'] = [next(n.left for n in ast.walk(run3) if isinstance(n, ast.BinOp) and isinstance(n.op, ast.Mult)
                                and isinstance(n.left, ast.Constant) and isinstance(n.right, ast.Name) and n.right.id == 'val')]
    found['fees.mmoa_min'] = [next(n.args[1] for n in ast.walk(run3) if isinstance(n, ast.Call)
                                   and getattr(n.func, 'id', None) == 'max' and len(n.args) == 2
                                   and isinstance(n.args[1], ast.Constant) and 'mmoa' in ast.dump(n.args[0]))]
    found['help.min_months'] = [next(n.args[0] for n in ast.walk(help_fn) if isinstance(n, ast.Call)
                                     and getattr(n.func, 'id', None) == 'max' and isinstance(n.args[0], ast.Constant))]

    stress = next(n.body[0].value.args[0] for n in ast.walk(run3) if isinstance(n, ast.If)
                  and isinstance(n.test, ast.Name) and n.test.id == 'stress')
    child = next(n.body[0].value for n in ast.walk(run3) if isinstance(n, ast.If)
                 and isinstance(n.test, ast.UnaryOp) and getattr(n.test.operand, 'id', None) == 'child')
    found['scenario.bad_luck'] = stress
    found['scenario.no_child_from'] = child

    fam = next(k.value for n in ast.walk(allr) if isinstance(n, ast.Call) for k in n.keywords if k.arg == 'family_longer')
    found['scenario.family_until_longer'] = _call_kw(fam, 'run', 'family_until')
    found['scenario.ge_later_at'] = next(n.value for n in ast.walk(allr) if isinstance(n, ast.Assign)
                                         and 'ge28' in ast.dump(n.targets[0]) and isinstance(n.value, ast.Tuple))
    fam_ge = [n for n in ast.walk(allr) if isinstance(n, ast.Assign) and 'if_found_jan_2028_family' in ast.dump(n.targets[0])]
    if not fam_ge:
        raise NotFound('the Golden Egg found-later family variant')
    found['scenario.ge_later_family_until'] = _call_kw(fam_ge[0].value, 'run', 'family_until')
    found['sweep.points'] = next(n.iter for n in ast.walk(allr) if isinstance(n, ast.For)
                                 and isinstance(n.target, ast.Tuple) and isinstance(n.iter, ast.List))

    ovr = {}
    for n in ast.walk(loop):
        if (isinstance(n, ast.If) and isinstance(n.test, ast.Compare) and getattr(n.test.left, 'id', None) == 'i'
                and isinstance(n.test.comparators[0], ast.Constant)):
            ovr[n.test.comparators[0].value] = n.body[0].value.value
    found['register.overrides'] = ovr
    return found


def values(model):
    """The located figures as plain values, for the private extract."""
    out = {}
    for k, v in locate(model).items():
        if k.startswith('register.help_'):
            continue  # the same factors as roads_v4's HELP, which the extract reads directly
        if isinstance(v, dict):
            out[k] = v
        elif isinstance(v, list):
            out[k] = v[0].value
        else:
            out[k] = ast.literal_eval(v)
    return out


def doc_variables(root):
    """The v4/v5 layer figures that exist only in the kit's
    docs/road_ahead/VARIABLES.md, read from its table by key."""
    path = os.path.join(root, 'docs', 'road_ahead', 'VARIABLES.md')
    rows = {}
    for line in open(path):
        cells = [c.strip() for c in line.strip().strip('|').split('|')]
        if len(cells) >= 2:
            rows[cells[0]] = cells[1]
    def num(s):
        return float(s) if '.' in s else int(s)
    try:
        hard, practical = [num(x.strip()) for x in rows['ceiling.hard / practical'].split('/')]
        return {
            'ceiling.practical': practical,
            'rules.forever_max_minutes': num(rows['rules.forever.max_minutes']),
            'rules.house1_max_minutes': num(rows['rules.house1.max_minutes']),
            'rules.house1_min_beds': num(rows['rules.min_beds_house1']),
            'rules.rent_max_months': num(rows['rent.max_months']),
        }
    except KeyError as e:
        raise NotFound(f'VARIABLES.md row {e}')
