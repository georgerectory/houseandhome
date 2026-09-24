-- ------------------------------------------------------------------
-- 85_lifecycle.sql - one live house, many drafts, nothing lost.
--
-- The system is property-agnostic. Everything belongs to one of five
-- scopes, and only one of them belongs to a building:
--
--   USER      the household: income, accounts, personal bills, owned kit
--             (property_id is null)
--   BRIEF     what a house is being looked for against (a document)
--   TEMPLATE  how any house is renovated: work_item_templates, work_phases
--   LIBRARY   what things cost and where: price_references
--   PROPERTY  one building (property_id is set)
--
-- Scope is not a column. It is whether property_id is set, which makes
-- "a PROPERTY row without a property" impossible to write rather than a
-- rule to remember.
--
-- Numbered after 80 because everything here reads the tables before it.
-- ------------------------------------------------------------------

-- ---------------------------------------------------------------
-- change_log: OLD -> NEW -> WHY -> SOURCE.
--
-- Every change to a money figure is written here by trigger, and a
-- money figure cannot change without a reason. A session sets it once
-- per transaction:
--
--   select set_config('house.change_why', 'Dorset 8yd skips from £420', true);
--   select set_config('house.change_source', 'The Waste Group, Sep 2026', true);
--
-- property_id cascades, so a purged building's history goes with it.
-- ---------------------------------------------------------------
create table if not exists public.change_log (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  property_id  uuid references public.properties (id) on delete cascade,
  entity_type  text not null,
  entity_id    uuid not null,
  field        text not null,
  old_value    text,
  new_value    text,
  why          text,
  source       text,
  changed_at   timestamptz not null default now()
);

create index if not exists change_log_entity_idx on public.change_log (entity_id, changed_at desc);
create index if not exists change_log_household_idx on public.change_log (household_id, changed_at desc);

-- One trigger function for every table. TG_ARGV lists the fields worth
-- logging; any field whose name starts `money:` also demands a reason.
create or replace function public.log_changes()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  f text;
  money boolean;
  o text;
  n text;
  why text := nullif(current_setting('house.change_why', true), '');
  src text := nullif(current_setting('house.change_source', true), '');
  prop uuid;
begin
  -- The owning property, where the row has one. `properties` owns itself.
  if TG_TABLE_NAME = 'properties' then
    prop := new.id;
  elsif to_jsonb(new) ? 'property_id' then
    prop := (to_jsonb(new) ->> 'property_id')::uuid;
  end if;

  foreach f in array TG_ARGV loop
    money := f like 'money:%';
    f := replace(f, 'money:', '');
    o := to_jsonb(old) ->> f;
    n := to_jsonb(new) ->> f;
    if o is distinct from n then
      if money and why is null then
        raise exception using errcode = 'check_violation',
          message = format('%s.%s changed from %s to %s with no reason given',
                           TG_TABLE_NAME, f, coalesce(o, 'null'), coalesce(n, 'null')),
          hint = 'A figure never changes silently. set_config(''house.change_why'', ''...'', true) first.';
      end if;
      insert into public.change_log (household_id, property_id, entity_type, entity_id,
                                     field, old_value, new_value, why, source)
      values (new.household_id, prop, TG_TABLE_NAME, new.id, f, o, n, why, src);
    end if;
  end loop;
  return new;
end;
$$;

revoke all on function public.log_changes() from public, anon, authenticated;

drop trigger if exists work_items_log on public.work_items;
create trigger work_items_log after update on public.work_items
  for each row execute function public.log_changes(
    'money:cost_best', 'money:cost_expected', 'money:cost_worst', 'money:spent_actual',
    'cost_confidence', 'status', 'property_id', 'funding_stream');

drop trigger if exists bills_log on public.bills;
create trigger bills_log after update on public.bills
  for each row execute function public.log_changes('money:amount', 'confidence', 'is_active');

drop trigger if exists accounts_log on public.accounts;
create trigger accounts_log after update on public.accounts
  for each row execute function public.log_changes('money:balance', 'confidence');

drop trigger if exists pots_log on public.pots;
create trigger pots_log after update on public.pots
  for each row execute function public.log_changes('money:monthly_contribution', 'contribution_confidence');

