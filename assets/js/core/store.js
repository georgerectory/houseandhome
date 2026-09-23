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
    carried, accounts, shopping, totals, stock, review, links, docs, theme, ready] = await Promise.all([
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
    // THE DERIVED VIEWS. These were written, tested and then never read
    // by the site, which queried the base tables and re-derived a worse
    // answer client-side. shopping_list knows which purchases are
    // dormant, which are hire and which are already owned; the page
    // summing work_items directly knew none of it and totalled all
    // three into one number.
    sb.from('shopping_list').select('*'),
    sb.from('shopping_totals').select('*'),
    sb.from('stock_plan').select('*').not('status', 'in', '(complete,dropped)'),
    sb.from('review_queue').select('*').order('review_score', { ascending: false }),
    // The edges. Without them the client cannot see why anything is on
    // the list, which is what made the view necessary in the first place.
    sb.from('knowledge_links').select('*').is('valid_to', null),
    // THE DOCUMENT. Sections in reading order, so plan.html can render
    // the handbook rather than linking to a PDF that nothing can query
    // and nothing keeps in step.
    sb.from('document_sections').select('*').order('sort_order'),
    sb.from('theme_book').select('*').order('sort_order'),
    // WHY each job cannot be started yet, derived from the same edges
    // that drive the shopping list. The roadmap says what matters most;
    // this says what is actually doable.
    sb.from('work_item_readiness').select('*'),
  ]);
  const { data: pot, error: potError } = await sb.from('pots')
    .select('*').eq('is_active', true).maybeSingle();

  // A failed query returns null data, which renders identically to an
  // empty database: "No work items yet." That is the worst possible
  // failure mode for a system whose whole job is to be honest about what
  // it knows, so a broken read is raised rather than swallowed.
  const failed = Object.entries({
    rooms, items, bills, assets, storage, inventory, settings, prices, carried,
    accounts, shopping, totals, stock, review, links, docs, theme, ready, pot: { error: potError },
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
    shopping_list: shopping.data ?? [],
    shopping_totals: totals.data ?? [],
    stock_plan: stock.data ?? [],
    review_queue: review.data ?? [],
    knowledge_links: links.data ?? [],
    document_sections: docs.data ?? [],
    theme_book: theme.data ?? [],
    work_item_readiness: ready.data ?? [],
  };
  return cache;
}

export const isDemo = () => !CONFIG.supabaseUrl || !CONFIG.supabaseAnonKey;

export async function load() {
  return isDemo() ? loadFixture() : loadLive();
}

// --- Derived selectors, shared by every page ------------------------
