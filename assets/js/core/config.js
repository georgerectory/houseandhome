// config.js - where the data lives.
//
// The publishable key below is designed to be public in a browser and is
// safe to commit, but ONLY because row-level security is forced on every
// table and nothing is granted to anon. That is not a convention here:
// tests/sql/rls.test.sql proves the isolation, and the live project
// reports 45 tables with RLS on all of them, 118 policies, and zero
// tables or SECURITY DEFINER functions reachable by anon.
//
// The service_role key must never appear in this repository.
//
// Empty values fall back to demo mode against data/fixtures/demo.json,
// which is how the site stays runnable offline and in CI.
const DEFAULTS = {
  supabaseUrl: 'https://fggexvcodgmpkxkgpxet.supabase.co',
  supabaseAnonKey: 'sb_publishable_8aJevWV59aW0A7KLFM4I8A_5ig6wyiG',
  supabaseModule: 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm',
};

// A page may override these before the modules load. The only consumer
// is the test harness, which forces demo mode so the suite runs without
// network access and without touching the live database. Nothing in the
// application writes this.
export const CONFIG = { ...DEFAULTS, ...(globalThis.__HH_CONFIG__ ?? {}) };
