\set ON_ERROR_STOP on
\pset pager off
begin;

create or replace function pass(t text) returns void language plpgsql as $$
begin raise notice 'PASS %', t; end $$;
create or replace function fail(t text, d text) returns void language plpgsql as $$
begin raise exception 'FAIL % : %', t, d; end $$;

-- The carry-over load. These figures cross from another Supabase account
-- as a file, because a session can only be authenticated to one account
-- at a time. That makes loading a REPEATABLE operation, and these tests
-- exist because the failure modes are silent: a second copy of every
-- line, or a line the owner has already dealt with quietly reappearing
-- on their list.

insert into households (id, name) values
  ('11111111-1111-1111-1111-111111111111', 'Test House');

-- The exact statement tools/carry-lib.mjs emits, with two rows.
-- The body is tagged $fn$ rather than $$ because the test data itself
-- contains a literal $$ - which is precisely the hazard the loader's
-- dynamic dollar tag exists to defuse, demonstrated here by accident.
create or replace function load_batch(p_batch uuid, p_amount numeric)
returns void language plpgsql as $fn$
begin
  insert into carried_finance
    (household_id, source_system, source_group, source_ref, label, amount,
     cadence, raw, captured_at, batch_id, review_status)
  select '11111111-1111-1111-1111-111111111111'::uuid, 'rec',
         t.source_group, t.source_ref, t.label, t.amount, t.cadence, t.raw,
         '2026-09-14T15:30:00Z'::timestamptz, p_batch, 'pending'
    from jsonb_to_recordset(
      jsonb_build_array(
        jsonb_build_object('source_group','ongoing_bills','source_ref','bill-1',
          'label','Energy','amount',p_amount,'cadence','monthly',
          'raw', jsonb_build_object('quirk', 'Someone''s "Energy" Ltd; $$')),
        jsonb_build_object('source_group','gift_cards','source_ref','gc-1',
          'label','Card','amount',40,'cadence',null,'raw', '{}'::jsonb)))
      as t(source_group text, source_ref text, label text, amount numeric,
           cadence text, raw jsonb)
  on conflict (household_id, source_system, source_group, source_ref)
  do update set label       = excluded.label,
                amount      = excluded.amount,
                cadence     = excluded.cadence,
                raw         = excluded.raw,
                captured_at = excluded.captured_at,
                batch_id    = excluded.batch_id;
end $fn$;

do $$
declare n int;
begin
  perform load_batch('aaaaaaaa-0000-0000-0000-000000000001', 92.50);
  select count(*) into n from carried_finance;
  if n <> 2 then perform fail('carry: first load', 'expected 2 rows, got '||n); end if;
  perform pass('carry: a load writes exactly the rows it carried');
end $$;

do $$
declare n int;
begin
  select count(*) into n from carried_finance where review_status <> 'pending';
  if n <> 0 then perform fail('carry: arrival state', 'something arrived already reviewed'); end if;
  perform pass('carry: everything lands unreviewed, so it drives nothing');
end $$;

do $$
declare n int; amt numeric;
begin
  -- The same extract, re-run. An interrupted load, or a cautious second
  -- go, must not double the archive.
  perform load_batch('aaaaaaaa-0000-0000-0000-000000000002', 95.00);
  select count(*) into n from carried_finance;
  if n <> 2 then perform fail('carry: idempotency', 'a re-load duplicated rows: '||n); end if;
  select amount into amt from carried_finance where source_ref = 'bill-1';
  if amt <> 95.00 then perform fail('carry: refresh', 'a re-load did not update the figure'); end if;
  perform pass('carry: a re-load updates in place and never duplicates');
end $$;

do $$
declare st text;
begin
  -- The owner deals with a line...
  update carried_finance
     set review_status = 'superseded', reviewed_at = now(),
         superseded_note = 'Re-entered as a real bill'
   where source_ref = 'bill-1';
  -- ...and the source is imported again.
  perform load_batch('aaaaaaaa-0000-0000-0000-000000000003', 97.00);
  select review_status into st from carried_finance where source_ref = 'bill-1';
  if st <> 'superseded' then
    perform fail('carry: reviewed lines', 'a re-import reopened a line the owner had already dealt with');
  end if;
  perform pass('carry: a reviewed line is never dragged back onto the list');
end $$;

-- Tagged $fid$ for the same reason as load_batch: the value under test
-- contains a literal $$.
do $fid$
declare q text;
begin
  select raw->>'quirk' into q from carried_finance where source_ref = 'bill-1';
  if q <> 'Someone''s "Energy" Ltd; $$' then
    perform fail('carry: fidelity', 'quoting mangled the original row: '||coalesce(q,'null'));
  end if;
  perform pass('carry: quotes, semicolons and dollar signs survive verbatim');
end $fid$;

do $$
begin
  begin
    -- Two households may legitimately carry the same source_ref; the
    -- natural key is scoped to the household, not global.
    insert into households (id, name) values
      ('99999999-9999-9999-9999-999999999999','Other House');
    insert into carried_finance (household_id, source_system, source_group, source_ref, label)
    values ('99999999-9999-9999-9999-999999999999','rec','ongoing_bills','bill-1','Energy');
    perform pass('carry: the natural key is scoped to the household');
  exception when unique_violation then
    perform fail('carry: key scope', 'one household blocked another from carrying the same reference');
  end;
end $$;

do $$
begin
  begin
    insert into carried_finance (household_id, source_system, source_group, source_ref, label, review_status)
    values ('11111111-1111-1111-1111-111111111111','rec','ongoing_bills','new-1','X','confirmed');
    perform fail('carry: review vocabulary', 'an unknown review status was accepted');
  exception when check_violation then
    perform pass('carry: review status is pending, superseded or dismissed - never "confirmed"');
  end;
end $$;

rollback;
