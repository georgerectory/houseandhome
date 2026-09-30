// parity-road-ahead.mjs - Road Ahead's listing assessor, held equal in
// its two homes: appraise.js and appraisalSettings() in the engine,
// ra_appraise() and ra_settings() in 89_road_ahead_logic.sql.
//
// Called by parity-check.mjs, which owns the database. Every figure here
// is invented. The cases are drawn from a seeded generator, so a failure
// reproduces, plus the edges a random draw would rarely land on: the
// half-even tie the kit's register turns on, the stamp-duty bands and
// the first-time limit, a fee that tips the price over it, the near and
// far boundary, the ceiling, the stretch, both ends of the walk-away
// search, a tie between roads, a negative profit that rounds to zero,
// an overridden grade and the owner's judgement.
//
// Equality is exact, to the last bit of every number, with one allowance
// made on purpose: a -0 equals a 0. Python's round() gives -0 for a small
// loss and the engine copies it faithfully, but jsonb stores numbers as
// numeric, which has no negative zero, so the database can only ever
// return 0. They are the same pound.
import { appraise, appraisalSettings, buildParams } from '../assets/js/engine/road-ahead/index.js';
import { listingInputs } from '../assets/js/engine/road-ahead/page/model.js';
import { ROAD_SHAPE } from '../assets/js/core/road-shape.js';

/** A small seeded generator (mulberry32), so every run draws the same cases. */
function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const BASE_V = {
  cash_at_purchase: 55000, buy_costs: 3000, day_one_kit: 2000, deposit_pct: 0.1, sell_pct: 0.015,
  sell_fixed: 1500, target_profit: 40000, works_factor: 0.8, walk_from: 100000, walk_to: 450000,
  walk_step: 500, stretch_below: 8000, near_minutes: 30, help_near_cost: 0.85, help_far_cost: 1.1,
  ceiling_hard: 380000, verdict_strong: 50000, verdict_worth: 30000, verdict_marginal: 15000,
};

function randomCases(n, rnd) {
  const int = (lo, hi, step = 1) => lo + step * Math.floor(rnd() * (Math.floor((hi - lo) / step) + 1));
  const pick = (xs) => xs[Math.floor(rnd() * xs.length)];
  const out = [];
  for (let i = 0; i < n; i += 1) {
    const V = {
      cash_at_purchase: int(20000, 90000, 1000), buy_costs: int(1500, 5000, 500), day_one_kit: int(1000, 4000, 500),
      deposit_pct: pick([0.05, 0.1, 0.15]), sell_pct: pick([0.012, 0.0144, 0.015, 0.02]), sell_fixed: int(1000, 3000, 500),
      target_profit: int(20000, 60000, 5000), works_factor: pick([0.7, 0.75, 0.8, 0.85, 1]), walk_from: 100000,
      walk_to: int(350000, 500000, 10000), walk_step: pick([500, 1000, 2500]), stretch_below: int(5000, 12000, 1000),
      near_minutes: int(20, 40, 5), help_near_cost: pick([0.6, 0.73, 0.85, 0.95]), help_far_cost: pick([0.9, 1, 1.1, 1.2]),
      ceiling_hard: int(300000, 450000, 5000), verdict_strong: 50000, verdict_worth: 30000, verdict_marginal: 15000,
    };
    const buy = int(150000, 480000, 500);
    const finLo = buy + int(20000, 150000, 500);
    const L = {
      likely_buy: buy, fin_lo: finLo, fin_hi: finLo + int(0, 40000, 500), works: int(10000, 90000, 500),
      mins: int(5, 90),
    };
    const fee = rnd();
    if (fee < 1 / 3) Object.assign(L, { fee: int(500, 2000, 100), pct: 0 });
    else if (fee < 2 / 3) Object.assign(L, { fee: int(3000, 8000, 100), pct: pick([0.01, 0.02, 0.025, 0.03]) });
    const roads = ['GE', 'H1', 'H2', 'H3', 'H4'].filter(() => rnd() < 0.6);
    L.fits = roads.map((r) => [r, int(0, 3)]);
    if (rnd() < 0.1) L.override_grade = 'Walk away';
    const j = rnd();
    if (j < 0.15) L.judgement = { premium: int(-10000, 30000, 500), reason: 'Invented reason', kind: 'emotional' };
    else if (j < 0.3) L.judgement = { walk_away: int(150000, 480000, 500), reason: 'Another invented reason' };
    out.push({ name: `random ${i + 1}`, V, L });
  }
  return out;
}

