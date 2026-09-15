// store.js - the only module that knows where data comes from.
//
// Two sources, one shape. Until a Supabase project is connected, the
// site renders the fixture dataset; once config.js carries a URL and an
// anon key, the same functions read live rows instead. Pages never know
// which, so nothing has to change on the day it is connected.
//
// The anon key is safe to ship ONLY because RLS is forced on every
// table - see supabase/schema/90_policies.sql. That is not a convention
// here, it is proven by tests/sql/rls.test.sql.

import { CONFIG } from './config.js';

let cache = null;

async function loadFixture() {
  if (cache) return cache;
  const res = await fetch(new URL('../../../data/fixtures/demo.json', import.meta.url));
  if (!res.ok) throw new Error(`fixture load failed: ${res.status}`);
  cache = await res.json();
  return cache;
}

async function loadLive() {
  const { createClient } = await import(CONFIG.supabaseModule);
  const sb = createClient(CONFIG.supabaseUrl, CONFIG.supabaseAnonKey);
  const { data: { session } } = await sb.auth.getSession();
  if (!session) { location.replace('login.html'); return null; }

  const [rooms, items, bills, assets, storage, inventory, settings, prices,
    carried, accounts] = await Promise.all([
    sb.from('rooms').select('*'),
    sb.from('work_items').select('*').order('priority'),
    sb.from('bills').select('*').eq('is_active', true),
    sb.from('assets').select('*'),
    sb.from('storage_locations').select('*'),
    sb.from('inventory_items').select('*'),
    sb.from('allocation_settings').select('*').maybeSingle(),
    sb.from('price_references').select('*'),
    // Only what is still unreviewed: a line that has been dealt with has
    // left the prompt sheet, and showing it again would ask the owner to
    // decide something they have already decided.
    sb.from('carried_finance').select('*').eq('review_status', 'pending'),
    sb.from('accounts').select('*').eq('is_active', true),
  ]);
  const { data: pot, error: potError } = await sb.from('pots')
    .select('*').eq('is_active', true).maybeSingle();

  // A failed query returns null data, which renders identically to an
  // empty database: "No work items yet." That is the worst possible
  // failure mode for a system whose whole job is to be honest about what
  // it knows, so a broken read is raised rather than swallowed.
  const failed = Object.entries({
    rooms, items, bills, assets, storage, inventory, settings, prices, carried,
    accounts, pot: { error: potError },
  }).filter(([, r]) => r?.error).map(([name, r]) => `${name}: ${r.error.message}`);
  if (failed.length) {
    throw new Error(`Could not read the database - ${failed.join('; ')}`);
  }

  // Pages read room_name off an item; resolve it once here rather than
  // making every page join, and rather than asking PostgREST for an
  // embedded select that RLS would have to re-check per row.
  const roomById = new Map((rooms.data ?? []).map((r) => [r.id, r]));
  const storageById = new Map((storage.data ?? []).map((sl) => [sl.id, sl]));
  const withRoom = (i) => ({
    ...i,
    room_key: roomById.get(i.room_id)?.key ?? null,
    room_name: roomById.get(i.room_id)?.name ?? null,
  });

  cache = {
    meta: { generated: new Date().toISOString().slice(0, 10), note: 'Live data.' },
    pot: pot ?? null,
    rooms: rooms.data ?? [],
    items: (items.data ?? []).map(withRoom),
    bills: bills.data ?? [],
    // room_key as well as room_name: the floor plan resolves a fixture to
    // a room on the plan through the key, so an asset without one is
    // unplaceable even when its room is perfectly well known.
    assets: (assets.data ?? []).map((a) => ({
      ...a,
      room_key: roomById.get(a.room_id)?.key ?? null,
      room_name: roomById.get(a.room_id)?.name ?? null,
    })),
    storage: (storage.data ?? []).map((s) => ({
      ...s, room_key: roomById.get(s.room_id)?.key ?? null,
    })),
    // Pages show what is IN a storage location by its name, so resolve
    // the link here rather than leaving every inventory row claiming it
    // is stored nowhere.
    inventory: (inventory.data ?? []).map((v) => ({
      ...v,
      storage: storageById.get(v.storage_location_id)?.name ?? null,
    })),
    allocation_settings: settings.data ?? { decay: 0.85, floor_share: 0.10 },
    price_references: prices.data ?? [],
    // An ARCHIVE, not a ledger. Deliberately not fed into any selector
    // below: nothing here may reach a total, a projection or an
    // allocation until a person has confirmed it.
    carried_finance: carried.data ?? [],
    accounts: accounts.data ?? [],
  };
  return cache;
}

