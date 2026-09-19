\set ON_ERROR_STOP on
\pset pager off
begin;

create or replace function pass(t text) returns void language plpgsql as $$
begin raise notice 'PASS %', t; end $$;
create or replace function fail(t text, d text) returns void language plpgsql as $$
begin raise exception 'FAIL % : %', t, d; end $$;

-- The stockpile exists to answer one question over two years: how many
-- of the thing do we have, against how many we need. Everything below
-- tests that the answer cannot drift from the hauls it is made of, and
-- that a target which cannot be matched against a listing is refused at
-- the door.

insert into households (id, name) values
  ('cccccccc-0000-0000-0000-000000000001','Stock house');

insert into household_members (household_id, user_id) values
  ('cccccccc-0000-0000-0000-000000000001','cccccccc-1111-1111-1111-111111111111');

insert into stock_targets (id, household_id, name, category, spec, acquisition,
  unit, quantity_needed, quantity_basis, wastage_pct,
  unit_price_reclaimed, unit_price_new)
values (
  'cccccccc-2222-0000-0000-000000000001',
  'cccccccc-0000-0000-0000-000000000001',
  'Reclaimed imperial red brick', 'brick',
  'Imperial 9 x 4 3/8 x 2 5/8in, soft red, sand-struck, circa 1880',
  'reclaimed', 'each', 1000, 'Wall face area off the model x 60/m2', 10,
  1.20, 2.40);

-- ---------------------------------------------------------------
-- The running total is DERIVED. Nothing writes quantity_held.
-- ---------------------------------------------------------------
do $$
declare held numeric; outstanding numeric; pct numeric;
begin
  select quantity_held, quantity_outstanding, pct_collected
    into held, outstanding, pct
  from stock_status where id = 'cccccccc-2222-0000-0000-000000000001';

  if held <> 0 then perform fail('stock: a target with no hauls holds nothing',
    'held is ' || held); end if;
  -- 1000 needed + 10% wastage = 1100 to collect.
  if outstanding <> 1100 then perform fail('stock: wastage is applied to the target',
    'outstanding is ' || outstanding || ', expected 1100'); end if;
  perform pass('stock: an empty target is 0 of 1100, wastage included');
end $$;

insert into stock_acquisitions (household_id, stock_target_id, acquired_on,
  quantity, unit_price, total_paid, source, matches_spec)
values
  ('cccccccc-0000-0000-0000-000000000001','cccccccc-2222-0000-0000-000000000001',
   date '2026-03-01', 300, 1.10, 330, 'Marketplace, Wimborne', true),
  ('cccccccc-0000-0000-0000-000000000001','cccccccc-2222-0000-0000-000000000001',
   date '2026-05-14', 250, 1.30, 325, 'Reclamation yard, Poole', true);

do $$
declare held numeric; hauls int; spent numeric; outstanding numeric; pct numeric; last_on date;
begin
  select quantity_held, haul_count, spent_so_far, quantity_outstanding,
         pct_collected, last_acquired_on
    into held, hauls, spent, outstanding, pct, last_on
  from stock_status where id = 'cccccccc-2222-0000-0000-000000000001';

  if held <> 550 then perform fail('stock: held is the sum of the hauls',
    'held is ' || held); end if;
  if hauls <> 2 then perform fail('stock: hauls are counted', 'count is ' || hauls); end if;
  if spent <> 655 then perform fail('stock: spend is the sum of what was paid',
    'spent is ' || spent); end if;
  if outstanding <> 550 then perform fail('stock: outstanding is to-collect less held',
    'outstanding is ' || outstanding); end if;
  if pct <> 50.0 then perform fail('stock: progress is a percentage of the collect target',
    'pct is ' || pct); end if;
  if last_on <> date '2026-05-14' then perform fail('stock: the last haul date is the latest',
    'last is ' || last_on); end if;
  perform pass('stock: two hauls sum to 550 of 1100, 50 per cent, 655 spent');
end $$;

-- ---------------------------------------------------------------
-- BREAKAGE LEAVES THE PILE WITHOUT A ROW BEING DELETED. Nothing here
-- is ever deleted, so rejects are a negative haul with a reason.
-- ---------------------------------------------------------------
insert into stock_acquisitions (household_id, stock_target_id, acquired_on,
  quantity, reason, matches_spec)
