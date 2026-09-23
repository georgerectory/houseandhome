#!/usr/bin/env node
// ingest-document.mjs - a PDF, turned into rows.
//
// Nothing here touches a database. It reads the PDF, emits JSON for a
// session to load, and prints what it found - the same split as
// tools/carry.mjs, and for the same reason: the extraction and the
// write happen in different places, and a tool that pretended otherwise
// would be lying about where the risk is.
//
// THE BLOB NEVER ENTERS THE REPOSITORY. The output goes to
// data/carried/, which is gitignored and which the secrets gate fails
// on if a file is ever tracked. The PDF identifies the property, the
// layout and the owner's finances.
//
//   node tools/ingest-document.mjs <file.pdf> [--out data/carried/doc.json]
//   node tools/ingest-document.mjs <file.pdf> --dry-run
import { execFileSync } from 'node:child_process';
import { writeFileSync, existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith('--'));
const flag = (n, d) => { const i = args.indexOf(`--${n}`); return i === -1 ? d : args[i + 1]; };
const dryRun = args.includes('--dry-run');
const out = flag('out', 'data/carried/document.json');

if (!file || !existsSync(file)) {
  console.error('Usage: node tools/ingest-document.mjs <file.pdf> [--out path] [--dry-run]');
  process.exit(1);
}

// The extraction itself is Python, because PyMuPDF reads a PDF's text
// layout properly and there is no reason to reimplement that badly in
// Node. It prints JSON on stdout and nothing else.
const PY = `
import sys, json, re
import pymupdf

doc = pymupdf.open(sys.argv[1])
pages = []
for n, page in enumerate(doc, start=1):
    text = page.get_text()
    lines = [l.rstrip() for l in text.split('\\n')]
    nonblank = [l for l in lines if l.strip()]
    # The handbook's own furniture: a running header naming the part, a
    # title, an "IN SHORT" lede, then the body, then a footer repeated
    # on every page. Stripping it is what makes the body readable.
    part = nonblank[0] if nonblank else ''
    title = nonblank[1] if len(nonblank) > 1 else ''
    lede = ''
    body_start = 2
    if len(nonblank) > 3 and nonblank[2].strip().upper() == 'IN SHORT':
        lede = nonblank[3]
        body_start = 4
    body = [l for l in nonblank[body_start:]]
    # Drop the footer block: the address line, the disclaimer, the page
    # number and the part marker repeat on all 54 pages.
    body = [l for l in body if not re.match(
        r'^(48 AMEYSFORD ROAD|Final designs|\\d+$|[ABC] . (BROCHURE|HANDBOOK|RECAP)$)', l.strip())]
    pages.append({
        'page': n,
        'part': part,
        'title': title,
        'lede': lede,
        'body': '\\n'.join(body).strip(),
        'images': len(page.get_images(full=True)),
        'chars': len(text),
    })
print(json.dumps({'page_count': doc.page_count, 'pages': pages}))
`;

