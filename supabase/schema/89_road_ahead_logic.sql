-- ------------------------------------------------------------------
-- 89_road_ahead_logic.sql - Road Ahead's arithmetic and its reads.
--
-- THE ASSESSOR IS HERE AS WELL AS IN JAVASCRIPT, on purpose. Any Claude
-- with the database connector - the chat app included - can assess a
-- listing with ra_assess() without running code, and gets the same
-- pounds the page shows: `npm run test:parity` holds ra_appraise() equal
-- to appraise.js on every case it tries, field by field.
--
-- Everything is double precision, as the engine is, and rounding is the
-- kit's: half to even. round() on a DOUBLE is the C library's rint(),
-- which is exactly that on the Linux servers Postgres runs on (round() on
-- a NUMERIC rounds halves away from zero, so a numeric must never reach
-- it); the SQL suite pins the tie. Dividing by 10, 100 or 1000 first
-- can never turn a near-tie into a false tie: the quotient keeps more
-- than half an ulp of the gap.
-- ------------------------------------------------------------------

-- ---------------------------------------------------------------
-- Primitives.
-- ---------------------------------------------------------------
create or replace function public.ra_round_even(x double precision, digits integer)
returns double precision
language plpgsql
immutable
set search_path = public
as $$
begin
  -- To the ten, hundred or thousand only. Rounding to decimal places the
  -- kit's way needs the exact decimal value, which a double does not
  -- carry, so it is refused rather than approximated.
  if digits > 0 then
    raise exception 'ra_round_even rounds to tens, hundreds or thousands (digits <= 0), not to %', digits;
  end if;
  -- Adding zero turns a -0 into 0 and changes no other value. Python,
  -- and the engine after it, keep the -0 of a small loss; jsonb cannot
  -- (numeric has no negative zero), so it is dropped here, where a
  -- figure read as text would otherwise print as -0.
  return round(x / (10::double precision ^ (-digits))) * (10::double precision ^ (-digits)) + 0.0::double precision;
end;
$$;

-- Stamp duty land tax, England, residential, from 1 April 2025. The law,
-- mirrored from money.js; a change in the rates changes both.
create or replace function public.ra_sdlt(p_price double precision, p_ftb boolean default false)
returns double precision
language plpgsql
immutable
set search_path = public
as $$
declare
  t double precision := 0;
  prev double precision := 0;
  b record;
begin
  if p_ftb and p_price <= 500000 then
    return greatest(0::double precision, p_price - 300000) * 0.05::double precision;
  end if;
  for b in select * from (values (125000::double precision, 0::double precision), (250000, 0.02),
                                 (925000, 0.05), (1500000, 0.10), ('Infinity', 0.12)) v(top, rate)
           order by top loop
    if p_price > prev then t := t + (least(p_price, b.top) - prev) * b.rate; end if;
    prev := b.top;
  end loop;
  return t;
end;
$$;

-- ---------------------------------------------------------------
-- The appraisal settings: the variables with a scenario laid over them,
-- in the shape appraise.js takes (params.js appraisalSettings).
-- ---------------------------------------------------------------
create or replace function public.ra_params(p_household uuid, p_scenario text default 'base')
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select coalesce((select jsonb_object_agg(v.key, v.value) from public.ra_variables v
                    where v.household_id = p_household and v.status = 'active'), '{}'::jsonb)
         || coalesce((select s.overrides from public.ra_scenarios s
                        where s.household_id = p_household and s.key = p_scenario), '{}'::jsonb)
$$;

-- The scenario's own works factor is the optimistic one, when it has
-- one (Highly optimistic takes 0.7); a scenario without local help
-- prices every listing's works as paid labour. appraisalSettings() in
-- params.js applies the same two rules.
create or replace function public.ra_settings(p_household uuid, p_scenario text default 'base')
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  p jsonb := public.ra_params(p_household, p_scenario);
  s public.ra_scenarios;
  v jsonb := '{}';
  missing text[] := '{}';
  m record;
