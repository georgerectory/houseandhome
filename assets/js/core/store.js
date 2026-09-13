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
  if (!session) { location.href = 'pages/login.html'; return null; }

  const [rooms, items, bills, assets] = await Promise.all([
    sb.from('rooms').select('*'),
    sb.from('work_items').select('*').order('priority'),
    sb.from('bills').select('*').eq('is_active', true),
    sb.from('assets').select('*'),
  ]);
  const { data: pot } = await sb.from('pots').select('*').eq('is_active', true).maybeSingle();

  cache = {
    meta: { generated: new Date().toISOString().slice(0, 10), note: 'Live data.' },
    pot: pot ?? null,
    rooms: rooms.data ?? [],
    items: items.data ?? [],
    bills: bills.data ?? [],
    assets: assets.data ?? [],
    storage: [], inventory: [],
    allocation_settings: { decay: 0.85, floor_share: 0.10 },
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
