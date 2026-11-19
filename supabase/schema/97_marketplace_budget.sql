-- ------------------------------------------------------------------
-- 97_marketplace_budget.sql - is the whole plan a sensible sum?
--
-- The ladders say what each thing is worth. They do not say whether
-- the whole house, priced that way, is a reasonable amount to spend,
-- and a list that is cheap piece by piece can still be too long. So
-- the plan is held up against what other households spend, from dated
-- published sources, and the answer is a view, not an impression.
--
-- THREE THINGS ARE ADDED.
--
--   purpose on mp_profiles: utility (sleeping, sitting, eating,
--   storing, light, the kitchen) or aesthetic (rugs, mirrors,
--   pictures, clocks, ornament, the garden). Utility comes first;
--   the share spent on looks is a number to watch, not a guess.
--
--   mp_new_buys: what is bought NEW and never hunted second hand -
--   mattresses, white goods, bedding and towels, kitchen basics,
--   the sundries of moving in. They are part of the bill all the same,
--   and leaving them out is how a furniture budget looks cheaper than
--   the house it furnishes. Each carries a low, mid and high price.
--
--   mp_benchmarks: published figures for what a household spends, each
--   with its source, what it covers (furniture alone, furnishing, or
--   furnishing and decorating), which home and on what basis.
--
-- mp_budget_position puts the plan's totals beside each other - steal,
-- good, typical and new; utility against aesthetic; the new buys - and
-- mp_budget_vs_benchmarks lays each benchmark beside the figure of
-- ours that covers the same ground, with where it falls.
-- ------------------------------------------------------------------

alter table public.mp_profiles
  add column if not exists purpose text check (purpose is null or purpose in ('utility','aesthetic'));

create table if not exists public.mp_new_buys (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references public.households (id),
  key           text not null,
  name          text not null,
  tier          text not null default 'day_one'
    check (tier in ('day_one','first_month','first_year','opportunistic')),
  quantity      numeric(8,2) not null default 1 check (quantity >= 0),
  -- Per unit. Low is a sound budget buy, mid a good one, high the top of
  -- what is worth paying; none is a luxury.
  price_low     numeric(10,2) not null check (price_low >= 0),
  price_mid     numeric(10,2) not null check (price_mid >= 0),
  price_high    numeric(10,2) not null check (price_high >= 0),
  why_new       text not null check (length(btrim(why_new)) > 0),
  status        text not null default 'planned' check (status in ('planned','bought','dropped')),
  paid          numeric(10,2) check (paid is null or paid >= 0),
  resolution    text,
  source_id     uuid references public.sources (id),
  confidence    text not null default 'drafted' references public.confidence_levels (key),
  notes         text,
  sort_order    integer not null default 100,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (household_id, key),
  check (price_low <= price_mid and price_mid <= price_high),
  check (status <> 'bought' or paid is not null),
  check (status <> 'dropped' or resolution is not null)
);

comment on table public.mp_new_buys is
  'What is bought new, never hunted second hand: mattresses, white goods, bedding, kitchen basics, sundries. Part of the bill, and counted in mp_budget_position. Prices per unit, low, mid and high.';

create table if not exists public.mp_benchmarks (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references public.households (id),
  key           text not null,
  label         text not null,
  -- What the figure counts. Furniture alone; furnishing (furniture,
  -- soft furnishings and the household goods of moving in); or
  -- furnishing and decorating together.
  covers        text not null check (covers in ('furniture','furnishing','furnishing_and_decorating')),
  home          text not null,
  basis         text not null check (basis in ('new','mixed','second_hand')),
  amount_low    numeric(10,2) check (amount_low is null or amount_low >= 0),
  amount_mid    numeric(10,2) check (amount_mid is null or amount_mid >= 0),
  amount_high   numeric(10,2) check (amount_high is null or amount_high >= 0),
  published_on  date,
  source_id     uuid references public.sources (id),
  confidence    text not null default 'researched' references public.confidence_levels (key),
  status        text not null default 'active' check (status in ('active','retired')),
  note          text,
  sort_order    integer not null default 100,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (household_id, key),
  check (coalesce(amount_low, amount_mid, amount_high) is not null),
  check (amount_low is null or amount_mid is null or amount_low <= amount_mid),
  check (amount_mid is null or amount_high is null or amount_mid <= amount_high),
  check (amount_low is null or amount_high is null or amount_low <= amount_high),
  check (status = 'active' or note is not null)
);

