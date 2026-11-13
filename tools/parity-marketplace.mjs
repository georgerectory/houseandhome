// parity-marketplace.mjs - the Marketplace rules, held equal in their
// two homes: engine/marketplace.js for the page, and mp_band(),
// mp_grade(), mp_travel_band(), mp_verdict_refusal(), mp_hunt_queue and
// mp_alerts_to_set in 95_ and 96_marketplace_*.sql for any Claude with
// the connector.
//
// Called by parity-check.mjs, which owns the database. Every row here
// is invented. The guard is compared over its WHOLE input space rather
// than a sample - it is small enough - and the queue over a seeded
// draw of profiles, so a failure reproduces.
import {
  band, grade, travelBand, verdictRefusal, unseenChecks,
  board, huntQueue, alertsToSet,
} from '../assets/js/engine/marketplace.js';

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
// A scalar result is selected as '=' || value: psql output is trimmed
// by the caller, and a blank first line would shift every row after it.
const q = (v) => (v == null ? 'null' : typeof v === 'string' ? `'${v.replace(/'/g, "''")}'` : String(v));
const rows = (out) => (out ? out.split('\n').map((l) => l.split('|')) : []);

function report(name, n, diffs, detail) {
  if (diffs.length) {
    console.log(`FAIL parity: ${name} - ${diffs.length} of ${n} differ; first: ${diffs[0]}`);
    return 1;
  }
  console.log(`PASS parity: ${name} (${n} cases) - ${detail}`);
  return 0;
}

function bandParity(psql) {
  const ladders = [
    [40, 80, 130, 200], [null, 80, 130, 200], [40, null, 130, 200], [40, 80, 130, null],
    [40, 80, null, 200], [0, 0, 0, 0], [0.5, 1, 2.5, 4],
  ];
  const units = [null, 0, 0.5, 0.51, 1, 39.99, 40, 40.01, 80, 80.01, 130, 130.01, 200, 200.01, 999];
  const cases = ladders.flatMap((l) => units.map((u) => [u, ...l]));
  const sql = `select '=' || coalesce(public.mp_band(u, s, g, f, m), '') from (values ${
    cases.map((c, i) => `(${i}, ${c.map((v) => `${q(v)}::numeric`).join(', ')})`).join(',')
  }) as t(i, u, s, g, f, m) order by i;`;
  const got = psql(sql).split('\n').map((l) => l.slice(1));
  const diffs = [];
  cases.forEach(([u, s, g, f, m], i) => {
    const js = band(u, { price_steal: s, price_good: g, price_fair: f, price_max: m }) ?? '';
    if (js !== (got[i] ?? '')) diffs.push(`unit ${u} on ${[s, g, f, m]}: js ${js || 'null'}, sql ${got[i] || 'null'}`);
  });
  return report('Marketplace price band', cases.length, diffs, 'identical on every boundary and every missing rung');
}

function guardParity(psql) {
  const cases = [];
  for (const v of [null, 'buy', 'offer', 'watch', 'pass']) {
    for (const g of [null, 'A', 'B', 'C', 'X']) {
      for (const fit of [null, 1, 2, 3, 4, 5]) {
        for (const b of [null, 'steal', 'good', 'over']) {
          for (const t of [null, 'A', 'B', 'beyond']) {
            for (const d of [null, true, false]) cases.push([v, g, fit, b, t, d]);
          }
        }
      }
    }
  }
  const sql = `select '=' || coalesce(public.mp_verdict_refusal(v, g, fit, b, t, d), '') from (values ${
    cases.map((c, i) => `(${i}, ${q(c[0])}::text, ${q(c[1])}::text, ${q(c[2])}::int, ${q(c[3])}::text, ${q(c[4])}::text, ${q(c[5])}::boolean)`).join(',')
  }) as x(i, v, g, fit, b, t, d) order by i;`;
  const got = psql(sql).split('\n').map((l) => l.slice(1));
  const diffs = [];
  cases.forEach((c, i) => {
    const js = verdictRefusal(...c) ?? '';
    if (js !== (got[i] ?? '')) diffs.push(`${JSON.stringify(c)}: js ${js || 'allowed'}, sql ${got[i] || 'allowed'}`);
  });
  return report('Marketplace verdict guard', cases.length, diffs, 'the whole input space, the exception included');
}

