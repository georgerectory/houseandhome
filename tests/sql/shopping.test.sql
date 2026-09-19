\set ON_ERROR_STOP on
\pset pager off
begin;

create or replace function pass(t text) returns void language plpgsql as $$
begin raise notice 'PASS %', t; end $$;
create or replace function fail(t text, d text) returns void language plpgsql as $$
begin raise exception 'FAIL % : %', t, d; end $$;

-- The shopping list exists to answer one question honestly: what does
-- the project owe RIGHT NOW. Everything below tests the rule that makes
-- that answer trustworthy - a thing is on the list because a live job
-- requires it, and nothing else puts it there.

insert into households (id, name) values
  ('eeeeeeee-0000-0000-0000-000000000001','Shopping house');
insert into household_members (household_id, user_id) values
  ('eeeeeeee-0000-0000-0000-000000000001','eeeeeeee-1111-1111-1111-111111111111');

-- A job nobody has started, and a job about to happen.
insert into work_items (id, household_id, title, kind, status, horizon, phase)
values
  ('eeeeeeee-2222-0000-0000-00000000000a','eeeeeeee-0000-0000-0000-000000000001',
   'Dig the foundations','renovation','idea','someday','extension'),
  ('eeeeeeee-2222-0000-0000-00000000000b','eeeeeeee-0000-0000-0000-000000000001',
   'Strip back to brick','renovation','planned','next','strip_out');

-- Four purchases: one behind the dig, one behind the strip, one that is
-- its own reason, and one that is hired rather than bought.
insert into work_items (id, household_id, title, kind, status, horizon, phase,
                        acquisition, cost_expected, cost_confidence)
values
  ('eeeeeeee-3333-0000-0000-000000000001','eeeeeeee-0000-0000-0000-000000000001',
   'Mini digger hire','purchase','idea','someday','extension','hire', 750, 'drafted'),
  ('eeeeeeee-3333-0000-0000-000000000002','eeeeeeee-0000-0000-0000-000000000001',
   'Dust extractor','purchase','planned','next','strip_out','new', 380, 'drafted'),
  ('eeeeeeee-3333-0000-0000-000000000003','eeeeeeee-0000-0000-0000-000000000001',
   'Bedding','purchase','planned','now','move_in','new', 100, 'confirmed'),
  ('eeeeeeee-3333-0000-0000-000000000004','eeeeeeee-0000-0000-0000-000000000001',
   'Builders skip','purchase','planned','next','strip_out','hire', 320, 'drafted');

insert into knowledge_links (household_id, from_type, from_id, to_type, to_id, kind, confidence)
values
  ('eeeeeeee-0000-0000-0000-000000000001','work_item','eeeeeeee-2222-0000-0000-00000000000a',
   'work_item','eeeeeeee-3333-0000-0000-000000000001','requires_material','derived'),
  ('eeeeeeee-0000-0000-0000-000000000001','work_item','eeeeeeee-2222-0000-0000-00000000000b',
   'work_item','eeeeeeee-3333-0000-0000-000000000002','requires_material','derived'),
  ('eeeeeeee-0000-0000-0000-000000000001','work_item','eeeeeeee-2222-0000-0000-00000000000b',
   'work_item','eeeeeeee-3333-0000-0000-000000000004','requires_material','derived');

-- ---------------------------------------------------------------
-- NO DIGGING, NO DIGGER. The rule the whole list runs on.
-- ---------------------------------------------------------------
do $$
declare st text; cost numeric;
begin
  select demand_state, cost_in_scope into st, cost
  from shopping_list where id = 'eeeeeeee-3333-0000-0000-000000000001';
  if st <> 'dormant' then perform fail('shopping: a digger behind an idea job is dormant',
    'state is ' || st); end if;
  if cost <> 0 then perform fail('shopping: a dormant item costs the list nothing yet',
    'cost_in_scope is ' || cost); end if;

  select demand_state into st from shopping_list
  where id = 'eeeeeeee-3333-0000-0000-000000000002';
  if st <> 'live' then perform fail('shopping: an item behind a planned/next job is live',
    'state is ' || st); end if;

  select demand_state into st from shopping_list
  where id = 'eeeeeeee-3333-0000-0000-000000000003';
  if st <> 'standalone' then perform fail('shopping: an item nothing requires stands alone',
    'state is ' || st); end if;
  perform pass('shopping: no digging, no digger - and a bed needs no job behind it');
end $$;

-- ---------------------------------------------------------------
-- MOVING THE JOB MOVES THE LIST. Nothing is stored, so the whole
-- thing re-derives. This is the "adapts when the plans change" rule,
-- and it is the one worth proving rather than asserting.
-- ---------------------------------------------------------------
update work_items set status = 'planned', horizon = 'next'
where id = 'eeeeeeee-2222-0000-0000-00000000000a';

do $$
declare st text; cost numeric;
begin
  select demand_state, cost_in_scope into st, cost
  from shopping_list where id = 'eeeeeeee-3333-0000-0000-000000000001';
  if st <> 'live' then perform fail('shopping: waking the job wakes the digger',
    'state is ' || st); end if;
  if cost <> 750 then perform fail('shopping: a woken item brings its cost with it',
    'cost_in_scope is ' || cost); end if;
  perform pass('shopping: moving the dig to planned/next puts the digger on the list');
