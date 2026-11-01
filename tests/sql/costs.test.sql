\set ON_ERROR_STOP on
\pset pager off
begin;

create or replace function pass(t text) returns void language plpgsql as $$
begin raise notice 'PASS %', t; end $$;
create or replace function fail(t text, d text) returns void language plpgsql as $$
begin raise exception 'FAIL % : %', t, d; end $$;

-- cost_rollup only ADDS UP priced rows: these pin that every dimension
-- sums the right rows, that closed work drops out, and that the share
-- resting on unconfirmed figures is computed rather than assumed.

insert into households (id, name) values
  ('cccccccc-0000-0000-0000-000000000001','Costs house');
insert into properties (id, household_id, ref, name, status)
values ('cccccccc-1111-0000-0000-000000000001','cccccccc-0000-0000-0000-000000000001','P-901','Costs test','candidate');
insert into rooms (id, household_id, property_id, key, name, room_type)
values ('cccccccc-2222-0000-0000-000000000001','cccccccc-0000-0000-0000-000000000001',
        'cccccccc-1111-0000-0000-000000000001','kitchen','Kitchen','kitchen');

insert into work_items (household_id, property_id, room_id, title, kind, status, horizon, trade,
                        tags, cost_best, cost_expected, cost_worst, cost_confidence)
values
  ('cccccccc-0000-0000-0000-000000000001','cccccccc-1111-0000-0000-000000000001','cccccccc-2222-0000-0000-000000000001',
   'Kitchen units','renovation','idea','later','carpentry', array['stage:s1','idea:kitchen-diner'], 1000, 1500, 2000, 'confirmed'),
  ('cccccccc-0000-0000-0000-000000000001','cccccccc-1111-0000-0000-000000000001',null,
   'Steel beam','renovation','idea','later',null, array['stage:s1','idea:kitchen-diner'], 2000, 3000, 5000, 'drafted'),
  ('cccccccc-0000-0000-0000-000000000001','cccccccc-1111-0000-0000-000000000001',null,
   'Locks','repair','idea','next','security', array['case:low','case:mid'], 200, 300, 400, 'drafted'),
  ('cccccccc-0000-0000-0000-000000000001','cccccccc-1111-0000-0000-000000000001',null,
   'Already done','repair','done','now','security', array['case:low'], 999, 999, 999, 'actual');

do $$
declare r record;
begin
  select * into r from cost_rollup where property_id = 'cccccccc-1111-0000-0000-000000000001' and dim = 'idea' and key = 'kitchen-diner';
  if r.cost_base <> 4500 or r.cost_low <> 3000 or r.cost_high <> 7000 or r.items <> 2 then
    perform fail('idea sums its tagged rows', format('%s %s %s %s', r.cost_low, r.cost_base, r.cost_high, r.items)); end if;
  if r.cost_base_unconfirmed <> 3000 or r.unconfirmed_share <> 0.667 then
    perform fail('unconfirmed share is computed', format('%s %s', r.cost_base_unconfirmed, r.unconfirmed_share)); end if;
  perform pass('cost_rollup: an idea totals its own rows and says how much is unconfirmed');

  select * into r from cost_rollup where property_id = 'cccccccc-1111-0000-0000-000000000001' and dim = 'case' and key = 'low';
  if r.cost_base <> 300 then perform fail('closed work drops out', r.cost_base::text); end if;
  perform pass('cost_rollup: done and dropped work is not counted');

  select * into r from cost_rollup where property_id = 'cccccccc-1111-0000-0000-000000000001' and dim = 'room' and key = 'whole-house';
  if r.items <> 2 then perform fail('unroomed work is whole-house', r.items::text); end if;
  select * into r from cost_rollup where property_id = 'cccccccc-1111-0000-0000-000000000001' and dim = 'room' and key = 'kitchen';
  if r.cost_base <> 1500 then perform fail('room work is by room', r.cost_base::text); end if;
  perform pass('cost_rollup: work with a room counts there, the rest is whole-house');

  select * into r from cost_rollup where property_id = 'cccccccc-1111-0000-0000-000000000001' and dim = 'trade' and key = 'unassigned';
  if r.cost_base <> 3000 then perform fail('no trade is unassigned', r.cost_base::text); end if;
  perform pass('cost_rollup: work without a trade is reported, not lost');
end $$;

rollback;