drop trigger if exists income_sources_log on public.income_sources;
create trigger income_sources_log after update on public.income_sources
  for each row execute function public.log_changes('money:amount', 'confidence', 'basis');

drop trigger if exists properties_log on public.properties;
create trigger properties_log after update on public.properties
  for each row execute function public.log_changes(
    'status', 'money:guide_price', 'money:expected_price', 'money:walk_away_price',
    'money:purchase_price', 'fit_score', 'offer_status');

drop trigger if exists house_facts_log on public.house_facts;
create trigger house_facts_log after update on public.house_facts
  for each row execute function public.log_changes('fact', 'confidence');

-- ---------------------------------------------------------------
-- F.11.1 - no double-counting. A costed child under a costed parent is
-- the same money twice, unless the parent is explicitly a heading whose
-- components carry the cost.
-- ---------------------------------------------------------------
create or replace function public.work_item_double_count_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.cost_expected is not null and new.status not in ('done','dropped') then
    if new.parent_id is not null and exists (
         select 1 from public.work_items p
          where p.id = new.parent_id and p.cost_expected is not null
            and not p.costs_components_separately
            and p.status not in ('done','dropped')) then
      raise exception using errcode = 'check_violation',
        message = format('%s is costed and so is its parent: the money would count twice', new.title),
        hint = 'Merge the cost into the parent, or mark the parent costs_components_separately.';
    end if;
    if not new.costs_components_separately and exists (
         select 1 from public.work_items c
          where c.parent_id = new.id and c.cost_expected is not null
            and c.status not in ('done','dropped')) then
      raise exception using errcode = 'check_violation',
        message = format('%s is costed and so are its components: the money would count twice', new.title),
        hint = 'Mark it costs_components_separately, or take the cost off the components.';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.work_item_double_count_guard() from public, anon, authenticated;

drop trigger if exists work_items_double_count on public.work_items;
create trigger work_items_double_count before insert or update on public.work_items
  for each row execute function public.work_item_double_count_guard();

-- F.11.4, the half a check constraint cannot see: `quoted` means a
-- quote row exists for this item. A figure called a quote with no quote
-- behind it is a benchmark wearing a suit.
create or replace function public.work_item_quoted_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.cost_confidence = 'quoted' and not exists (
       select 1 from public.quotes q
        where q.work_item_id = new.id and q.status in ('received','accepted')) then
    raise exception using errcode = 'check_violation',
      message = format('%s is marked quoted but has no received quote', new.title),
      hint = 'Record the quote in quotes first. A benchmark is researched, not quoted.';
  end if;
  return new;
end;
$$;

revoke all on function public.work_item_quoted_guard() from public, anon, authenticated;

drop trigger if exists work_items_quoted on public.work_items;
create trigger work_items_quoted before insert or update of cost_confidence on public.work_items
  for each row execute function public.work_item_quoted_guard();

-- ---------------------------------------------------------------
-- property_quantities: one building's quantities.
--
-- A RATE carries to every house; a QUANTITY belongs to one. This table
-- holds the second, and is written by the takeoff import (tools/
-- takeoff.mjs --sql), not typed: the geometry is the authority and a
-- typed quantity is a shadow that goes stale when a wall moves.
-- ---------------------------------------------------------------
create table if not exists public.property_quantities (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  property_id  uuid not null references public.properties (id) on delete cascade,
  package_key  text not null,
  label        text not null,
  quantity     numeric(12,3),
  unit         text not null,
  basis        text not null,
  source       text not null default 'takeoff'
    check (source in ('takeoff','drawing','survey','handbook','measured')),
  confidence   text not null default 'drafted' references public.confidence_levels (key),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (property_id, package_key)
);

