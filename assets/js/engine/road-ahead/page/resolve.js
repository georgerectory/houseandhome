// resolve.js - from the loaded rows and the page's state to what the
// engine runs on.
//
// The command line's recipe (tools/road-ahead.mjs), so a figure on the
// page is the figure the CLI and the tests produce:
//
//   P    = buildParams(variables, the scenario's overrides, the what-ifs)
//   help = helpSettings(P)
//   runRoad(road, road.near, P, { works_factor, help, overrides: null }, help)
//
// The what-ifs go into buildParams rather than runRoad because three
// things are DERIVED there - the family stay's last month, the lender's
// income multiple and the market paths - and must follow a what-if
// exactly as they follow a scenario.
//
// The works share is the optimistic one. A scenario with its own works
// factor (Optimistic, Highly optimistic) applies it to the roads and the
// register alike, and the control moves that factor. Otherwise the roads
// price the works in full, as the kit did, and the control moves the
// register's optimistic share (appraisal.works_factor) alone.

import { buildParams, helpSettings, appraisalSettings, problems } from '../params.js';
import { addMonths, monthIndex } from '../money.js';
import { CONTROLS, stageDeposit } from './state.js';

/** variable key -> value, from the rows. */
export const valuesOf = (variables) => Object.fromEntries(variables.map((v) => [v.key, v.value]));

export const scenarioByKey = (scenarios, key) => scenarios.find((s) => s.key === key) ?? null;

/** The scenario the page opens on. */
export const defaultScenario = (scenarios) =>
  (scenarios.find((s) => s.is_default) ?? scenarios.find((s) => s.key === 'base') ?? scenarios[0])?.key ?? 'base';

/** The month of a road's first purchase: the first step that is not renting. */
const firstPurchase = (road) => road.stages.find((s) => s.kind !== 'rent')?.at ?? null;

/** The earliest first purchase across the roads: what the keys control moves. */
export function keysMonth(roads) {
  const at = roads.map(firstPurchase).filter(Boolean);
  return at.length ? at.reduce((a, b) => (monthIndex(b) < monthIndex(a) ? b : a)) : null;
}

/** The deposits the roads' stages of a kind carry: the commonest, and the spread. */
export function depositsOf(roads, kind) {
  const deps = roads.flatMap((r) => r.stages.filter((s) => s.kind === kind)).map(stageDeposit);
  if (!deps.length) return null;
  const counts = new Map();
  for (const d of deps) counts.set(d, (counts.get(d) ?? 0) + 1);
  const common = [...counts].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0][0];
  return { common, min: Math.min(...deps), max: Math.max(...deps) };
}

/** Each control's value before any what-if, under a scenario. */
export function currentValues(data, scenarioKey) {
  const sc = scenarioByKey(data.scenarios, scenarioKey);
  const P = buildParams(valuesOf(data.variables), sc?.overrides);
  const out = {};
  for (const c of CONTROLS) {
    let v = null;
    if (c.target.startsWith('var:')) v = P[c.target.slice(4)] ?? null;
    else if (c.target === 'works') v = sc?.works_factor ?? P['appraisal.works_factor'] ?? null;
    else if (c.target === 'keys') v = keysMonth(data.roads);
    else if (c.target === 'dep:buy') v = depositsOf(data.roads, 'buy')?.common ?? null;
    else if (c.target === 'dep:forever') v = depositsOf(data.roads, 'forever')?.common ?? null;
    if (v != null) out[c.id] = v;
  }
  return out;
}

/** The roads with the what-ifs that act on their steps applied. */
export function withStageWhatIfs(roads, values) {
  const keys = keysMonth(roads);
  const shift = values.keys && keys ? monthIndex(values.keys) - monthIndex(keys) : 0;
  return roads.map((r) => ({
    ...r,
    stages: r.stages.map((s) => {
      const t = { ...s };
      // Moving the keys moves every step after the renting with them, so
      // each road keeps its own stay and its own gaps.
      if (shift && s.kind !== 'rent') t.at = addMonths(s.at, shift);
      if (values.dep1 != null && s.kind === 'buy') t.dep = values.dep1;
      if (values.dep2 != null && s.kind === 'forever') t.dep = values.dep2;
      return t;
    }),
  }));
}

/**
 * Everything the engine runs on for one scenario and the page's what-ifs.
 * @param {{variables:object[], scenarios:object[], roads:object[]}} data
 * @param {string} scenarioKey
 * @param {Object<string,*>} [values] control id -> value
 */
export function resolve(data, scenarioKey, values = {}) {
  const sc = scenarioByKey(data.scenarios, scenarioKey)
    ?? { key: scenarioKey, name: scenarioKey, overrides: {}, works_factor: null, help: true };
  const whatIf = {};
  let worksFactor = sc.works_factor ?? null;
  for (const c of CONTROLS) {
    const v = values[c.id];
    if (v == null) continue;
    if (c.target.startsWith('var:')) whatIf[c.target.slice(4)] = v;
    else if (c.target === 'works') {
      if (worksFactor != null) worksFactor = v;
      else whatIf['appraisal.works_factor'] = v;
    }
  }
  const P = buildParams(valuesOf(data.variables), sc.overrides, whatIf);
  const help = helpSettings(P);
  const scenario = { works_factor: worksFactor, help: sc.help !== false, overrides: null };
  return {
    key: sc.key, row: sc, P, help, scenario, whatIf,
    V: appraisalSettings(P, { works_factor: worksFactor ?? undefined, help: sc.help !== false }),
    roads: withStageWhatIfs(data.roads, values),
    missing: [...new Set([...problems(P, 'roads'), ...problems(P, 'appraisal')])],
  };
}