begin
  select * into s from public.ra_scenarios where household_id = p_household and key = p_scenario;
  if p_scenario <> 'base' and s.id is null then
    raise exception 'no scenario % in this household', p_scenario;
  end if;
  for m in select * from (values
      ('cash_at_purchase', 'appraisal.cash_at_purchase'), ('buy_costs', 'appraisal.buy_costs'),
      ('day_one_kit', 'appraisal.day_one_kit'), ('deposit_pct', 'appraisal.deposit_pct'),
      ('sell_pct', 'appraisal.sell_pct'), ('sell_fixed', 'appraisal.sell_fixed'),
      ('target_profit', 'appraisal.target_profit'), ('works_factor', 'appraisal.works_factor'),
      ('walk_from', 'appraisal.walk_from'), ('walk_to', 'appraisal.walk_to'), ('walk_step', 'appraisal.walk_step'),
      ('stretch_below', 'appraisal.stretch_below'), ('near_minutes', 'help.near_minutes'),
      ('help_near_cost', 'help.near.cost'), ('help_far_cost', 'help.far.cost'), ('ceiling_hard', 'ceiling.hard'),
      ('verdict_strong', 'verdict.strong'), ('verdict_worth', 'verdict.worth'),
      ('verdict_marginal', 'verdict.marginal')) x(setting, variable) loop
    -- No defaults, as in the engine: a missing figure is refused by name.
    if jsonb_typeof(p -> m.variable) is distinct from 'number' then
      missing := missing || m.variable;
    end if;
    v := v || jsonb_build_object(m.setting, p -> m.variable);
  end loop;
  if cardinality(missing) > 0 then
    raise exception 'Road Ahead cannot assess: no number for %', array_to_string(missing, ', ')
      using hint = 'Each is a row in ra_variables (see docs/road-ahead/VARIABLES.md).';
  end if;
  if s.works_factor is not null then
    v := v || jsonb_build_object('works_factor', s.works_factor::double precision);
  end if;
  if s.help is false then
    v := v || '{"help_near_cost": 1, "help_far_cost": 1}'::jsonb;
  end if;
  return v;
end;
$$;

-- ---------------------------------------------------------------
-- The register maths, mirroring appraise.js line for line.
-- ---------------------------------------------------------------
create or replace function public.ra_fee(p_buy double precision, p_fee double precision, p_pct double precision)
returns double precision
language sql
immutable
set search_path = public
as $$ select case when p_pct <> 0 then greatest(p_buy * p_pct, p_fee) else p_fee end $$;

create or replace function public.ra_profit(v jsonb, p_buy double precision, p_works double precision,
  p_finished double precision, p_fee double precision default 0, p_pct double precision default 0)
returns double precision
language sql
immutable
set search_path = public
as $$
  select public.ra_round_even(p_finished - (p_buy + f + public.ra_sdlt(p_buy + case when p_pct <> 0 then f else 0 end, true)
    + (v ->> 'buy_costs')::double precision + p_works + p_finished * (v ->> 'sell_pct')::double precision
    + (v ->> 'sell_fixed')::double precision), -3)
  from (select public.ra_fee(p_buy, p_fee, p_pct) as f) x
$$;

create or replace function public.ra_walk_away(v jsonb, p_works double precision, p_finished double precision,
  p_fee double precision default 0, p_pct double precision default 0, p_target double precision default null)
returns double precision
language plpgsql
immutable
set search_path = public
as $$
declare
  t double precision := coalesce(p_target, (v ->> 'target_profit')::double precision);
  step double precision := (v ->> 'walk_step')::double precision;
  b double precision := (v ->> 'walk_from')::double precision;
  top double precision := (v ->> 'walk_to')::double precision;
begin
  while b <= top loop
    if public.ra_profit(v, b, p_works, p_finished, p_fee, p_pct) < t then return b - step; end if;
    b := b + step;
  end loop;
  return top;
end;
$$;

create or replace function public.ra_cash_left(v jsonb, p_buy double precision, p_fee double precision default 0,
  p_pct double precision default 0, p_dep double precision default null)
returns double precision
language sql
immutable
set search_path = public
as $$
  select public.ra_round_even((v ->> 'cash_at_purchase')::double precision - (
      p_buy * coalesce(p_dep, (v ->> 'deposit_pct')::double precision)
      + public.ra_sdlt(p_buy + case when p_pct <> 0 then f else 0 end, true)
      + (v ->> 'buy_costs')::double precision + (v ->> 'day_one_kit')::double precision + f), -3)
  from (select public.ra_fee(p_buy, p_fee, p_pct) as f) x
$$;

create or replace function public.ra_verdict(v jsonb, p_profit_opt double precision, p_buy double precision,
  p_cash double precision)
returns text
language plpgsql
immutable
set search_path = public
as $$
declare g text;
begin
  g := case when p_profit_opt >= (v ->> 'verdict_strong')::double precision then 'Strong'
            when p_profit_opt >= (v ->> 'verdict_worth')::double precision then 'Worth pursuing'
            when p_profit_opt >= (v ->> 'verdict_marginal')::double precision then 'Marginal'
            else 'Walk away' end;
  if p_buy > (v ->> 'ceiling_hard')::double precision or p_cash < 0 then
    g := 'Over budget';
  elsif p_cash < (v ->> 'stretch_below')::double precision and g in ('Strong', 'Worth pursuing') then
    g := g || ' (stretch)';
  end if;
  return g;
end;
$$;

