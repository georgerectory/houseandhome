// pages.js - the site's pages, in one place.
//
// THE ONE HOME. This list had three: the nav in core/shell.js, the HTML
// generator in tools/build-pages.mjs, and the sweep list in
// tools/check-frontend.mjs. Adding a page meant editing all three and
// nothing detected a miss - so a page could exist, be generated, and
// never be navigated to or tested, and everything would still be green.
//
// It lives under assets/js/core/ rather than tools/ because the browser
// has to read it and the browser cannot import from tools/. It holds no
// DOM and no fetch, so the two node scripts import it directly.
//
// `lede` is the one-sentence description that becomes both the page's
// meta description and the line under its heading.

export const PAGES = [
  {
    href: 'index.html',
    label: 'Dashboard',
    lede: 'What to do next, and where things stand.',
  },
  {
    href: 'plan.html',
    label: 'Plan',
    lede: 'The document: checklists, decisions and the handbook, in reading order. Prints.',
  },
  {
    href: 'roadmap.html',
    label: 'Roadmap',
    lede: 'The same work as a board, a timeline or a list — grouped by room, trade, intent or benefit.',
  },
  {
    href: 'backlog.html',
    label: 'Backlog',
    lede: 'Every job and purchase, ranked and filterable.',
  },
  {
    href: 'money.html',
    label: 'Money',
    lede: 'The pot, what it is funding, and what is due.',
  },
  {
    href: 'shopping.html',
    label: 'Shopping',
    lede: 'What to buy, grouped into trips, with what each run costs.',
  },
  {
    href: 'theme.html',
    label: 'Theme',
    lede: 'What to buy and what to reject: paint, timber, lighting, ironmongery and finishes.',
  },
  {
    href: 'house.html',
    label: 'House',
    lede: 'The floor plan, what sits where on it, and the equipment register.',
  },
  {
    href: 'handbook.html',
    label: 'Handbook',
    lede: 'What this house is and what was decided.',
  },
];

/**
 * The login screen. Separate because it is the only page reached
 * without a session, it carries no navigation, and it loads a smaller
 * set of stylesheets - so the generator and the front-end sweep both
 * have to treat it differently rather than pretend it is one of the
 * others.
 */
export const PUBLIC_PAGES = [
  { href: 'login.html', label: 'Sign in', lede: 'Sign in to House & Home.' },
];

/** Every page the site serves, public and private. */
export const ALL_PAGES = [...PAGES, ...PUBLIC_PAGES];