end $$;

-- And dropping the job takes it away again, without anybody editing
-- the digger.
update work_items set status = 'dropped', resolution = 'Extension deferred.'
where id = 'eeeeeeee-2222-0000-0000-00000000000a';

do $$
declare st text;
begin
  select demand_state into st from shopping_list
  where id = 'eeeeeeee-3333-0000-0000-000000000001';
  if st <> 'standalone' then perform fail(
    'shopping: a dropped job leaves the digger with no demand at all',
    'state is ' || st); end if;
  perform pass('shopping: dropping the only job that wanted it releases the digger');
end $$;

-- Put it back as it was for the totals below.
update work_items set status = 'idea', horizon = 'someday', resolution = null
where id = 'eeeeeeee-2222-0000-0000-00000000000a';

-- ---------------------------------------------------------------
-- HIRE IS NOT A PURCHASE, and a total that adds them together says
-- the project owns a skip.
-- ---------------------------------------------------------------
do $$
declare buy numeric; hire numeric; total numeric; dorm numeric; unconf numeric;
begin
  select buy_cost, hire_cost, total_in_scope, dormant_cost, unconfirmed_cost
    into buy, hire, total, dorm, unconf
  from shopping_totals
  where household_id = 'eeeeeeee-0000-0000-0000-000000000001' and phase = 'strip_out';

  if buy <> 380 then perform fail('shopping: buy is the extractor alone', 'buy is ' || buy); end if;
  if hire <> 320 then perform fail('shopping: hire is the skip alone', 'hire is ' || hire); end if;
  if total <> 700 then perform fail('shopping: the total is both', 'total is ' || total); end if;
  if unconf <> 700 then perform fail('shopping: both are drafted, so all of it is unconfirmed',
    'unconfirmed is ' || unconf); end if;
  perform pass('shopping: hire and purchase are totalled apart');
end $$;

do $$
declare hire numeric; dorm numeric;
begin
  -- A phase with no hire at all reports zero, NOT null. A filtered sum
  -- over no rows returns null, and null in a money column reads as
  -- "unknown" when the answer is "nothing".
  select hire_cost, dormant_cost into hire, dorm
  from shopping_totals
  where household_id = 'eeeeeeee-0000-0000-0000-000000000001' and phase = 'move_in';
  if hire is null then perform fail('shopping: a phase with no hire reports 0, not null',
    'hire_cost is null'); end if;
  if hire <> 0 then perform fail('shopping: move_in hires nothing', 'hire is ' || hire); end if;
  if dorm <> 0 then perform fail('shopping: move_in parks nothing', 'dormant is ' || dorm); end if;

  select dormant_cost into dorm from shopping_totals
  where household_id = 'eeeeeeee-0000-0000-0000-000000000001' and phase = 'extension';
  if dorm <> 750 then perform fail('shopping: parked money is reported, not hidden',
    'dormant_cost is ' || dorm); end if;
  perform pass('shopping: empty filters total to zero, and parked money stays visible');
end $$;

-- ---------------------------------------------------------------
-- A CLOSED LINK STOPS COUNTING. Links close, they do not delete, and
-- a closed one must not keep a purchase alive.
-- ---------------------------------------------------------------
update knowledge_links set valid_to = now()
where to_id = 'eeeeeeee-3333-0000-0000-000000000002';

do $$
declare st text;
begin
  select demand_state into st from shopping_list
  where id = 'eeeeeeee-3333-0000-0000-000000000002';
  if st <> 'standalone' then perform fail('shopping: a closed link no longer demands anything',
    'state is ' || st); end if;
  perform pass('shopping: closing a link releases the purchase it held');
end $$;

-- ---------------------------------------------------------------
-- RLS: the views are the easiest place to leak a household, because a
-- view runs as its OWNER unless it is told otherwise.
-- ---------------------------------------------------------------
insert into households (id, name) values
  ('ffffffff-0000-0000-0000-000000000001','Other shopping house');
insert into household_members (household_id, user_id) values
  ('ffffffff-0000-0000-0000-000000000001','ffffffff-1111-1111-1111-111111111111');

grant usage on schema public to authenticated;
grant select, insert, update on all tables in schema public to authenticated;
grant select on public.shopping_list, public.shopping_totals, public.stock_plan
  to authenticated;

set local role authenticated;
set local request.jwt.claims = '{"sub":"ffffffff-1111-1111-1111-111111111111"}';

do $$
declare n int;
begin
  select count(*) into n from shopping_list;
  if n <> 0 then perform fail('shopping RLS: the list does not leak',
    'saw ' || n || ' - shopping_list is probably missing security_invoker'); end if;
  select count(*) into n from shopping_totals;
  if n <> 0 then perform fail('shopping RLS: the totals do not leak either',
    'saw ' || n); end if;
  select count(*) into n from stock_plan;
  if n <> 0 then perform fail('shopping RLS: stock_plan does not leak',
    'saw ' || n); end if;
  perform pass('shopping RLS: all three derived views are household-scoped');
end $$;

reset role;

rollback;
