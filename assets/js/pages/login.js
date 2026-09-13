// The login screen. The only form in the system.
import { signIn, isConfigured, DEMO_USERNAME, DEMO_PASSWORD, currentUser } from '../core/auth.js';
import { applyStoredTheme } from '../core/shell.js';
import { escape } from '../core/format.js';

applyStoredTheme();

const next = new URLSearchParams(location.search).get('next') || 'index.html';
// Only ever return to a page within this site: an open redirect on a
// login screen is how a phishing link gets a real session.
const safeNext = /^[a-z0-9-]+\.html$/i.test(next) ? next : 'index.html';

if (await currentUser()) location.replace(safeNext);

const root = document.querySelector('[data-page-root]');
root.innerHTML = `
  <form class="login" id="login" novalidate>
    <h1 class="login__title">House &amp; Home</h1>
    <p class="login__lede">Sign in to see the house.</p>

    <div class="field">
      <label for="username">Username</label>
      <input id="username" name="username" type="text" autocomplete="username"
             autocapitalize="none" autocorrect="off" spellcheck="false" required>
    </div>

    <div class="field">
      <label for="password">Password</label>
      <input id="password" name="password" type="password"
             autocomplete="current-password" required>
    </div>

    <p class="login__error" id="error" role="alert" hidden></p>

    <button class="btn" type="submit" id="submit">Sign in</button>

    ${!isConfigured() ? `<div class="notice login__demo">
      <span class="notice__title">Demo mode</span>
      No database is connected, so this screen unlocks sample data rather
      than a real account. Sign in with <code>${escape(DEMO_USERNAME)}</code> /
      <code>${escape(DEMO_PASSWORD)}</code>. This gate is cosmetic: the page
      source is public, and nothing behind it is real. Proper protection
      arrives with the database, and comes from row-level security.
    </div>` : ''}
  </form>
`;

const form = document.getElementById('login');
const errorEl = document.getElementById('error');
const submit = document.getElementById('submit');

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  errorEl.hidden = true;
  submit.disabled = true;
  submit.textContent = 'Signing in…';

  const res = await signIn(form.username.value, form.password.value);

  if (res.ok) {
    location.replace(safeNext);
    return;
  }

  errorEl.textContent = res.error;
  errorEl.hidden = false;
  submit.disabled = false;
  submit.textContent = 'Sign in';
  form.password.value = '';
  form.password.focus();
});