export const isDemo = () => !CONFIG.supabaseUrl || !CONFIG.supabaseAnonKey;

export async function load() {
  return isDemo() ? loadFixture() : loadLive();
}

// --- Derived selectors, shared by every page ------------------------

export const openItems = (d) => d.items.filter((i) => !['done', 'dropped'].includes(i.status));

export const fundable = (d) =>
  openItems(d)
    .filter((i) => (i.cost_expected ?? i.cost_best) != null)
    .sort((a, b) => a.priority - b.priority)
    .map((i) => ({
      id: i.id,
      title: i.title,
      targetCost: i.cost_expected ?? i.cost_best,
      allocatedBalance: i.allocated_balance ?? 0,
    }));

export const byHorizon = (d, h) =>
  openItems(d).filter((i) => i.horizon === h).sort((a, b) => a.priority - b.priority);

export const totalOutstanding = (d) =>
  fundable(d).reduce((s, i) => s + Math.max(0, (i.targetCost ?? 0) - i.allocatedBalance), 0);

/** How much of what is on screen has actually been checked by a human.
 *  Surfaced prominently rather than buried, because early on the honest
 *  answer is "none of it". */
export function confidenceSummary(d) {
  const rows = openItems(d);
  const trusted = rows.filter((i) => ['confirmed', 'actual'].includes(i.cost_confidence)).length;
  return { total: rows.length, trusted, unconfirmed: rows.length - trusted };
}

/**
 * What is actually held, netted.
 *
 * Mirrors the house_funds view in 40_money.sql - the same rule, because
 * the page and the database disagreeing about how much money exists is
 * the worst bug this system could have.
 *
 * Only TRUSTED balances count. An unconfirmed one is reported separately
 * so a surface can say what it is leaving out rather than quietly
 * understating the position.
 */
export function houseFunds(d) {
  const rows = (d.accounts ?? []).filter((a) => a.is_active !== false);
  const trusted = rows.filter((a) => ['confirmed', 'actual'].includes(a.confidence));
  const sum = (list, f) => list.reduce((s, a) => s + f(a), 0);
  const assets = trusted.filter((a) => !a.is_liability);
  const debts = trusted.filter((a) => a.is_liability);
  // Undrawn works for a facility from either side: an account in credit
  // with a 1000 limit has 1000 undrawn; one overdrawn by 607.38 against
  // the same limit has 392.62 left.
  const undrawn = (a) => Math.max(0,
    Number(a.facility_limit ?? 0) - (a.is_liability ? Number(a.balance ?? 0) : 0));
  const net = sum(assets, (a) => Number(a.balance ?? 0)) - sum(debts, (a) => Number(a.balance ?? 0));
  return {
    totalAssets: sum(assets, (a) => Number(a.balance ?? 0)),
    earmarkedAssets: sum(assets, (a) => Number(a.balance ?? 0) * (a.earmark_pct ?? 0) / 100),
    totalLiabilities: sum(debts, (a) => Number(a.balance ?? 0)),
    netPosition: net,
    // What could be laid hands on today, borrowing included. Reported
    // separately from netPosition and never instead of it: an overdraft
    // adds to this and nothing to what is actually yours.
    undrawnFacilities: sum(trusted, undrawn),
    availableToDraw: net + sum(trusted, undrawn),
    accounts: rows,
    unconfirmed: rows.filter((a) => !['confirmed', 'actual'].includes(a.confidence)),
  };
}
