// property-choice.js - which house the site is showing.
//
// More than one house can be in play at once: the active one (made
// active with make_active(), the house every default view in Postgres is
// scoped to) and candidates being worked up alongside it. The viewer
// picks one with the switcher in the header; the choice travels in the
// URL (?property=P-004) and is remembered per viewer. Archived houses are
// never offered: the archive is read only for a cross-property
// comparison, and purged ones do not exist.
//
// THE RULE THAT MATTERS: nothing from one house may appear on another's
// pages. The base tables are filtered by property_id in the query. The
// derived views (shopping list, review queue, readiness, the diary) are
// computed in Postgres for the ACTIVE house only, so while a candidate is
// in view they are emptied rather than shown, and the page says so.
import * as prefs from './prefs.js';

const KEY = 'hh-property';
const SHOWN = ['active', 'committed', 'owned', 'candidate'];

/** The ref asked for: the URL first, then the viewer's last choice. */
export function wantedRef(search = globalThis.location?.search ?? '') {
  const fromUrl = new URLSearchParams(search).get('property');
  if (fromUrl) {
    prefs.set(KEY, fromUrl);
    return fromUrl;
  }
  return prefs.get(KEY);
}

/** The houses the switcher offers: never an archived or sold one. */
export const switchable = (properties) => (properties ?? []).filter((p) => SHOWN.includes(p.status));

/**
 * The house to show, and whether it is the default (active) one.
 * A remembered ref that no longer exists, or points at an archived
 * house, falls back to the active house rather than to nothing.
 */
export function chooseProperty(properties, wanted) {
  const list = switchable(properties);
  const fallback = list.find((p) => ['active', 'committed', 'owned'].includes(p.status)) ?? null;
  const chosen = list.find((p) => p.ref === wanted) ?? fallback;
  return { property: chosen, isDefault: !!chosen && chosen === fallback, properties: list };
}

/** The keys that hold one house's rows, or views computed for the active house. */
export const PROPERTY_KEYS = ['rooms', 'cost_rollup', 'house_facts', 'document_sections'];
export const ACTIVE_ONLY_VIEWS = ['shopping_list', 'shopping_totals', 'stock_plan', 'review_queue',
  'work_item_readiness', 'whats_next'];

/**
 * Scope a whole-household data set (the demo fixture) to one house.
 * Rows carrying a property_id are kept only for that house; rows with
 * none belong to the household and stay. When the house is not the
 * active one, the views computed for the active house are emptied.
 */
export function scopeTo(data, choice, defaultId) {
  const id = choice.property?.id ?? null;
  const mine = (r) => r.property_id == null ? true : r.property_id === id;
  // Fixture rows written before properties carried ids belong to the
  // default house: keep them there and nowhere else.
  const ownedBy = (r) => (r.property_id === undefined ? id === defaultId : mine(r));
  const out = { ...data, property: choice.property, properties: choice.properties, propertyIsDefault: choice.isDefault };
  for (const k of PROPERTY_KEYS) out[k] = (data[k] ?? []).filter(ownedBy);
  out.items = (data.items ?? []).filter((i) => (i.property_id === undefined ? id === defaultId : mine(i)));
  out.bills = (data.bills ?? []).filter(mine);
  if (!choice.isDefault) for (const k of ACTIVE_ONLY_VIEWS) out[k] = [];
  return out;
}
