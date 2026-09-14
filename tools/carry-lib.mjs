// carry-lib.mjs - the carry-over blob: its shape, its checksum, and the
// SQL that loads it. Pure functions, no filesystem and no network, so
// every rule below is unit-tested rather than discovered during a
// migration nobody wants to run twice.
//
// WHY A FILE AT ALL. The figures being carried live in a Supabase
// project under one account; this system is under another. A session can
// be authenticated to one account at a time, so the two databases can
// never be open at once and the data has to cross as a file.
//
// That shapes everything here:
//
//   The extract is READ-ONLY. The source system is not ours to modify,
//   and the protocol it was built under forbids writing to it at all.
//
//   The load is IDEMPOTENT. An extract may be re-run and a load may be
//   interrupted; neither may leave a second copy of a line. The natural
//   key is (system, group, source_ref).
//
//   The blob is CHECKSUMMED. A file that crosses between sessions can be
//   truncated, half-written or edited. A load against a blob whose
//   contents do not match its own checksum is refused.
//
//   Nothing it carries is TRUE. Every row lands unreviewed and drives no
//   total, projection or allocation until a person confirms it.

import { createHash } from 'node:crypto';

export const FORMAT = 'houseandhome.carry/1';

/** The groups a blob may carry, and what each becomes once reviewed.
 *  A group not on this list is refused rather than loaded into a table
 *  nobody has decided the meaning of. */
export const GROUPS = {
  shopping_list: 'Things once listed to buy. Becomes purchase work_items.',
  one_time_costs: 'One-off setup costs. Becomes work_items or spend_events.',
  ongoing_bills: 'Recurring bills. Becomes bills.',
  subscriptions: 'Recurring subscriptions. Becomes subscriptions.',
  expenses: 'Recorded spending. Becomes spend_events.',
  gift_cards: 'Gift card balances. Reviewed, then held or dismissed.',
  savings: 'Savings positions. Informs the pot, never sets it.',
  investments_history: 'Monthly investment history. Reference only.',
  debts: 'Debt balances. Informs affordability, never sets it.',
};

export const isKnownGroup = (g) => Object.hasOwn(GROUPS, g);

/**
 * Canonical JSON: object keys sorted at every depth, no incidental
 * whitespace. Two extracts of the same data must produce the same bytes
 * and therefore the same checksum, and JavaScript's key order is an
 * accident of insertion rather than a promise.
 */
