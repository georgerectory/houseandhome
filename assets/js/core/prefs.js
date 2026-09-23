// prefs.js - the one place that touches localStorage.
//
// There were five copies of this wrapper: the theme switch in shell.js,
// an identical `store` object in house.js, roadmap.js and shopping.js,
// and a JSON pair in house/display.js. Five copies of a try/catch is
// five chances to forget the catch, and forgetting it is not a small
// bug - localStorage THROWS in private mode rather than returning null,
// so an unguarded read does not degrade, it takes the page down before
// anything renders.
//
// What belongs here is per-viewer convenience only: a remembered tab, a
// chosen axis, a collapsed panel, the display toggles. Nothing that a
// total, a projection or an allocation depends on. Those live in
// Supabase, where they are shared, backed up and governed by RLS.

/** A stored string, or null if there is nothing or storage is barred. */
export function get(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}

/** Store a string; remove it when the value is empty. Never throws. */
export function set(key, value) {
  try {
    if (value === null || value === undefined || value === '') localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch { /* private mode, or site data blocked */ }
}

/**
 * A stored object, merged over defaults.
 *
 * Merging rather than replacing is what makes an old saved preference
 * survive a new release: a version that adds a display toggle would
 * otherwise read a saved object with that key missing and get undefined
 * where it expected a boolean. Only keys the defaults know about are
 * kept, so a key some previous version wrote cannot linger for ever.
 */
export function getJSON(key, defaults = {}) {
  const raw = get(key);
  if (!raw) return { ...defaults };
  try {
    const saved = JSON.parse(raw);
    if (!saved || typeof saved !== 'object') return { ...defaults };
    return {
      ...defaults,
      ...Object.fromEntries(Object.entries(saved).filter(([k]) => k in defaults)),
    };
  } catch { return { ...defaults }; }
}

/** Store an object. Never throws. */
export function setJSON(key, value) {
  try { set(key, JSON.stringify(value)); } catch { /* unserialisable */ }
}

/** One value out of a known set, or a fallback. Guards every remembered
 *  tab and axis on the site: a key left over from an older release must
 *  not select a view that no longer exists. */
export function getOneOf(key, allowed, fallback) {
  const v = get(key);
  return allowed.includes(v) ? v : fallback;
}
