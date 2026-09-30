// The colour tokens, checked as colours rather than as text.
//
//   * Every colour token has its hex twin in the fallback block, in both
//     themes, and the system dark theme and the chosen one agree. (The
//     tokens file has always said so; this is what makes it true.)
//   * The road series - one colour per road in Road Ahead's charts - reads
//     at 3:1 or better against the paper in both themes (WCAG 1.4.11 for
//     graphics), and its colours stay apart in normal vision and for the
//     three colour-vision deficiencies, simulated with Machado et al.
//     (2009) at full severity and measured in OKLab.
//   * Each fallback hex is its oklch colour, to within rounding.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const CSS = readFileSync(new URL('../../assets/css/tokens.css', import.meta.url), 'utf8');

/** The body of the first block that follows `selector {`, braces balanced. */
function block(src, selector, from = 0) {
  const at = src.indexOf(`${selector} {`, from);
  assert.ok(at >= 0, `no ${selector} block`);
  let depth = 0;
  const open = src.indexOf('{', at);
  for (let i = open; i < src.length; i += 1) {
    if (src[i] === '{') depth += 1;
    if (src[i] === '}' && (depth -= 1) === 0) return { body: src.slice(open + 1, i), end: i };
  }
  throw new Error(`unclosed ${selector}`);
}
const decls = (body) => Object.fromEntries([...body.matchAll(/--([a-z0-9-]+):\s*([^;]+);/g)].map(([, k, v]) => [k, v.trim()]));
const colours = (d) => Object.fromEntries(Object.entries(d).filter(([, v]) => /^(oklch|color-mix|#)/.test(v)));

const supportsAt = CSS.indexOf('@supports not');
const light = colours(decls(block(CSS, ':root').body));
const darkSystem = colours(decls(block(block(CSS, '@media (prefers-color-scheme: dark)').body, ':root:not([data-theme="light"])').body));
const darkChosen = colours(decls(block(CSS.slice(0, supportsAt), ':root[data-theme="dark"]').body));
const fallback = block(CSS, '@supports not (color: oklch(50% 0.1 150))').body;
const fbLight = colours(decls(block(fallback, ':root').body));
const fbDark = colours(decls(block(fallback, ':root[data-theme="dark"]').body));

test('every colour token has its fallback, and the two dark themes agree', () => {
  assert.deepEqual(Object.keys(fbLight).sort(), Object.keys(light).sort(), 'light tokens and their hex fallbacks');
  assert.deepEqual(Object.keys(fbDark).sort(), Object.keys(darkChosen).sort(), 'dark tokens and their hex fallbacks');
  assert.deepEqual(darkSystem, darkChosen, 'the system dark theme is the chosen dark theme');
});

// --- Colour maths ---------------------------------------------------
const rad = (d) => (d * Math.PI) / 180;
// The hues are tokens too (--hue-neutral, --hue-accent); resolve them first.
const rootVars = decls(block(CSS, ':root').body);
const resolveVars = (v) => v.replace(/var\(--([a-z0-9-]+)\)/g, (_, k) => rootVars[k]);
function oklchToLinear(value) {
  const v = resolveVars(value);
  const m = /^oklch\(([\d.]+)%\s+([\d.]+)\s+([\d.]+)\)$/.exec(v);
  assert.ok(m, `${v} is a plain oklch()`);
  const [L, C, h] = [Number(m[1]) / 100, Number(m[2]), Number(m[3])];
  const a = C * Math.cos(rad(h));
  const b = C * Math.sin(rad(h));
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const mm = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.2914855480 * b) ** 3;
  return [4.0767416621 * l - 3.3077115913 * mm + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * mm - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * mm + 1.7076147010 * s].map((x) => Math.min(1, Math.max(0, x)));
}
function linearToOklab([r, g, b]) {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s];
}
const luminance = ([r, g, b]) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
const contrast = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
const toHex = (lin) => `#${lin.map((c) => {
  const s = c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;
  return Math.round(Math.min(1, Math.max(0, s)) * 255).toString(16).padStart(2, '0');
}).join('')}`;
const MACHADO = {
  protanopia: [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]],
  deuteranopia: [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.011820, 0.042940, 0.968881]],
  tritanopia: [[1.255528, -0.076749, -0.178779], [-0.078411, 0.930809, 0.147602], [0.004733, 0.691367, 0.303900]],
};
const simulate = (M, v) => M.map((row) => Math.min(1, Math.max(0, row[0] * v[0] + row[1] * v[1] + row[2] * v[2])));
const closestPair = (cols, view) => {
  let min = Infinity;
  for (let i = 0; i < cols.length; i += 1) {
    for (let j = i + 1; j < cols.length; j += 1) {
      const [a, b] = [linearToOklab(view(cols[i])), linearToOklab(view(cols[j]))];
      min = Math.min(min, Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]));
    }
  }
  return min;
};

const THEMES = [['light', light, fbLight], ['dark', darkChosen, fbDark]];
const roadsOf = (t) => Object.keys(t).filter((k) => /^road-\d$/.test(k)).sort();

test('the road series reads at 3:1 against the paper in both themes', () => {
  for (const [name, t] of THEMES) {
    assert.equal(roadsOf(t).length, 5, `${name}: five roads`);
    const paper = oklchToLinear(t.paper);
    for (const k of roadsOf(t)) {
      const c = contrast(oklchToLinear(t[k]), paper);
      assert.ok(c >= 3, `${name} --${k} ${t[k]}: contrast ${c.toFixed(2)} against the paper`);
    }
  }
});

test('the road series stays apart in normal vision and for each colour-vision deficiency', () => {
  for (const [name, t] of THEMES) {
    const cols = roadsOf(t).map((k) => oklchToLinear(t[k]));
    assert.ok(closestPair(cols, (v) => v) >= 0.10, `${name}: normal vision`);
    for (const [kind, M] of Object.entries(MACHADO)) {
      const d = closestPair(cols, (v) => simulate(M, v));
      assert.ok(d >= 0.06, `${name}: ${kind} brings two roads within ${d.toFixed(3)}`);
    }
  }
});

test('each road fallback hex is its oklch colour', () => {
  for (const [name, t, fb] of THEMES) {
    for (const k of roadsOf(t)) {
      const want = toHex(oklchToLinear(t[k]));
      const got = fb[k].toLowerCase();
      const off = [1, 3, 5].map((i) => Math.abs(parseInt(got.slice(i, i + 2), 16) - parseInt(want.slice(i, i + 2), 16)));
      assert.ok(Math.max(...off) <= 2, `${name} --${k}: fallback ${got}, oklch gives ${want}`);
    }
  }
});