function gradeParity(psql, HH) {
  const PID = '22222222-0000-0000-0000-000000000001';
  const EMPTY = '22222222-0000-0000-0000-000000000002';
  const checks = [
    { key: 'a', must_pass: true, distinction: false, doorstep: true, sort_order: 2, status: 'active' },
    { key: 'b', must_pass: true, distinction: false, doorstep: false, sort_order: 1, status: 'active' },
    { key: 'c', must_pass: false, distinction: true, doorstep: true, sort_order: 3, status: 'active' },
    { key: 'd', must_pass: false, distinction: true, doorstep: true, sort_order: 4, status: 'active' },
    { key: 'e', must_pass: true, distinction: false, doorstep: true, sort_order: 5, status: 'retired' },
  ].map((c) => ({ ...c, profile_id: PID, question: `Question ${c.key}?`, how: 'photo' }));
  const makers = { seek: '33333333-0000-0000-0000-000000000001', acceptable: '33333333-0000-0000-0000-000000000002',
    avoid: '33333333-0000-0000-0000-000000000003' };
  psql(`insert into mp_profiles (id, household_id, key, name, category, spec) values
          ('${PID}', '${HH}', 'graded', 'Graded', 'storage', 'x'), ('${EMPTY}', '${HH}', 'bare', 'Bare', 'storage', 'x');
        insert into mp_checks (household_id, profile_id, key, kind, question, must_pass, distinction, doorstep, sort_order, status)
        values ${checks.map((c) => `('${HH}', '${PID}', '${c.key}', 'material', '${c.question}', ${c.must_pass}, ${c.distinction}, ${c.doorstep}, ${c.sort_order}, '${c.status}')`).join(',')};
        insert into mp_makers (id, household_id, name, category, standing) values
          ${Object.entries(makers).map(([s, id]) => `('${id}', '${HH}', 'Maker ${s}', 'storage', '${s}')`).join(',')};
        insert into mp_brief (household_id, style_brief, reject_brief, home_base, travel_bands) values
          ('${HH}', 'x', 'x', 'Anytown', '[{"band":"C","miles_max":40,"minutes_max":60},{"band":"A","miles_max":10,"minutes_max":20},{"band":"B","miles_max":25,"minutes_max":40}]');`);

  const answers = [undefined, 'pass', 'fail', 'unseen'];
  const cases = [];
  for (const a of answers) for (const b of answers) for (const c of answers) for (const d of ['pass', 'fail']) {
    for (const m of [null, 'seek', 'acceptable', 'avoid']) {
      const obj = {};
      for (const [k, v] of [['a', a], ['b', b], ['c', c], ['d', d], ['e', 'fail']]) if (v) obj[k] = { answer: v };
      cases.push({ profile: PID, obj, maker: m });
    }
  }
  for (const m of [null, 'seek', 'avoid']) {
    cases.push({ profile: EMPTY, obj: {}, maker: m });
    cases.push({ profile: null, obj: {}, maker: m });
  }
  const sql = `select coalesce(public.mp_grade(p, c, m), ''),
                      (select coalesce(string_agg(e ->> 'key', ',' order by o), '') from jsonb_array_elements(public.mp_unseen_checks(p, c)) with ordinality as u(e, o))
                 from (values ${cases.map((c, i) => `(${i}, ${q(c.profile)}::uuid, '${JSON.stringify(c.obj)}'::jsonb, ${q(c.maker ? makers[c.maker] : null)}::uuid)`).join(',')}) as t(i, p, c, m)
                order by i;`;
  const got = rows(psql(sql));
  const diffs = [];
  cases.forEach((c, i) => {
    const own = c.profile === PID ? checks : c.profile === EMPTY ? [] : null;
    const maker = c.maker ? { name: c.maker, standing: c.maker } : null;
    const js = [grade(own, c.obj, maker).grade ?? '', unseenChecks(own, c.obj).map((u) => u.key).join(',')];
    if (js[0] !== got[i][0] || js[1] !== got[i][1]) {
      diffs.push(`${JSON.stringify(c.obj)} maker ${c.maker}: js ${js}, sql ${got[i]}`);
    }
  });
  let failures = report('Marketplace quality grade', cases.length, diffs, 'A, B, C, X and null agree, and so do the unseen questions');

  const brief = { travel_bands: [{ band: 'C', miles_max: 40, minutes_max: 60 }, { band: 'A', miles_max: 10, minutes_max: 20 }, { band: 'B', miles_max: 25, minutes_max: 40 }] };
  const trips = [[null, null], [0, null], [10, null], [10.1, null], [25, 90], [39.9, null], [40.1, null], [null, 20], [null, 21], [null, 60], [null, 61]];
  const tGot = psql(`select '=' || coalesce(public.mp_travel_band('${HH}', mi, mn), '') from (values ${
    trips.map((t, i) => `(${i}, ${q(t[0])}::numeric, ${q(t[1])}::int)`).join(',')}) as t(i, mi, mn) order by i;`).split('\n').map((l) => l.slice(1));
  const tDiffs = [];
  trips.forEach((t, i) => {
    const js = travelBand(brief, t[0], t[1]) ?? '';
    if (js !== (tGot[i] ?? '')) tDiffs.push(`${t}: js ${js}, sql ${tGot[i]}`);
  });
  failures += report('Marketplace travel band', trips.length, tDiffs, 'by miles, by minutes, beyond and unknown');
  return failures;
}