-- One listing, scored: the SQL twin of appraise() in appraise.js, the
-- owner's judgement included. `l` carries likely_buy, fin_lo, fin_hi,
-- works (DIY, before help), fee, pct, mins, fits (ordered [road, score]
-- pairs), override_grade and judgement.
create or replace function public.ra_appraise(v jsonb, l jsonb)
returns jsonb
language plpgsql
immutable
set search_path = public
as $$
declare
  buy double precision := (l ->> 'likely_buy')::double precision;
  fee double precision := coalesce((l ->> 'fee')::double precision, 0);
  pct double precision := coalesce((l ->> 'pct')::double precision, 0);
  lo double precision := (l ->> 'fin_lo')::double precision;
  hi double precision := (l ->> 'fin_hi')::double precision;
  mid double precision := (lo + hi) / 2;
  near boolean := coalesce((l ->> 'mins')::double precision <= (v ->> 'near_minutes')::double precision, false);
  ceiling double precision := (v ->> 'ceiling_hard')::double precision;
  works_base double precision;
  works_opt double precision;
  walk double precision;
  cash double precision;
  profit_opt double precision;
  best text;
  j jsonb := l -> 'judgement';
  jwalk double precision;
  judgement jsonb := null;
begin
  works_base := public.ra_round_even((l ->> 'works')::double precision
    * case when near then (v ->> 'help_near_cost')::double precision else (v ->> 'help_far_cost')::double precision end, -3);
  works_opt := public.ra_round_even(works_base * (v ->> 'works_factor')::double precision, -3);
  profit_opt := public.ra_profit(v, buy, works_opt, mid, fee, pct);
  walk := public.ra_walk_away(v, works_opt, mid, fee, pct);
  cash := public.ra_cash_left(v, buy, fee, pct);
  -- The first highest score, in the order the scores were given.
  select f ->> 0 into best
    from jsonb_array_elements(coalesce(l -> 'fits', '[]'::jsonb)) with ordinality e(f, i)
   order by (f ->> 1)::numeric desc, i asc
   limit 1;

  if j is not null and ((j ->> 'walk_away') is not null or (j ->> 'premium') is not null) then
    if not coalesce((j ->> 'reason') ~ '\S', false) then
      raise exception using errcode = 'check_violation', message = 'a judgement needs its reason';
    end if;
    jwalk := coalesce((j ->> 'walk_away')::double precision, walk + (j ->> 'premium')::double precision);
    judgement := jsonb_build_object(
      'walk_away', jwalk,
      'bid_limit', least(jwalk, ceiling),
      'above_ceiling', jwalk > ceiling,
      'difference', jwalk - walk,
      'profit_opt', public.ra_profit(v, jwalk, works_opt, mid, fee, pct),
      'cost', public.ra_profit(v, walk, works_opt, mid, fee, pct) - public.ra_profit(v, jwalk, works_opt, mid, fee, pct),
      'cash_left', public.ra_cash_left(v, least(jwalk, ceiling), fee, pct),
      'reason', j ->> 'reason',
      'kind', coalesce(j ->> 'kind', 'personal'));
  end if;

  return jsonb_build_object(
    'near', near, 'works_base', works_base, 'works_opt', works_opt,
    'best_road', coalesce(best, '—'),
    'profit_base', public.ra_profit(v, buy, works_base, mid, fee, pct),
    'profit_opt', profit_opt,
    'profit_opt_hi', public.ra_profit(v, buy, works_opt, hi, fee, pct),
    'walk_away_opt', walk, 'bid_limit', least(walk, ceiling), 'cash_left', cash,
    'over_ceiling', buy > ceiling,
    'grade', coalesce(l ->> 'override_grade', public.ra_verdict(v, profit_opt, buy, cash)),
    'judgement', judgement);
end;
$$;

-- ---------------------------------------------------------------
-- The owner's current judgement on each listing and field: the newest,
-- unless a newer one names it as superseded.
-- ---------------------------------------------------------------
create or replace view public.ra_current_judgements
with (security_invoker = on) as
select distinct on (j.household_id, j.listing_id, j.road_code, j.field)
  j.*
from public.ra_judgements j
where not exists (select 1 from public.ra_judgements n where n.supersedes_id = j.id)
order by j.household_id, j.listing_id, j.road_code, j.field, j.said_on desc, j.created_at desc;

