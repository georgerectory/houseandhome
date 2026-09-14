// lint-frontend.mjs - the rules a browser cannot catch.
//
// The browser check proves what RENDERS is correct at the viewports we
// test. These are the rules about how it is WRITTEN, which stop a
// regression getting in on a viewport nobody thought to test.
import { readFileSync } from 'node:fs';
import { globSync } from 'node:fs';

const RULES = [
  {
    id: 'no-100vw',
    files: /\.css$/,
    re: /\b100vw\b/g,
    why: '100vw includes the scrollbar and causes horizontal overflow. Use 100%.',
  },
  {
    id: 'no-raw-vh',
    files: /\.css$/,
    // vh ignores mobile browser chrome, so a 100vh panel is taller than
    // the visible area on a phone. dvh/svh exist for exactly this.
    re: /(?<![ds])\b\d+vh\b/g,
    why: 'Raw vh misses mobile browser chrome. Use dvh or svh.',
  },
  {
    id: 'no-max-width-media',
    files: /\.css$/,
    // prefers-*, orientation and height queries are the sanctioned
    // exceptions: they are not layout breakpoints.
    re: /@media[^{]*\(max-width:/g,
    why: 'Layout breakpoints are min-width only, so mobile is the base rather than the exception.',
  },
  {
    id: 'no-ipad-band-breakpoint',
    files: /\.css$/,
    re: /min-width:\s*(6\d\d|7[0-5]\d|79\d)px/g,
    why: 'No layout transition may land in 600-800px: that is where iPad portrait sits (768/810/834).',
  },
  {
    id: 'no-focus-ring-as-outline',
    files: /\.css$/,
    re: /outline:\s*var\(--focus-ring\)/g,
    why: '--focus-ring is a box-shadow value. As outline it is invalid and silently removes the focus indicator.',
  },
  {
    id: 'no-padding-shorthand-on-page',
    files: /\.css$/,
    re: /\.page\s*\{[^}]*[^-]\bpadding:\s/g,
    why: 'A padding shorthand on .page zeroes the inline gutter set separately. Use padding-block.',
  },
  {
    id: 'no-inline-style-attr',
    files: /\.(js|html)$/,
    // Setting a custom property is the sanctioned escape for a genuinely
    // dynamic numeric value; a static style attribute is not.
    re: /style="(?![^"]*--)[^"]*"/g,
    why: 'No static inline styles. Use a class, or set a custom property for dynamic values.',
  },
  {
    id: 'no-emoji',
    files: /\.(js|css|html|md|sql)$/,
    re: /[\u{1F300}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu,
    why: 'No emojis anywhere: not in the interface, docs, comments or commit messages.',
  },
  {
    id: 'no-hardcoded-hex',
    files: /\.css$/,
    re: /#[0-9a-fA-F]{3,8}\b/g,
    why: 'Colour comes from tokens.css. Hard-coded hex belongs only in the oklch fallback block.',
    skipFiles: [/tokens\.css$/],
  },
];

// Third-party code we did not write and must not edit. These rules
// describe THIS codebase's conventions; running them over a vendored
// library only produces noise nobody can act on. The rule that a
// dependency is pinned and vendored rather than fetched from a CDN is
// enforced by it being in the tree at an exact version, not by lint.
const VENDOR = /(^|\/)vendor(\/|$)/;

function walk(dir, out = []) {
  for (const e of globSync(`${dir}/**/*.{js,css,html,md,sql}`, { withFileTypes: false })) {
    if (!VENDOR.test(e)) out.push(e);
  }
  return out;
}

const files = [
  ...walk('assets'),
  ...walk('tools'),
  ...walk('supabase'),
  ...globSync('*.html'),
  ...globSync('docs/*.md'),
  'README.md',
];

let failures = 0;
let checked = 0;

for (const f of [...new Set(files)]) {
  let src;
  try { src = readFileSync(f, 'utf8'); } catch { continue; }
  checked++;
  for (const rule of RULES) {
    if (!rule.files.test(f)) continue;
    if (rule.skipFiles?.some((re) => re.test(f))) continue;
    // The lint describes its own rules, so skip this file for the
    // patterns it necessarily contains.
    if (f.endsWith('lint-frontend.mjs')) continue;
    const hits = [...src.matchAll(rule.re)];
    if (hits.length) {
      failures += hits.length;
      const line = src.slice(0, hits[0].index).split('\n').length;
      console.log(`FAIL ${rule.id}: ${f}:${line} (${hits.length} hit${hits.length === 1 ? '' : 's'})`);
      console.log(`     ${rule.why}`);
    }
  }
}

console.log('');
console.log(failures === 0
  ? `Front-end lint: ${checked} files, ${RULES.length} rules, clean`
  : `Front-end lint: ${failures} violation(s)`);
process.exit(failures === 0 ? 0 : 1);