function edgeCases() {
  const L = (o) => ({ likely_buy: 250000, fin_lo: 330000, fin_hi: 350000, works: 40000, mins: 20, ...o });
  const flat = { ...BASE_V, help_near_cost: 1, help_far_cost: 1, sell_pct: 0, sell_fixed: 0, works_factor: 1 };
  return [
    // 50000 x 0.85 is exactly 42500 in binary: half to even gives 42000.
    { name: 'the half-even works tie', V: BASE_V, L: L({ works: 50000, mins: 10 }) },
    ...[125000, 250000, 300000, 500000, 500001].map((b) => ({ name: `stamp duty at ${b}`, V: BASE_V, L: L({ likely_buy: b, fin_lo: b + 60000, fin_hi: b + 90000 }) })),
    { name: 'a percentage fee tips the price past first-time relief', V: { ...BASE_V, ceiling_hard: 520000, walk_to: 600000 },
      L: L({ likely_buy: 495000, fin_lo: 640000, fin_hi: 660000, fee: 5000, pct: 0.02 }) },
    { name: 'a fixed admin fee, not dutiable', V: BASE_V, L: L({ fee: 1200, pct: 0 }) },
    { name: 'exactly at the near boundary', V: BASE_V, L: L({ mins: 30 }) },
    { name: 'no minutes given', V: BASE_V, L: (({ mins, ...x }) => x)(L({})) },
    { name: 'over the ceiling', V: BASE_V, L: L({ likely_buy: 380500, fin_lo: 480000, fin_hi: 500000 }) },
    { name: 'cash runs out', V: { ...BASE_V, cash_at_purchase: 20000 }, L: L({}) },
    { name: 'strong but a stretch', V: { ...BASE_V, cash_at_purchase: 36000 }, L: L({}) },
    { name: 'the first price already misses', V: BASE_V, L: L({ works: 200000 }) },
    { name: 'no price ever misses', V: { ...BASE_V, walk_to: 200000 }, L: L({ fin_lo: 600000, fin_hi: 600000 }) },
    { name: 'no fit scores', V: BASE_V, L: L({ fits: [] }) },
    { name: 'a tie between roads', V: BASE_V, L: L({ fits: [['H3', 2], ['H1', 2], ['H2', 1]] }) },
    { name: 'a negative profit rounding to zero', V: flat, L: L({ likely_buy: 200000, works: 30000, mins: 5, fin_lo: 232700, fin_hi: 232700 }) },
    { name: 'an overridden grade', V: BASE_V, L: L({ override_grade: 'Marginal' }) },
    { name: 'a premium for the village', V: BASE_V, L: L({ judgement: { premium: 10000, reason: 'Invented', kind: 'emotional' } }) },
    { name: 'a walk-away above the ceiling', V: BASE_V, L: L({ judgement: { walk_away: 400000, reason: 'Invented' } }) },
  ];
}

const dollar = (x) => `$rj$${JSON.stringify(x)}$rj$::jsonb`;

/** Every field, exactly; a list of the differences. */
function differences(js, sql, path = '') {
  const out = [];
  const keys = new Set([...Object.keys(js ?? {}), ...Object.keys(sql ?? {})]);
  for (const k of keys) {
    const a = js?.[k];
    const b = sql?.[k];
    if (a && typeof a === 'object') out.push(...differences(a, b, `${path}${k}.`));
    else if (a !== b && !(a == null && b == null)) out.push(`${path}${k}: js=${String(a)} sql=${String(b)}`);
  }
  return out;
}

function assessorParity(psql) {
  const cases = [...edgeCases(), ...randomCases(160, seeded(20260930))];
  const raw = psql(`select coalesce(json_agg(ra_appraise(c -> 'V', c -> 'L') order by i), '[]')::text
    from jsonb_array_elements(${dollar(cases.map(({ V, L }) => ({ V, L })))}) with ordinality e(c, i);`);
  const sql = JSON.parse(raw);
  let diffs = 0;
  cases.forEach((c, i) => {
    const d = differences(appraise(c.V, c.L), sql[i]);
    if (d.length) {
      diffs += 1;
      if (diffs <= 3) console.log(`  ${c.name}: ${d.slice(0, 4).join('; ')}`);
    }
  });
  // An agreement about nothing proves nothing: the cases must reach
  // every grade, both sides of near, and the judgement.
  const grades = new Set(sql.map((r) => r.grade.replace(' (stretch)', '')));
  const reached = ['Strong', 'Worth pursuing', 'Marginal', 'Walk away', 'Over budget'].every((g) => grades.has(g))
    && sql.some((r) => r.grade.endsWith('(stretch)')) && sql.some((r) => r.near) && sql.some((r) => !r.near)
    && sql.some((r) => r.judgement?.above_ceiling) && sql[0].works_base === 42000;
  if (diffs === 0 && sql.length === cases.length && reached) {
    console.log(`PASS parity: Road Ahead assessor (${cases.length} listings) - identical to the pound, every grade reached`);
    return 0;
  }
  console.log(`FAIL parity: Road Ahead assessor - ${diffs} listing(s) differ, reachedEveryBranch=${reached}`);
  return 1;
}