-- The inputs a listing is assessed on: its latest appraisal WITH FIGURES
-- (a Part N write-up is narrative and has none), the listing's own
-- minutes and fee where the appraisal is silent, that appraisal's
-- override, and the owner's current walk-away judgement.
create or replace function public.ra_listing_inputs(p_household uuid, p_code text)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select jsonb_strip_nulls(
    jsonb_build_object('mins', l.minutes_from_home, 'fee', l.fee, 'pct', l.fee_pct)
    || coalesce(a.inputs, '{}'::jsonb)
    || jsonb_build_object('fits', a.fits, 'override_grade', a.override_grade,
         'judgement', (select case when j.field = 'walk_away' then jsonb_build_object('walk_away', j.value)
                                   else jsonb_build_object('premium', j.value) end
                              || jsonb_build_object('reason', j.reason, 'kind', j.kind)
                         from public.ra_current_judgements j
                        where j.listing_id = l.id and j.field in ('walk_away', 'premium')
                        order by j.said_on desc, j.created_at desc limit 1)))
  from public.ra_listings l
  left join lateral (select * from public.ra_appraisals a where a.listing_id = l.id and a.inputs ? 'likely_buy'
                      order by a.appraised_on desc, a.created_at desc limit 1) a on true
  where l.household_id = p_household and l.code = p_code
$$;

-- ---------------------------------------------------------------
-- ra_assess: the assessor any Claude can call.
--   select ra_assess('<household>', 'L03');            the base scenario
--   select ra_assess('<household>', 'L03', 'optimistic');
--   select ra_assess_inputs('<household>', '{"likely_buy": ...}');
-- ---------------------------------------------------------------
create or replace function public.ra_assess(p_household uuid, p_code text, p_scenario text default 'base')
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
declare inputs jsonb := public.ra_listing_inputs(p_household, p_code);
begin
  if inputs is null then
    raise exception 'no listing % in this household', p_code;
  end if;
  if not (inputs ? 'likely_buy' and inputs ? 'fin_lo' and inputs ? 'fin_hi' and inputs ? 'works') then
    return jsonb_build_object('listing', p_code, 'error', 'no appraisal inputs yet',
      'needs', 'an appraisal with likely_buy, fin_lo, fin_hi and works');
  end if;
  return jsonb_build_object('listing', p_code, 'scenario', p_scenario, 'inputs', inputs)
      || public.ra_appraise(public.ra_settings(p_household, p_scenario), inputs);
end;
$$;

create or replace function public.ra_assess_inputs(p_household uuid, p_inputs jsonb, p_scenario text default 'base')
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$ select public.ra_appraise(public.ra_settings(p_household, p_scenario), p_inputs) $$;

-- ---------------------------------------------------------------
-- The bridge to the project system. A listing the owner wants to work
-- up becomes a candidate property with the renovation template, and the
-- listing points at it. Idempotent: a listing already promoted returns
-- its property. It never makes the property the house unless asked, and
-- asking goes through make_active(), with all its rules.
--
--   select ra_promote_listing('<household>', 'L03');          a candidate
--   select ra_promote_listing('<household>', 'L03', true);    and the house
-- ---------------------------------------------------------------
create or replace function public.ra_promote_listing(p_household uuid, p_code text, p_make_active boolean default false)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  l public.ra_listings;
  v_id uuid;
  -- The reason is the link's alone: whatever the session changes next
  -- gives its own.
  v_why text := current_setting('house.change_why', true);
begin
  select * into l from public.ra_listings where household_id = p_household and code = p_code;
  if not found then
    raise exception 'no listing %', p_code;
  end if;
  if l.purpose = 'benchmark' then
    raise exception using errcode = 'check_violation',
      message = format('%s is a benchmark, kept for comparison; only a candidate becomes a project', p_code);
  end if;
  if l.status in ('dropped', 'closed', 'lost') then
    raise exception using errcode = 'check_violation',
      message = format('%s is %s (%s); reopen it before working it up', p_code, l.status, l.status_reason);
  end if;

  v_id := l.property_id;
  if v_id is null then
    v_id := public.new_property(p_household, l.name, l.address, l.postcode, null, null, null,
                                coalesce(l.guide_price, l.asking_price));
    perform set_config('house.change_why', format('%s promoted to a project', p_code), true);
    update public.ra_listings set property_id = v_id where id = l.id;
    perform set_config('house.change_why', coalesce(v_why, ''), true);
  end if;
  if p_make_active then
    perform public.make_active(p_household, (select ref from public.properties where id = v_id));
  end if;
  return v_id;
end;
$$;


-- ---------------------------------------------------------------
-- The auction countdown, per lot and step. Due dates are derived from
-- the auction date. A lot being chased gets every step; a lot only
-- watched gets auction day, so the hammer price is logged.
-- ---------------------------------------------------------------
create or replace view public.ra_pipeline
with (security_invoker = on) as
select
  l.household_id, l.id as listing_id, l.code, l.name, l.house_code, split_part(h.name, ' (', 1) as house_name, l.lot,
  l.auction_on, l.auction_at, l.status as listing_status,
  t.key as step_key, t.label, t.settles, t.sort_order,
  (l.auction_on + t.offset_days) as due_on,
  ((l.auction_on + t.offset_days) - current_date) as days_until,
  s.done_on, s.outcome, (s.done_on is not null) as is_done