let raw;
try {
  raw = execFileSync('python3', ['-c', PY, file], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
} catch (e) {
  console.error('Extraction failed. Is pymupdf installed? pip install pymupdf');
  console.error(String(e.stderr || e.message).slice(0, 400));
  process.exit(1);
}
const doc = JSON.parse(raw);

// ---------------------------------------------------------------
// CLAIMS. Every money figure, with the line it sits on.
//
// Deliberately generous: it is better to extract a figure nobody
// wanted than to miss the one line that changes the plan, because a
// session reviews these and an unreviewed row drives nothing anyway.
// The document's own VERIFIED / ESTIMATE markers are carried across
// rather than flattened - dressing an estimate as a survey is the one
// thing this must not do.
// ---------------------------------------------------------------
// A RANGE IS TWO FIGURES, AND THE MULTIPLIER SITS AT THE END OF IT.
// "£72-115k" is seventy-two THOUSAND to a hundred and fifteen
// thousand; reading the first number alone and dropping the k records
// it as seventy-two pounds. That is not a rounding error, it is a
// different claim by three orders of magnitude, and it would land in
// the one table whose job is to be trustworthy enough to price a job.
// So: match the whole range, apply the suffix to BOTH ends, and emit
// each end as its own claim.
const MONEY = /£\s?([\d,]+(?:\.\d{1,2})?)\s?(?:[-\u2013\u2014]\s?([\d,]+(?:\.\d{1,2})?))?\s?(k|K)?/g;
const claims = [];
for (const p of doc.pages) {
  for (const line of p.body.split('\n')) {
    const t = line.trim();
    if (!t || t.length > 200) continue;
    MONEY.lastIndex = 0;
    let m;
    while ((m = MONEY.exec(t)) !== null) {
      const mult = m[3] ? 1000 : 1;
      const ends = [m[1], m[2]].filter(Boolean)
        .map((x) => Number(x.replace(/,/g, '')) * mult)
        .filter((n) => Number.isFinite(n) && n !== 0);
      for (const n of ends) claims.push({
        page: p.page,
        claim_type: 'cost',
        label: t.slice(0, 160),
        value_numeric: n,
        unit: 'GBP',
        // The handbook marks its own figures. VERIFIED means checked
        // against a primary source; ESTIMATE means reasoned and to be
        // replaced by a quote.
        confidence: /VERIFIED/.test(t) ? 'researched'
          : /ESTIMATE/.test(t) ? 'drafted' : 'researched',
      });
    }
  }
}
// One claim per (page, amount, first 60 chars) - a figure repeated in a
// table row and its total is one fact, not two.
const seen = new Set();
const uniqueClaims = claims.filter((c) => {
  const k = `${c.page}|${c.value_numeric}|${c.label.slice(0, 60)}`;
  if (seen.has(k)) return false;
  seen.add(k);
  return true;
});

const sections = doc.pages
  .filter((p) => p.body.length > 0)
  .map((p, i) => ({
    part: p.part || null,
    title: p.title || `Page ${p.page}`,
    lede: p.lede || null,
    body: p.body,
    page_from: p.page,
    page_to: p.page,
    sort_order: (i + 1) * 10,
  }));

const figures = doc.pages
  .filter((p) => p.images > 0)
  .flatMap((p) => Array.from({ length: p.images }, (_, k) => ({
    page: p.page,
    caption: `${p.title || 'Page ' + p.page}${p.images > 1 ? ` (${k + 1} of ${p.images})` : ''}`,
    // Floor plans, the site plan and the roof options are things this
    // system COMPUTES. Pointing at the live drawing rather than storing
    // a bitmap is what stops the picture and the model diverging.
    replaced_by_view: /floor plan|site|plot|stage \d|roof option/i.test(p.title || '')
      ? 'house.html' : null,
  })));

const payload = {
  format: 'house-and-home/document/1',
  source_sha256: createHash('sha256').update(readFileSync(file)).digest('hex'),
  page_count: doc.page_count,
  sections,
  figures,
  claims: uniqueClaims,
};

console.log(`Pages          ${doc.page_count}`);
console.log(`Sections       ${sections.length}`);
console.log(`Figures        ${figures.length} (${figures.filter((f) => f.replaced_by_view).length} drawn live instead)`);
console.log(`Money claims   ${uniqueClaims.length}`);
console.log(`Body text      ${sections.reduce((n, s) => n + s.body.length, 0).toLocaleString()} chars`);
console.log(`Checksum       ${payload.source_sha256.slice(0, 16)}...`);

if (dryRun) {
  console.log('\nDry run: nothing written.');
  console.log(sections.slice(0, 3).map((s) => `  ${s.page_from}. ${s.title}`).join('\n'));
  process.exit(0);
}
writeFileSync(out, JSON.stringify(payload, null, 1));
console.log(`\nWrote ${out} - gitignored, and the secrets gate fails if it is ever tracked.`);
