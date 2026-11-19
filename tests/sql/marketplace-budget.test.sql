\set ON_ERROR_STOP on
\pset pager off
begin;

create or replace function pass(t text) returns void language plpgsql as $$
begin raise notice 'PASS %', t; end $$;
create or replace function fail(t text, d text) returns void language plpgsql as $$
begin raise exception 'FAIL % : %', t, d; end $$;

-- The Marketplace budget against published figures. Every row here is
-- invented.

insert into households (id, name) values
  ('a2a2a2a2-0000-0000-0000-000000000001','Budget house A'),
  ('b2b2b2b2-0000-0000-0000-000000000001','Budget house B');
insert into household_members (household_id, user_id) values
  ('a2a2a2a2-0000-0000-0000-000000000001','a2a2a2a2-1111-1111-1111-111111111111'),
  ('b2b2b2b2-0000-0000-0000-000000000001','b2b2b2b2-1111-1111-1111-111111111111');

insert into mp_profiles (household_id, key, name, category, tier, wanted_qty, spec, purpose, price_confidence,
                         price_steal, price_good, price_fair, price_max, price_new, status, resolution) values
  ('a2a2a2a2-0000-0000-0000-000000000001','chest','Chest','storage','day_one',2,'x','utility','drafted',    40, 80, 130, 200, 650, 'hunting', null),
  ('a2a2a2a2-0000-0000-0000-000000000001','rug','Rug','textiles','first_year',1,'x','aesthetic','researched',50, 100, 200, 300, 900, 'hunting', null),
  ('a2a2a2a2-0000-0000-0000-000000000001','lamp','Lamp','lighting','day_one',3,'x',null,'drafted',            5, 10, 20, 30, 50, 'hunting', null),
  ('a2a2a2a2-0000-0000-0000-000000000001','done','Done','storage','day_one',1,'x','utility','drafted',        40, 80, 130, 200, 650, 'filled', 'found'),
  ('b2b2b2b2-0000-0000-0000-000000000001','chest','Chest','storage','day_one',1,'x','utility','drafted',      10, 20, 30, 40, 100, 'hunting', null);

insert into mp_new_buys (household_id, key, name, tier, quantity, price_low, price_mid, price_high, why_new, status, paid, resolution) values
  ('a2a2a2a2-0000-0000-0000-000000000001','mattress','Mattress','day_one',2,200,300,500,'Hygiene','planned',null,null),
  ('a2a2a2a2-0000-0000-0000-000000000001','towels','Towels','day_one',1,50,80,120,'Hygiene','bought',65,null),
  ('a2a2a2a2-0000-0000-0000-000000000001','telly','Television','first_year',1,300,400,600,'Guarantee','dropped',null,'Not wanted'),
  ('b2b2b2b2-0000-0000-0000-000000000001','mattress','Mattress','day_one',1,100,200,300,'Hygiene','planned',null,null);

insert into mp_benchmarks (household_id, key, label, covers, home, basis, amount_low, amount_mid, amount_high, sort_order, status, note) values
  ('a2a2a2a2-0000-0000-0000-000000000001','a','Furniture survey','furniture','first home','new',null,200,null,2,'active',null),
  ('a2a2a2a2-0000-0000-0000-000000000001','b','Whole house','furnishing','3-bed','new',500,null,1500,1,'active',null),
  ('a2a2a2a2-0000-0000-0000-000000000001','c','With decorating','furnishing_and_decorating','first home','mixed',null,5000,null,3,'active',null),
  ('a2a2a2a2-0000-0000-0000-000000000001','d','Old','furniture','x','new',null,1,null,4,'retired','Superseded'),
  ('b2b2b2b2-0000-0000-0000-000000000001','a','Furniture survey','furniture','first home','new',null,200,null,1,'active',null);

