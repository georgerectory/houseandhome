// road-fixture/record.mjs - the demo's record: decisions, the owner's
// words, logged changes, open questions, the figures to confirm first,
// judgements due a second look, and each road's last accepted run. Part
// of tools/build-road-fixture.mjs. Every word is invented; the figures to
// confirm and the accepted runs are the engine's own answers on the
// invented inputs, so the demo shows what the engine would say.
//
// One story runs through it, as it would live: the invented take-home
// pay was raised after the runs were accepted, the change is logged with
// its reason, and Calibration shows what it moved.

import { buildParams, helpSettings } from '../../assets/js/engine/road-ahead/params.js';
import { runRoad, headline } from '../../assets/js/engine/road-ahead/roads.js';
import { sensitivity, rangesOf, combinedAgenda, foreverBudget } from '../../assets/js/engine/road-ahead/sensitivity.js';

// How much the invented take-home rose after the runs were accepted.
const PAY_RISE = 150;
const ACCEPTED_AT = '2026-09-20T12:00:00+00:00';
const DAY = 86400000;
const daysBefore = (iso, n) => new Date(Date.parse(`${iso}T00:00:00Z`) - n * DAY).toISOString().slice(0, 10);

/**
 * @param {{variables:object[], scenarios:object[], roads:object[], register:object[], ON:string, INVENTED:string}} demo
 */
