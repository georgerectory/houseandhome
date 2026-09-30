// road-ahead-sql.mjs - what the engine works out, as SQL for the connector.
//
// A session holds no database password: the command line computes, and
// the Supabase connector writes. So results leave the engine as SQL files
// in data/road-ahead/out/ (gitignored: they carry the owner's figures),
// run through the connector exactly as the seed is. The literal helpers
// here are the seed's too, so both write values the same way.

export const lit = (v) => (v == null ? 'null' : `'${String(v).replace(/'/g, "''")}'`);
export const num = (v) => (v == null || v === '' || !Number.isFinite(Number(v)) ? 'null' : String(Number(v)));
export const bool = (v) => (v == null ? 'null' : v ? 'true' : 'false');
export const js = (v) => (v == null ? 'null' : `${lit(JSON.stringify(v))}::jsonb`);
export const arr = (xs) => (xs && xs.length ? `array[${xs.map(lit).join(', ')}]::text[]` : `'{}'::text[]`);
export const day = (d) => (d ? `${lit(d)}::date` : 'null');

const uuid = (hh) => {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(hh ?? '')) throw new Error(`not a household id: ${hh}`);
  return `'${hh}'::uuid`;
};

/**
 * One sensitivity snapshot: every finite swing of every answer, in one
 * statement, so the rows share their run_at and the calibration queue
 * reads them as one snapshot.
 * @param {string} household
 * @param {Array<{output:string, rows:Array<{key:string, low:*, high:*, at_low:number|null, at_high:number|null, swing:number}>}>} snapshots
 * @param {string} engineVersion
 * @param {string} [scenario]
 * @returns {{sql:string, rows:number, skipped:string[]}}
 */
export function sensitivitySql(household, snapshots, engineVersion, scenario = 'base') {
  const values = [];
  const skipped = [];
  for (const { output, rows } of snapshots) {
    for (const r of rows) {
      if (!Number.isFinite(r.swing)) { skipped.push(`${output}: ${r.key} leaves no answer at one end of its range`); continue; }
      if (r.swing <= 0) continue;
      values.push(`  (${uuid(household)}, ${lit(scenario)}, ${lit(output)}, ${lit(r.key)}, ${js(r.low)}, ${js(r.high)}, `
        + `${num(r.at_low)}, ${num(r.at_high)}, ${num(r.swing)}, ${lit(engineVersion)})`);
    }
  }
  const sql = values.length ? `insert into public.ra_sensitivity (household_id, scenario_key, output, variable_key, low, high,
  at_low, at_high, swing, engine_version) values
${values.join(',\n')};\n` : '';
  return { sql, rows: values.length, skipped };
}

/**
 * Accepted road results as the new baseline (source 'engine'). The note
 * is the owner's acceptance in their own words, and is required.
 * @param {string} household
 * @param {Array<{road_code:string, scenario_key:string, run_name?:string, summary:object, inputs_hash?:string}>} runs
 * @param {string} engineVersion
 * @param {string} note
 */
export function runsSql(household, runs, engineVersion, note) {
  if (!note || !String(note).trim()) throw new Error('an accepted run needs the owner\'s words: --note "..."');
  if (!runs.length) return '';
  return `insert into public.ra_road_runs (household_id, scenario_key, road_code, run_name, source, engine_version,
  inputs_hash, summary, accepted_note) values
${runs.map((r) => `  (${uuid(household)}, ${lit(r.scenario_key)}, ${lit(r.road_code)}, ${lit(r.run_name ?? 'main')}, 'engine', `
    + `${lit(engineVersion)}, ${lit(r.inputs_hash ?? null)}, ${js(r.summary)}, ${lit(note)})`).join(',\n')};\n`;
}
