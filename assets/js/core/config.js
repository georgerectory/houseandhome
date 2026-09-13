// config.js - where the data lives.
//
// Empty values mean demo mode: the site renders data/fixtures/demo.json
// and writes nothing. Filling these in switches every page to live
// Supabase with no other change.
//
// The anon (publishable) key is designed to be public in a browser and
// is safe to commit, but ONLY because row-level security is forced on
// every table. If RLS were ever disabled on a table, this key would
// read it. tests/sql/rls.test.sql is what keeps that honest.
//
// The service_role key must never appear in this repository.
export const CONFIG = {
  supabaseUrl: '',
  supabaseAnonKey: '',
  supabaseModule: 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm',
};
