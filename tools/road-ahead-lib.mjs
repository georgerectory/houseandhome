// road-ahead-lib.mjs - the kit extract: its shape, its conversion from
// the kit's own objects, and its validation. Shared by the kit tool, the
// checksum gate and the command line, so all three read one format.
//
// The extract is PRIVATE. It holds salary, savings, the mortgage in
// principle and the owner's plans. It lives in data/road-ahead/, which
// is gitignored, and the secrets gate fails if it is ever tracked.

import { REGISTRY } from '../assets/js/engine/road-ahead/registry.js';
import { buildParams, problems } from '../assets/js/engine/road-ahead/params.js';

export const FORMAT = 'road-ahead-kit-extract/1';
// What road_ahead_export() returns: the extract without its raw data
// files (in Supabase those are rows) and with the monthly cash trace
// kept for the base run only.
export const EXPORT_FORMAT = 'road-ahead-export/1';

/** Labels as the kit writes them, onto one variable. */
function labelsOf(x) {
  if (!x || typeof x !== 'object' || Array.isArray(x)) {
    return { evidence: null, certainty: null, source: null, unit: null, low: null, high: null };
  }
  return {
    evidence: x.label ?? null, certainty: x.conf ?? null, source: x.source ?? null,
    unit: x.unit ?? null, low: x.low ?? null, high: x.high ?? null,
  };
}

const note = (meta, extra) => ({ ...meta, source: meta.source ? `${meta.source}; ${extra}` : extra });

/**
 * The owner's answer of 30 Sep 2026: what the owner STATED lands as
 * confirmed, dated to when it was said; VERIFIED is researched; an
 * ESTIMATE or a CHECK is drafted until the owner says otherwise.
 */
export const CONFIDENCE_OF = Object.freeze({ STATED: 'confirmed', VERIFIED: 'researched', ESTIMATE: 'drafted', CHECK: 'drafted' });

/**
 * Every kit input as a variable with its labels: assumptions.yaml as the
 * kit's own loader flattened it, then the v4/v5 layer the roads and the
 * register ran on, then the few inline literals.
 * @returns {{variables: Object<string, object>, superseded: Object<string, object>}}
 */