comment on table public.mp_benchmarks is
  'Published figures for what a household spends furnishing a home, each with its source and what it covers. mp_budget_vs_benchmarks sets ours beside them.';

create or replace trigger mp_new_buys_updated_at before update on public.mp_new_buys
  for each row execute function public.set_updated_at();
create or replace trigger mp_benchmarks_updated_at before update on public.mp_benchmarks
  for each row execute function public.set_updated_at();

-- A planned price and a price paid are money: neither changes silently.
create or replace trigger mp_new_buys_log after update on public.mp_new_buys
  for each row execute function public.log_changes(
    'money:price_low', 'money:price_mid', 'money:price_high', 'money:paid', 'quantity', 'status', 'confidence');

do $$
declare t text;
begin
  foreach t in array array['mp_new_buys', 'mp_benchmarks'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = t and policyname = t || '_read') then
      execute format('create policy %I on public.%I for select to authenticated '
        || 'using (public.is_household_member(household_id))', t || '_read', t);
    end if;
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = t and policyname = t || '_insert') then
      execute format('create policy %I on public.%I for insert to authenticated '
        || 'with check (public.is_household_member(household_id))', t || '_insert', t);
    end if;
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = t and policyname = t || '_update') then
      execute format('create policy %I on public.%I for update to authenticated '
        || 'using (public.is_household_member(household_id)) '
        || 'with check (public.is_household_member(household_id))', t || '_update', t);
    end if;
  end loop;
end $$;

-- As 90_policies.sql: anon gets nothing, and signed-in users reach the
-- rows the policies above allow.
revoke all on public.mp_new_buys, public.mp_benchmarks from anon;
grant select, insert, update on public.mp_new_buys, public.mp_benchmarks to authenticated;

-- ---------------------------------------------------------------
-- mp_budget_position: the whole plan, one row per household.
--
-- Second-hand figures are over everything still being hunted, at the
-- wanted quantity: the plan, not what is left of it. A profile with no
-- purpose counts as utility, because an unsorted thing is assumed to be
-- needed until somebody says otherwise. New buys are counted while
-- planned or bought; a bought one counts at what was paid.
-- ---------------------------------------------------------------
create or replace view public.mp_budget_position
with (security_invoker = on) as
with sh as (
  select p.household_id,
    count(*)                                                                   as kinds,
    round(sum(p.wanted_qty * coalesce(p.price_steal, 0)), 2)                    as sh_steal,
    round(sum(p.wanted_qty * coalesce(p.price_good, 0)), 2)                     as sh_good,
    round(sum(p.wanted_qty * coalesce(p.price_fair, 0)), 2)                     as sh_fair,
    round(sum(p.wanted_qty * coalesce(p.price_new, 0)), 2)                      as sh_new,
    round(sum(p.wanted_qty * coalesce(p.price_good, 0))
      filter (where coalesce(p.purpose, 'utility') = 'utility'), 2)             as utility_good,
    round(sum(p.wanted_qty * coalesce(p.price_good, 0))
      filter (where p.purpose = 'aesthetic'), 2)                                as aesthetic_good,
    round(sum(p.wanted_qty * coalesce(p.price_good, 0))
      filter (where coalesce(p.price_confidence, '') not in ('researched','confirmed','actual')), 2) as unconfirmed_good,
    round(sum(p.wanted_qty * coalesce(p.price_good, 0))
      filter (where p.tier = 'day_one'), 2)                                     as day_one_good
  from public.mp_profiles p
  where p.status = 'hunting'
  group by p.household_id
), nb as (
  select n.household_id,
    count(*)                                                                    as new_kinds,
    round(sum(case when n.status = 'bought' then n.paid else n.quantity * n.price_low end), 2)  as new_low,
    round(sum(case when n.status = 'bought' then n.paid else n.quantity * n.price_mid end), 2)  as new_mid,
    round(sum(case when n.status = 'bought' then n.paid else n.quantity * n.price_high end), 2) as new_high,
    round(sum(case when n.status = 'bought' then n.paid else n.quantity * n.price_mid end)
      filter (where n.tier = 'day_one'), 2)                                     as new_day_one_mid
  from public.mp_new_buys n
  where n.status in ('planned','bought')
  group by n.household_id
)
select
  h.id                                                   as household_id,
  coalesce(sh.kinds, 0)                                  as kinds,
  coalesce(sh.sh_steal, 0)                               as sh_steal,
  coalesce(sh.sh_good, 0)                                as sh_good,
  coalesce(sh.sh_fair, 0)                                as sh_fair,
  coalesce(sh.sh_new, 0)                                 as sh_new,
  coalesce(sh.utility_good, 0)                           as utility_good,
  coalesce(sh.aesthetic_good, 0)                         as aesthetic_good,
  coalesce(sh.unconfirmed_good, 0)                       as unconfirmed_good,
  coalesce(nb.new_kinds, 0)                              as new_kinds,
  coalesce(nb.new_low, 0)                                as new_low,
  coalesce(nb.new_mid, 0)                                as new_mid,
  coalesce(nb.new_high, 0)                               as new_high,
  -- All in: the second-hand plan at a price point, plus the new buys at
  -- the matching one. Steal goes with low, good with mid, typical with high.
  coalesce(sh.sh_steal, 0) + coalesce(nb.new_low, 0)     as all_in_steal,
  coalesce(sh.sh_good, 0)  + coalesce(nb.new_mid, 0)     as all_in_good,
  coalesce(sh.sh_fair, 0)  + coalesce(nb.new_high, 0)    as all_in_fair,
  coalesce(sh.day_one_good, 0) + coalesce(nb.new_day_one_mid, 0) as day_one_all_in,
  case when coalesce(sh.sh_good, 0) > 0
       then round(coalesce(sh.aesthetic_good, 0) / sh.sh_good, 4) end as aesthetic_share,
  case when coalesce(sh.sh_good, 0) > 0
       then round(coalesce(sh.unconfirmed_good, 0) / sh.sh_good, 4) end as unconfirmed_share
