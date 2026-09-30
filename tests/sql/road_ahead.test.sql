\set ON_ERROR_STOP on
\pset pager off
begin;

create or replace function pass(t text) returns void language plpgsql as $$
begin raise notice 'PASS %', t; end $$;
create or replace function fail(t text, d text) returns void language plpgsql as $$
begin raise exception 'FAIL % : %', t, d; end $$;

-- Road Ahead on invented figures: nothing here is anybody's pay, savings
-- or price. Household A is being tested; household B exists to prove A's
-- rows never reach it.
insert into households (id, name) values
  ('aaaaaaaa-0000-0000-0000-0000000000a1','Road A'),
  ('bbbbbbbb-0000-0000-0000-0000000000b1','Road B');
insert into household_members (household_id, user_id) values
  ('aaaaaaaa-0000-0000-0000-0000000000a1','aaaaaaaa-1111-1111-1111-1111111111a1'),
  ('bbbbbbbb-0000-0000-0000-0000000000b1','bbbbbbbb-1111-1111-1111-1111111111b1');

insert into ra_variables (household_id, key, value, evidence, confidence)
select 'aaaaaaaa-0000-0000-0000-0000000000a1', k, to_jsonb(v), 'ESTIMATE', 'drafted'
  from (values ('appraisal.cash_at_purchase', 60000::numeric), ('appraisal.buy_costs', 3000),
               ('appraisal.day_one_kit', 2000), ('appraisal.deposit_pct', 0.1), ('appraisal.sell_pct', 0.015),
               ('appraisal.sell_fixed', 1500), ('appraisal.target_profit', 40000), ('appraisal.works_factor', 0.8),
               ('appraisal.walk_from', 100000), ('appraisal.walk_to', 450000), ('appraisal.walk_step', 500),
               ('appraisal.stretch_below', 8000), ('help.near_minutes', 30), ('help.near.cost', 0.9),
               ('help.far.cost', 1.1), ('ceiling.hard', 380000), ('verdict.strong', 50000),
               ('verdict.worth', 30000), ('verdict.marginal', 15000), ('cash.start_cash', 20000)) x(k, v);

insert into ra_scenarios (household_id, key, name, overrides, works_factor, help) values
  ('aaaaaaaa-0000-0000-0000-0000000000a1', 'base', 'Base', '{}', null, true),
  ('aaaaaaaa-0000-0000-0000-0000000000a1', 'keen', 'Keen, no help', '{}', 0.7, false);

insert into ra_auction_houses (household_id, code, name) values
  ('aaaaaaaa-0000-0000-0000-0000000000a1', 'HX', 'Harbour Auctions');

-- Three lots chased and one watched, all in the same sale in three weeks.
insert into ra_listings (household_id, code, name, house_code, lot, auction_on, sale_method, minutes_from_home, status)
values
  ('aaaaaaaa-0000-0000-0000-0000000000a1', 'L01', 'Mill Lane', 'HX', '12', current_date + 21, 'auction', 20, 'chase'),
  ('aaaaaaaa-0000-0000-0000-0000000000a1', 'L02', 'Quay Row', 'HX', '4', current_date + 21, 'auction', 45, 'chase'),
  ('aaaaaaaa-0000-0000-0000-0000000000a1', 'L03', 'Rope Walk', 'HX', '11', current_date + 21, 'auction', 25, 'chase'),
  ('aaaaaaaa-0000-0000-0000-0000000000a1', 'L04', 'Salt Store', 'HX', '30', current_date + 21, 'auction', 50, 'watch');

insert into ra_appraisals (household_id, listing_id, appraised_on, authored_by, protocol, inputs, fits)
select household_id, id, current_date - 1, 'claude_code', 'road-ahead-1',
       '{"likely_buy": 250000, "fin_lo": 330000, "fin_hi": 350000, "works": 40000}',
       '[["H1", 2], ["H2", 3], ["H3", 3]]'
  from ra_listings where code = 'L01';

