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
do $$
begin
  begin
    update mp_finds set status = 'bought', paid = 35, travel_cost = 5, bought_on = current_date
     where id = 'a1a1a1a1-3333-0000-0000-000000000001';
    perform fail('marketplace: money', 'a price paid was written with no reason');
  exception when check_violation then null; end;
  perform pass('marketplace: what was paid never changes silently');
end $$;
select set_config('house.change_why', 'test purchase', true);
update mp_finds set status = 'bought', paid = 35, travel_cost = 5, bought_on = current_date
 where id = 'a1a1a1a1-3333-0000-0000-000000000001';
select set_config('house.change_why', '', true);

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
-- PRICE EVIDENCE. Sold prices drive; asking prices and estimates do not.
-- ---------------------------------------------------------------
do $$
declare e record; n int;
begin
  select count(*) into n from mp_price_obs
   where profile_id = 'a1a1a1a1-2222-0000-0000-000000000001' and kind = 'asking';
  if n < 5 then perform fail('evidence', 'finds did not land as asking observations: ' || n); end if;
  perform pass('marketplace evidence: every find with a price is an asking observation');

  insert into mp_price_obs (household_id, profile_id, kind, price, premium_pct, observed_on, is_typical) values
    ('a1a1a1a1-0000-0000-0000-000000000001','a1a1a1a1-2222-0000-0000-000000000001','auction_hammer', 100, 25, current_date - 30, true),
    ('a1a1a1a1-0000-0000-0000-000000000001','a1a1a1a1-2222-0000-0000-000000000001','auction_hammer', 120, 25, current_date - 60, true),
    ('a1a1a1a1-0000-0000-0000-000000000001','a1a1a1a1-2222-0000-0000-000000000001','auction_hammer', 140, 25, current_date - 90, true),
    ('a1a1a1a1-0000-0000-0000-000000000001','a1a1a1a1-2222-0000-0000-000000000001','sold_listing',   160,  0, current_date - 120, true),
    -- None of these four may count: top of the market, too old, an estimate, a dealer.
    ('a1a1a1a1-0000-0000-0000-000000000001','a1a1a1a1-2222-0000-0000-000000000001','auction_hammer', 5000, 25, current_date - 10, false),
    ('a1a1a1a1-0000-0000-0000-000000000001','a1a1a1a1-2222-0000-0000-000000000001','auction_hammer', 9000, 25, current_date - 800, true),
    ('a1a1a1a1-0000-0000-0000-000000000001','a1a1a1a1-2222-0000-0000-000000000001','auction_estimate', 7000, 0, current_date - 10, true),
    ('a1a1a1a1-0000-0000-0000-000000000001','a1a1a1a1-2222-0000-0000-000000000001','dealer', 900, 0, current_date - 10, true);

  select * into e from mp_price_evidence where profile_id = 'a1a1a1a1-2222-0000-0000-000000000001';
  if e.sold_n <> 4 or e.has_enough then perform fail('evidence', 'four sold prices: n ' || e.sold_n); end if;
  if exists (select 1 from mp_threshold_review where profile_id = e.profile_id) then
    perform fail('evidence', 'a suggestion was made on fewer than five sold prices'); end if;
  perform pass('marketplace evidence: fewer than five sold prices suggest nothing');

  insert into mp_price_obs (household_id, profile_id, kind, price, premium_pct, observed_on) values
    ('a1a1a1a1-0000-0000-0000-000000000001','a1a1a1a1-2222-0000-0000-000000000001','auction_hammer', 180, 25, current_date - 150);
  select * into e from mp_price_evidence where profile_id = 'a1a1a1a1-2222-0000-0000-000000000001';
  -- hammer 100,120,140,160,180: median 140. all in 125,150,175,160,225: median 160, q3 175.
  if e.sold_n <> 5 or e.median_hammer <> 140 or e.median_all_in <> 160
     or e.implied_steal <> 80 or e.implied_good <> 140 or e.implied_fair <> 160 or e.implied_max <> 175
     or e.implied_new <> 900 or e.estimate_n <> 1 or e.dealer_n <> 1 then
    perform fail('evidence', format('n %s hammer %s all-in %s steal %s good %s fair %s max %s',
      e.sold_n, e.median_hammer, e.median_all_in, e.implied_steal, e.implied_good, e.implied_fair, e.implied_max));
  end if;
  perform pass('marketplace evidence: medians from typical sold prices in the window only');

  -- typed 40/80/130/200: steal +100%, good +75%, fair +23% are out; max -12.5% is not.
  select count(*) into n from mp_threshold_review where profile_id = e.profile_id;
  if n <> 3 or exists (select 1 from mp_threshold_review where profile_id = e.profile_id and threshold = 'max') then
    perform fail('evidence', 'review rows ' || n); end if;
  if (select price_good from mp_profiles where id = e.profile_id) <> 80 then
    perform fail('evidence', 'the evidence overwrote a threshold'); end if;
  perform pass('marketplace evidence: a threshold more than a fifth out is put up for review, and not changed');