function queueParity(psql) {
  const rnd = seeded(20261113);
  const pick = (list) => list[Math.floor(rnd() * list.length)];
  let failures = 0;
  const states = [['none', null], ['exchanged', 'committed'], ['moved', 'owned']];
  states.forEach(([state, propertyStatus], s) => {
    const hh = `44444444-0000-0000-0000-00000000000${s + 1}`;
    const profiles = Array.from({ length: 36 }, (_, i) => {
      const good = Math.round(rnd() * 200);
      return {
        id: `55555555-000${s}-0000-0000-${String(i).padStart(12, '0')}`,
        key: `k${String(i).padStart(2, '0')}`, name: `Thing ${i}`,
        tier: pick(['day_one', 'first_month', 'first_year', 'opportunistic']),
        supply: pick(['common', 'regular', 'scarce', 'rare']),
        buy_window: pick(['any_time', 'from_exchange', 'after_move']),
        wanted_qty: pick([0, 1, 1, 2, 4]),
        price_good: pick([null, good, good]),
        // Ties on the saving are deliberate: the key has to break them.
        price_new: pick([null, good + 100, good + 100, good + Math.round(rnd() * 900)]),
        status: pick(['hunting', 'hunting', 'hunting', 'hunting', 'paused', 'filled']),
        anchor_of: null, created_at: '2026-01-01T00:00:00Z',
      };
    });
    profiles.forEach((p, i) => { if (i % 4 === 0) p.anchor_of = pick(profiles).key; });
    const finds = Array.from({ length: 24 }, (_, i) => ({
      profile_id: pick(profiles).id, quantity: pick([1, 1, 2]),
      status: pick(['bought', 'bought', 'spotted', 'passed']), is_placeholder: rnd() < 0.25, paid: 10,
    }));
    const searches = Array.from({ length: 40 }, (_, i) => ({
      id: `66666666-000${s}-0000-0000-${String(i).padStart(12, '0')}`,
      profile_id: rnd() < 0.9 ? pick(profiles).id : null, label: `search ${String(i).padStart(2, '0')}`,
      query: `query ${i}`, cadence: pick(['alert', 'weekly', 'weekly', 'monthly']),
      is_alert: rnd() < 0.3, sort_order: pick([10, 20, 20, 30]), status: pick(['active', 'active', 'active', 'retired']),
    }));

    psql(`insert into households (id, name) values ('${hh}', 'Parity market ${state}');
      ${propertyStatus ? `insert into properties (household_id, ref, name, status) values ('${hh}', 'P-90${s}', 'Parity house', '${propertyStatus}');` : ''}
      insert into mp_profiles (id, household_id, key, name, category, spec, tier, supply, buy_window, wanted_qty,
                               price_good, price_new, status, resolution, anchor_of, created_at) values
      ${profiles.map((p) => `('${p.id}', '${hh}', '${p.key}', '${p.name}', 'other', 'x', '${p.tier}', '${p.supply}', '${p.buy_window}', ${p.wanted_qty},
         ${q(p.price_good)}, ${q(p.price_new)}, '${p.status}', ${p.status === 'filled' ? "'done'" : 'null'}, ${q(p.anchor_of)}, '${p.created_at}')`).join(',')};
      select set_config('house.change_why', 'parity', false);
      insert into mp_finds (household_id, profile_id, title, quantity, status, is_placeholder, paid, bought_on) values
      ${finds.map((f, i) => `('${hh}', '${f.profile_id}', 'find ${i}', ${f.quantity}, '${f.status}', ${f.is_placeholder},
         ${f.status === 'bought' ? f.paid : 'null'}, ${f.status === 'bought' ? "'2026-02-01'" : 'null'})`).join(',')};
      insert into mp_searches (id, household_id, profile_id, label, query, cadence, is_alert, sort_order, status) values
      ${searches.map((x) => `('${x.id}', '${hh}', ${q(x.profile_id)}, '${x.label}', '${x.query}', '${x.cadence}', ${x.is_alert}, ${x.sort_order}, '${x.status}')`).join(',')};`);

    const jsQueue = huntQueue(board(profiles, finds), state, '2026-02-10');
    const sqlQueue = rows(psql(`select key, queue_rank, mode, start_rank, waits_for_anchor, saving_vs_new, qty_outstanding
                                  from mp_hunt_queue where household_id = '${hh}' order by queue_rank;`));
    const line = (r) => [r.key, r.queue_rank, r.mode, r.start_rank, r.waits_for_anchor ? 't' : 'f',
      Number(r.saving_vs_new).toFixed(2), Number(r.qty_outstanding).toFixed(2)].join('|');
    const diffs = [];
    const n = Math.max(jsQueue.length, sqlQueue.length);
    for (let i = 0; i < n; i += 1) {
      const js = jsQueue[i] ? line(jsQueue[i]) : '(none)';
      const sql = sqlQueue[i] ? sqlQueue[i].join('|') : '(none)';
      if (js !== sql) diffs.push(`rank ${i + 1}: js ${js}, sql ${sql}`);
    }
    failures += report(`Marketplace hunt queue, house ${state}`, n, diffs, 'order, buy or watch, lead time and anchors');

    const jsAlerts = alertsToSet(jsQueue, searches).map((a) => `${a.label}|${a.slot ?? ''}|${a.action}`).sort();
    const sqlAlerts = rows(psql(`select label, coalesce(slot::text, ''), action from mp_alerts_to_set
                                  where household_id = '${hh}';`)).map((r) => r.join('|')).sort();
    const aDiffs = [];
    for (let i = 0; i < Math.max(jsAlerts.length, sqlAlerts.length); i += 1) {
      if (jsAlerts[i] !== sqlAlerts[i]) aDiffs.push(`js ${jsAlerts[i]}, sql ${sqlAlerts[i]}`);
    }
    failures += report(`Marketplace alert ration, house ${state}`, jsAlerts.length, aDiffs, 'the same ten, the same keep, set and retire');
  });
  return failures;
}

export function marketplaceParity(psql, HH) {
  const failures = bandParity(psql) + guardParity(psql) + gradeParity(psql, HH) + queueParity(psql);
  return { cases: 10, failures };
}