function settingsParity(psql, HH) {
  const values = {
    'appraisal.cash_at_purchase': 48000, 'appraisal.buy_costs': 2500, 'appraisal.day_one_kit': 1500,
    'appraisal.deposit_pct': 0.1, 'appraisal.sell_pct': 0.0144, 'appraisal.sell_fixed': 2000,
    'appraisal.target_profit': 35000, 'appraisal.works_factor': 0.8, 'appraisal.walk_from': 100000,
    'appraisal.walk_to': 420000, 'appraisal.walk_step': 500, 'appraisal.stretch_below': 7000,
    'help.near_minutes': 35, 'help.near.cost': 0.8, 'help.far.cost': 1.05, 'ceiling.hard': 360000,
    'verdict.strong': 50000, 'verdict.worth': 30000, 'verdict.marginal': 15000,
  };
  const scenarios = {
    base: { overrides: {} },
    keen: { overrides: {}, works_factor: 0.7, help: false },
    lean: { overrides: { 'appraisal.target_profit': 25000, 'ceiling.hard': 340000 } },
  };
  const rows = Object.entries(values)
    .map(([k, v]) => `('${HH}', '${k}', '${JSON.stringify(v)}'::jsonb, 'ESTIMATE')`).join(',\n');
  const srows = Object.entries(scenarios)
    .map(([k, s]) => `('${HH}', '${k}', '${k}', ${dollar(s.overrides)}, ${s.works_factor ?? 'null'}, ${s.help ?? true})`).join(',\n');
  psql(`delete from ra_scenarios where household_id = '${HH}';
        delete from ra_variables where household_id = '${HH}';
        insert into ra_variables (household_id, key, value, evidence) values ${rows};
        insert into ra_scenarios (household_id, key, name, overrides, works_factor, help) values ${srows};`);
  const listings = [
    { likely_buy: 240000, fin_lo: 320000, fin_hi: 348000, works: 38000, mins: 25, fits: [['H1', 3]] },
    { likely_buy: 300500, fin_lo: 390000, fin_hi: 410000, works: 52000, mins: 60, fee: 6000, pct: 0.02 },
    { likely_buy: 199000, fin_lo: 260000, fin_hi: 280000, works: 50000, mins: 35, fee: 1500 },
  ];
  let diffs = 0;
  for (const [key, s] of Object.entries(scenarios)) {
    const V = appraisalSettings(buildParams(values, s.overrides), s);
    const out = JSON.parse(psql(`select json_build_object('settings', ra_settings('${HH}', '${key}'),
        'assessed', (select json_agg(ra_assess_inputs('${HH}', l, '${key}') order by i)
                       from jsonb_array_elements(${dollar(listings)}) with ordinality e(l, i)))::text;`));
    const d = [...differences(V, out.settings),
      ...listings.flatMap((L, i) => differences(appraise(V, L), out.assessed[i]).map((x) => `listing ${i + 1} ${x}`))];
    if (d.length) {
      diffs += 1;
      console.log(`  scenario ${key}: ${d.slice(0, 4).join('; ')}`);
    }
  }
  if (diffs === 0) {
    console.log(`PASS parity: Road Ahead settings (${Object.keys(scenarios).length} scenarios x ${listings.length} listings) - variables, overrides, works factor and help read alike`);
    return 0;
  }
  console.log(`FAIL parity: Road Ahead settings - ${diffs} scenario(s) differ`);
  return 1;
}

/**
 * The page assembles a listing's inputs from its register row
 * (listingInputs() in page/model.js); ra_assess() takes them from
 * ra_listing_inputs(). The two must agree on every row: the listing's
 * own facts under its latest appraisal with figures, nulls dropped, and
 * the owner's current walk-away judgement.
 */
