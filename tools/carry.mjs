#!/usr/bin/env node
// carry.mjs - move carried-over figures between two Supabase accounts
// that can never be open at the same time.
//
//   node tools/carry.mjs plan            what to run while connected to the SOURCE
//   node tools/carry.mjs check <file>    validate a blob without touching anything
//   node tools/carry.mjs seal <file>     recompute and write the checksum
//   node tools/carry.mjs load <file>     print the SQL to run against THIS database
//
// Nothing here connects to a database. It prints SQL for a person or an
// MCP session to run, and validates the file that crosses between them.
// That is deliberate: the two halves happen in different sessions,
// against different accounts, and a tool that pretended otherwise would
// be lying about where the risk is.

import { readFileSync, writeFileSync } from 'node:fs';
import {
  FORMAT, GROUPS, validateBlob, checksum, loadSql, verifySql, newBatchId,
} from './carry-lib.mjs';

const [cmd, file, arg3] = process.argv.slice(2);

const die = (msg) => { console.error(msg); process.exit(1); };

/**
 * Phase one. Strictly SELECT.
 *
 * The source system is not ours to change, and the agreement it was read
 * under is that nothing writes to it, ever. Every statement below is a
 * read; there is no migration, no temp table and no function to install.
 */
function plan() {
  console.log(`CARRY-OVER, PHASE ONE: EXTRACT (connector pointed at the SOURCE account)

Everything below is a SELECT. Nothing writes to the source database, and
nothing is installed in it. If a step here asks you to create, alter,
insert, update or delete anything in the source, it is wrong - stop.

1. Confirm which project you are on before reading a single row:

     select current_database(), current_setting('server_version');

2. List what is actually there, so the extract is driven by the schema
   rather than by memory of it:

     select table_name, column_name, data_type
       from information_schema.columns
      where table_schema = 'public'
      order by table_name, ordinal_position;

3. For each group below, read the rows and shape them into the blob.
   A group that does not exist in the source is simply omitted - an
   absent group is honest, an empty invented one is not.

${Object.entries(GROUPS).map(([g, why]) => `     ${g.padEnd(21)} ${why}`).join('\n')}

   Every row needs, at minimum:

     source_ref   its identity in the source (a primary key, or a
                  stable natural key). This is what makes a re-run
                  safe rather than duplicating everything.
     label        what a person would call it
     amount       a number, or null if it genuinely has none
     cadence      monthly / annual / one_off / null
     raw          the ORIGINAL row, verbatim, so nothing is lost on
                  the way in

4. Write the file to data/carried/ - which is gitignored, because this
   repository is public and these figures are not:

     {
       "format": "${FORMAT}",
       "source_system": "rec",
       "source_project_ref": "<the project ref you read>",
       "captured_at": "<ISO timestamp>",
       "note": "Read-only extract. Unverified and stale by construction.",
       "groups": { "ongoing_bills": [ ... ], ... }
     }

5. Seal and check it before the connector moves:

     node tools/carry.mjs seal data/carried/<file>.json
     node tools/carry.mjs check data/carried/<file>.json

   Do this while still connected to the source. If the file is wrong,
   that is the only moment you can cheaply go back and re-read.

PHASE TWO happens after the connector is switched back to this account:

     node tools/carry.mjs load data/carried/<file>.json <household-uuid>

   which prints the load SQL and the verification query to run after it.`);
}

function read(path) {
  if (!path) die('Give the path to a carried-over blob.');
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (err) {
    die(`Could not read ${path}: ${err.message}`);
    return null;
  }
}

function report(result) {
  for (const w of result.warnings) console.log(`  warn  ${w}`);
  for (const e of result.errors) console.log(`  FAIL  ${e}`);
  console.log('');
  console.log(`  rows: ${result.total}`);
  for (const [g, n] of Object.entries(result.counts)) console.log(`    ${g.padEnd(21)} ${n}`);
  console.log(`  checksum: ${result.checksum}`);
}

function check(path) {
  const blob = read(path);
  const result = validateBlob(blob);
  console.log(`Checking ${path}`);
  report(result);
  console.log('');
  if (!result.ok) die('This file is NOT safe to load. Fix the failures above, or re-extract.');
  console.log('Valid. Nothing in it is confirmed, and loading it changes no total.');
}

function seal(path) {
  const blob = read(path);
  if (!blob?.groups) die('The file has no groups to checksum.');
  blob.checksum = checksum(blob.groups);
  writeFileSync(path, `${JSON.stringify(blob, null, 2)}\n`);
  console.log(`Sealed ${path}\n  checksum: ${blob.checksum}`);
}

function load(path, householdId) {
  if (!householdId) {
    die('Give the household uuid to load into:\n'
      + '  node tools/carry.mjs load <file> <household-uuid>\n\n'
      + 'Find it with:  select id, name from public.households;');
  }
  const blob = read(path);
  const result = validateBlob(blob);
  if (!result.ok) {
    report(result);
    die('\nRefusing to emit SQL for a file that does not validate.');
  }
  const batchId = newBatchId();
  console.log(`-- ${result.total} rows, checksum ${result.checksum}`);
  console.log(`-- Batch ${batchId}\n`);
  console.log(loadSql(blob, householdId, batchId));
  console.log('\n-- Then verify, and compare against the counts above:\n');
  console.log(verifySql(blob, batchId));
}

switch (cmd) {
  case 'plan': plan(); break;
  case 'check': check(file); break;
  case 'seal': seal(file); break;
  case 'load': load(file, arg3); break;
  default:
    console.log('Usage: node tools/carry.mjs <plan|check|seal|load> [file] [household-uuid]');
    process.exit(cmd ? 1 : 0);
}