-- ---------------------------------------------------------------
-- The primitives: the kit's rounding and the law's stamp duty.
-- ---------------------------------------------------------------
do $$
begin
  if ra_round_even(42500, -3) <> 42000 or ra_round_even(43500, -3) <> 44000
     or ra_round_even(42500.000001, -3) <> 43000 or ra_round_even(-1500, -3) <> -2000 then
    perform fail('rounding', 'half to even on the exact value');
  end if;
  if ra_round_even(-500, -3)::text <> '0' then
    perform fail('rounding', 'a negative half rounds to 0, never -0: got ' || ra_round_even(-500, -3)::text);
  end if;
  begin
    perform ra_round_even(1.005, 2);
    perform fail('rounding', 'decimal places were approximated instead of refused');
  exception when raise_exception then null;
  end;
  perform pass('road ahead: rounding is half to even, to the thousand, with no negative zero');
end $$;

do $$
begin
  if ra_sdlt(125000, true) <> 0 or ra_sdlt(300000, true) <> 0 or ra_sdlt(400000, true) <> 5000
     or ra_sdlt(500000, true) <> 10000 or ra_sdlt(500001, true) <> 15000.050000000001::double precision then
    perform fail('stamp duty', 'first-time relief and its limit');
  end if;
  if ra_sdlt(300000) <> 5000 or ra_sdlt(550000) <> 17500 or ra_sdlt(1000000) <> 43750 then
    perform fail('stamp duty', 'the standard bands');
  end if;
  perform pass('road ahead: stamp duty at the band edges, first-time relief ending above its limit');
end $$;

-- ---------------------------------------------------------------
-- The assessor: the same pounds as appraise.js (npm run test:parity
-- holds the two equal across many cases; these anchor one).
-- ---------------------------------------------------------------
do $$
declare a jsonb := ra_assess('aaaaaaaa-0000-0000-0000-0000000000a1', 'L01');
begin
  if a ->> 'grade' <> 'Strong' or (a ->> 'profit_opt')::numeric <> 51000 or (a ->> 'profit_base')::numeric <> 44000
     or (a ->> 'walk_away_opt')::numeric <> 261500 or (a ->> 'cash_left')::numeric <> 30000
     or (a ->> 'works_opt')::numeric <> 29000 or a ->> 'best_road' <> 'H2' or (a ->> 'near')::boolean is not true then
    perform fail('assess', a::text);
  end if;
  perform pass('road ahead: ra_assess scores a listing from its latest appraisal, the first highest fit winning');
end $$;

do $$
declare a jsonb := ra_assess('aaaaaaaa-0000-0000-0000-0000000000a1', 'L01', 'keen');
begin
  -- The scenario's own works factor, and no local help: works at cost.
  if (a ->> 'works_base')::numeric <> 40000 or (a ->> 'works_opt')::numeric <> 28000
     or (a ->> 'walk_away_opt')::numeric <> 262500 then
    perform fail('assess scenario', a::text);
  end if;
  perform pass('road ahead: a scenario brings its own works factor, and without help the works are paid');
end $$;

do $$
declare a jsonb := ra_assess_inputs('aaaaaaaa-0000-0000-0000-0000000000a1',
  '{"likely_buy": 240000, "fin_lo": 330000, "fin_hi": 350000, "works": 40000, "mins": 45, "fee": 6000, "pct": 0.02,
    "fits": [["H1", 2], ["H2", 3]]}');
begin
  if a ->> 'grade' <> 'Worth pursuing' or (a ->> 'cash_left')::numeric <> 25000
     or (a ->> 'walk_away_opt')::numeric <> 249500 or (a ->> 'near')::boolean then
    perform fail('assess inputs', a::text);
  end if;
  perform pass('road ahead: ra_assess_inputs assesses before a row exists, fee counted for stamp duty');
end $$;