from public.ra_listings l
join public.ra_pipeline_template t on (l.status <> 'watch' or t.key = 't-0')
left join public.ra_pipeline_steps s on s.listing_id = l.id and s.step_key = t.key
left join public.ra_auction_houses h on h.household_id = l.household_id and h.code = l.house_code
where l.auction_on is not null
  and l.status in ('watch','chase','viewing','legal','survey','bid','offer');

-- ---------------------------------------------------------------
-- whats_next: the dates, as one list.
--
-- Milestones, scheduled events and the auction countdown answer the
-- same question from three tables. A MILESTONE is a date the plan has
-- to hit; an EVENT is a date somebody else set; a PIPELINE row is a lot
-- step due that day. A dashboard showing only one of them would be
-- confidently wrong in exactly the week that matters - an agent's open
-- house or an auctioneer's catalogue is not in the plan's gift.
--
-- `days_until` is computed HERE rather than in the page, because two
-- surfaces counting days from a date is two chances to get a timezone
-- wrong, and a countdown that is a day out is worse than no countdown.
-- The event side converts through Europe/London before taking the date,
-- so an 11am viewing does not land on the previous day in summer.
--
-- The countdown is ONE ROW PER DAY: every lot's step due that day is
-- folded into the title, so a page showing one row per date - the
-- published Dashboard does - still shows every lot. The view lives in
-- this file, not beside the milestones, because it reads the Road Ahead
-- tables and has to be created after them.
-- ---------------------------------------------------------------
create or replace view public.whats_next
with (security_invoker = on) as
select
  'milestone'                       as source,
  m.id,
  m.key,
  m.title,
  m.description,
  m.due_on                          as on_date,
  null::timestamptz                 as starts_at,
  null::text                        as location,
  'planned'::text                   as status,
  (m.due_on - current_date)         as days_until,
  m.household_id,
  -- How much open work is pinned to this date. A milestone nothing
  -- points at is a date in a document; one with work behind it is a
  -- deadline. For a pipeline row, the number of lots.
  (select count(*) from public.work_items w
    where w.milestone_id = m.id and w.status not in ('done', 'dropped')) as open_items
from public.milestones m
where public.in_default_scope(m.household_id, m.property_id)
union all
select
  'event'                           as source,
  e.id,
  null                              as key,
  e.title,
  e.notes                           as description,
  (e.starts_at at time zone 'Europe/London')::date as on_date,
  e.starts_at,
  e.location,
  e.status,
  ((e.starts_at at time zone 'Europe/London')::date - current_date) as days_until,
  e.household_id,
  0                                 as open_items
from public.scheduled_events e
where e.status <> 'cancelled'
  and public.in_default_scope(e.household_id, e.property_id)
union all
select
  'pipeline'                        as source,
  md5(d.household_id::text || d.due_on::text)::uuid as id,
  'auction:' || d.due_on::text      as key,
  string_agg(d.line, '; ' order by d.sort_order, d.auction_on) as title,
  string_agg(distinct d.settles, '; ' order by d.settles) as description,
  d.due_on                          as on_date,
  null::timestamptz                 as starts_at,
  null::text                        as location,
  'planned'::text                   as status,
  (d.due_on - current_date)         as days_until,
  d.household_id,
  sum(d.lots)::bigint               as open_items
from (
  select p.household_id, p.due_on, p.auction_on, p.sort_order,
         format('%s %s: %s (%s)', coalesce(p.house_name, p.house_code, 'Auction'), to_char(p.auction_on, 'FMDD Mon'),
                p.label, string_agg(coalesce('lot ' || p.lot, p.code), ', '
                                    order by length(coalesce(p.lot, p.code)), coalesce(p.lot, p.code))) as line,
         min(p.settles) as settles,
         count(*) as lots
    from public.ra_pipeline p
   where not p.is_done
   group by p.household_id, p.due_on, p.auction_on, p.sort_order, p.house_name, p.house_code, p.label
) d
group by d.household_id, d.due_on;

comment on view public.whats_next is
  'Milestones, scheduled events and the auction countdown as one diary, with days_until computed once. A milestone is a date the plan has to hit; an event is a date somebody else set; a pipeline row is every lot step due that day.';