export function recordParts({ variables, scenarios, roads, register, ON, INVENTED }) {
  const values = Object.fromEntries(variables.map((v) => [v.key, v.value]));
  const byKey = new Map(variables.map((v) => [v.key, v]));

  // --- Decisions: one open question, one leaning, one replaced ---------
  const decision = (code, topic, title, decided, firmness, extra = {}) => ({
    code, topic, title, decided, rationale: null, firmness, door: 'two-way', evidence: 'STATED', certainty: 'M',
    reopen_if: null, checkpoint: null, source: INVENTED, decided_on: '2026-09-20', status: 'active',
    is_current: true, supersedes: [], superseded_by: [], ...extra,
  });
  const decisions = [
    decision('D-00', 'Money', 'What deposit goes down on House 1?', '5%', 'locked',
      { is_current: false, superseded_by: ['D-01'], decided_on: '2026-08-02' }),
    decision('D-01', 'Money', 'What deposit goes down on House 1?', '10%, with the rest kept for the works', 'locked',
      { rationale: 'A lower rate, and still six months of works in hand', supersedes: ['D-00'], door: 'one-way', certainty: 'H' }),
    decision('D-02', 'Money', 'How much cash is kept back at all times?', '£5,000', 'lean',
      { reopen_if: 'The works run over by a month' }),
    decision('D-03', 'Where', 'How far from home can House 1 be?', 'Within 75 minutes', 'locked',
      { reopen_if: 'A job move' }),
    decision('D-04', 'Where', 'Is a village better than a town?', null, 'open',
      { decided_on: null, evidence: null, rationale: 'Waiting on two viewings' }),
    decision('D-05', 'Timing', 'When does the family stay end?', 'December, then renting', 'locked',
      { checkpoint: 'CP1' }),
    decision('D-06', 'Model', 'Split the works into materials and labour?', 'Not yet: one figure is enough for now',
      'lean', { evidence: 'ESTIMATE' }),
    decision('D-07', 'Process', 'Who bids in the room?', null, 'open', { decided_on: null, evidence: null }),
  ];

  // --- The owner's words ----------------------------------------------
  const word = (code, kind, words, extra = {}) => ({
    code, kind, words, context: null, implies: null, open_question: null, conflicts: [], certainty: 'M',
    rating: null, said_on: '2026-09-18', source: INVENTED, links: [], is_reflected: false, ...extra,
  });
  const signals = [
    word('S-01', 'signal', 'I would rather a smaller house in a village than a big one in a town.',
      { implies: 'Village listings first', open_question: 'How small is too small?', said_on: '2026-09-25' }),
    word('S-02', 'signal', 'Nothing more than an hour and a quarter away: I want to work on it after work.',
      { implies: 'The distance rule for House 1', said_on: '2026-09-12', is_reflected: true,
        links: [{ type: 'ra_variable', code: 'rules.house1_max_minutes', reads: 'Affects' }] }),
    word('S-03', 'signal', 'A garden matters more to me than a fourth bedroom.',
      { implies: 'The plot in every road\'s fit', said_on: '2026-09-28' }),
    word('PT-1', 'pattern', 'Every house liked so far has had a view at the back.',
      { implies: 'Outlook belongs in the fit' }),
    word('R1-01', 'reaction', 'Loved the forge; worried about the road outside.',
      { context: 'The Old Forge, Fernwick', rating: 'Liked', links: [{ type: 'listing', code: 'L03', reads: 'About' }] }),
    word('R1-02', 'reaction', 'Too far, and the kitchen is a gut job.',
      { context: 'Ivy Lodge, Netherfold', rating: 'Unsure', links: [{ type: 'listing', code: 'L05', reads: 'About' }] }),
  ];

  // --- Logged changes, newest first -----------------------------------
  const pay = byKey.get('income.net_pay_now');
  const change = (entity_type, code, label, field, was, now, why, changed_at) => ({
    entity_type, code, label, field, old_value: was, new_value: now, why, source: INVENTED, changed_at,
  });
  const changes = [
    change('ra_variables', pay.key, pay.label, 'value', String(pay.value - PAY_RISE), String(pay.value),
      'The take-home pay was confirmed higher than first thought', '2026-09-29T18:00:00+00:00'),
    change('ra_scenarios', 'promotion', 'Promotion', 'overrides', '{"income.pay_rise_2027": 5000}',
      '{"income.pay_rise_2027": 6000}', 'The promotion letter named a figure', '2026-09-27T09:30:00+00:00'),
    change('ra_listings', 'L08', 'Rowan Cottage, Kestlecombe', 'status', 'watch', 'dropped',
      'Already done: nothing left to add', '2026-09-24T16:00:00+00:00'),
    change('ra_variables', 'mortgage.stress_rate', byKey.get('mortgage.stress_rate').label, 'confidence', 'drafted',
      'researched', 'Checked against two lenders\' published rates', '2026-09-22T11:00:00+00:00'),
  ];
  if (!scenarios.some((s) => s.key === 'promotion')) throw new Error('the demo record names a promotion scenario');

  // --- Open questions --------------------------------------------------
  const contradictions = [
    { key: 'demo-cash', topic: 'Cash at the start', source_a: 'The model',
      position_a: 'Starts from the savings figure set in September', source_b: 'Your accounts',
      position_b: 'Hold a little less, as of mid-September', what_it_changes: 'Every road\'s low point, and the cash left after buying',
      value_at_stake: 1150, created_at: '2026-09-29T09:00:00+00:00' },
    { key: 'demo-rent', topic: 'Renting', source_a: 'The plan', position_a: 'Four months of renting before the keys',
      source_b: 'A letting agent', position_b: 'Six months is the shortest tenancy offered',
      what_it_changes: 'Two months more rent on every road', value_at_stake: 2600, created_at: '2026-09-30T09:00:00+00:00' },
  ];

  // --- What to confirm first: the engine's own agenda -------------------
  // Each input swung across its range, on every road's forever budget, as
  // `node tools/road-ahead.mjs agenda` does and ra_calibration_agenda reads.
  const ranges = rangesOf(Object.fromEntries(variables.map((v) => [v.key, v])));
  const labels = Object.fromEntries(variables.map((v) => [v.key, { confidence: v.confidence, evidence: v.evidence }]));
  const snapshots = roads.map((r) => ({ output: `${r.code} forever budget`, rows: sensitivity(foreverBudget(r, r.near), values, ranges) }));
  const calibrate = combinedAgenda(snapshots, labels, { top: 8 }).map((a, i) => ({
    variable_key: a.key, label: byKey.get(a.key)?.label ?? null, score: Math.round(a.score), swing: Math.round(a.swing),
    moves: a.moves, evidence: a.evidence, confidence: a.confidence, place: i + 1,
  }));

  // --- Judgements due a second look: ra_judgements_to_revisit's rule ----
  const revisit = register.flatMap((r) => (r.judgements ?? []).map((j) => {
    const since = [r.appraised_on, r.write_up_on].filter((d) => d && d > j.said_on).sort().pop() ?? null;
    const old = j.said_on < daysBefore(ON, 90);
    return old || since ? { listing_code: r.code, listing_name: r.name, field: j.field, value: j.value, reason: j.reason,
      kind: j.kind, said_on: j.said_on, is_old: old, appraised_since: since } : null;
  })).filter(Boolean).sort((a, b) => a.said_on.localeCompare(b.said_on));

  // --- Each road's accepted run, from before the pay rose ---------------
  const before = buildParams({ ...values, [pay.key]: pay.value - PAY_RISE });
  const help = helpSettings(before);
  const runs = roads.map((road) => {
    const h = headline(runRoad(road, road.near, before, { works_factor: null, help: true, overrides: null }, help));
    return {
      scenario_key: 'base', road_code: road.code, run_name: 'main', source: 'engine',
      summary: { forever_today: h.forever_today, forever_price: h.forever_price, forever_when: h.forever_when,
        min_cash: h.min_cash, min_cash_when: h.min_cash_when, fa_used: h.fa_used, works_done: h.works_done,
        works_left: h.works_left, profits: h.profits },
      accepted_at: ACCEPTED_AT, accepted_note: 'The figures as first agreed', was_forever_today: null, was_accepted_at: null,
    };
  });

  return { decisions, signals, changes, contradictions, calibrate, revisit, runs };
}