end $$;

do $$
begin
  begin
    update mp_profiles set price_good = 85 where id = 'a1a1a1a1-2222-0000-0000-000000000001';
    perform fail('marketplace: money', 'a threshold changed with no reason');
  exception when check_violation then null; end;
  perform set_config('house.change_why', 'five sold prices', true);
  update mp_profiles set price_good = 85 where id = 'a1a1a1a1-2222-0000-0000-000000000001';
  if not exists (select 1 from change_log where entity_type = 'mp_profiles' and field = 'price_good'
                    and old_value = '80.00' and new_value = '85.00' and why = 'five sold prices') then
    perform fail('marketplace: money', 'the threshold change was not logged'); end if;
  update mp_profiles set price_good = 80 where id = 'a1a1a1a1-2222-0000-0000-000000000001';
  perform set_config('house.change_why', '', true);
  perform pass('marketplace: a threshold changes with a reason, and the change is logged');
end $$;

-- ---------------------------------------------------------------
-- THE HUNT ORDER.
-- ---------------------------------------------------------------
insert into mp_profiles (id, household_id, key, name, category, tier, wanted_qty, spec, supply, buy_window,
                         price_good, price_new, anchor_of, fallback, fallback_weeks, created_at)
values
  ('a1a1a1a1-2222-0000-0000-000000000011','a1a1a1a1-0000-0000-0000-000000000001','sofa','Sofa','seating','day_one',1,'x','regular','from_exchange', 200, 1800, null, 'Buy a plain new one', 4, now() - interval '40 days'),
  ('a1a1a1a1-2222-0000-0000-000000000012','a1a1a1a1-0000-0000-0000-000000000001','side_table','Side table','tables','day_one',1,'x','common','any_time', 20, 2000, 'sofa', null, null, now()),
  ('a1a1a1a1-2222-0000-0000-000000000013','a1a1a1a1-0000-0000-0000-000000000001','lamp','Lamp','lighting','first_month',2,'x','common','any_time', 10, 110, null, null, null, now()),
  ('a1a1a1a1-2222-0000-0000-000000000014','a1a1a1a1-0000-0000-0000-000000000001','stone','Staddle stone','garden','first_year',1,'x','rare','after_move', 80, 400, null, null, null, now()),
  ('a1a1a1a1-2222-0000-0000-000000000015','a1a1a1a1-0000-0000-0000-000000000001','paused','Paused thing','other','day_one',1,'x','common','any_time', 1, 9999, null, null, null, now());
update mp_profiles set status = 'paused' where key = 'paused';

do $$
declare got text; q record;
begin
  -- chest: day_one, 1 outstanding, saving 570. sofa: day_one, 1600. side_table: day_one but
  -- waits for the sofa. stone: first_year pulled two tiers earlier by rare. lamp: first_month.
  -- knobs want nothing and the paused one is not hunted.
  select string_agg(key, ',' order by queue_rank) into got from mp_hunt_queue
   where household_id = 'a1a1a1a1-0000-0000-0000-000000000001';
  if got <> 'sofa,chest,stone,side_table,lamp' then perform fail('hunt queue', 'order is ' || got); end if;
  perform pass('marketplace queue: tier, lead time for rare things, anchors first, then the saving');

  select * into q from mp_hunt_queue where key = 'sofa';
  if q.mode <> 'watch' or q.house_state <> 'none' or q.fallback_due or q.weeks_hunted <> 5 then
    perform fail('hunt queue', format('sofa mode %s state %s due %s weeks %s', q.mode, q.house_state, q.fallback_due, q.weeks_hunted)); end if;
  if (select mode from mp_hunt_queue where key = 'lamp') <> 'buy' then perform fail('hunt queue', 'a small thing cannot be bought'); end if;
  perform pass('marketplace queue: with no house a large piece is watched, and no fallback is due');

  insert into properties (id, household_id, ref, name, status)
  values ('a1a1a1a1-6666-0000-0000-000000000001','a1a1a1a1-0000-0000-0000-000000000001','P-901','Test house','committed');
  if (select mode from mp_hunt_queue where key = 'sofa') <> 'buy'
     or (select mode from mp_hunt_queue where key = 'stone') <> 'watch'
     or not (select fallback_due from mp_hunt_queue where key = 'sofa') then
    perform fail('hunt queue', 'exchange did not open from_exchange, or opened after_move'); end if;
  perform pass('marketplace queue: exchange opens the large pieces and starts the fallback clock; after_move still waits');
