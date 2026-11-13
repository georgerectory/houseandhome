\set ON_ERROR_STOP on
\pset pager off
begin;

create or replace function pass(t text) returns void language plpgsql as $$
begin raise notice 'PASS %', t; end $$;
create or replace function fail(t text, d text) returns void language plpgsql as $$
begin raise exception 'FAIL % : %', t, d; end $$;

-- Marketplace: profiles, finds and the money derived from them. Every
-- row here is invented.

insert into households (id, name) values
  ('a1a1a1a1-0000-0000-0000-000000000001','Market house A'),
  ('b1b1b1b1-0000-0000-0000-000000000001','Market house B');
insert into household_members (household_id, user_id) values
  ('a1a1a1a1-0000-0000-0000-000000000001','a1a1a1a1-1111-1111-1111-111111111111'),
  ('b1b1b1b1-0000-0000-0000-000000000001','b1b1b1b1-1111-1111-1111-111111111111');

insert into mp_brief (household_id, style_brief, reject_brief, home_base) values
  ('a1a1a1a1-0000-0000-0000-000000000001','Plain and old','Shiny and new','Anytown'),
  ('b1b1b1b1-0000-0000-0000-000000000001','Other','Other','Othertown');

insert into mp_profiles (id, household_id, key, name, category, tier, wanted_qty, spec,
                         price_steal, price_good, price_fair, price_max, price_new)
values
  ('a1a1a1a1-2222-0000-0000-000000000001','a1a1a1a1-0000-0000-0000-000000000001',
   'chest','Chest of drawers','storage','day_one',2,'Solid timber, dovetailed', 40, 80, 130, 200, 650),
  ('a1a1a1a1-2222-0000-0000-000000000002','a1a1a1a1-0000-0000-0000-000000000001',
   'knobs','Brass knobs','hardware','opportunistic',0,'Cast brass', 1, 2, 3, 4, 8),
  ('b1b1b1b1-2222-0000-0000-000000000001','b1b1b1b1-0000-0000-0000-000000000001',
   'chest','Chest of drawers','storage','day_one',1,'Any', 10, 20, 30, 40, 100);

insert into mp_finds (id, household_id, profile_id, title, asking_price, quantity) values
  ('a1a1a1a1-3333-0000-0000-000000000001','a1a1a1a1-0000-0000-0000-000000000001','a1a1a1a1-2222-0000-0000-000000000001','steal',  40, 1),
  ('a1a1a1a1-3333-0000-0000-000000000002','a1a1a1a1-0000-0000-0000-000000000001','a1a1a1a1-2222-0000-0000-000000000001','good',  160, 2),
  ('a1a1a1a1-3333-0000-0000-000000000003','a1a1a1a1-0000-0000-0000-000000000001','a1a1a1a1-2222-0000-0000-000000000001','fair',  130, 1),
  ('a1a1a1a1-3333-0000-0000-000000000004','a1a1a1a1-0000-0000-0000-000000000001','a1a1a1a1-2222-0000-0000-000000000001','high',  200, 1),
  ('a1a1a1a1-3333-0000-0000-000000000005','a1a1a1a1-0000-0000-0000-000000000001','a1a1a1a1-2222-0000-0000-000000000001','over',  201, 1),
  ('a1a1a1a1-3333-0000-0000-000000000006','a1a1a1a1-0000-0000-0000-000000000001',null,'no profile', 5, 1),
  ('b1b1b1b1-3333-0000-0000-000000000001','b1b1b1b1-0000-0000-0000-000000000001','b1b1b1b1-2222-0000-0000-000000000001','B find', 5, 1);

insert into mp_searches (household_id, label, query) values
  ('a1a1a1a1-0000-0000-0000-000000000001','A search','chest of drawers'),
  ('b1b1b1b1-0000-0000-0000-000000000001','B search','chest of drawers');
insert into mp_grounds (id, household_id, key, name, kind) values
  ('a1a1a1a1-4444-0000-0000-000000000001','a1a1a1a1-0000-0000-0000-000000000001','saleroom','A saleroom','auction'),
  ('b1b1b1b1-4444-0000-0000-000000000001','b1b1b1b1-0000-0000-0000-000000000001','saleroom','B saleroom','auction');

-- ---------------------------------------------------------------
-- The price band is computed from the unit price, at each boundary.
-- ---------------------------------------------------------------
do $$
declare r record;
begin
  for r in select title, price_band from mp_find_ledger
            where household_id = 'a1a1a1a1-0000-0000-0000-000000000001' and profile_id is not null loop
    if r.price_band is distinct from r.title then
      perform fail('marketplace: band', r.title || ' came out ' || coalesce(r.price_band, 'null'));
    end if;
  end loop;
  perform pass('marketplace: steal, good, fair, high and over each land on their boundary, per unit');
  if (select price_band from mp_find_ledger where title = 'no profile') is not null then
    perform fail('marketplace: band', 'a find with no profile has a band'); end if;
  perform pass('marketplace: a find with no profile has no band');
end $$;

