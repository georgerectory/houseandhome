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
import { ROAD_SHAPE, columns } from './road-shape.js';

let cache = null;
let sbClient = null;

/** The one Supabase client, signed in, or null after sending the reader
 *  to the login screen. Shared, so a page that reads the house and Road
 *  Ahead does not start two auth clients on one session. */
async function client() {
  if (!sbClient) {
    sbClient = (async () => {
      const { createClient } = await import(CONFIG.supabaseModule);
      return createClient(CONFIG.supabaseUrl, CONFIG.supabaseAnonKey);
    })();
  }
  const sb = await sbClient;
  const { data: { session } } = await sb.auth.getSession();
  if (!session) { location.replace('login.html'); return null; }
  return sb;
}

async function loadFixture() {
  if (cache) return cache;
  const res = await fetch(new URL('../../../data/fixtures/demo.json', import.meta.url));
  if (!res.ok) throw new Error(`fixture load failed: ${res.status}`);
  cache = await res.json();
  return cache;
}

async function loadLive() {
  const sb = await client();
  if (!sb) return null;

  // THE HOUSE. Exactly one property is active, committed or owned, and
  // every default view shows it plus the household's own rows. The views
  // filter in Postgres (in_default_scope); the base tables are filtered
  // here by the same rule, so a candidate being worked up alongside
  // never leaks into the roadmap, the budget or the shopping list.
  const { data: property, error: propertyError } = await sb.from('properties')
    .select('id, ref, name, status, address_line, postcode, offer_status, guide_price, walk_away_price')
    .in('status', ['active', 'committed', 'owned']).maybeSingle();
  if (propertyError) throw new Error(`Could not read the database - properties: ${propertyError.message}`);
  const scoped = (q) => (property
    ? q.or(`property_id.is.null,property_id.eq.${property.id}`)
    : q.is('property_id', null));

  const [rooms, items, bills, assets, storage, inventory, settings, prices,
    carried, accounts, shopping, totals, stock, review, links, docs, theme, ready, diary] = await Promise.all([
    scoped(sb.from('rooms').select('*')),
    scoped(sb.from('work_items').select('*')).order('priority'),
    scoped(sb.from('bills').select('*').eq('is_active', true)),
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
    scoped(sb.from('document_sections').select('*')).order('sort_order'),
    sb.from('theme_book').select('*').order('sort_order'),
    // WHY each job cannot be started yet, derived from the same edges
    // that drive the shopping list. The roadmap says what matters most;
    // this says what is actually doable.
    sb.from('work_item_readiness').select('*'),
    // The diary. Milestones, events and the auction countdown in one
    // list, with days_until already counted - see whats_next in
    // 89_road_ahead_logic.sql for why that is not the page's job.
    sb.from('whats_next').select('*').order('days_until'),
  ]);
  const { data: pot, error: potError } = await sb.from('pots')
    .select('*').eq('is_active', true).maybeSingle();

  // A failed query returns null data, which renders identically to an
  // empty database: "No work items yet." That is the worst possible
  // failure mode for a system whose whole job is to be honest about what
  // it knows, so a broken read is raised rather than swallowed.
  const failed = Object.entries({
    rooms, items, bills, assets, storage, inventory, settings, prices, carried,
    accounts, shopping, totals, stock, review, links, docs, theme, ready, diary, pot: { error: potError },
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
    property: property ?? null,
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
    whats_next: diary.data ?? [],
  };
  return cache;
}

export const isDemo = () => !CONFIG.supabaseUrl || !CONFIG.supabaseAnonKey;

export async function load() {
  return isDemo() ? loadFixture() : loadLive();
}

// --- Road Ahead ------------------------------------------------------
// Read by the Road Ahead page only: the register, the roads, the
// scenarios and the variables the engine runs on in the browser. The
// columns are ROAD_SHAPE's, so the demo (built from invented inputs by
// tools/build-road-fixture.mjs) and the live rows have one shape.

let roadCache = null;

async function loadRoadFixture() {
  const res = await fetch(new URL('../../../data/fixtures/road-ahead.json', import.meta.url));
  if (!res.ok) throw new Error(`fixture load failed: ${res.status}`);
  return res.json();
}

async function loadRoadLive() {
  const sb = await client();
  if (!sb) return null;
  const active = (t, part) => sb.from(t).select(columns(part)).eq('status', 'active');
  // listing_id rather than listing_code: the code is resolved below.
  const withListingId = (part) => ROAD_SHAPE[part].map((c) => (c === 'listing_code' ? 'listing_id' : c)).join(', ');
  const parts = {
    variables: active('ra_variables', 'variables').order('key'),
    scenarios: active('ra_scenarios', 'scenarios'),
    roads: active('ra_roads', 'roads').eq('kind', 'road').order('sort_order'),
    rules: active('ra_rules', 'rules').order('code'),
    register: sb.from('ra_register').select(columns('register')).order('code'),
    comparables: sb.from('ra_comparables').select(withListingId('comparables')),
    pipeline: sb.from('ra_pipeline').select(columns('pipeline')).order('due_on'),
    next: sb.from('whats_next').select(columns('next')).gte('days_until', 0).order('days_until').limit(12),
    ledger: sb.from('ra_model_vs_ledger').select(columns('ledger')),
    houses: active('ra_auction_houses', 'houses').order('code'),
    calendar: sb.from('ra_auction_calendar').select(columns('calendar')).neq('status', 'cancelled').order('on_date'),
    results: sb.from('ra_auction_results').select(withListingId('results')).order('sold_on', { ascending: false }),
    playbook: active('ra_playbook', 'playbook').order('sort_order'),
  };
  const names = Object.keys(parts);
  const results = await Promise.all(Object.values(parts));
  // A broken read is raised, never rendered as an empty register.
  const failed = results.map((r, i) => (r.error ? `${names[i]}: ${r.error.message}` : null)).filter(Boolean);
  if (failed.length) throw new Error(`Could not read Road Ahead - ${failed.join('; ')}`);
  const data = Object.fromEntries(names.map((n, i) => [n, results[i].data ?? []]));
  const codeById = new Map(data.register.map((r) => [r.id, r.code]));
  const byCode = ({ listing_id: id, ...row }) => ({ listing_code: codeById.get(id) ?? null, ...row });
  data.comparables = data.comparables.map(byCode);
  data.results = data.results.map(byCode);
  return { meta: { generated: new Date().toISOString().slice(0, 10), note: 'Live data.' }, ...data };
}

export async function loadRoadAhead() {
  if (!roadCache) roadCache = await (isDemo() ? loadRoadFixture() : loadRoadLive());
  return roadCache;
}
