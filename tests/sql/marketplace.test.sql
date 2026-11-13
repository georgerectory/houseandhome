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
-- THE QUALITY LAYER. The grade is derived from the answers; the guard
-- refuses a verdict the grade and the fit do not support.
-- ---------------------------------------------------------------
update mp_brief set travel_bands = '[{"band":"A","miles_max":10,"minutes_max":20},
                                     {"band":"B","miles_max":25,"minutes_max":40}]'::jsonb
 where household_id = 'a1a1a1a1-0000-0000-0000-000000000001';

insert into mp_makers (id, household_id, name, category, standing) values
  ('a1a1a1a1-5555-0000-0000-000000000001','a1a1a1a1-0000-0000-0000-000000000001','Goodwright and Sons','storage','seek'),
  ('a1a1a1a1-5555-0000-0000-000000000002','a1a1a1a1-0000-0000-0000-000000000001','Flatpack Regency','storage','avoid'),
  ('b1b1b1b1-5555-0000-0000-000000000001','b1b1b1b1-0000-0000-0000-000000000001','B maker','storage','seek');

insert into mp_checks (household_id, profile_id, key, kind, question, must_pass, distinction, doorstep, sort_order) values
  ('a1a1a1a1-0000-0000-0000-000000000001','a1a1a1a1-2222-0000-0000-000000000001','carcass','material','Is the carcass solid timber?', true, false, false, 1),
  ('a1a1a1a1-0000-0000-0000-000000000001','a1a1a1a1-2222-0000-0000-000000000001','joints','construction','Are the drawers dovetailed?', true, false, true, 2),
  ('a1a1a1a1-0000-0000-0000-000000000001','a1a1a1a1-2222-0000-0000-000000000001','linings','construction','Oak drawer linings?', false, true, true, 3),
  ('b1b1b1b1-0000-0000-0000-000000000001','b1b1b1b1-2222-0000-0000-000000000001','any','condition','Sound?', true, false, true, 1);

do $$
declare
  prof constant uuid := 'a1a1a1a1-2222-0000-0000-000000000001';
  ok   constant jsonb := '{"carcass":{"answer":"pass","evidence":"photo 3, end grain"},"joints":{"answer":"pass","evidence":"photo 4"}}';
  g text;
begin
  if mp_grade(prof, '{}', null) <> 'C' then perform fail('grade', 'all unseen is not C'); end if;
  if mp_grade(prof, '{"carcass":{"answer":"pass"}}', null) <> 'C' then perform fail('grade', 'one unseen is not C'); end if;
  if mp_grade(prof, ok, null) <> 'B' then perform fail('grade', 'all must-pass passed is not B'); end if;
  if mp_grade(prof, ok || '{"linings":{"answer":"pass"}}', null) <> 'A' then perform fail('grade', 'distinction did not lift to A'); end if;
  if mp_grade(prof, ok, 'a1a1a1a1-5555-0000-0000-000000000001') <> 'A' then perform fail('grade', 'a seek maker did not lift to A'); end if;
  if mp_grade(prof, ok || '{"joints":{"answer":"fail"}}', null) <> 'X' then perform fail('grade', 'a failed must-pass is not X'); end if;
  if mp_grade(prof, ok || '{"linings":{"answer":"fail"}}', null) <> 'B' then perform fail('grade', 'a failed optional check changed the grade'); end if;
  if mp_grade(prof, ok, 'a1a1a1a1-5555-0000-0000-000000000002') <> 'X' then perform fail('grade', 'an avoid maker is not X'); end if;
  if mp_grade('a1a1a1a1-2222-0000-0000-000000000002', '{}', null) <> 'C' then perform fail('grade', 'a profile with no checks is not C'); end if;
  if mp_grade(null, '{}', null) is not null then perform fail('grade', 'no profile has a grade'); end if;
  perform pass('marketplace grade: A, B, C and X each reached, by checks and by maker');

  if mp_travel_band('a1a1a1a1-0000-0000-0000-000000000001', 10, null) <> 'A'
     or mp_travel_band('a1a1a1a1-0000-0000-0000-000000000001', 10.1, null) <> 'B'
     or mp_travel_band('a1a1a1a1-0000-0000-0000-000000000001', null, 30) <> 'B'
     or mp_travel_band('a1a1a1a1-0000-0000-0000-000000000001', 26, null) <> 'beyond'
     or mp_travel_band('a1a1a1a1-0000-0000-0000-000000000001', null, null) is not null then
    perform fail('travel band', 'wrong band'); end if;
  perform pass('marketplace travel band: by miles, by minutes, beyond, and null when unknown');
end $$;

-- Each branch of the guard. `try` returns the refusal code, or 'ok'.
create or replace function try_verdict(p_verdict text, p_checks jsonb, p_fit int, p_asking numeric,
  p_miles numeric, p_profile uuid default 'a1a1a1a1-2222-0000-0000-000000000001', p_maker uuid default null)
returns text language plpgsql as $$
begin
  insert into mp_finds (household_id, profile_id, title, verdict, checks, style_fit, asking_price,
                        distance_miles, maker_id, maker_evidence)
  values ('a1a1a1a1-0000-0000-0000-000000000001', p_profile, 'guard case', p_verdict, p_checks, p_fit,
          p_asking, p_miles, p_maker, case when p_maker is not null then 'label seen' end);
  return 'ok';