-- ---------------------------------------------------------------
-- Constraints.
-- ---------------------------------------------------------------
do $$
begin
  begin
    update mp_profiles set price_steal = 90 where id = 'a1a1a1a1-2222-0000-0000-000000000001';
    perform fail('marketplace: ladder', 'steal above good was accepted');
  exception when check_violation then null; end;
  perform pass('marketplace: the ladder refuses steal above good');
  begin
    update mp_finds set status = 'bought' where id = 'a1a1a1a1-3333-0000-0000-000000000001';
    perform fail('marketplace: bought', 'bought with no price was accepted');
  exception when check_violation then null; end;
  perform pass('marketplace: bought refuses a null paid');
  begin
    update mp_profiles set status = 'dropped' where id = 'a1a1a1a1-2222-0000-0000-000000000002';
    perform fail('marketplace: resolution', 'dropped with no resolution was accepted');
  exception when check_violation then null; end;
  perform pass('marketplace: a profile closes with a resolution or not at all');
end $$;

-- ---------------------------------------------------------------
-- The board and the totals are derived from the finds.
-- ---------------------------------------------------------------
update mp_finds set status = 'bought', paid = 35, travel_cost = 5, bought_on = current_date
 where id = 'a1a1a1a1-3333-0000-0000-000000000001';

do $$
declare b record; t record; l record;
begin
  select * into b from mp_board where id = 'a1a1a1a1-2222-0000-0000-000000000001';
  if b.bought_qty <> 1 or b.qty_outstanding <> 1 or b.spent <> 40 or b.budget_outstanding <> 80 then
    perform fail('marketplace: board', format('bought %s outstanding %s spent %s budget %s',
      b.bought_qty, b.qty_outstanding, b.spent, b.budget_outstanding)); end if;
  if b.live_finds <> 4 then perform fail('marketplace: board', 'live finds ' || b.live_finds); end if;
  perform pass('marketplace: the board derives bought, outstanding, spent and live finds');

  select * into l from mp_find_ledger where id = 'a1a1a1a1-3333-0000-0000-000000000001';
  if l.haggled_off <> 5 or l.saved_vs_fair <> 90 or l.saved_vs_new <> 610 then
    perform fail('marketplace: ledger', format('haggled %s fair %s new %s',
      l.haggled_off, l.saved_vs_fair, l.saved_vs_new)); end if;
  perform pass('marketplace: savings are net of travel');

  select * into t from mp_totals
   where household_id = 'a1a1a1a1-0000-0000-0000-000000000001' and tier = 'opportunistic';
  if t.profiles <> 1 or t.profiles_filled <> 0 then
    perform fail('marketplace: totals', 'a profile wanting nothing counted as filled'); end if;
  perform pass('marketplace: a profile wanting nothing is not filled');
  select * into t from mp_totals
   where household_id = 'a1a1a1a1-0000-0000-0000-000000000001' and tier = 'day_one';
  if t.budget_good <> 160 or t.unconfirmed_budget <> 160 or t.spent <> 40 then
    perform fail('marketplace: totals', format('good %s unconfirmed %s spent %s',
      t.budget_good, t.unconfirmed_budget, t.spent)); end if;
  perform pass('marketplace: totals say how much rests on unconfirmed thresholds');
end $$;

-- ---------------------------------------------------------------
-- RLS: user B sees nothing of household A, on every mp_ table.
-- ---------------------------------------------------------------
grant usage on schema public to authenticated;
grant select, insert, update on all tables in schema public to authenticated;
set local role authenticated;
set local request.jwt.claim.sub = 'b1b1b1b1-1111-1111-1111-111111111111';

do $$
declare t text; n int;
begin
  foreach t in array array['mp_brief','mp_profiles','mp_finds','mp_searches','mp_grounds',
                           'mp_board','mp_find_ledger','mp_totals'] loop
    execute format('select count(*) from %I where household_id = %L', t,
                   'a1a1a1a1-0000-0000-0000-000000000001') into n;
    if n <> 0 then perform fail('marketplace RLS', format('user B reads %s rows of %s', n, t)); end if;
    execute format('select count(*) from %I', t) into n;
    if n = 0 then perform fail('marketplace RLS', 'user B cannot read their own ' || t); end if;
  end loop;
  perform pass('marketplace RLS: user B reads only their own household, tables and views');

  begin
    insert into mp_finds (household_id, title) values ('a1a1a1a1-0000-0000-0000-000000000001','planted');
    perform fail('marketplace RLS', 'user B wrote into household A');
  exception when insufficient_privilege then null; end;
  update mp_profiles set name = 'taken' where household_id = 'a1a1a1a1-0000-0000-0000-000000000001';
  get diagnostics n = row_count;
  if n <> 0 then perform fail('marketplace RLS', 'user B updated household A'); end if;
  perform pass('marketplace RLS: user B cannot write into household A');

  if mp_context('a1a1a1a1-0000-0000-0000-000000000001') -> 'brief' <> 'null'::jsonb
     or jsonb_array_length(mp_context('a1a1a1a1-0000-0000-0000-000000000001') -> 'hunting') <> 0 then
    perform fail('marketplace RLS', 'mp_context leaks household A'); end if;
  perform pass('marketplace RLS: mp_context returns nothing of another household');
end $$;

reset role;

rollback;
