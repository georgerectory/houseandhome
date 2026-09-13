// build-pages.mjs - write the HTML shell for each page.
//
// Generated rather than hand-copied so the <head>, the stylesheet order
// and the landmark structure cannot drift between pages. Every page gets
// the same viewport meta (viewport-fit=cover, so safe-area insets
// actually resolve on a notched phone), the same skip target, and one
// <main id="main">.
import { writeFileSync } from 'node:fs';

const PAGES = [
  ['index.html', 'Dashboard', 'What to do next, and where things stand.'],
  ['roadmap.html', 'Roadmap', 'Work banded into now, next, later and someday.'],
  ['backlog.html', 'Backlog', 'Every job and purchase, ranked and filterable.'],
  ['money.html', 'Money', 'The pot, what it is funding, and what is due.'],
  ['house.html', 'House', 'Rooms, storage and equipment.'],
  ['handbook.html', 'Handbook', 'What this house is and what was decided.'],
];

// The login screen has no nav, no <h1> of its own and no lede: it is
// rendered entirely by its module, so it gets a bare shell.
const LOGIN = `<!doctype html>
<html lang="en-GB">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Sign in — House &amp; Home</title>
<meta name="description" content="Sign in to House &amp; Home.">
<meta name="color-scheme" content="light dark">
<meta name="robots" content="noindex">
<link rel="icon" href="favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="assets/css/tokens.css">
<link rel="stylesheet" href="assets/css/base.css">
<link rel="stylesheet" href="assets/css/components.css">
<script>
try { var t = localStorage.getItem('hh-theme'); if (t) document.documentElement.dataset.theme = t; } catch (e) {}
</script>
</head>
<body>
<main id="main" class="page">
  <div data-page-root aria-live="polite"></div>
</main>
<script type="module" src="assets/js/pages/login.js"></script>
</body>
</html>
`;

const tpl = (file, title, lede) => `<!doctype html>
<html lang="en-GB">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${title} — House &amp; Home</title>
<meta name="description" content="${lede}">
<meta name="color-scheme" content="light dark">
<link rel="icon" href="favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="assets/css/tokens.css">
<link rel="stylesheet" href="assets/css/base.css">
<link rel="stylesheet" href="assets/css/components.css">
<script>
/* Apply the stored theme before first paint: doing it in the module
   would flash the wrong theme while the module loads. */
try { var t = localStorage.getItem('hh-theme'); if (t) document.documentElement.dataset.theme = t; } catch (e) {}
</script>
</head>
<body>
<main id="main" class="page">
  <h1>${title}</h1>
  <p class="lede">${lede}</p>
  <div data-page-root aria-live="polite"></div>
</main>
<script type="module" src="assets/js/pages/${file.replace('.html', '')}.js"></script>
</body>
</html>
`;

for (const [file, title, lede] of PAGES) {
  writeFileSync(file, tpl(file, title, lede));
}
writeFileSync('login.html', LOGIN);
console.log(`pages: ${PAGES.length + 1} written`);