values ('cccccccc-0000-0000-0000-000000000001','cccccccc-2222-0000-0000-000000000001',
  date '2026-05-20', -40, 'Wirecut, not sand-struck. Sorted out and set aside.', false);

do $$
declare held numeric; hauls int;
begin
  select quantity_held, haul_count into held, hauls
  from stock_status where id = 'cccccccc-2222-0000-0000-000000000001';
  if held <> 510 then perform fail('stock: a reject reduces the pile',
    'held is ' || held); end if;
  if hauls <> 3 then perform fail('stock: a reject is still a recorded haul',
    'count is ' || hauls); end if;
  perform pass('stock: 40 rejects leave the pile as a negative haul, not a delete');
end $$;

-- ---------------------------------------------------------------
-- The saving is what the whole exercise is for, so it is computed
-- rather than asserted in prose.
-- ---------------------------------------------------------------
do $$
declare saving numeric; cost_r numeric; cost_n numeric;
begin
  select saving_if_reclaimed, outstanding_cost_reclaimed, outstanding_cost_new
    into saving, cost_r, cost_n
  from stock_status where id = 'cccccccc-2222-0000-0000-000000000001';
  -- 1100 to collect x (2.40 - 1.20) = 1320.
  if saving <> 1320 then perform fail('stock: the saving is the whole quantity x the price gap',
    'saving is ' || saving); end if;
  -- 590 outstanding x each price.
  if cost_r <> 708 then perform fail('stock: outstanding at the reclaimed price',
    'is ' || cost_r); end if;
  if cost_n <> 1416 then perform fail('stock: outstanding at the new price',
    'is ' || cost_n); end if;
  perform pass('stock: collecting reclaimed saves 1320 against buying the lot new');
end $$;

-- ---------------------------------------------------------------
-- A TARGET WITHOUT A SPEC IS REFUSED. "Reclaimed brick" is not
-- something you can hold a listing up against, and a stockpile of
-- nearly-matching things cannot build a wall.
-- ---------------------------------------------------------------
do $$
begin
  begin
    insert into stock_targets (household_id, name, category, spec)
    values ('cccccccc-0000-0000-0000-000000000001','Vague brick','brick','   ');
    perform fail('stock: a blank spec is refused', 'the insert succeeded');
  exception when check_violation then
    perform pass('stock: a target with a blank spec is refused');
  end;
end $$;

-- ---------------------------------------------------------------
-- CLOSING A LINE SAYS WHY, like every other table here.
-- ---------------------------------------------------------------
do $$
begin
  begin
    update stock_targets set status = 'complete'
    where id = 'cccccccc-2222-0000-0000-000000000001';
    perform fail('stock: completing without a resolution is refused', 'the update succeeded');
  exception when check_violation then
    perform pass('stock: a target cannot be completed or dropped without a resolution');
  end;
end $$;

-- ---------------------------------------------------------------
-- RLS: the stockpile is household data like everything else, and the
-- VIEW has to respect it too. A view runs as its owner by default,
-- which would read straight past row level security.
-- ---------------------------------------------------------------
insert into households (id, name) values
  ('dddddddd-0000-0000-0000-000000000001','Other house');
insert into household_members (household_id, user_id) values
  ('dddddddd-0000-0000-0000-000000000001','dddddddd-1111-1111-1111-111111111111');

grant usage on schema public to authenticated;
grant select, insert, update on all tables in schema public to authenticated;
grant select on public.stock_status to authenticated;

set local role authenticated;
set local request.jwt.claims = '{"sub":"dddddddd-1111-1111-1111-111111111111"}';

do $$
declare n int;
begin
  select count(*) into n from stock_targets;
  if n <> 0 then perform fail('stock RLS: another household sees no targets',
    'saw ' || n); end if;

  select count(*) into n from stock_acquisitions;
  if n <> 0 then perform fail('stock RLS: another household sees no hauls',
    'saw ' || n); end if;

  select count(*) into n from stock_status;
  if n <> 0 then perform fail('stock RLS: the VIEW does not leak either',
    'saw ' || n || ' - the view is probably missing security_invoker'); end if;

  perform pass('stock RLS: targets, hauls and the derived view are all household-scoped');
end $$;

reset role;

rollback;
