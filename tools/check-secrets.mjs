// check-secrets.mjs - the rail that keeps private data out of a public
// repository.
//
// This repository is public. Two kinds of thing must never be committed
// to it, and neither is caught by the front-end lint:
//
//   1. Carried-over financial extracts. These are real figures from
//      another system, crossing as a file because two Supabase accounts
//      cannot be connected at once. They are gitignored - but a
//      gitignore is a default, not a guarantee: `git add -f` overrides
//      it, and so does a rule someone edits later.
//
//   2. The service_role key, which bypasses row-level security entirely.
//      The publishable key is safe to commit and is; that one is not.
//
// This checks what git ACTUALLY TRACKS, not what is on disk, because the
// question is only ever "could this be pushed".

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { privateMarkers } from './road-ahead-lib.mjs';

const failures = [];

function tracked() {
  try {
    return execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' })
      .split('\0').filter(Boolean);
  } catch {
    // Not a git checkout: nothing can be pushed from here.
    return null;
  }
}

const files = tracked();

if (files === null) {
  console.log('Secrets: not a git checkout, nothing to check.');
} else {
  // 1. Carried-over blobs, and Road Ahead's kit extract and exports.
  const blobs = files.filter((f) => /^data\/(carried|road-ahead)\/.+/.test(f) && !f.endsWith('README.md'));
  for (const f of blobs) {
    failures.push(`${f} is TRACKED BY GIT. Extracts are private and this repository is public.\n`
      + `     Remove it with: git rm --cached "${f}"`);
  }

  // 3. The owner's names, home village, salary and mortgage in principle,
  //    checked wherever the private kit extract is present - which is
  //    exactly where they could leak from. The values are read from it
  //    at check time; nothing here names them.
  //    One file is spared the NUMBER markers only: the golden master is
  //    generated from invented inputs by tools/road-ahead-golden.py (which
  //    is itself checked), and its prices are found by stepping down a
  //    thousand at a time, so a round number there matching one of the
  //    owner's is chance, not a leak. Names and places still apply to it.
  const EXTRACT = 'data/road-ahead/kit-extract.json';
  const INVENTED = new Set(['tests/fixtures/road-ahead-golden.json']);
  if (existsSync(EXTRACT)) {
    let markers = { numbers: [], words: [] };
    try { markers = privateMarkers(JSON.parse(readFileSync(EXTRACT, 'utf8'))); } catch { /* an unreadable extract is the checksum gate's to report */ }
    for (const f of files) {
      let src;
      try { src = readFileSync(f, 'utf8'); } catch { continue; }
      if (src.includes('\0')) continue;
      const apply = INVENTED.has(f) ? markers.words : [...markers.numbers, ...markers.words];
      const hits = apply.filter((re) => re.test(src)).length;
      if (hits) failures.push(`${f} contains ${hits} of the owner's private markers (names, home village, salary or mortgage in principle).`);
    }
  }

  // 2. Anything that looks like a service_role key or a JWT carrying
  //    that role. Checked by content, because a key can be pasted into
  //    any file, not only a config one.
  const ROLE = /service_role/;
  const JWT = /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/;
  const SECRET_KEY = /\bsb_secret_[A-Za-z0-9_-]{8,}/;
  for (const f of files) {
    if (f === 'tools/check-secrets.mjs') continue;
    let src;
    try { src = readFileSync(f, 'utf8'); } catch { continue; }
    if (src.includes('\0')) continue;
    if (SECRET_KEY.test(src)) failures.push(`${f} contains what looks like a Supabase secret key.`);
    if (JWT.test(src)) failures.push(`${f} contains what looks like a JWT. Only the publishable key may be committed.`);
    // The word appears legitimately in prose that says it must never be
    // here; flag only an assignment to it.
    if (/service_role["']?\s*[:=]\s*["'][^"']{12,}/.test(src) && ROLE.test(src)) {
      failures.push(`${f} appears to assign a service_role key.`);
    }
  }

  if (failures.length) {
    console.log('');
    for (const f of failures) console.log(`FAIL ${f}`);
    console.log('');
    console.log(`Secrets: ${failures.length} problem(s) in ${files.length} tracked files`);
    process.exit(1);
  }
  const privateNote = existsSync('data/road-ahead/kit-extract.json') ? ', none of the owner\'s private markers' : '';
  console.log(`Secrets: ${files.length} tracked files, no private data and no privileged key${privateNote}`);
}