from public.households h
left join sh on sh.household_id = h.id
left join nb on nb.household_id = h.id
where sh.household_id is not null or nb.household_id is not null;

comment on view public.mp_budget_position is
  'The whole Marketplace plan in one row: second-hand at steal, good, typical and new; utility against aesthetic; the new buys at low, mid and high; and all in at each price point. aesthetic_share and unconfirmed_share are fractions of the second-hand good total.';

-- ---------------------------------------------------------------
-- mp_budget_vs_benchmarks: each benchmark beside our figure for the
-- same ground. A furniture-only benchmark is met by the second-hand
-- plan alone; furnishing, and furnishing with decorating, by the plan
-- all in. Decorating is not in our figure, so against those benchmarks
-- ours is the smaller by construction, and the row says so.
-- `position` is below, within or above the benchmark's range (its
-- single figure when it gives only one); `ratio` is ours over the
-- benchmark's middle figure, or its only one.
-- ---------------------------------------------------------------
create or replace view public.mp_budget_vs_benchmarks
with (security_invoker = on) as
select
  b.household_id, b.id as benchmark_id, b.key, b.label, b.covers, b.home, b.basis,
  b.amount_low, b.amount_mid, b.amount_high, b.published_on, b.confidence, b.source_id, b.sort_order,
  case b.covers when 'furniture' then 'second_hand_plan' else 'all_in' end as compared_with,
  case b.covers when 'furniture' then bp.sh_steal else bp.all_in_steal end as ours_steal,
  case b.covers when 'furniture' then bp.sh_good  else bp.all_in_good  end as ours_good,
  case b.covers when 'furniture' then bp.sh_fair  else bp.all_in_fair  end as ours_fair,
  round((case b.covers when 'furniture' then bp.sh_good else bp.all_in_good end)
        / nullif(coalesce(b.amount_mid, (b.amount_low + b.amount_high) / 2, b.amount_low, b.amount_high), 0), 4) as ratio,
  case
    when (case b.covers when 'furniture' then bp.sh_good else bp.all_in_good end)
         < coalesce(b.amount_low, b.amount_mid, b.amount_high) then 'below'
    when (case b.covers when 'furniture' then bp.sh_good else bp.all_in_good end)
         > coalesce(b.amount_high, b.amount_mid, b.amount_low) then 'above'
    else 'within'
  end as position,
  (b.covers = 'furnishing_and_decorating') as includes_decorating
from public.mp_benchmarks b
join public.mp_budget_position bp on bp.household_id = b.household_id
where b.status = 'active';

comment on view public.mp_budget_vs_benchmarks is
  'Each active benchmark beside our figure for the same ground, at the good price: the plan alone against furniture-only figures, the plan all in against the rest. position is below, within or above the benchmark''s range; ratio is ours over its middle.';

revoke all on public.mp_budget_position, public.mp_budget_vs_benchmarks from anon;
grant select on public.mp_budget_position, public.mp_budget_vs_benchmarks to authenticated;