export function canonical(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value ?? null);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`;
}

/** The checksum covers the GROUPS only - the payload. Metadata around it
 *  (a note, the capture time) can be corrected without invalidating a
 *  file whose data has not changed. */
export const checksum = (groups) =>
  `sha256:${createHash('sha256').update(canonical(groups)).digest('hex')}`;

const isPlainObject = (v) => !!v && typeof v === 'object' && !Array.isArray(v);

/**
 * Check a blob before anything touches a database.
 *
 * Returns { ok, errors, warnings, counts, total, checksum }. Errors
 * block a load; warnings do not, because a group that happens to be
 * empty in the source is a fact about the source, not a fault in the
 * file.
 */
export function validateBlob(blob) {
  const errors = [];
  const warnings = [];

  if (!isPlainObject(blob)) {
    return { ok: false, errors: ['The file is not a JSON object.'], warnings, counts: {}, total: 0 };
  }
  if (blob.format !== FORMAT) {
    errors.push(`format must be "${FORMAT}", found ${JSON.stringify(blob.format ?? null)}.`);
  }
  for (const field of ['source_system', 'captured_at']) {
    if (!blob[field] || typeof blob[field] !== 'string') {
      errors.push(`${field} is required and must be a string.`);
    }
  }
  if (blob.captured_at && Number.isNaN(Date.parse(blob.captured_at))) {
    errors.push('captured_at is not a readable timestamp.');
  }
  if (!isPlainObject(blob.groups)) {
    errors.push('groups must be an object of group name to rows.');
    return { ok: false, errors, warnings, counts: {}, total: 0 };
  }

  const counts = {};
  let total = 0;
  for (const [group, rows] of Object.entries(blob.groups)) {
    if (!isKnownGroup(group)) {
      errors.push(`Unknown group "${group}". Known groups: ${Object.keys(GROUPS).join(', ')}.`);
      continue;
    }
    if (!Array.isArray(rows)) {
      errors.push(`Group "${group}" must be an array.`);
      continue;
    }
    counts[group] = rows.length;
    total += rows.length;
    if (!rows.length) warnings.push(`Group "${group}" is empty.`);

    const seen = new Set();
    rows.forEach((row, i) => {
      const at = `${group}[${i}]`;
      if (!isPlainObject(row)) { errors.push(`${at} is not an object.`); return; }
      if (!row.source_ref || typeof row.source_ref !== 'string') {
        errors.push(`${at} needs a string source_ref - it is what makes a re-load safe.`);
      } else if (seen.has(row.source_ref)) {
        // Two rows sharing a key would silently collapse into one on
        // load, and the count would look right.
        errors.push(`${at} repeats source_ref "${row.source_ref}" within its group.`);
      } else {
        seen.add(row.source_ref);
      }
      if (!row.label || typeof row.label !== 'string') {
        errors.push(`${at} needs a label a person can recognise.`);
      }
      if (row.amount != null && typeof row.amount !== 'number') {
        errors.push(`${at} amount must be a number or null, not ${typeof row.amount}.`);
      }
      if (row.amount != null && !Number.isFinite(row.amount)) {
        errors.push(`${at} amount is not a finite number.`);
      }
      if (row.raw != null && !isPlainObject(row.raw)) {
        errors.push(`${at} raw must be an object - it holds the original row verbatim.`);
      }
    });
  }

  if (!total) errors.push('The file carries no rows at all.');

  const sum = checksum(blob.groups);
  if (blob.checksum && blob.checksum !== sum) {
    errors.push(`Checksum does not match the contents: the file says ${blob.checksum}, the data is ${sum}. `
      + 'The file was edited or truncated after it was written.');
  }
  if (!blob.checksum) warnings.push('The file carries no checksum, so truncation cannot be detected.');

  return { ok: errors.length === 0, errors, warnings, counts, total, checksum: sum };
}

/** Flatten a blob to the rows carried_finance stores. `raw` keeps the
 *  source row verbatim, because the point of an archive is that nothing
 *  was thrown away on the way in. */
export function toRows(blob) {
  const out = [];
  for (const [group, rows] of Object.entries(blob.groups ?? {})) {
    for (const row of rows) {
      out.push({
        source_group: group,
        source_ref: row.source_ref,
        label: row.label,
        amount: row.amount ?? null,
        cadence: row.cadence ?? null,
        raw: row.raw ?? {},
      });
    }
  }
  return out;
}

/** A dollar-quote tag that cannot appear inside the payload, so the JSON
 *  needs no escaping and a stray quote in someone's bill description
 *  cannot break the statement. */
export function dollarTag(payload) {
  for (let n = 0; ; n += 1) {
    const tag = n ? `$carry${n}$` : '$carry$';
    if (!payload.includes(tag)) return tag;
  }
}

/**
 * The load statement.
 *
 * One INSERT, fed by the JSON itself rather than by generated literals:
 * nothing is string-concatenated into SQL, so no value in the payload
 * can change the shape of the statement.
 *
 * ON CONFLICT updates in place, which is what makes a re-run safe. It
 * deliberately does NOT touch review_status, reviewed_at or
 * superseded_note: if a line has already been reviewed, re-importing the
 * source must not quietly mark it unreviewed again and drag it back into
 * a list the owner has already dealt with.
 */
export function loadSql(blob, householdId, batchId) {
  const rows = toRows(blob);
  const payload = JSON.stringify(rows);
  const tag = dollarTag(payload);
  return `-- Carried-over figures from ${blob.source_system}, captured ${blob.captured_at}.
-- ${rows.length} rows. Every one lands unreviewed and drives nothing.
insert into public.carried_finance
  (household_id, source_system, source_group, source_ref, label, amount,
   cadence, raw, captured_at, batch_id, review_status)
select '${householdId}'::uuid,
       '${blob.source_system}',
       t.source_group, t.source_ref, t.label, t.amount, t.cadence, t.raw,
       '${blob.captured_at}'::timestamptz,
       '${batchId}'::uuid,
       'pending'
  from jsonb_to_recordset(${tag}${payload}${tag}::jsonb)
    as t(source_group text, source_ref text, label text, amount numeric,
         cadence text, raw jsonb)
on conflict (household_id, source_system, source_group, source_ref)
do update set label       = excluded.label,
              amount      = excluded.amount,
              cadence     = excluded.cadence,
              raw         = excluded.raw,
              captured_at = excluded.captured_at,
              batch_id    = excluded.batch_id;`;
}

/** What to run after a load to prove it did what it said. Counts per
 *  group, so they can be compared against the blob's own counts. */
export function verifySql(blob, batchId) {
  return `-- Compare these counts against the blob: ${JSON.stringify(
    Object.fromEntries(Object.entries(blob.groups ?? {}).map(([g, r]) => [g, r.length])))}
select source_group, count(*) as rows, count(*) filter (where batch_id = '${batchId}'::uuid) as this_batch,
       count(*) filter (where review_status = 'pending') as still_unreviewed
  from public.carried_finance
 where source_system = '${blob.source_system}'
 group by source_group order by source_group;`;
}

/** A uuid without pulling in a dependency. Node has randomUUID; this is
 *  only here so the tool runs on anything. */
export const newBatchId = () =>
  (globalThis.crypto?.randomUUID?.() ?? createHash('sha256')
    .update(String(Date.now() + Math.random())).digest('hex')
    .replace(/^(.{8})(.{4})(.{3})(.{3})(.{12}).*$/, '$1-$2-4$3-a$4-$5'));