end $$;

-- The ration: twelve searches, ten alerts.
insert into mp_searches (household_id, profile_id, label, query, is_alert, sort_order)
select 'a1a1a1a1-0000-0000-0000-000000000001', p.id, p.key || ' ' || n, p.key || ' q' || n, (p.key = 'lamp'), n
  from mp_profiles p cross join generate_series(1, 3) n
 where p.household_id = 'a1a1a1a1-0000-0000-0000-000000000001' and p.key in ('sofa','chest','side_table','lamp');

do $$
declare r record;
begin
  select count(*) filter (where action in ('keep','set')) as on_n,
         count(*) filter (where action = 'set') as set_n,
         count(*) filter (where action = 'keep') as keep_n,
         count(*) filter (where action = 'retire') as retire_n,
         string_agg(label, ',' order by label) filter (where action = 'retire') as retired
    into r from mp_alerts_to_set where household_id = 'a1a1a1a1-0000-0000-0000-000000000001';
  -- Day-one searches fill nine slots; the lamp (first_month) gets the tenth and loses two.
  if r.on_n <> 10 or r.set_n <> 9 or r.keep_n <> 1 or r.retire_n <> 2 or r.retired <> 'lamp 2,lamp 3' then
    perform fail('alerts', format('on %s set %s keep %s retire %s (%s)', r.on_n, r.set_n, r.keep_n, r.retire_n, r.retired)); end if;
  perform pass('marketplace alerts: ten at most, day-one first, and the ones to stop are named');
  -- A search written as an alert outranks every sweep.
  update mp_searches set cadence = 'alert' where label = 'lamp 3';
  if (select slot from mp_alerts_to_set where label = 'lamp 3') <> 1 then
    perform fail('alerts', 'an alert-cadence search did not take the first slot'); end if;
  update mp_searches set cadence = 'weekly' where label = 'lamp 3';
  perform pass('marketplace alerts: a search written as an alert outranks a sweep');
end $$;

-- ---------------------------------------------------------------
-- ONE FUNCTION FOR A PURCHASE.
-- ---------------------------------------------------------------
insert into work_items (id, household_id, title, kind, status, horizon, phase, acquisition, cost_expected, cost_confidence)
values ('a1a1a1a1-7777-0000-0000-000000000001','a1a1a1a1-0000-0000-0000-000000000001',
        'Lamps and a sofa','purchase','planned','next','move_in','either', 300, 'drafted');
update mp_profiles set work_item_id = 'a1a1a1a1-7777-0000-0000-000000000001' where key in ('lamp','sofa')
   and household_id = 'a1a1a1a1-0000-0000-0000-000000000001';
insert into mp_checks (household_id, profile_id, key, kind, question)
values ('a1a1a1a1-0000-0000-0000-000000000001','a1a1a1a1-2222-0000-0000-000000000013','solid','material','Solid brass?');
insert into mp_finds (id, household_id, profile_id, title, asking_price, quantity, style_fit, checks, is_placeholder) values
  ('a1a1a1a1-3333-0000-0000-000000000021','a1a1a1a1-0000-0000-0000-000000000001','a1a1a1a1-2222-0000-0000-000000000013','Pair of brass lamps', 30, 2, 5, '{"solid":{"answer":"pass","evidence":"magnet"}}', false),
  ('a1a1a1a1-3333-0000-0000-000000000022','a1a1a1a1-0000-0000-0000-000000000001','a1a1a1a1-2222-0000-0000-000000000013','Unproven lamp', 5, 1, 5, '{}', false),
  ('a1a1a1a1-3333-0000-0000-000000000023','a1a1a1a1-0000-0000-0000-000000000001','a1a1a1a1-2222-0000-0000-000000000013','Plated lamp', 5, 1, 5, '{"solid":{"answer":"fail","evidence":"magnet sticks"}}', true),
  ('a1a1a1a1-3333-0000-0000-000000000024','a1a1a1a1-0000-0000-0000-000000000001','a1a1a1a1-2222-0000-0000-000000000013','Wrong-looking lamp', 5, 1, 3, '{"solid":{"answer":"pass"}}', false),
  ('a1a1a1a1-3333-0000-0000-000000000025','a1a1a1a1-0000-0000-0000-000000000001','a1a1a1a1-2222-0000-0000-000000000013','Stand-in lamp', 4, 1, 2, '{}', true);

create or replace function try_purchase(p_find uuid, p_paid numeric) returns text language plpgsql as $$
begin
  perform mp_record_purchase(p_find, p_paid, current_date, 0, null);
  return 'ok';
exception when check_violation then
  return coalesce(substring(sqlerrm from '\(([a-z_]+)\)'), sqlerrm);