drop trigger if exists property_quantities_updated_at on public.property_quantities;
create trigger property_quantities_updated_at before update on public.property_quantities
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------
-- contradictions: two sources that disagree, held open until decided.
-- Neither position is picked by being the more attractive number.
-- ---------------------------------------------------------------
create table if not exists public.contradictions (
  id              uuid primary key default gen_random_uuid(),
  household_id    uuid not null references public.households (id) on delete cascade,
  property_id     uuid references public.properties (id) on delete cascade,
  key             text not null,
  topic           text not null,
  source_a        text not null,
  position_a      text not null,
  source_b        text not null,
  position_b      text not null,
  what_it_changes text not null,
  value_at_stake  numeric(12,2),
  status          text not null default 'open'
    check (status in ('open','resolved','superseded')),
  resolution      text,
  resolved_at     timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (household_id, key),
  constraint contradictions_resolution check (status = 'open' or resolution is not null)
);

drop trigger if exists contradictions_updated_at on public.contradictions;
create trigger contradictions_updated_at before update on public.contradictions
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------
-- gate_conditions: what has to be true to pass a decision gate. The
-- gate is a milestone; the conditions are its rows. A gate with one
-- untested condition has not been passed.
-- ---------------------------------------------------------------
create table if not exists public.gate_conditions (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  property_id  uuid not null references public.properties (id) on delete cascade,
  milestone_id uuid references public.milestones (id) on delete set null,
  gate         text not null,
  number       smallint not null,
  description  text not null,
  threshold    text,
  status       text not null default 'untested'
    check (status in ('untested','pass','fail','waived')),
  evidence     text,
  tested_on    date,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (property_id, gate, number),
  constraint gate_conditions_evidence check (status in ('untested') or evidence is not null)
);

drop trigger if exists gate_conditions_updated_at on public.gate_conditions;
create trigger gate_conditions_updated_at before update on public.gate_conditions
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------
-- income_lines: money coming back from the project. Salvage, scrap,
-- tools sold at the end. Kept apart from work_items because a negative
-- cost in the funding queue would be allocated a share of every deposit.
-- ---------------------------------------------------------------
create table if not exists public.income_lines (
  id              uuid primary key default gen_random_uuid(),
  household_id    uuid not null references public.households (id) on delete cascade,
  property_id     uuid references public.properties (id) on delete cascade,
  source          text not null,
  kind            text not null
    check (kind in ('salvage','scrap','tool_resale','lodger','seller_contribution','other')),
  amount_low      numeric(12,2) check (amount_low is null or amount_low >= 0),
  amount_base     numeric(12,2) check (amount_base is null or amount_base >= 0),
  amount_high     numeric(12,2) check (amount_high is null or amount_high >= 0),
  expected_on     date,
  realised_amount numeric(12,2),
  realised_on     date,
  confidence      text not null default 'drafted' references public.confidence_levels (key),
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint income_lines_range check (amount_low is null or amount_high is null or amount_low <= amount_high)
);

drop trigger if exists income_lines_updated_at on public.income_lines;
create trigger income_lines_updated_at before update on public.income_lines
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------
-- monthly_actuals: what actually happened, one row a month. Savings is
-- MEASURED from these, never predicted into them (plan §11.2 rule 4).
-- ---------------------------------------------------------------
create table if not exists public.monthly_actuals (
  id               uuid primary key default gen_random_uuid(),
  household_id     uuid not null references public.households (id) on delete cascade,
  month            date not null check (extract(day from month) = 1),
  opening_balance  numeric(12,2),
  closing_balance  numeric(12,2),
  income_received  numeric(12,2),
  housing_paid     numeric(12,2),
  non_housing_paid numeric(12,2),
  project_spend    numeric(12,2),
  other_spend      numeric(12,2),
  confidence       text not null default 'actual' references public.confidence_levels (key),
  notes            text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (household_id, month)
);

