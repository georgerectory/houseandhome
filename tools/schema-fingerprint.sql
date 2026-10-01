-- ------------------------------------------------------------------
-- schema-fingerprint.sql - is the live database the repository?
--
-- One digest per kind of schema object. Run it in two places and the
-- rows must match:
--
--   live:   paste this file into the Supabase connector (execute_sql)
--   repo:   npm run schema:fingerprint   (applies supabase/schema to a
--           throwaway Postgres and runs this file there)
--
-- A kind whose digest differs is drilled into by replacing the last
-- statement with `select k, n, h from items where k = '<kind>' order by n`
-- in both places and comparing the rows.
--
-- WHAT IS COMPARED, AND WHAT IS NOT.
--   * Columns by name, type, nullability and default - but NOT by
--     physical position. A column added live with ALTER lands at the
--     end of the table while the repository may declare it inline; the
--     position is invisible except to `t.*` in a view, and views are
--     compared on their own (columns in order, and the definition).
--   * Function bodies with comments and whitespace removed, because the
--     connector can strip comments from what it applies. Security
--     definer, volatility, search_path, result type and the anon and
--     authenticated grants are compared exactly.
--   * Constraints, indexes, policies, triggers and the RLS switches as
--     Postgres itself prints them.
-- ------------------------------------------------------------------
with items as (
  select 'columns' k, table_name::text n,
         md5(string_agg(column_name || ':' || data_type || ':' || is_nullable || ':'
             || coalesce(column_default, ''), '|' order by column_name)) h
    from information_schema.columns
   where table_schema = 'public'
   group by table_name
  union all
  select 'constraints', conrelid::regclass::text,
         md5(string_agg(conname || '=' || pg_get_constraintdef(oid), '|' order by conname))
    from pg_constraint
   where connamespace = 'public'::regnamespace and conrelid <> 0
   group by conrelid
  union all
  select 'indexes', c.relname::text,
         md5(string_agg(pg_get_indexdef(i.indexrelid), '|' order by pg_get_indexdef(i.indexrelid)))
    from pg_index i join pg_class c on c.oid = i.indrelid
   where c.relnamespace = 'public'::regnamespace
   group by c.relname
  union all
  select 'functions', p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')',
         md5(regexp_replace(regexp_replace(p.prosrc, '--[^\n]*', '', 'g'), '\s+', '', 'g')
             || '|' || p.prosecdef || '|' || p.provolatile::text
             || '|' || coalesce(array_to_string(p.proconfig, ','), '')
             || '|' || pg_get_function_result(p.oid)
             || '|anon=' || has_function_privilege('anon', p.oid, 'execute')
             || '|auth=' || has_function_privilege('authenticated', p.oid, 'execute'))
    from pg_proc p
   where p.pronamespace = 'public'::regnamespace and p.prokind = 'f'
  union all
  select 'views', c.relname::text,
         md5(coalesce(array_to_string(c.reloptions, ','), '') || '|'
             || (select string_agg(a.attname || ':' || format_type(a.atttypid, a.atttypmod), '|' order by a.attnum)
                   from pg_attribute a where a.attrelid = c.oid and a.attnum > 0)
             || '|' || pg_get_viewdef(c.oid))
    from pg_class c
   where c.relnamespace = 'public'::regnamespace and c.relkind = 'v'
  union all
  select 'policies', tablename::text,
         md5(string_agg(policyname || ':' || cmd || ':' || coalesce(qual, '') || ':'
             || coalesce(with_check, '') || ':' || array_to_string(roles, ','), '|' order by policyname))
    from pg_policies
   where schemaname = 'public'
   group by tablename
  union all
  select 'triggers', c.relname::text,
         md5(string_agg(pg_get_triggerdef(t.oid), '|' order by t.tgname))
    from pg_trigger t join pg_class c on c.oid = t.tgrelid
   where c.relnamespace = 'public'::regnamespace and not t.tgisinternal
   group by c.relname
  union all
  select 'rls', relname::text, md5(relrowsecurity || '/' || relforcerowsecurity)
    from pg_class
   where relnamespace = 'public'::regnamespace and relkind = 'r'
)
select k, count(*) as objects, md5(string_agg(n || '=' || h, '|' order by n)) as digest
  from items
 group by k
 order by k;