do $$
begin
  begin
    perform ra_assess('aaaaaaaa-0000-0000-0000-0000000000a1', 'L99');
    perform fail('assess unknown', 'an unknown listing was assessed');
  exception when raise_exception then null;
  end;
  if ra_assess('aaaaaaaa-0000-0000-0000-0000000000a1', 'L02') ->> 'error' is null then
    perform fail('assess no inputs', 'a listing with no appraisal produced numbers');
  end if;
  update ra_variables set status = 'retired', resolution = 'test'
   where household_id = 'aaaaaaaa-0000-0000-0000-0000000000a1' and key = 'appraisal.buy_costs';
  begin
    perform ra_assess('aaaaaaaa-0000-0000-0000-0000000000a1', 'L01');
    perform fail('assess missing', 'assessed with a figure missing');
  exception when raise_exception then
    if sqlerrm not like '%appraisal.buy_costs%' then perform fail('assess missing', 'the refusal did not name the key: ' || sqlerrm); end if;
  end;
  update ra_variables set status = 'active', resolution = null
   where household_id = 'aaaaaaaa-0000-0000-0000-0000000000a1' and key = 'appraisal.buy_costs';
  perform pass('road ahead: no defaults - a missing figure is refused by name, an unknown listing refused');
end $$;

-- ---------------------------------------------------------------
-- The owner's judgement beside the maths.
-- ---------------------------------------------------------------
do $$
declare
  l uuid := (select id from ra_listings where code = 'L01');
  first uuid;
  a jsonb;