do $$
declare b record;
begin
  select * into b from mp_budget_position where household_id = 'a2a2a2a2-0000-0000-0000-000000000001';
  if b.kinds <> 3 then perform fail('budget position', 'kinds ' || b.kinds); end if;
  if (b.sh_steal, b.sh_good, b.sh_fair, b.sh_new) <> (145, 290, 520, 2350) then
    perform fail('budget position', format('second hand %s %s %s %s', b.sh_steal, b.sh_good, b.sh_fair, b.sh_new)); end if;
  if b.utility_good <> 190 or b.aesthetic_good <> 100 then
    perform fail('budget position', 'a profile with no purpose must count as utility'); end if;
  if b.unconfirmed_good <> 190 then perform fail('budget position', 'unconfirmed ' || b.unconfirmed_good); end if;
  if (b.new_kinds, b.new_low, b.new_mid, b.new_high) <> (2, 465, 665, 1065) then
    perform fail('budget position', format('new %s %s %s %s: bought at what was paid, dropped not at all',
      b.new_kinds, b.new_low, b.new_mid, b.new_high)); end if;
  if (b.all_in_steal, b.all_in_good, b.all_in_fair, b.day_one_all_in) <> (610, 955, 1585, 855) then
    perform fail('budget position', format('all in %s %s %s, day one %s', b.all_in_steal, b.all_in_good, b.all_in_fair, b.day_one_all_in)); end if;
  if b.aesthetic_share <> 0.3448 or b.unconfirmed_share <> 0.6552 then
    perform fail('budget position', format('shares %s %s', b.aesthetic_share, b.unconfirmed_share)); end if;
  perform pass('budget position: the whole plan at each price point, new buys beside it, utility against looks');
end $$;

do $$
declare got text;
begin
  select string_agg(key || ':' || compared_with || ':' || ours_good || ':' || position || ':' || ratio, ' ' order by sort_order, key)
    into got from mp_budget_vs_benchmarks where household_id = 'a2a2a2a2-0000-0000-0000-000000000001';
  if got <> 'b:all_in:955.00:within:0.9550 a:second_hand_plan:290.00:above:1.4500 c:all_in:955.00:below:0.1910' then
    perform fail('budget vs benchmarks', got); end if;
  perform pass('budget vs benchmarks: each beside the figure that covers the same ground; retired left out');
end $$;

do $$
begin
  begin
    insert into mp_new_buys (household_id, key, name, price_low, price_mid, price_high, why_new)
      values ('a2a2a2a2-0000-0000-0000-000000000001','bad','Bad', 300, 200, 100, 'x');
    perform fail('new buys', 'low above high was accepted');
  exception when check_violation then null; end;
  begin
    insert into mp_benchmarks (household_id, key, label, covers, home, basis)
      values ('a2a2a2a2-0000-0000-0000-000000000001','empty','Empty','furniture','x','new');
    perform fail('benchmarks', 'a benchmark with no figure was accepted');
  exception when check_violation then null; end;
  begin
    update mp_new_buys set price_mid = 310 where key = 'mattress' and household_id = 'a2a2a2a2-0000-0000-0000-000000000001';
    perform fail('new buys', 'a price changed with no reason given');
  exception when check_violation then null; end;
  perform set_config('house.change_why', 'test', true);
  update mp_new_buys set price_mid = 310 where key = 'mattress' and household_id = 'a2a2a2a2-0000-0000-0000-000000000001';
  if not exists (select 1 from change_log where entity_type = 'mp_new_buys' and field = 'price_mid' and new_value = '310.00') then
    perform fail('new buys', 'the change was not logged'); end if;
  perform set_config('house.change_why', '', true);
  perform pass('new buys and benchmarks: ordered prices, a figure required, money never changes silently');
end $$;

grant usage on schema public to authenticated;
grant select, insert, update on all tables in schema public to authenticated;
set local role authenticated;
set local request.jwt.claim.sub = 'b2b2b2b2-1111-1111-1111-111111111111';

do $$
declare t text; n int;
begin
  foreach t in array array['mp_new_buys','mp_benchmarks','mp_budget_position','mp_budget_vs_benchmarks'] loop
    execute format('select count(*) from %I where household_id = %L', t, 'a2a2a2a2-0000-0000-0000-000000000001') into n;
    if n <> 0 then perform fail('budget RLS', format('user B reads %s rows of %s', n, t)); end if;
    execute format('select count(*) from %I', t) into n;
    if n = 0 then perform fail('budget RLS', 'user B cannot read their own ' || t); end if;
  end loop;
  begin
    insert into mp_benchmarks (household_id, key, label, covers, home, basis, amount_mid)
      values ('a2a2a2a2-0000-0000-0000-000000000001','planted','Planted','furniture','x','new',1);
    perform fail('budget RLS', 'user B wrote into household A');
  exception when insufficient_privilege then null; end;
  update mp_new_buys set name = 'taken' where household_id = 'a2a2a2a2-0000-0000-0000-000000000001';
  get diagnostics n = row_count;
  if n <> 0 then perform fail('budget RLS', 'user B updated household A'); end if;
  perform pass('budget RLS: user B reads and writes only their own household, tables and views');
end $$;

reset role;

rollback;