function inputsParity(psql, HH) {
  const L = (code, mins, fee, pct) => `('${HH}', '${code}', 'Invented ${code}', ${mins}, ${fee}, ${pct}, 'watch')`;
  psql(`delete from ra_judgements where household_id = '${HH}';
        delete from ra_appraisals where household_id = '${HH}';
        delete from ra_listings where household_id = '${HH}';
        insert into ra_listings (household_id, code, name, minutes_from_home, fee, fee_pct, status) values
          ${[L('L91', 40, 1200, 0), L('L92', 15, 0, 0.045), L('L93', 'null', 900, 0), L('L94', 25, 0, 0)].join(',\n')};
        insert into ra_appraisals (household_id, listing_id, appraised_on, authored_by, protocol, inputs, fits, override_grade, override_reason, narrative)
        select '${HH}', l.id, a.on_date::date, 'claude_code', 'road-ahead-1', a.inputs::jsonb, a.fits::jsonb, a.grade, a.reason, a.narrative::jsonb
          from (values
            ('L91', '2026-09-01', ${dollar({ likely_buy: 280000, fin_lo: 350000, fin_hi: 370000, works: 30000, fee: null, mins: 25 })}::text, '[["H1", 2], ["H3", 3]]', null, null, null),
            ('L92', '2026-09-02', ${dollar({ likely_buy: 250000, fin_lo: 320000, fin_hi: 340000, works: 20000, pct: 0.05 })}::text, '[]', 'Strong (keep)', 'Invented: kept longer', null),
            ('L94', '2026-08-01', ${dollar({ likely_buy: 200000, fin_lo: 260000, fin_hi: 270000, works: 15000 })}::text, '[["H4", 1]]', null, null, null),
            ('L94', '2026-09-10', '{}', '[]', null, null, '{"rooms": "a write-up with no figures"}')
          ) a(code, on_date, inputs, fits, grade, reason, narrative)
          join ra_listings l on l.household_id = '${HH}' and l.code = a.code;
        insert into ra_judgements (household_id, listing_id, field, value, reason, kind, said_on)
        select '${HH}', l.id, j.field, j.value::jsonb, j.reason, j.kind, j.said_on::date
          from (values
            ('L91', 'premium', '5000', 'Invented: liked it', 'emotional', '2026-09-03'),
            ('L91', 'walk_away', '330000', 'Invented: said a figure', 'personal', '2026-09-05'),
            ('L92', 'walk_away', '270000', 'Invented', 'strategic', '2026-09-04'),
            ('L93', 'fit', '3', 'Invented: not a walk-away', 'strategic', '2026-09-04')
          ) j(code, field, value, reason, kind, said_on)
          join ra_listings l on l.household_id = '${HH}' and l.code = j.code;`);
  const cols = ROAD_SHAPE.register.join(', ');
  const rows = JSON.parse(psql(`select coalesce(json_agg(r order by r.code), '[]') from
    (select ${cols} from ra_register where household_id = '${HH}') r;`));
  const sql = JSON.parse(psql(`select json_object_agg(code, ra_listing_inputs('${HH}', code)) from ra_listings
    where household_id = '${HH}';`));
  let diffs = 0;
  for (const row of rows) {
    // SQL answers a listing without figures with its facts alone, which
    // ra_assess cannot run; the page answers it with null. Both mean
    // "nothing to assess".
    const want = sql[row.code]?.likely_buy == null ? null : sql[row.code];
    const d = differences(listingInputs(row), want);
    if (d.length) {
      diffs += 1;
      console.log(`  ${row.code}: ${d.slice(0, 4).join('; ')}`);
    }
  }
  const covered = rows.length === 4 && sql.L91?.judgement?.walk_away === 330000 && sql.L94?.likely_buy === 200000
    && sql.L92?.override_grade === 'Strong (keep)' && !('fee' in (sql.L91 ?? {}));
  if (diffs === 0 && covered) {
    console.log(`PASS parity: Road Ahead listing inputs (${rows.length} listings) - the page reads ra_register as ra_listing_inputs() does`);
    return 0;
  }
  console.log(`FAIL parity: Road Ahead listing inputs - ${diffs} listing(s) differ, covered=${covered}`);
  return 1;
}

/**
 * Run the Road Ahead cases against the parity database.
 * @param {(sql: string) => string} psql
 * @param {string} HH the parity household
 * @returns {{cases: number, failures: number}}
 */
export function roadAheadParity(psql, HH) {
  return { cases: 3, failures: assessorParity(psql) + settingsParity(psql, HH) + inputsParity(psql, HH) };
}