export function toVariables(dump) {
  const A = dump.assumptions;
  const asOf = String(A.meta?.as_of ?? '');
  const vars = {};
  const superseded = {};
  const put = (key, value, meta, when = asOf) => {
    const confidence = CONFIDENCE_OF[meta.evidence] ?? 'drafted';
    vars[key] = { value, ...meta, confidence, confirmed_at: confidence === 'confirmed' ? when : null, as_of: when };
  };

  for (const [group, items] of Object.entries(A)) {
    if (group === 'meta' || group === 'market' || typeof items !== 'object') continue;
    for (const [k, x] of Object.entries(items)) {
      const key = `${group}.${k}`;
      if (!(key in dump.P0)) continue;
      const meta = labelsOf(x);
      if (!meta.evidence) Object.assign(meta, { evidence: 'ESTIMATE', source: meta.source ?? `data/assumptions.yaml ${group}` });
      put(key, dump.P0[key], meta);
      // Sub-fields the loader lifts into keys of their own. They are
      // months: the parent's evidence and source carry over, its unit and
      // range (pounds) do not.
      const asMonth = { ...meta, unit: null, low: null, high: null };
      if (key === 'income.pay_rise_2027') put('income.pay_rise_month', dump.P0['income.pay_rise_month'], asMonth);
      if (key === 'costs.household_contribution') put('costs.contribution_from', dump.P0['costs.contribution_from'], asMonth);
    }
  }
  for (const [name, path] of Object.entries(A.market.scenarios)) {
    put(`market.${name}`, path, { ...labelsOf(null), evidence: 'ESTIMATE', source: A.market.source ?? 'data/assumptions.yaml market', unit: 'growth by year' });
  }

  // The lender multiple: the kit's roads replaced the assumed 5.15 with
  // the mortgage in principle divided by the salary it was based on.
  superseded['mortgage.house1_max_multiple'] = { ...vars['mortgage.house1_max_multiple'], why: 'replaced by the mortgage in principle (G-F09), from which it is derived' };
  delete vars['mortgage.house1_max_multiple'];
  const v4 = dump.roads_v4;
  const stated = (src) => ({ ...labelsOf(null), evidence: 'STATED', certainty: 'H', source: src });
  put('mortgage.mip_amount', v4.MIP.amount, { ...stated('G-F09; roads_v4.py BASE'), unit: '£' }, '2026-09-28');
  put('mortgage.mip_salary', v4.MIP.salary, { ...stated('G-F09; roads_v4.py BASE'), unit: '£/yr' }, '2026-09-28');
  for (const [k, v] of Object.entries(v4.BASE_overrides)) {
    if (k === 'mortgage.house1_max_multiple') continue;
    if (JSON.stringify(v) === JSON.stringify(vars[k]?.value)) vars[k] = note(vars[k], 'confirmed for the roads in roads_v4.py BASE, 28 Sep 2026');
    else put(k, v, stated('roads_v4.py BASE, 28 Sep 2026'), '2026-09-28');
  }

  const est = (src, unit = null) => ({ ...labelsOf(null), evidence: 'ESTIMATE', certainty: 'M', source: src, unit });
  for (const [side, h] of [['near', v4.HELP_NEAR], ['far', v4.HELP_FAR]]) {
    put(`help.${side}.cost`, h.cost, est('roads_v4.py HELP (P-07, 28 Sep 2026)', 'factor'), '2026-09-28');
    put(`help.${side}.time`, h.time, est('roads_v4.py HELP (P-07, 28 Sep 2026)', 'factor'), '2026-09-28');
  }
  put('fa.after_months', dump.roads_v3.FA_AFTER, est('roads_v3.py FA_AFTER', 'months'), '2026-09-28');

  const V = dump.register_v5.V;
  const fromV = { cash_jan27: 'appraisal.cash_at_purchase', reserve: 'appraisal.reserve', buy_costs: 'appraisal.buy_costs',
    sell_pct: 'appraisal.sell_pct', sell_fixed: 'appraisal.sell_fixed', target_profit: 'appraisal.target_profit',
    opt_works: 'appraisal.works_factor' };
  for (const [k, key] of Object.entries(fromV)) put(key, V[k], est(`register_v5.py V.${k}`), '2026-09-30');
  for (const k of Object.keys(V)) if (!(k in fromV)) superseded[`register_v5.V.${k}`] = { value: V[k], why: 'not read by any calculation in the kit' };

  for (const [key, value] of Object.entries(dump.inline.variables)) put(key, value, est('kit inline literal (see tools/road-ahead-kit.py)'), '2026-09-30');
  for (const [key, value] of Object.entries(dump.inline.doc_variables)) {
    const meta = key.startsWith('rules.') ? stated('docs/road_ahead/VARIABLES.md (decision log)') : est('docs/road_ahead/VARIABLES.md');
    put(key, value, meta, '2026-09-30');
  }
  return { variables: vars, superseded };
}

/** The kit's variants as scenario rows: overrides and road transforms, never code. */
export function toScenarios(dump) {
  const v4 = dump.roads_v4;
  const inl = dump.inline.scenarios;
  const OPT = dump.register_v5.OPT;
  const wf = dump.register_v5.V.opt_works;
  const hi = dump.data.listing_queue?.requested_scenario?.optimistic ?? {};
  return {
    base: { name: 'Base', overrides: {} },
    promotion: { name: 'Promotion', overrides: v4.PROMO },
    job_change: { name: 'Job change', overrides: v4.DOWN },
    family_longer: { name: 'Family stay longer', overrides: inl.family_longer },
    bad_luck: { name: 'Bad luck', overrides: inl.bad_luck },
    no_child: { name: 'No child costs', overrides: inl.no_child },
    no_help: { name: 'No local help', overrides: {}, help: false },
    optimistic: { name: 'Optimistic', overrides: OPT, works_factor: wf },
    optimistic_promotion: { name: 'Optimistic with promotion', overrides: { ...OPT, ...v4.PROMO }, works_factor: wf },
    highly_optimistic: {
      name: 'Highly optimistic',
      overrides: { 'costs.family_cost': hi.child_cost_per_month }, works_factor: hi.works_rate_multiplier,
    },
    career: { name: 'Career path (retired roads)', overrides: dump.roads_v3.CAREER, status: 'retired' },
    route_kit: {
      name: 'Route model as the kit ran it', status: 'frozen',
      overrides: { 'mortgage.house1_max_multiple': dump.P0['mortgage.house1_max_multiple'] },
    },
  };
}