-- ---------------------------------------------------------------
-- The register, the decisions in force, and the model beside the ledger.
-- ---------------------------------------------------------------
-- A listing with its latest appraisal that has figures (what the page
-- computes from) and its latest written appraisal (the Part N write-up:
-- rooms, comparables, moves, funding), which may be the same row.
create or replace view public.ra_register
with (security_invoker = on) as
select
  l.*,
  a.id as appraisal_id, a.appraised_on, a.protocol, a.inputs, a.outputs, a.fits, a.verdict,
  a.override_grade, a.override_reason, a.positives, a.negatives, a.red_flags, a.next_checks,
  (l.auction_on - current_date) as days_to_auction,
  (select jsonb_agg(jsonb_build_object('field', j.field, 'value', j.value, 'reason', j.reason,
                                       'kind', j.kind, 'said_on', j.said_on) order by j.field)
     from public.ra_current_judgements j where j.listing_id = l.id) as judgements,
  (select jsonb_build_object('step', p.label, 'due_on', p.due_on, 'days_until', p.days_until)
     from public.ra_pipeline p where p.listing_id = l.id and not p.is_done
    order by p.sort_order limit 1) as next_step,
  n.id as write_up_id, n.appraised_on as write_up_on, n.verdict as write_up_verdict, n.narrative,
  -- Where the latest figures came from, and how far each is trusted.
  a.sources, a.labels
from public.ra_listings l
left join lateral (select * from public.ra_appraisals a where a.listing_id = l.id and a.inputs ? 'likely_buy'
                    order by a.appraised_on desc, a.created_at desc limit 1) a on true
left join lateral (select * from public.ra_appraisals a where a.listing_id = l.id and a.narrative is not null
                    order by a.appraised_on desc, a.created_at desc limit 1) n on true;

-- The road's decisions in force: active, and not superseded by a newer
-- one. The kit's log names what each decision supersedes but sometimes
-- leaves the older one marked locked or lean; the link decides here, and
-- the older row keeps the status the kit gave it.
create or replace view public.ra_current_decisions
with (security_invoker = on) as
select d.id, d.household_id, d.property_id, d.code, d.topic, d.title, d.decided, d.rationale,
       d.firmness, d.door, d.evidence, d.certainty, d.reopen_if, d.checkpoint, d.source, d.decided_on
from public.decisions d
where d.domain = 'road' and d.status = 'active'
  and not exists (select 1 from public.knowledge_links k
                   where k.kind = 'supersedes' and k.to_type = 'decision' and k.to_id = d.id
                     and k.valid_to is null);