drop trigger if exists monthly_actuals_updated_at on public.monthly_actuals;
create trigger monthly_actuals_updated_at before update on public.monthly_actuals
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------
-- salvage_items: what comes out of a building before it is stripped,
-- and where it goes. The cheapest period door is the one already
-- hanging in the house.
-- ---------------------------------------------------------------
create table if not exists public.salvage_items (
  id              uuid primary key default gen_random_uuid(),
  household_id    uuid not null references public.households (id) on delete cascade,
  property_id     uuid not null references public.properties (id) on delete cascade,
  room_id         uuid references public.rooms (id) on delete set null,
  item            text not null,
  condition       text,
  classification  text not null default 'unclassified'
    check (classification in ('unclassified','keep_in_place','salvage_reuse','salvage_resale',
      'recycle','general_waste','hazardous')),
  photo_path      text,
  removed_on      date,
  storage_location_id uuid references public.storage_locations (id) on delete set null,
  resale_low      numeric(12,2),
  resale_high     numeric(12,2),
  confidence      text not null default 'drafted' references public.confidence_levels (key),
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

drop trigger if exists salvage_items_updated_at on public.salvage_items;
create trigger salvage_items_updated_at before update on public.salvage_items
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------
-- DERIVED VIEWS. Nothing below is stored.
-- SECURITY INVOKER IS NOT OPTIONAL - see 55_stock.sql.
-- ---------------------------------------------------------------

-- savings_regimes: the savings identity as a step function.
--
--   SAVINGS = NET INCOME - HOUSING - COMMITTED NON-HOUSING - DISCRETIONARY
--
-- Savings is an output, never stored. Each regime starts where any
-- income or bill starts or stops, so rent ending at completion and a
-- mortgage beginning are two steps rather than a smoothed guess. Every
-- figure is counted whatever its confidence, and `unconfirmed_inputs`
-- says how many of them nobody has checked.
create or replace view public.savings_regimes
with (security_invoker = on) as
with bounds as (
  select household_id, starts_on as d from public.income_sources where is_active and starts_on is not null
  union select household_id, ends_on from public.income_sources where is_active and ends_on is not null
  union select household_id, starts_on from public.bills
         where is_active and starts_on is not null and public.in_default_scope(household_id, property_id)
  union select household_id, ends_on from public.bills
         where is_active and ends_on is not null and public.in_default_scope(household_id, property_id)
  union select id, current_date from public.households
),
regimes as (
  select household_id, d as starts_on,
         lead(d) over (partition by household_id order by d) as ends_on
    from (select distinct household_id, d from bounds where d >= current_date) b
)
select
  r.household_id,
  r.starts_on,
  r.ends_on,
  round(coalesce((select sum(public.monthly_equivalent(i.amount, i.cadence))
      from public.income_sources i
     where i.household_id = r.household_id and i.is_active
       and (i.starts_on is null or i.starts_on <= r.starts_on)
       and (i.ends_on is null or i.ends_on > r.starts_on)), 0), 2)   as income,
  round(coalesce((select sum(public.monthly_equivalent(b.amount, b.cadence))
      from public.bills b
     where b.household_id = r.household_id and b.is_active and b.property_id is not null
       and public.in_default_scope(b.household_id, b.property_id)
       and (b.starts_on is null or b.starts_on <= r.starts_on)
       and (b.ends_on is null or b.ends_on > r.starts_on)), 0), 2)    as housing,
  round(coalesce((select sum(public.monthly_equivalent(b.amount, b.cadence))
      from public.bills b
     where b.household_id = r.household_id and b.is_active and b.property_id is null
       and b.cost_class <> 'discretionary'
       and (b.starts_on is null or b.starts_on <= r.starts_on)
       and (b.ends_on is null or b.ends_on > r.starts_on)), 0), 2)    as committed_non_housing,
  round(coalesce((select sum(public.monthly_equivalent(b.amount, b.cadence))
      from public.bills b
     where b.household_id = r.household_id and b.is_active and b.property_id is null
       and b.cost_class = 'discretionary'
       and (b.starts_on is null or b.starts_on <= r.starts_on)
       and (b.ends_on is null or b.ends_on > r.starts_on)), 0), 2)    as discretionary,
  (select count(*) from (
      select i.confidence from public.income_sources i
       where i.household_id = r.household_id and i.is_active
         and (i.starts_on is null or i.starts_on <= r.starts_on)
         and (i.ends_on is null or i.ends_on > r.starts_on)
      union all
      select b.confidence from public.bills b
       where b.household_id = r.household_id and b.is_active
         and public.in_default_scope(b.household_id, b.property_id)
         and (b.starts_on is null or b.starts_on <= r.starts_on)
         and (b.ends_on is null or b.ends_on > r.starts_on)) x
     join public.confidence_levels cl on cl.key = x.confidence
    where not cl.is_trusted)                                           as unconfirmed_inputs
from regimes r;

create or replace view public.savings_by_regime
with (security_invoker = on) as
select r.*,
       round(r.income - r.housing - r.committed_non_housing - r.discretionary, 2) as savings
  from public.savings_regimes r;

comment on view public.savings_by_regime is
  'The savings identity as a step function over dated bills and income. Savings is derived, never stored; unconfirmed_inputs counts the figures nobody has checked.';

-- savings_actuals: measured surplus with the three averages the plan
-- asks for, always shown together (§11.2 rule 5).
create or replace view public.savings_actuals
with (security_invoker = on) as
with m as (
  select a.*,
         coalesce(a.income_received, 0) - coalesce(a.housing_paid, 0)
           - coalesce(a.non_housing_paid, 0) - coalesce(a.other_spend, 0) as surplus
    from public.monthly_actuals a
)
select m.household_id, m.month, m.surplus, m.project_spend,
       round(avg(m.surplus) over w3, 2)  as trailing_3,
       round(avg(m.surplus) over w12, 2) as trailing_12,
       (select percentile_cont(0.5) within group (order by m2.surplus)
          from m m2 where m2.household_id = m.household_id and m2.month <= m.month
            and m2.month > m.month - interval '12 months') as median_12,
       -- Rule 7: a drift flag, never a silent re-baseline.
       avg(m.surplus) over w3 < avg(m.surplus) over w12 as below_trend
  from m
window w3  as (partition by m.household_id order by m.month rows between 2 preceding and current row),
       w12 as (partition by m.household_id order by m.month rows between 11 preceding and current row);

-- vat_treatment: every row with a VAT rate, its deadline and what the
-- reduced rate is worth against the standard 20%.
create or replace view public.vat_treatment
with (security_invoker = on) as
select w.id, w.household_id, w.property_id, w.title, w.vat_rate, w.vat_deadline,
       w.performed_by, w.cost_expected,
       case when w.vat_deadline is null then null else w.vat_deadline - current_date end as days_left,
       case when w.cost_expected is null or w.vat_rate is null or w.vat_rate >= 20 then 0
            else round(w.cost_expected * (1.20 - (1 + w.vat_rate / 100)) / (1 + w.vat_rate / 100), 2)
       end as saving_vs_standard
  from public.work_items w
 where w.vat_rate is not null
   and w.status not in ('done','dropped')
   and public.in_default_scope(w.household_id, w.property_id);

-- priced_lines: a building's quantity times the library's rate. The
-- newest rate for the package wins, a rate from the property's own
-- region is preferred to a national one, and `region_mismatch` says
-- when the only rate on file was learned somewhere else.
create or replace view public.priced_lines
with (security_invoker = on) as
select q.household_id, q.property_id, q.package_key, q.label, q.quantity, q.unit,
       q.confidence as quantity_confidence,
       r.id as rate_id, r.price_low, r.price_typical, r.price_high, r.unit as rate_unit,
       r.region as rate_region, r.captured_on as rate_date, r.confidence as rate_confidence,
       r.region is not null and r.region is distinct from p.region as region_mismatch,
       round(q.quantity * r.price_low, 2)     as cost_low,
       round(q.quantity * r.price_typical, 2) as cost_base,
       round(q.quantity * r.price_high, 2)    as cost_high
  from public.property_quantities q
  join public.properties p on p.id = q.property_id
  left join lateral (
    select * from public.price_references pr
     where pr.household_id = q.household_id and pr.package_key = q.package_key
     order by (pr.region = p.region) desc nulls last, (pr.region is null) desc, pr.captured_on desc
     limit 1) r on true;

-- property_compare: COMPARE is the one read that crosses properties.
-- Archived properties appear with their status; purged ones have no row.
create or replace view public.property_compare
with (security_invoker = on) as
select p.id, p.household_id, p.ref, p.name, p.status, p.status_reason,
       p.address_line, p.postcode, p.council, p.region,
       p.guide_price, p.expected_price, p.walk_away_price, p.offer_status,
       p.fit_score, p.fit_confidence,
       (select count(*) from public.work_items w
         where w.property_id = p.id and w.status not in ('done','dropped'))       as open_items,
       (select round(coalesce(sum(w.cost_best), 0), 2) from public.work_items w
         where w.property_id = p.id and w.status not in ('done','dropped'))       as cost_low,
       (select round(coalesce(sum(coalesce(w.cost_expected, w.cost_best)), 0), 2) from public.work_items w
         where w.property_id = p.id and w.status not in ('done','dropped'))       as cost_base,
       (select round(coalesce(sum(coalesce(w.cost_worst, w.cost_expected)), 0), 2) from public.work_items w
         where w.property_id = p.id and w.status not in ('done','dropped'))       as cost_high,
       (select count(*) from public.contradictions c
         where c.property_id = p.id and c.status = 'open')                        as open_contradictions,
       (select count(*) from public.gate_conditions g
         where g.property_id = p.id and g.status = 'fail')                        as failed_gate_conditions
  from public.properties p;

-- ---------------------------------------------------------------
-- LIFECYCLE COMMANDS. Called by Claude through the SQL connector; the
-- site has no button that changes anything, so none of these is
-- granted to anon or to authenticated.
-- ---------------------------------------------------------------

-- NEW PROPERTY: a candidate, cloned from the template, every quantity
-- NULL. Never changes which property is active.
create or replace function public.new_property(
  p_household_id uuid,
  p_name         text,
  p_address      text default null,
  p_postcode     text default null,
  p_council      text default null,
  p_region       text default null,
  p_ref          text default null,
  p_guide_price  numeric default null
) returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare v_id uuid;
begin
  insert into public.properties (household_id, ref, name, status, address_line, postcode,
                                 council, region, guide_price, status_reason)
  values (p_household_id, p_ref, p_name, 'candidate', p_address, p_postcode,
          p_council, p_region, p_guide_price, 'new property')
  returning id into v_id;

  -- The template, cloned. Lines switched on by a condition (thatch,
  -- off-mains drainage) wait until the intake checklist triggers them.
  insert into public.work_items (household_id, property_id, template_id, title, summary,
                                 details, kind, trade, theme, benefit_type, skill_level,
                                 work_phase, phase, funding_stream, acquisition, package_key,
                                 status, horizon, confidence, cost_confidence)
  select p_household_id, v_id, t.id, t.title, t.summary, t.details, t.kind, t.trade,
         t.theme, t.benefit_type, t.skill_level, t.work_phase, t.phase, t.funding_stream,
         t.acquisition, t.package_key, 'idea', 'someday', 'drafted', 'drafted'
    from public.work_item_templates t
   where t.triggered_by is null;

  return v_id;
end;
$$;

-- MAKE ACTIVE: promote one, demote the previous active to candidate -
-- never straight to archived. Demote first: a unique index is checked
-- row by row, so the order is what makes it one atomic switch.
create or replace function public.make_active(p_household_id uuid, p_ref text)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare v_target public.properties;
begin
  select * into v_target from public.properties
   where household_id = p_household_id and ref = p_ref;
  if not found then
    raise exception 'no property %', p_ref;
  end if;
  if v_target.status = 'active' then
    return v_target.id;
  end if;
  if v_target.status <> 'candidate' then
    raise exception using errcode = 'check_violation',
      message = format('%s is %s; only a candidate can be made active', p_ref, v_target.status),
      hint = 'Restore an archived property to candidate first.';
  end if;
  if exists (select 1 from public.properties
              where household_id = p_household_id and status in ('committed','owned')) then
    raise exception using errcode = 'check_violation',
      message = 'an offer has been accepted or a house is owned; the active slot is not free';
  end if;

  perform set_config('house.change_why', format('make %s active', p_ref), true);
  update public.properties set status = 'candidate', status_reason = format('%s made active', p_ref)
   where household_id = p_household_id and status = 'active';
  update public.properties set status = 'active', status_reason = 'made active'
   where id = v_target.id;
  return v_target.id;
end;
$$;

-- COMMIT, ARCHIVE, RESTORE, SOLD, and a committed purchase falling
-- through. The graph is enforced here so a status cannot jump a step.
create or replace function public.set_property_status(
  p_household_id uuid, p_ref text, p_status text, p_reason text
) returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare v_p public.properties;
begin
  select * into v_p from public.properties
   where household_id = p_household_id and ref = p_ref;
  if not found then
    raise exception 'no property %', p_ref;
  end if;
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'a status change needs a reason';
  end if;
  if not ((v_p.status, p_status) in (
      ('candidate','archived'), ('active','candidate'), ('active','committed'),
      ('active','archived'), ('committed','active'), ('committed','archived'),
      ('committed','owned'), ('owned','sold'), ('sold','archived'),
      ('archived','candidate'))) then
    raise exception using errcode = 'check_violation',
      message = format('%s cannot go from %s to %s', p_ref, v_p.status, p_status),
      hint = case when p_status = 'active' then 'Use make_active().'
                  when p_status = 'owned' then 'Use finalise_property().'
                  else 'See the lifecycle in docs/RENOVATION-SYSTEM.md, S3.' end;
  end if;

  perform set_config('house.change_why', p_reason, true);
  update public.properties set status = p_status, status_reason = p_reason
   where id = v_p.id;
  return v_p.id;
end;
$$;

-- PURGE: the one deliberate delete this system has.
--
-- Everything the building owns goes; everything the household owns
-- stays. Library rates learned on it and kit bought for it survive with
-- the link removed. Refuses the current house, refuses anything with
-- money allocated against it, and refuses unless the address is typed.
create or replace function public.purge_property(
  p_household_id uuid, p_ref text, p_typed_address text
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_p public.properties;
  v_ids uuid[];
  v_items uuid[];
  v_out jsonb;
  norm text;
begin
  select * into v_p from public.properties
   where household_id = p_household_id and ref = p_ref;
  if not found then
    raise exception 'no property %', p_ref;
  end if;
  if v_p.status in ('active','committed','owned') then
    raise exception using errcode = 'check_violation',
      message = format('%s is %s and cannot be purged', p_ref, v_p.status),
      hint = 'Make another property active, or archive this one, first.';
  end if;
  norm := lower(regexp_replace(coalesce(p_typed_address, ''), '[^a-zA-Z0-9]', '', 'g'));
  if norm = '' or norm not in (
       lower(regexp_replace(coalesce(v_p.address_line, ''), '[^a-zA-Z0-9]', '', 'g')),
       lower(regexp_replace(v_p.name, '[^a-zA-Z0-9]', '', 'g'))) then
    raise exception using errcode = 'check_violation',
      message = format('the typed address does not match %s', p_ref),
      hint = 'PURGE cannot be undone. Type the property''s address to confirm.';
  end if;

  select coalesce(array_agg(id), '{}') into v_items
    from public.work_items where property_id = v_p.id;
  if exists (select 1 from public.allocations a where a.work_item_id = any(v_items)) then
    raise exception using errcode = 'check_violation',
      message = format('%s has savings allocated against its work', p_ref),
      hint = 'Money put aside is history. Reallocate it before purging.';
  end if;

  -- Material already collected is the household's, not the building's:
  -- a pile of bricks in the shed does not vanish because the house it
  -- was meant for did. The stockpile moves to USER scope and survives.
  update public.stock_targets set property_id = null, room_id = null
   where property_id = v_p.id
     and exists (select 1 from public.stock_acquisitions a where a.stock_target_id = stock_targets.id);

  -- Every id the building owns, for the tables that point at rows
  -- without a foreign key (knowledge_links, change_log).
  select coalesce(array_agg(x), '{}') into v_ids from (
    select unnest(v_items)
    union all select id from public.rooms where property_id = v_p.id
    union all select id from public.stock_targets where property_id = v_p.id
    union all select id from public.house_facts where property_id = v_p.id
    union all select id from public.milestones where property_id = v_p.id
    union all select id from public.decisions where property_id = v_p.id
    union all select id from public.building_stages where property_id = v_p.id
    union all select id from public.bills where property_id = v_p.id
    union all select id from public.source_documents where property_id = v_p.id
    union all select id from public.scheduled_events where property_id = v_p.id
    union all select v_p.id) s(x);

  v_out := jsonb_build_object(
    'ref', v_p.ref, 'name', v_p.name,
    'work_items', cardinality(v_items),
    'rooms', (select count(*) from public.rooms where property_id = v_p.id),
    'links', (select count(*) from public.knowledge_links
               where from_id = any(v_ids) or to_id = any(v_ids)),
    'notes', (select count(*) from public.work_notes
               where work_item_id = any(v_items)
                  or room_id in (select id from public.rooms where property_id = v_p.id)),
    'library_rates_kept', (select count(*) from public.price_references
               where researched_during_property_id = v_p.id),
    'kit_kept', (select count(*) from public.assets where acquired_for_property_id = v_p.id)
              + (select count(*) from public.inventory_items where acquired_for_property_id = v_p.id));

  perform set_config('house.allow_work_item_delete', 'on', true);

  delete from public.knowledge_links where from_id = any(v_ids) or to_id = any(v_ids);
  delete from public.change_log where entity_id = any(v_ids) or property_id = v_p.id;
  delete from public.work_notes
   where work_item_id = any(v_items)
      or room_id in (select id from public.rooms where property_id = v_p.id);
  delete from public.quotes where work_item_id = any(v_items);
  delete from public.invoices where work_item_id = any(v_items);
  delete from public.spend_events where work_item_id = any(v_items);
  delete from public.scheduled_events where work_item_id = any(v_items);
  delete from public.document_claims where work_item_id = any(v_items)
      or stock_target_id in (select id from public.stock_targets where property_id = v_p.id)
      or house_fact_id in (select id from public.house_facts where property_id = v_p.id);
  -- The rest follows the foreign keys: work_items, rooms, levels,
  -- stages, facts, stockpiles, milestones, decisions, bills, documents,
  -- quantities, gates, salvage, income lines. Library and kit links are
  -- SET NULL, so a rate learned there is still a rate.
  delete from public.properties where id = v_p.id;

  return v_out;
end;
$$;

-- FINALISE: the purchase completed. Called once to see what would be
-- purged, and again with p_confirm to do it. After this the system is
-- single-property: one house, and no reference to any other.
create or replace function public.finalise_property(
  p_household_id uuid, p_ref text, p_confirm boolean default false
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_p public.properties;
  v_other record;
  v_purged jsonb := '[]'::jsonb;
begin
  select * into v_p from public.properties
   where household_id = p_household_id and ref = p_ref;
  if not found then
    raise exception 'no property %', p_ref;
  end if;
  if v_p.status not in ('committed','owned') then
    raise exception using errcode = 'check_violation',
      message = format('%s is %s; only a committed purchase can complete', p_ref, v_p.status);
  end if;
  if not p_confirm then
    return jsonb_build_object('will_purge', (
      select coalesce(jsonb_agg(jsonb_build_object('ref', ref, 'name', name, 'status', status)
                                order by ref), '[]'::jsonb)
        from public.properties where household_id = p_household_id and id <> v_p.id),
      'confirm', format('select finalise_property(%L, %L, true);', p_household_id, p_ref));
  end if;

  if v_p.status = 'committed' then
    perform set_config('house.change_why', 'purchase completed', true);
    update public.properties set status = 'owned', status_reason = 'purchase completed',
           offer_status = 'accepted', completed_on = coalesce(completed_on, current_date)
     where id = v_p.id;
  end if;

  for v_other in select * from public.properties
                  where household_id = p_household_id and id <> v_p.id loop
    v_purged := v_purged || public.purge_property(p_household_id, v_other.ref,
                  coalesce(v_other.address_line, v_other.name));
  end loop;
  return jsonb_build_object('owned', p_ref, 'purged', v_purged);
end;
$$;

revoke all on function public.new_property(uuid, text, text, text, text, text, text, numeric) from public, anon, authenticated;
revoke all on function public.make_active(uuid, text) from public, anon, authenticated;
revoke all on function public.set_property_status(uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.purge_property(uuid, text, text) from public, anon, authenticated;
revoke all on function public.finalise_property(uuid, text, boolean) from public, anon, authenticated;