/** Active roads (GE, H1-H4) and the retired v3 roads. */
export function toRoads(dump) {
  const v4 = dump.roads_v4;
  const active = Object.entries(v4.ROADS).map(([code, r]) => ({
    code, name: r.name, rank: r.rank, near: v4.NEAR[code], status: 'active', stages: r.stages,
  }));
  const retired = Object.entries(dump.roads_v3.ROADS).map(([id, r]) => ({
    code: `V3-${id}`, name: r.name, family: r.family, career: r.career ?? false, status: 'retired', stages: r.stages,
  }));
  return { active, retired, keys_month: dump.roads_v3.K27 };
}

/** Register rows as listings L01 to L25, the kit's P-number kept. */
export function toRegister(dump) {
  return dump.register_v5.rows.map((r) => ({
    code: `L${r.kit_ref.slice(1)}`, ...r, override_grade: dump.inline.overrides[r.kit_ref] ?? null,
  }));
}

/** The parameter values alone, for buildParams(). */
export const valuesOf = (variables) => Object.fromEntries(Object.entries(variables).map(([k, v]) => [k, v.value]));

/**
 * Everything wrong with an extract. Empty means the engine can run every
 * part of it.
 */
export function validateExtract(x) {
  const out = [];
  if (x?.format !== FORMAT && x?.format !== EXPORT_FORMAT) return [`not a Road Ahead kit extract (format ${x?.format})`];
  for (const k of ['kit', 'variables', 'scenarios', 'roads', 'register', 'results', ...(x.format === FORMAT ? ['data'] : [])]) {
    if (!x[k]) out.push(`missing ${k}`);
  }
  if (out.length) return out;
  const P = buildParams(valuesOf(x.variables));
  for (const part of ['roads', 'route', 'appraisal']) out.push(...problems(P, part).map((p) => `${part}: ${p}`));
  for (const [k, v] of Object.entries(x.variables)) {
    if (!v.evidence) out.push(`${k} has no evidence label`);
  }
  const unknown = REGISTRY.filter((r) => !(r.key in x.variables) && r.key !== 'mortgage.house1_max_multiple');
  for (const r of unknown) out.push(`${r.key} is in the registry but not in the extract`);
  return out;
}

// ---------------------------------------------------------------
// The privacy guard's markers: the owner's names, home village, salary
// and mortgage in principle. Read from the private extract at check
// time and never written anywhere: a hash of a salary would be
// reversible in a second by trying every number, so no list of these
// is kept in this public repository, hashed or otherwise.
// ---------------------------------------------------------------

/**
 * Distinctive private values, as the patterns that would find them in text.
 * @returns {{numbers: RegExp[], words: RegExp[]}}
 */
export function privateMarkers(x) {
  const numbers = ['income.gross_salary_now', 'mortgage.mip_amount']
    .map((k) => x.variables?.[k]?.value)
    .filter((n) => Number.isInteger(n) && n >= 10000);
  // The surname: the rest of the repository calls the owner "the owner".
  const words = String(x.assumptions?.meta?.owner ?? '').split(/\s+/).filter((w) => w.length > 2).slice(-1);
  // The home village is the place the forever-home radius is measured from.
  const text = JSON.stringify([x.data?.decisions, x.data?.preferences]);
  const places = {};
  for (const m of text.matchAll(/minutes? (?:of|from) ([A-Z][a-z]+)/g)) places[m[1]] = (places[m[1]] ?? 0) + 1;
  const home = Object.entries(places).sort((a, b) => b[1] - a[1])[0]?.[0];
  if (home) words.push(home);
  const nums = [];
  for (const n of numbers) {
    const grouped = n.toLocaleString('en-GB');
    nums.push(new RegExp(`(?<![\\d.,])(?:${n}|${grouped})(?!\\d|[.,]\\d)`));
    if (n % 1000 === 0) nums.push(new RegExp(`(?<![\\d.])${n / 1000}k\\b`, 'i'));
  }
  return { numbers: nums, words: words.map((w) => new RegExp(`\\b${w}\\b`, 'i')) };
}