end $$;

do $$
declare r jsonb; b record; w record; got text;
begin
  if try_purchase('a1a1a1a1-3333-0000-0000-000000000022', 5) <> 'unproven' then perform fail('purchase', 'a grade C was bought'); end if;
  if try_purchase('a1a1a1a1-3333-0000-0000-000000000023', 5) <> 'grade_x' then perform fail('purchase', 'a grade X placeholder was bought'); end if;
  if try_purchase('a1a1a1a1-3333-0000-0000-000000000024', 5) <> 'fit' then perform fail('purchase', 'a poor fit was bought'); end if;
  perform pass('marketplace purchase: refuses an X, an unproven C and a poor fit');

  -- A placeholder is recorded, and fills nothing.
  r := mp_record_purchase('a1a1a1a1-3333-0000-0000-000000000025', 4, current_date);
  select * into b from mp_board where key = 'lamp' and household_id = 'a1a1a1a1-0000-0000-0000-000000000001';
  if b.bought_qty <> 0 or b.placeholder_qty <> 1 or b.qty_outstanding <> 2 or b.status <> 'hunting'
     or (r -> 'profile' ->> 'filled')::boolean then
    perform fail('purchase', 'a placeholder counted as the real thing'); end if;
  if (select is_typical from mp_price_obs where find_id = 'a1a1a1a1-3333-0000-0000-000000000025' and kind = 'own_purchase') then
    perform fail('purchase', 'a placeholder price counts as typical'); end if;
  perform pass('marketplace purchase: a placeholder is in use and does not fill the profile');

  r := mp_record_purchase('a1a1a1a1-3333-0000-0000-000000000021', 24, current_date, 3, 'haggled at the door');
  select * into b from mp_board where key = 'lamp' and household_id = 'a1a1a1a1-0000-0000-0000-000000000001';
  select * into w from work_items where id = 'a1a1a1a1-7777-0000-0000-000000000001';
  if b.status <> 'filled' or b.resolution is null or b.qty_outstanding <> 0 then perform fail('purchase', 'the profile did not fill'); end if;
  if w.spent_actual <> 28 or w.status <> 'planned' then
    perform fail('purchase', format('line spent %s status %s', w.spent_actual, w.status)); end if;
  if (r -> 'line' ->> 'nothing_outstanding')::boolean then
    perform fail('purchase', 'the line reads clear while the sofa is outstanding'); end if;
  if (select count(*) from spend_events where work_item_id = w.id and channel = 'marketplace' and confidence = 'actual') <> 2 then
    perform fail('purchase', 'spend events missing'); end if;
  if not exists (select 1 from mp_price_obs where find_id = 'a1a1a1a1-3333-0000-0000-000000000021'
                   and kind = 'own_purchase' and unit_price = 12 and grade = 'B' and is_typical) then
    perform fail('purchase', 'no own_purchase observation'); end if;
  if exists (select 1 from mp_searches where profile_id = b.id and status = 'active') then
    perform fail('purchase', 'the filled profile still has live searches'); end if;
  if not exists (select 1 from change_log where entity_type = 'work_items' and field = 'spent_actual' and why = 'haggled at the door') then
    perform fail('purchase', 'the spend was not logged with its reason'); end if;
  if (r -> 'find' ->> 'saved_vs_new')::numeric <> 2 * 110 - 24 - 3 or r -> 'find' ->> 'grade' <> 'B' then
    perform fail('purchase', 'the result does not report the saving and the grade: ' || r::text); end if;
  perform pass('marketplace purchase: find, spend, line, observation, profile and searches all move together');
  perform pass('marketplace purchase: the shopping line is never closed, and is not called clear while a profile is outstanding');

  got := try_purchase('a1a1a1a1-3333-0000-0000-000000000021', 24);
  if got not like '%already bought%' then perform fail('purchase', 'bought twice: ' || got); end if;
  perform pass('marketplace purchase: refuses a find already bought');

  if jsonb_typeof(mp_context('a1a1a1a1-0000-0000-0000-000000000001') -> 'queue') <> 'array'
     or mp_context('a1a1a1a1-0000-0000-0000-000000000001') ->> 'house_state' <> 'exchanged'
     or jsonb_array_length(mp_profile_brief('a1a1a1a1-0000-0000-0000-000000000001', 'chest') -> 'checks') < 3 then
    perform fail('context', 'mp_context or mp_profile_brief is missing a part'); end if;
  perform pass('marketplace context: the queue, the house state and a profile brief with its checks');
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
                           'mp_makers','mp_checks','mp_price_obs','mp_board','mp_price_evidence','mp_hunt_queue','mp_find_ledger','mp_totals'] loop
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
