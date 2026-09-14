// shell.js - the header, navigation and theme control, built once.
//
// Navigation is derived from ONE list so a new page cannot be added to
// the site and forgotten in the nav. The theme toggle writes an explicit
// choice to localStorage; with nothing stored, the system preference
// wins, which is what the tokens are written to expect.

const PAGES = [
  { href: 'index.html',    label: 'Dashboard' },
  { href: 'roadmap.html',  label: 'Roadmap' },
  { href: 'backlog.html',  label: 'Backlog' },
  { href: 'money.html',    label: 'Money' },
  { href: 'shopping.html', label: 'Shopping' },
  { href: 'house.html',    label: 'House' },
  { href: 'handbook.html', label: 'Handbook' },
];

const THEME_KEY = 'hh-theme';

function storedTheme() {
  try { return localStorage.getItem(THEME_KEY); } catch { return null; }
}
function storeTheme(v) {
  try { v ? localStorage.setItem(THEME_KEY, v) : localStorage.removeItem(THEME_KEY); } catch { /* private mode */ }
}

export function applyStoredTheme() {
  const t = storedTheme();
  if (t === 'dark' || t === 'light') document.documentElement.dataset.theme = t;
}

function currentTheme() {
  return document.documentElement.dataset.theme
    || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
}

export function mountShell(active, { user = null } = {}) {
  applyStoredTheme();

  const header = document.createElement('header');
  header.className = 'site-header';

  const inner = document.createElement('div');
  inner.className = 'site-header__inner';

  const brand = document.createElement('a');
  brand.className = 'brand';
  brand.href = 'index.html';
  brand.textContent = 'House & Home';

  const nav = document.createElement('nav');
  nav.className = 'nav';
  nav.setAttribute('aria-label', 'Main');
  for (const p of PAGES) {
    const a = document.createElement('a');
    a.className = 'nav__link';
    a.href = p.href;
    a.textContent = p.label;
    if (p.href === active) a.setAttribute('aria-current', 'page');
    nav.append(a);
  }

  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'theme-toggle';
  const paint = () => {
    const t = currentTheme();
    toggle.textContent = t === 'dark' ? 'Light' : 'Dark';
    // The button's accessible name says what it DOES, not what is
    // currently on - a toggle labelled with its own state is ambiguous.
    toggle.setAttribute('aria-label', `Switch to ${t === 'dark' ? 'light' : 'dark'} theme`);
  };
  toggle.addEventListener('click', () => {
    const next = currentTheme() === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    storeTheme(next);
    paint();
  });
  paint();

  const actions = document.createElement('div');
  actions.className = 'header-actions';
  actions.append(toggle);

  if (user) {
    const out = document.createElement('button');
    out.type = 'button';
    out.className = 'signout';
    out.textContent = 'Sign out';
    out.setAttribute('aria-label', `Sign out of ${user.username}`);
    out.addEventListener('click', async () => {
      const { signOut } = await import('./auth.js');
      await signOut();
      location.replace('login.html');
    });
    actions.append(out);
  }

  inner.append(brand, nav, actions);
  header.append(inner);

  const skip = document.createElement('a');
  skip.className = 'skip-link';
  skip.href = '#main';
  skip.textContent = 'Skip to content';

  document.body.prepend(header);
  document.body.prepend(skip);

  const footer = document.createElement('footer');
  footer.className = 'site-footer';
  const f = document.createElement('div');
  f.className = 'page';
  f.style.setProperty('padding-block', '0');
  f.innerHTML = '<p>Display only. Everything here is added, edited and decided through conversation with Claude; '
    + 'this site renders the result.</p>';
  footer.append(f);
  document.body.append(footer);
}

/** Render into a host, replacing whatever was there. */
export function render(host, html) {
  const el = typeof host === 'string' ? document.querySelector(host) : host;
  if (el) el.innerHTML = html;
  return el;
}

/** A standing banner stating how much of what is shown is unverified.
 *  Present on every page by design: it is the difference between a
 *  system that is honest about what it knows and one that is not. */
export function confidenceBanner({ total, trusted, unconfirmed }) {
  if (!total || unconfirmed === 0) return '';
  const all = trusted === 0;
  return `<div class="notice notice--warn" role="status">
    <span class="notice__title">${all ? 'Nothing here is confirmed yet' : `${unconfirmed} of ${total} items are unconfirmed`}</span>
    ${all
      ? 'Every figure on this site is a draft estimate. None has been checked, so none of it should be relied on for a decision yet.'
      : 'Figures marked with a dotted underline are estimates that have not been confirmed.'}
  </div>`;
}