exception when check_violation then
  return substring(sqlerrm from '\(([a-z_]+)\)');
end $$;

do $$
declare
  ok   constant jsonb := '{"carcass":{"answer":"pass"},"joints":{"answer":"pass"}}';
  door constant jsonb := '{"carcass":{"answer":"pass"}}';
  r record;
begin
  for r in select * from (values
    ('buy at B, fit 5',                 try_verdict('buy',   ok,  5, 120, null), 'ok'),
    ('buy at B, fit 3',                 try_verdict('buy',   ok,  3, 120, null), 'fit'),
    ('buy at B, fit unknown',           try_verdict('buy',   ok,  null, 120, null), 'fit'),
    ('buy at C',                        try_verdict('buy',   '{}', 5, 120, null), 'unproven'),
    ('offer at C, fit 4',               try_verdict('offer', '{}', 4, 120, null), 'ok'),
    ('offer at C, fit 3',               try_verdict('offer', '{}', 3, 120, null), 'fit'),
    ('watch at C, fit 3',               try_verdict('watch', '{}', 3, 120, null), 'ok'),
    ('watch at X',                      try_verdict('watch', '{"joints":{"answer":"fail"}}', 5, 120, null), 'grade_x'),
    ('offer at X',                      try_verdict('offer', '{"joints":{"answer":"fail"}}', 5, 120, null), 'grade_x'),
    ('pass at X',                       try_verdict('pass',  '{"joints":{"answer":"fail"}}', 5, 120, null), 'ok'),
    ('buy with an avoid maker',         try_verdict('buy',   ok, 5, 120, null,
                                          'a1a1a1a1-2222-0000-0000-000000000001', 'a1a1a1a1-5555-0000-0000-000000000002'), 'grade_x'),
    ('watch at fit 2',                  try_verdict('watch', ok,  2, 120, null), 'wrong_for_house'),
    ('pass at fit 1',                   try_verdict('pass',  ok,  1, 120, null), 'ok'),
    ('buy with no profile',             try_verdict('buy',   '{}', 5, 5, null, null), 'no_profile'),
    ('watch with no profile',           try_verdict('watch', '{}', 5, 5, null, null), 'ok'),
    ('exception: steal, band A, doorstep', try_verdict('buy', door, 5, 40, 5), 'ok'),
    ('exception needs band A',          try_verdict('buy',   door, 5, 40, 20), 'unproven'),
    ('exception needs a known distance', try_verdict('buy',  door, 5, 40, null), 'unproven'),
    ('exception needs the steal price', try_verdict('buy',   door, 5, 80, 5), 'unproven'),
    ('exception needs doorstep checks', try_verdict('buy',   '{}', 5, 40, 5), 'unproven'),
    ('exception still needs the fit',   try_verdict('buy',   door, 3, 40, 5), 'fit')
  ) as t(label, got, want) loop
    if r.got is distinct from r.want then
      perform fail('marketplace guard: ' || r.label, 'got ' || coalesce(r.got, 'null') || ', want ' || r.want);
    end if;
  end loop;
  perform pass('marketplace guard: 21 cases - buy, offer, watch, pass, X, fit and the one exception');

  -- The guard fires on an update too.
  begin
    update mp_finds set verdict = 'buy' where id = 'a1a1a1a1-3333-0000-0000-000000000003';
    perform fail('marketplace guard', 'an update to buy with nothing proven was accepted');
  exception when check_violation then null; end;
  perform pass('marketplace guard: refuses on update as on insert');

  begin
    insert into mp_finds (household_id, title, maker_id)
    values ('a1a1a1a1-0000-0000-0000-000000000001', 'claimed', 'a1a1a1a1-5555-0000-0000-000000000001');
    perform fail('marketplace maker', 'a maker with no evidence was accepted');
  exception when check_violation then null; end;
  perform pass('marketplace maker: a maker is set with what was seen, or not at all');
end $$;

-- A check added LATER does not rewrite history, but the ledger shows
-- the verdict no longer stands.
do $$
declare l record;
begin
  select * into l from mp_find_ledger where title = 'guard case' and verdict = 'buy' and quality_grade = 'B' limit 1;
  if not l.verdict_stands then perform fail('ledger', 'a sound buy does not stand'); end if;
  insert into mp_checks (household_id, profile_id, key, kind, question)
  values ('a1a1a1a1-0000-0000-0000-000000000001','a1a1a1a1-2222-0000-0000-000000000001','worm','condition','Any live woodworm?');
  select * into l from mp_find_ledger where id = l.id;
  if l.quality_grade <> 'C' or l.verdict_stands or l.verdict_refusal <> 'unproven'
     or jsonb_array_length(l.unseen_checks) <> 1 or l.unseen_checks -> 0 ->> 'key' <> 'worm' then
    perform fail('ledger', format('grade %s stands %s refusal %s', l.quality_grade, l.verdict_stands, l.verdict_refusal));
  end if;
  update mp_checks set status = 'retired' where key = 'worm';
  perform pass('marketplace ledger: a verdict a later check undermines says so, with the question to ask');
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
                           'mp_makers','mp_checks','mp_board','mp_find_ledger','mp_totals'] loop
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