create or replace view public.ra_model_vs_ledger
with (security_invoker = on) as
select v.household_id, 'cash'::text as measure,
       (v.value #>> '{}')::numeric as model_value, v.confidence as model_confidence, v.source as model_source,
       (select sum(case when a.is_liability then -a.balance else a.balance end)
          from public.accounts a join public.confidence_levels c on c.key = a.confidence
         where a.household_id = v.household_id and a.is_active and c.is_trusted and a.balance is not null) as ledger_value,
       (select max(a.as_of) from public.accounts a join public.confidence_levels c on c.key = a.confidence
         where a.household_id = v.household_id and a.is_active and c.is_trusted) as ledger_as_of
from public.ra_variables v where v.key = 'cash.start_cash'
union all
select v.household_id, 'net pay per month', (v.value #>> '{}')::numeric, v.confidence, v.source,
       (select sum(i.amount) from public.income_sources i join public.confidence_levels c on c.key = i.confidence
         where i.household_id = v.household_id and i.is_active and c.is_trusted
           and i.kind = 'salary' and i.basis = 'net' and i.cadence = 'monthly'),
       null::date
from public.ra_variables v where v.key = 'income.net_pay_now';

-- What to confirm first, from the latest sensitivity snapshot of each
-- output: the swing, weighted towards what is still unconfirmed. The
-- same weighting as calibrationAgenda() in sensitivity.js.
create or replace view public.ra_calibration_queue
with (security_invoker = on) as
with latest as (
  select distinct on (household_id, output) household_id, output, run_at
    from public.ra_sensitivity order by household_id, output, run_at desc
)
select s.household_id, s.output, s.variable_key, v.label, s.low, s.high, s.at_low, s.at_high, s.swing,
       v.evidence, v.confidence,
       s.swing * case when c.is_trusted then 0.1 else 1 end as score,
       rank() over (partition by s.household_id, s.output
                    order by s.swing * case when c.is_trusted then 0.1 else 1 end desc) as rank,
       s.run_at
from public.ra_sensitivity s
join latest l on l.household_id = s.household_id and l.output = s.output and l.run_at = s.run_at
left join public.ra_variables v on v.household_id = s.household_id and v.key = s.variable_key
left join public.confidence_levels c on c.key = v.confidence;

-- ---------------------------------------------------------------
-- road_ahead_context: the first call of any Road Ahead session. The
-- household is passed explicitly, because the connector runs with no
-- signed-in user.
-- ---------------------------------------------------------------
create or replace function public.road_ahead_context(p_household uuid)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select jsonb_build_object(
    'household', p_household,
    'privacy', 'Everything here is private. Never copy a figure from it into the repository.',
    'variables', (select coalesce(jsonb_agg(jsonb_build_object('key', v.key, 'value', v.value, 'unit', v.unit,
                    'evidence', v.evidence, 'confidence', v.confidence, 'label', v.label) order by v.key), '[]')
                    from public.ra_variables v where v.household_id = p_household and v.status = 'active'),
    'scenarios', (select coalesce(jsonb_agg(jsonb_build_object('key', s.key, 'name', s.name, 'status', s.status,
                    'overrides', s.overrides, 'works_factor', s.works_factor, 'help', s.help) order by s.key), '[]')
                    from public.ra_scenarios s where s.household_id = p_household and s.status <> 'retired'),
    'roads', (select coalesce(jsonb_agg(jsonb_build_object('code', r.code, 'name', r.name, 'rank', r.rank_label,
                    'near', r.near) order by r.sort_order, r.code), '[]')
                from public.ra_roads r where r.household_id = p_household and r.status = 'active'),
    'rules', (select coalesce(jsonb_agg(jsonb_build_object('code', r.code, 'scope', r.scope, 'rule', r.rule,
                    'severity', r.severity) order by r.code), '[]')
                from public.ra_rules r where r.household_id = p_household and r.status = 'active'),
    'decisions', (select coalesce(jsonb_agg(jsonb_build_object('code', d.code, 'topic', d.topic, 'question', d.title,
                    'answer', d.decided, 'firmness', d.firmness, 'on', d.decided_on) order by d.topic, d.code), '[]')
                    from public.ra_current_decisions d where d.household_id = p_household),
    'contradictions', (select coalesce(jsonb_agg(jsonb_build_object('key', c.key, 'topic', c.topic,
                    'what_it_changes', c.what_it_changes) order by c.key), '[]')
                    from public.contradictions c where c.household_id = p_household and c.status = 'open'
                     and public.in_default_scope(c.household_id, c.property_id)),
    'register', (select jsonb_build_object(
                    'by_status', (select jsonb_object_agg(status, n) from (select status, count(*) n from public.ra_listings
                                   where household_id = p_household group by status) x),
                    'live', (select coalesce(jsonb_agg(jsonb_build_object('code', l.code, 'name', l.name,
                               'status', l.status, 'auction_on', l.auction_on) order by l.auction_on nulls last, l.code), '[]')
                               from public.ra_listings l where l.household_id = p_household
                                and l.status in ('chase','viewing','legal','survey','bid','offer')))),
    'judgements', (select coalesce(jsonb_agg(jsonb_build_object('listing', l.code, 'road', j.road_code, 'field', j.field,
                    'value', j.value, 'reason', j.reason, 'kind', j.kind, 'said_on', j.said_on)), '[]')
                    from public.ra_current_judgements j left join public.ra_listings l on l.id = j.listing_id
                   where j.household_id = p_household),
    'next', (select coalesce(jsonb_agg(jsonb_build_object('on', w.on_date, 'days', w.days_until, 'what', w.title)
                    order by w.on_date), '[]')
               from (select * from public.whats_next w where w.household_id = p_household and w.days_until >= 0
                      order by w.on_date limit 10) w),
    'agenda', 'select road_ahead_agenda(household) for the order of a sit-down');
$$;

-- ---------------------------------------------------------------
-- road_ahead_agenda: what a sit-down should cover, in order
-- (docs/road-ahead/CALIBRATION.md).
-- ---------------------------------------------------------------
create or replace function public.road_ahead_agenda(p_household uuid)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select jsonb_build_object(
    'dated', (select coalesce(jsonb_agg(jsonb_build_object('on', w.on_date, 'days', w.days_until, 'what', w.title)
                order by w.on_date), '[]')
                from public.whats_next w where w.household_id = p_household and w.days_until between 0 and 21),
    'contradictions', (select coalesce(jsonb_agg(jsonb_build_object('key', c.key, 'topic', c.topic,
                'a', c.position_a, 'b', c.position_b, 'what_it_changes', c.what_it_changes) order by c.created_at), '[]')
                from public.contradictions c where c.household_id = p_household and c.status = 'open'
                 and public.in_default_scope(c.household_id, c.property_id)),
    -- Each input once, at its largest weighted swing across every answer
    -- it moves: eight questions that matter beat forty that repeat.
    'calibrate', (select coalesce(jsonb_agg(jsonb_build_object('variable', c.variable_key, 'label', c.label,
                'score', c.score, 'swing', c.swing, 'moves', c.moves, 'evidence', c.evidence,
                'confidence', c.confidence) order by c.score desc, c.variable_key), '[]')
                from (select q.variable_key, max(q.label) as label, max(q.score) as score, max(q.swing) as swing,
                             jsonb_agg(q.output order by q.score desc) as moves,
                             max(q.evidence) as evidence, max(q.confidence) as confidence
                        from public.ra_calibration_queue q where q.household_id = p_household and q.score > 0
                       group by q.variable_key order by max(q.score) desc, q.variable_key limit 8) c),
    'judgements_to_revisit', (select coalesce(jsonb_agg(jsonb_build_object('listing', l.code, 'field', j.field,
                'value', j.value, 'reason', j.reason, 'said_on', j.said_on)), '[]')
                from public.ra_current_judgements j join public.ra_listings l on l.id = j.listing_id
               where j.household_id = p_household
                 and (j.said_on < current_date - 90
                      or exists (select 1 from public.ra_appraisals a where a.listing_id = j.listing_id
                                  and a.appraised_on > j.said_on))),
    'signals_unreflected', (select coalesce(jsonb_agg(jsonb_build_object('code', s.code, 'words', s.words,
                'implies', s.implies) order by s.said_on desc nulls last, s.code), '[]')
                from public.ra_signals s
               where s.household_id = p_household and s.status = 'active' and s.kind = 'signal'
                 and not exists (select 1 from public.knowledge_links k
                                  where k.from_type = 'signal' and k.from_id = s.id and k.valid_to is null)),
    'moved', (select coalesce(jsonb_agg(jsonb_build_object('road', m.road_code, 'scenario', m.scenario_key,
                'run', m.run_name, 'was', m.was, 'now', m.now, 'accepted_at', m.accepted_at,
                'note', m.accepted_note) order by abs(m.now - m.was) desc), '[]')
                from (select r.road_code, r.scenario_key, r.run_name, r.accepted_at, r.accepted_note,
                             (r.summary ->> 'forever_today')::numeric as now,
                             lag((r.summary ->> 'forever_today')::numeric) over w as was,
                             row_number() over (partition by r.road_code, r.scenario_key, r.run_name
                                                order by r.accepted_at desc) as latest
                        from public.ra_road_runs r where r.household_id = p_household
                      window w as (partition by r.road_code, r.scenario_key, r.run_name order by r.accepted_at)) m
               where m.latest = 1 and abs(m.now - m.was) >= 1000));
$$;

-- ---------------------------------------------------------------
-- road_ahead_inputs: the figures the engine runs on today, for a session
-- that wants the JavaScript engine's view of the live data - the roads,
-- a sensitivity snapshot, an accepted run. Save it to data/road-ahead/
-- (gitignored) and pass the file to tools/road-ahead.mjs with --extract.
-- ---------------------------------------------------------------
create or replace function public.road_ahead_inputs(p_household uuid)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select jsonb_build_object(
    'format', 'road-ahead-inputs/1',
    'household', p_household,
    'variables', coalesce((select jsonb_object_agg(v.key, jsonb_build_object('value', v.value, 'low', v.low,
                    'high', v.high, 'unit', v.unit, 'evidence', v.evidence, 'confidence', v.confidence))
                   from public.ra_variables v where v.household_id = p_household and v.status = 'active'), '{}'),
    'scenarios', coalesce((select jsonb_object_agg(s.key, jsonb_build_object('name', s.name, 'overrides', s.overrides,
                    'works_factor', s.works_factor::double precision, 'help', s.help))
                   from public.ra_scenarios s where s.household_id = p_household and s.status = 'active'), '{}'),
    'roads', jsonb_build_object('active', coalesce((select jsonb_agg(jsonb_build_object('code', r.code, 'name', r.name,
                    'rank', r.rank_label, 'near', r.near, 'stages', r.stages) order by r.sort_order, r.code)
                   from public.ra_roads r where r.household_id = p_household and r.status = 'active' and r.kind = 'road'), '[]')),
    'listings', coalesce((select jsonb_agg(jsonb_build_object('code', l.code, 'name', l.name, 'status', l.status,
                    'inputs', public.ra_listing_inputs(p_household, l.code)) order by l.code)
                   from public.ra_listings l where l.household_id = p_household
                    and l.status in ('chase','viewing','legal','survey','bid','offer')), '[]'));
$$;

-- ---------------------------------------------------------------
-- road_ahead_export: a frozen scenario's complete inputs and published
-- outputs, in the kit extract's format, so a session without the kit
-- can re-prove the engine: save it to data/road-ahead/ and run
-- npm run test:checksums.
-- ---------------------------------------------------------------
create or replace function public.road_ahead_export(p_household uuid, p_scenario text default 'kit-v5')
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select s.frozen from public.ra_scenarios s
   where s.household_id = p_household and s.key = p_scenario and s.frozen is not null
$$;