begin
  insert into ra_judgements (household_id, listing_id, field, value, reason, kind, said_on)
  values ('aaaaaaaa-0000-0000-0000-0000000000a1', l, 'premium', '10000', 'It is the village', 'emotional', current_date - 2)
  returning id into first;
  a := ra_assess('aaaaaaaa-0000-0000-0000-0000000000a1', 'L01');
  if (a ->> 'walk_away_opt')::numeric <> 261500 then perform fail('judgement', 'the maths moved'); end if;
  if (a #>> '{judgement,walk_away}')::numeric <> 271500 or (a #>> '{judgement,cost}')::numeric <> 10000
     or (a #>> '{judgement,cash_left}')::numeric <> 28000 or a #>> '{judgement,kind}' <> 'emotional' then
    perform fail('judgement', a -> 'judgement' #>> '{}');
  end if;

  -- A newer judgement supersedes; the old one stays on the record.
  insert into ra_judgements (household_id, listing_id, field, value, reason, kind, supersedes_id)
  values ('aaaaaaaa-0000-0000-0000-0000000000a1', l, 'walk_away', '400000', 'Last one on the lane', 'personal', first);
  a := ra_assess('aaaaaaaa-0000-0000-0000-0000000000a1', 'L01');
  if (a #>> '{judgement,bid_limit}')::numeric <> 380000 or (a #>> '{judgement,above_ceiling}')::boolean is not true
     or (a #>> '{judgement,cash_left}')::numeric <> 13000 then
    perform fail('judgement ceiling', a -> 'judgement' #>> '{}');
  end if;
  if (select count(*) from ra_current_judgements where listing_id = l) <> 1
     or (select count(*) from ra_judgements where listing_id = l) <> 2 then
    perform fail('judgement history', 'expected one current judgement and two on the record');
  end if;
  perform pass('road ahead: a judgement sits beside the maths, says what it costs, and the ceiling still binds');
end $$;

do $$
begin
  begin
    insert into ra_judgements (household_id, listing_id, field, value, reason, kind)
    select household_id, id, 'premium', '5000', '   ', 'emotional' from ra_listings where code = 'L03';
    perform fail('judgement reason', 'a judgement without a reason was stored');
  exception when check_violation then null;
  end;
  begin
    perform ra_assess_inputs('aaaaaaaa-0000-0000-0000-0000000000a1',
      '{"likely_buy": 250000, "fin_lo": 330000, "fin_hi": 350000, "works": 40000, "mins": 20,
        "judgement": {"premium": 5000, "reason": " "}}');
    perform fail('judgement reason', 'the assessor took a judgement without a reason');
  exception when check_violation then null;
  end;
  perform pass('road ahead: a judgement without a reason is refused, in the table and in the assessor');
end $$;

-- ---------------------------------------------------------------
-- Append-only, even for the table owner.
-- ---------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['ra_appraisals','ra_judgements'] loop
    begin
      execute format('update %I set created_at = created_at', t);
      perform fail('append-only', t || ' was edited');
    exception when restrict_violation then null;
    end;
  end loop;
  insert into ra_road_runs (household_id, scenario_key, road_code, source, engine_version, summary)
  values ('aaaaaaaa-0000-0000-0000-0000000000a1', 'base', 'H1', 'engine', 'test', '{"forever_today": 400000}');
  begin
    update ra_road_runs set summary = '{}';
    perform fail('append-only', 'ra_road_runs was edited');
  exception when restrict_violation then null;
  end;
  perform pass('road ahead: appraisals, judgements and accepted runs are never edited, by anyone');
end $$;

-- ---------------------------------------------------------------
-- The countdown: one diary row per day, every lot on it.
-- ---------------------------------------------------------------
do $$
declare r record;
begin
  if exists (select on_date from whats_next where source = 'pipeline'
              and household_id = 'aaaaaaaa-0000-0000-0000-0000000000a1' group by on_date having count(*) > 1) then
    perform fail('countdown', 'more than one pipeline row on a day');
  end if;
  select * into r from whats_next where source = 'pipeline' and on_date = current_date + 7
     and household_id = 'aaaaaaaa-0000-0000-0000-0000000000a1';
  if r.title not like 'Harbour Auctions % Viewing (lot 4, lot 11, lot 12)' or r.open_items <> 3 or r.days_until <> 7 then
    perform fail('countdown', coalesce(r.title, 'no viewing row') || ' / ' || coalesce(r.open_items, -1));
  end if;
  select * into r from whats_next where source = 'pipeline' and on_date = current_date + 21
     and household_id = 'aaaaaaaa-0000-0000-0000-0000000000a1';
  if r.title not like '%Auction day (lot 4, lot 11, lot 12, lot 30)' or r.open_items <> 4 then
    perform fail('countdown', 'a watched lot belongs on auction day: ' || coalesce(r.title, 'no row'));
  end if;
  if (select count(*) from ra_pipeline where code = 'L04') <> 1 then
    perform fail('countdown', 'a watched lot got more than auction day');
  end if;
  perform pass('road ahead: the countdown is one row a day with every lot, a watched lot only on the day');
end $$;

do $$
declare r record;
begin
  -- A step reported done leaves the diary, and a moved auction moves every date.
  insert into ra_pipeline_steps (household_id, listing_id, step_key, done_on, outcome)
  select household_id, id, 't-14', current_date, 'Viewed; still keen' from ra_listings where code = 'L01';
  select * into r from whats_next where source = 'pipeline' and on_date = current_date + 7
     and household_id = 'aaaaaaaa-0000-0000-0000-0000000000a1';
  if r.title not like '%(lot 4, lot 11)' or r.open_items <> 2 then
    perform fail('countdown done', r.title);
  end if;
  begin
    insert into ra_pipeline_steps (household_id, listing_id, step_key, done_on)
    select household_id, id, 't-12', current_date from ra_listings where code = 'L01';
    perform fail('countdown done', 'a step was marked done with no outcome');
  exception when check_violation then null;
  end;
  update ra_listings set auction_on = auction_on + 7 where code = 'L03';
  if not exists (select 1 from ra_pipeline where code = 'L03' and step_key = 't-0' and due_on = current_date + 28) then
    perform fail('countdown moved', 'the dates did not follow the auction');
  end if;
  update ra_listings set auction_on = auction_on - 7 where code = 'L03';
  perform pass('road ahead: a done step leaves the diary, needs an outcome, and dates follow the auction');
end $$;

-- ---------------------------------------------------------------
-- Listings close with a reason; figures never change silently.
-- ---------------------------------------------------------------
do $$
declare n int;
begin
  begin
    update ra_listings set status = 'dropped' where code = 'L04';
    perform fail('closing', 'a listing was dropped without a reason');
  exception when check_violation then null;
  end;
  begin
    update ra_variables set value = '65000'
     where household_id = 'aaaaaaaa-0000-0000-0000-0000000000a1' and key = 'appraisal.cash_at_purchase';
    perform fail('silent change', 'a money variable changed with no reason');
  exception when check_violation then null;
  end;
  perform set_config('house.change_why', 'Test: savings counted again', true);
  update ra_variables set value = '65000'
   where household_id = 'aaaaaaaa-0000-0000-0000-0000000000a1' and key = 'appraisal.cash_at_purchase';
  perform set_config('house.change_why', '', true);
  select count(*) into n from change_log where entity_type = 'ra_variables' and field = 'value'
     and old_value = '60000' and new_value = '65000' and why = 'Test: savings counted again';
  if n <> 1 then perform fail('change log', 'the change was not recorded with its reason'); end if;
  perform pass('road ahead: a listing closes with a reason, a variable changes only with one, and it is logged');
end $$;

-- ---------------------------------------------------------------
-- Decisions: the road's and the house's in one table, told apart.
-- ---------------------------------------------------------------
do $$
declare ctx jsonb;
begin
  insert into decisions (household_id, code, domain, topic, title, decided, firmness)
  values ('aaaaaaaa-0000-0000-0000-0000000000a1', 'RA-T1', 'road', 'Money', 'Which deposit on House 1?', null, 'open'),
         ('aaaaaaaa-0000-0000-0000-0000000000a1', 'RA-T2', 'road', 'Model', 'Split works into materials and labour', 'Yes, at a neutral split', 'locked');
  insert into decisions (household_id, title, decided) values
    ('aaaaaaaa-0000-0000-0000-0000000000a1', 'Kitchen stays where it is', 'Yes');
  begin
    insert into decisions (household_id, title, decided) values ('aaaaaaaa-0000-0000-0000-0000000000a1', 'Unanswered', null);
    perform fail('decisions', 'a decision with no answer that is not open was stored');
  exception when check_violation then null;
  end;
  begin
    insert into decisions (household_id, code, domain, title, decided, firmness)
    values ('aaaaaaaa-0000-0000-0000-0000000000a1', 'RA-T1', 'road', 'Twice', 'x', 'locked');
    perform fail('decisions', 'a decision code was used twice');
  exception when unique_violation then null;
  end;
  ctx := house_context(null, 'aaaaaaaa-0000-0000-0000-0000000000a1');
  if jsonb_array_length(ctx -> 'decisions') <> 1 or ctx #>> '{decisions,0,title}' <> 'Kitchen stays where it is' then
    perform fail('decisions', 'house_context showed the road''s decisions: ' || (ctx -> 'decisions')::text);
  end if;
  if (select count(*) from ra_current_decisions where household_id = 'aaaaaaaa-0000-0000-0000-0000000000a1') <> 2 then
    perform fail('decisions', 'the road''s current decisions are not both there');
  end if;
  -- A newer decision superseding an older one takes it out of the
  -- current list, whatever status the older row still carries.
  insert into decisions (household_id, code, domain, topic, title, decided, firmness)
  values ('aaaaaaaa-0000-0000-0000-0000000000a1', 'RA-T3', 'road', 'Money', 'Which deposit on House 1?', '10%', 'locked');
  insert into knowledge_links (household_id, from_type, from_id, to_type, to_id, kind)
  select d.household_id, 'decision', n.id, 'decision', d.id, 'supersedes'
    from decisions d, decisions n where d.code = 'RA-T1' and n.code = 'RA-T3';
  if exists (select 1 from ra_current_decisions where code = 'RA-T1')
     or not exists (select 1 from ra_current_decisions where code = 'RA-T3') then
    perform fail('decisions', 'a superseded decision still shows as current');
  end if;
  perform pass('road ahead: road decisions may be open, codes are unique, and the house never sees them');
end $$;

-- ---------------------------------------------------------------
-- The model beside the ledger, and what to confirm first.
-- ---------------------------------------------------------------
do $$
declare r record;
begin
  insert into accounts (household_id, name, kind, balance, as_of, confidence) values
    ('aaaaaaaa-0000-0000-0000-0000000000a1', 'Saver', 'savings', 12000, current_date, 'actual'),
    ('aaaaaaaa-0000-0000-0000-0000000000a1', 'Rumoured pot', 'savings', 90000, current_date, 'drafted');
  insert into accounts (household_id, name, kind, is_liability, balance, as_of, confidence) values
    ('aaaaaaaa-0000-0000-0000-0000000000a1', 'Card', 'credit_card', true, 500, current_date, 'confirmed');
  select * into r from ra_model_vs_ledger where household_id = 'aaaaaaaa-0000-0000-0000-0000000000a1' and measure = 'cash';
  if r.model_value <> 20000 or r.ledger_value <> 11500 then
    perform fail('model vs ledger', format('model %s, ledger %s', r.model_value, r.ledger_value));
  end if;
  perform pass('road ahead: the model''s cash sits beside the trusted ledger, liabilities off, drafts ignored');
end $$;

do $$
declare ag jsonb;
begin
  update ra_variables set confidence = 'confirmed', confirmed_at = now()
   where household_id = 'aaaaaaaa-0000-0000-0000-0000000000a1' and key = 'ceiling.hard';
  insert into ra_sensitivity (household_id, output, variable_key, swing, engine_version) values
    ('aaaaaaaa-0000-0000-0000-0000000000a1', 'H1 forever budget', 'ceiling.hard', 20000, 'test'),
    ('aaaaaaaa-0000-0000-0000-0000000000a1', 'H1 forever budget', 'appraisal.buy_costs', 5000, 'test');
  if (select variable_key from ra_calibration_queue where rank = 1
       and household_id = 'aaaaaaaa-0000-0000-0000-0000000000a1') <> 'appraisal.buy_costs' then
    perform fail('calibration', 'a confirmed input outranked an estimate that moves the answer more after weighting');
  end if;

  insert into ra_signals (household_id, code, kind, words, implies, said_on) values
    ('aaaaaaaa-0000-0000-0000-0000000000a1', 'S-T1', 'signal', 'I want to hear the sea', 'Coast within 10 minutes', current_date);
  insert into ra_road_runs (household_id, scenario_key, road_code, source, engine_version, summary, accepted_at)
  values ('aaaaaaaa-0000-0000-0000-0000000000a1', 'base', 'H1', 'engine', 'test', '{"forever_today": 405000}', now() + interval '1 minute');
  insert into ra_judgements (household_id, listing_id, field, value, reason, kind, said_on)
  select household_id, id, 'walk_away', '255000', 'Felt dark inside', 'emotional', current_date - 120
    from ra_listings where code = 'L03';

  insert into ra_sensitivity (household_id, output, variable_key, swing, engine_version) values
    ('aaaaaaaa-0000-0000-0000-0000000000a1', 'L01 walk-away', 'appraisal.buy_costs', 3000, 'test');
  ag := road_ahead_agenda('aaaaaaaa-0000-0000-0000-0000000000a1');
  if ag #>> '{calibrate,0,variable}' <> 'appraisal.buy_costs' or jsonb_array_length(ag -> 'calibrate') <> 2
     or jsonb_array_length(ag #> '{calibrate,0,moves}') <> 2 then
    perform fail('agenda', 'calibrate: each input once, with every answer it moves: ' || (ag -> 'calibrate')::text);
  end if;
  if not exists (select 1 from jsonb_array_elements(ag -> 'dated') e where e ->> 'what' like '%Viewing%') then
    perform fail('agenda', 'the countdown is not on the agenda');
  end if;
  if not exists (select 1 from jsonb_array_elements(ag -> 'judgements_to_revisit') e where e ->> 'listing' = 'L03') then
    perform fail('agenda', 'a judgement older than three months is not up for revisiting');
  end if;
  if not exists (select 1 from jsonb_array_elements(ag -> 'signals_unreflected') e where e ->> 'code' = 'S-T1') then
    perform fail('agenda', 'a signal nothing reflects is not on the agenda');
  end if;
  if (ag #>> '{moved,0,was}')::numeric <> 400000 or (ag #>> '{moved,0,now}')::numeric <> 405000 then
    perform fail('agenda', 'what moved: ' || (ag -> 'moved')::text);
  end if;
  perform pass('road ahead: the sit-down agenda - dates, calibration, old judgements, unreflected signals, what moved');
end $$;

-- ---------------------------------------------------------------
-- Grounding through the connector, and nothing across households.
-- ---------------------------------------------------------------
do $$
declare ctx jsonb := road_ahead_context('aaaaaaaa-0000-0000-0000-0000000000a1');
begin
  if jsonb_array_length(ctx -> 'variables') < 20 or ctx #>> '{register,by_status,chase}' <> '3'
     or jsonb_array_length(ctx -> 'decisions') <> 2 or jsonb_array_length(ctx -> 'next') = 0 then
    perform fail('context', left(ctx::text, 400));
  end if;
  ctx := road_ahead_inputs('aaaaaaaa-0000-0000-0000-0000000000a1');
  if ctx ->> 'format' <> 'road-ahead-inputs/1' or ctx #>> '{variables,appraisal.target_profit,value}' <> '40000'
     or ctx #>> '{scenarios,keen,works_factor}' <> '0.7' or jsonb_array_length(ctx -> 'listings') <> 3
     or ctx #>> '{listings,0,inputs,likely_buy}' <> '250000' then
    perform fail('inputs', left(ctx::text, 400));
  end if;
  perform pass('road ahead: road_ahead_context grounds a session with no signed-in user; road_ahead_inputs feeds the engine');
end $$;

set local role authenticated;
set local request.jwt.claim.sub = 'bbbbbbbb-1111-1111-1111-1111111111b1';

do $$
declare ctx jsonb;
begin
  if (select count(*) from ra_listings) + (select count(*) from ra_variables) + (select count(*) from ra_appraisals)
     + (select count(*) from ra_judgements) + (select count(*) from ra_signals) + (select count(*) from ra_road_runs)
     + (select count(*) from ra_sensitivity) + (select count(*) from ra_pipeline)
     + (select count(*) from whats_next where source = 'pipeline') <> 0 then
    perform fail('isolation', 'user B sees household A''s Road Ahead rows');
  end if;
  ctx := road_ahead_context('aaaaaaaa-0000-0000-0000-0000000000a1');
  if jsonb_array_length(ctx -> 'variables') <> 0 or jsonb_array_length(ctx -> 'judgements') <> 0 then
    perform fail('isolation', 'naming another household reached its rows');
  end if;
  begin
    perform ra_assess('aaaaaaaa-0000-0000-0000-0000000000a1', 'L01');
    perform fail('isolation', 'user B assessed household A''s listing');
  exception when raise_exception then null;
  end;
  begin
    insert into ra_listings (household_id, code, name) values ('aaaaaaaa-0000-0000-0000-0000000000a1', 'L50', 'Injected');
    perform fail('isolation', 'user B wrote into household A');
  exception when insufficient_privilege then null;
  end;
  perform pass('road ahead RLS: another household sees, assesses and writes nothing');
end $$;

set local request.jwt.claim.sub = 'aaaaaaaa-1111-1111-1111-1111111111a1';

do $$
begin
  if (select count(*) from ra_listings) <> 4 then perform fail('member', 'the owner cannot see their own listings'); end if;
  begin
    update ra_appraisals set notes = 'edited';
    perform fail('append-only grant', 'a member could edit an appraisal');
  exception when insufficient_privilege then null;
  end;
  begin
    delete from ra_listings where code = 'L04';
    perform fail('no delete', 'a member deleted a listing');
  exception when insufficient_privilege then null;
  end;
  insert into ra_judgements (household_id, listing_id, field, value, reason, kind)
  select household_id, id, 'premium', '2000', 'Garden faces south', 'information' from ra_listings where code = 'L02';
  perform pass('road ahead RLS: a member reads and adds, never edits the record or deletes');
end $$;

reset role;
rollback;
