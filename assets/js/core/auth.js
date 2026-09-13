// auth.js - sign in, sign out, and the guard every page runs.
//
// This is the ONE exception to "no interactive front end": a login form
// is input, but it is not data entry. Nothing else on the site writes.
//
// Two modes, one interface:
//
//   Supabase configured  Real authentication. signInWithPassword against
//                        Supabase Auth; the session is what RLS reads,
//                        so what a signed-in user can see is decided by
//                        the database, not by this file.
//
//   Demo mode            No database. The gate accepts the demo account
//                        and stores a flag in sessionStorage.
//
// THE DEMO GATE IS NOT SECURITY, and is not dressed up as it. This is a
// public static site: anything it checks in the browser can be read by
// anyone who opens the page source. It exists so the deployed site
// behaves like the real thing. What sits behind it is sample data with
// no real figures in it, which is the only reason a cosmetic gate is
// acceptable here. Real protection starts when Supabase is connected,
// and it comes from row-level security rather than from this screen.

import { CONFIG } from './config.js';

/** Supabase Auth identifies users by email; the owner signs in by
 *  username. Mirrors auth_email_for_username() in 05_auth.sql - if one
 *  changes, so must the other. */
export const EMAIL_DOMAIN = 'houseandhome.local';
export const emailForUsername = (u) => `${String(u || '').trim().toLowerCase()}@${EMAIL_DOMAIN}`;

export const DEMO_USERNAME = 'homeowner';
// Demo-only, and public by necessity: see the note above. This unlocks
// sample data on a public site and protects nothing.
export const DEMO_PASSWORD = 'houseandhome';

const DEMO_SESSION_KEY = 'hh-demo-session';

export const isConfigured = () => Boolean(CONFIG.supabaseUrl && CONFIG.supabaseAnonKey);

let clientPromise = null;
async function client() {
  if (!clientPromise) {
    clientPromise = import(CONFIG.supabaseModule)
      .then(({ createClient }) => createClient(CONFIG.supabaseUrl, CONFIG.supabaseAnonKey));
  }
  return clientPromise;
}

function demoSignedIn() {
  try { return sessionStorage.getItem(DEMO_SESSION_KEY) === '1'; } catch { return false; }
}
function setDemoSession(on) {
  try {
    if (on) sessionStorage.setItem(DEMO_SESSION_KEY, '1');
    else sessionStorage.removeItem(DEMO_SESSION_KEY);
  } catch { /* private browsing: the gate simply will not persist */ }
}

/** @returns {Promise<{ok: true, username: string} | {ok: false, error: string}>} */
export async function signIn(username, password) {
  const user = String(username || '').trim().toLowerCase();
  if (!user || !password) return { ok: false, error: 'Enter a username and password.' };

  if (!isConfigured()) {
    if (user === DEMO_USERNAME && password === DEMO_PASSWORD) {
      setDemoSession(true);
      return { ok: true, username: user };
    }
    return { ok: false, error: 'That username and password were not recognised.' };
  }

  let sb;
  try {
    sb = await client();
  } catch {
    return { ok: false, error: 'Could not reach the sign-in service. Check your connection and try again.' };
  }
  const { error } = await sb.auth.signInWithPassword({
    email: emailForUsername(user),
    password,
  });
  // Deliberately not echoing the provider's message: it distinguishes
  // "no such user" from "wrong password", which tells an attacker which
  // usernames exist.
  if (error) return { ok: false, error: 'That username and password were not recognised.' };
  return { ok: true, username: user };
}

export async function signOut() {
  setDemoSession(false);
  if (isConfigured()) {
    const sb = await client();
    await sb.auth.signOut();
  }
}

export async function currentUser() {
  if (!isConfigured()) return demoSignedIn() ? { username: DEMO_USERNAME, demo: true } : null;
  let sb;
  try {
    sb = await client();
  } catch (err) {
    // The CDN client could not load. Report signed out rather than
    // throwing, so the login screen still renders and says so.
    console.error('Supabase client failed to load', err);
    return null;
  }
  const { data: { session } } = await sb.auth.getSession();
  if (!session) return null;
  return {
    username: session.user?.user_metadata?.username
      ?? String(session.user?.email || '').split('@')[0],
    demo: false,
  };
}

/** Run on every protected page before anything renders. Returns the
 *  user, or redirects to the login screen and resolves to null.
 *
 *  FAILS CLOSED. If the session cannot be established for any reason -
 *  the client library fails to load, the network is down, the project is
 *  unreachable - this redirects rather than letting the page continue.
 *  The original version let an exception propagate, which left a
 *  signed-out visitor sitting on a protected page with no session and no
 *  redirect. An auth guard that fails open is not a guard. */
export async function requireAuth({ loginPath = 'login.html' } = {}) {
  let user = null;
  try {
    user = await currentUser();
  } catch (err) {
    console.error('auth check failed; treating as signed out', err);
    user = null;
  }
  if (user) return user;
  const back = encodeURIComponent(location.pathname.split('/').pop() || 'index.html');
  location.replace(`${loginPath}?next=${back}`);
  return null;
}
