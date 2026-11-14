-- ------------------------------------------------------------------
-- 94_marketplace.sql - buying second hand, on purpose.
--
-- The shopping list says WHAT is needed and what it is budgeted at.
-- This file says how to recognise a good one when it turns up on
-- Marketplace, at an auction or in a charity furniture shop, and what
-- it is worth paying. Four things, kept apart:
--
--   mp_brief     the look being bought for, and how far to drive.
--   mp_profiles  one row per kind of thing: a spec, what disqualifies
--                it, four price thresholds and the words to search.
--   mp_finds     one row per listing actually looked at, from the
--                screenshot to the collection.
--   mp_searches  the saved searches and alerts to keep running.
--   mp_grounds   where it is worth looking, and how far away that is.
--
-- A profile borrows `spec` and `reject_if` from stock_targets and
-- palettes for the same reason they have them: a spec you cannot hold
-- a listing up against is not a spec.
--
-- THE PRICE BAND IS COMPUTED, NEVER TYPED. A find stores what was
-- asked; mp_find_ledger works out where that sits against the
-- profile. The VERDICT is a judgement (price, fit, size, timing) and
-- is typed, with its reason.
--
-- Every threshold starts `drafted` or `researched`. None of them is a
-- budget until the owner confirms it.
--
-- Numbered after 93_scoring.sql because mp_profiles.source_id points
-- at `sources`, which 92_brain.sql creates. The quality layer is in
-- 95_marketplace_quality.sql; price evidence, the hunt order and the
-- purchase function are in 96_marketplace_hunt.sql.
-- ------------------------------------------------------------------

create table if not exists public.mp_brief (
  household_id uuid primary key references public.households (id),
  style_brief  text not null,
  reject_brief text not null,
  home_base    text not null,
  -- [{band, minutes_max, miles_max, places[], min_saving, use_for}]
  travel_bands jsonb not null default '[]'::jsonb,
  -- [{key, rule, why}]
  rules        jsonb not null default '[]'::jsonb,
  confidence   text not null default 'drafted' references public.confidence_levels (key),
  confirmed_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create or replace trigger mp_brief_updated_at before update on public.mp_brief
  for each row execute function public.set_updated_at();

create table if not exists public.mp_profiles (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references public.households (id),
  key           text not null,
  name          text not null,
  category      text not null
    check (category in ('seating','tables','storage','beds','lighting','mirrors_art',
      'textiles','kitchen_dining','hearth','hardware','garden','decorative','other')),
  room_hint     text,
  -- When the house needs it, which is not when it turns up.
  tier          text not null default 'opportunistic'
    check (tier in ('day_one','first_month','first_year','opportunistic')),
  wanted_qty    numeric(8,2) not null default 1 check (wanted_qty >= 0),
  unit          text not null default 'each',
  -- The shopping line this fills. Several profiles may fill one line.
  work_item_id  uuid references public.work_items (id),

  spec          text not null,
  reject_if     text,
  -- What to check with hands on it, before money moves.
  inspect       text,

  -- Per unit. Steal: buy on sight. Good: the target. Fair: the going
  -- rate. Max: walk away above this. New: what the equivalent costs
  -- from a dealer or a shop, which is what a saving is measured from.
  price_steal   numeric(12,2) check (price_steal is null or price_steal >= 0),
  price_good    numeric(12,2) check (price_good is null or price_good >= 0),
  price_fair    numeric(12,2) check (price_fair is null or price_fair >= 0),
  price_max     numeric(12,2) check (price_max is null or price_max >= 0),
  price_new     numeric(12,2) check (price_new is null or price_new >= 0),
  price_basis   text,
  price_confidence text not null default 'drafted' references public.confidence_levels (key),
  captured_on   date not null default current_date,
  source_id     uuid references public.sources (id),

  keywords      text[] not null default '{}',
  misspellings  text[] not null default '{}',
  exclude_terms text[] not null default '{}',

  -- Whether it fits in the car and in a spare room matters before
  -- there is a house to put it in.
  size_class    text not null default 'small'
    check (size_class in ('small','medium','large')),
  buy_window    text not null default 'any_time'
    check (buy_window in ('any_time','from_exchange','after_move')),
  supply        text not null default 'regular'
    check (supply in ('common','regular','scarce','rare')),
  max_drive_minutes integer check (max_drive_minutes is null or max_drive_minutes >= 0),

  status        text not null default 'hunting'
    check (status in ('idea','hunting','paused','filled','dropped')),
  resolution    text,
  notes         text,
  sort_order    integer not null default 100,
  confidence    text not null default 'drafted' references public.confidence_levels (key),
  confirmed_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  unique (household_id, key),
  constraint mp_profiles_spec_not_blank check (length(btrim(spec)) > 0),
  constraint mp_profiles_ladder check (
    (price_steal is null or price_good is null or price_steal <= price_good) and
    (price_good  is null or price_fair is null or price_good  <= price_fair) and
    (price_fair  is null or price_max  is null or price_fair  <= price_max)),
  constraint mp_profiles_resolution_required
    check (status not in ('filled','dropped') or resolution is not null)
);

create index if not exists mp_profiles_tier_idx on public.mp_profiles (household_id, tier, sort_order);
create index if not exists mp_profiles_work_item_idx on public.mp_profiles (work_item_id) where work_item_id is not null;

create or replace trigger mp_profiles_updated_at before update on public.mp_profiles
  for each row execute function public.set_updated_at();

create table if not exists public.mp_finds (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references public.households (id),
  profile_id    uuid references public.mp_profiles (id),
  title         text not null,
  platform      text not null default 'facebook_marketplace'
    check (platform in ('facebook_marketplace','ebay','gumtree','auction','charity_shop',
      'car_boot','antiques_centre','reclamation','private','other')),
  listing_url   text,
  location_text text,
  distance_miles numeric(6,1),
  drive_minutes integer,
  seen_on       date not null default current_date,

  -- For the whole lot; quantity is how many units of the profile it is.
  asking_price  numeric(12,2) check (asking_price is null or asking_price >= 0),
  is_ono        boolean not null default false,
  quantity      numeric(8,2) not null default 1 check (quantity > 0),

  -- How well it fits the brief, 1 (wrong) to 5 (exactly it).
  style_fit     smallint check (style_fit is null or style_fit between 1 and 5),
  what_it_is    text,
  verdict       text check (verdict is null or verdict in ('buy','offer','watch','pass')),
  verdict_reason text,
  opening_offer numeric(12,2) check (opening_offer is null or opening_offer >= 0),
  max_offer     numeric(12,2) check (max_offer is null or max_offer >= 0),

  status        text not null default 'spotted'
    check (status in ('spotted','messaged','offered','agreed','bought','passed','lost')),
  status_note   text,
  paid          numeric(12,2) check (paid is null or paid >= 0),
  travel_cost   numeric(12,2) check (travel_cost is null or travel_cost >= 0),
  bought_on     date,
  -- The shopping line the money is recorded against once bought.
  work_item_id  uuid references public.work_items (id),

  confidence    text not null default 'drafted' references public.confidence_levels (key),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint mp_finds_bought_has_price
    check (status <> 'bought' or (paid is not null and bought_on is not null)),
  constraint mp_finds_offer_ladder
    check (opening_offer is null or max_offer is null or opening_offer <= max_offer)
);

create index if not exists mp_finds_status_idx on public.mp_finds (household_id, status, seen_on desc);
create index if not exists mp_finds_profile_idx on public.mp_finds (profile_id) where profile_id is not null;

create or replace trigger mp_finds_updated_at before update on public.mp_finds
  for each row execute function public.set_updated_at();

create table if not exists public.mp_searches (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references public.households (id),
  profile_id    uuid references public.mp_profiles (id),
  label         text not null,
  query         text not null,
  platform      text not null default 'facebook_marketplace',
  max_price     numeric(12,2),
  radius_km     integer,
  -- An alert pings the phone; a sweep is run by hand on its cadence.
  is_alert      boolean not null default false,
  cadence       text not null default 'weekly'
    check (cadence in ('alert','daily','twice_weekly','weekly','monthly')),
  why           text,
  status        text not null default 'active' check (status in ('active','paused','retired')),
  last_run_on   date,
  sort_order    integer not null default 100,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (household_id, platform, query)
);

create or replace trigger mp_searches_updated_at before update on public.mp_searches
  for each row execute function public.set_updated_at();

create table if not exists public.mp_grounds (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references public.households (id),
  key           text not null,
  name          text not null,
  kind          text not null
    check (kind in ('marketplace_area','auction','charity_furniture','antiques_centre',
      'car_boot','reclamation','fair','online')),
  town          text,
  postcode      text,
  band          text check (band is null or band in ('A','B','C','D','online')),
  drive_minutes integer,
  miles         numeric(6,1),
  schedule      text,
  buyer_premium_pct numeric(5,2),
  good_for      text,
  tactics       text,
  url           text,
  source_note   text,
  confidence    text not null default 'drafted' references public.confidence_levels (key),
  status        text not null default 'active' check (status in ('active','paused','retired')),
  sort_order    integer not null default 100,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (household_id, key)
);

create or replace trigger mp_grounds_updated_at before update on public.mp_grounds
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------
-- Row level security, in the same change as the tables.
-- ---------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['mp_brief','mp_profiles','mp_finds','mp_searches','mp_grounds'] loop
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

insert into public.link_entity_types (key, table_name, label, sort_order) values
  ('mp_profile', 'mp_profiles', 'Marketplace profile', 340),
  ('mp_find',    'mp_finds',    'Marketplace find',    341)
on conflict (key) do nothing;

-- ---------------------------------------------------------------
-- mp_board: each profile with what has been bought against it.
-- SECURITY INVOKER IS NOT OPTIONAL - see 55_stock.sql.
-- ---------------------------------------------------------------
create or replace view public.mp_board
with (security_invoker = on) as
select
  p.*,
  case p.tier when 'day_one' then 1 when 'first_month' then 2
              when 'first_year' then 3 else 4 end        as tier_rank,
  w.title                                               as list_title,
  w.cost_expected                                       as list_cost,
  w.cost_confidence                                     as list_cost_confidence,
  w.status                                              as list_status,
  coalesce(f.bought_qty, 0)                             as bought_qty,
  greatest(0, p.wanted_qty - coalesce(f.bought_qty, 0)) as qty_outstanding,
  coalesce(f.spent, 0)                                  as spent,
  coalesce(f.live_finds, 0)                             as live_finds,
  round(greatest(0, p.wanted_qty - coalesce(f.bought_qty, 0))
        * coalesce(p.price_good, 0), 2)                 as budget_outstanding
from public.mp_profiles p
left join public.work_items w on w.id = p.work_item_id
left join (
  select profile_id,
         sum(quantity) filter (where status = 'bought')                     as bought_qty,
         sum(paid + coalesce(travel_cost, 0)) filter (where status = 'bought') as spent,
         count(*) filter (where status in ('spotted','messaged','offered','agreed')) as live_finds
  from public.mp_finds
  group by profile_id
) f on f.profile_id = p.id;

comment on view public.mp_board is
  'mp_profiles with bought, outstanding and spent derived from mp_finds. Nothing here is stored.';

-- ---------------------------------------------------------------
-- mp_find_ledger: each find against its profile. price_band and the
-- three savings are derived; verdict is the typed judgement.
-- ---------------------------------------------------------------
create or replace view public.mp_find_ledger
with (security_invoker = on) as
select
  f.*,
  p.key          as profile_key,
  p.name         as profile_name,
  p.tier,
  p.size_class,
  p.buy_window,
  p.price_steal, p.price_good, p.price_fair, p.price_max, p.price_new,
  p.price_confidence,
  round(f.asking_price / f.quantity, 2)                 as unit_asking,
  case
    when f.asking_price is null or p.id is null or p.price_fair is null then null
    when f.asking_price / f.quantity <= coalesce(p.price_steal, -1) then 'steal'
    when f.asking_price / f.quantity <= coalesce(p.price_good, -1)  then 'good'
    when f.asking_price / f.quantity <= p.price_fair                then 'fair'
    when f.asking_price / f.quantity <= coalesce(p.price_max, p.price_fair) then 'high'
    else 'over'
  end                                                   as price_band,
  case when f.status = 'bought' and f.asking_price is not null
       then round(f.asking_price - f.paid, 2) end       as haggled_off,
  case when f.status = 'bought' and p.price_fair is not null
       then round(p.price_fair * f.quantity - f.paid - coalesce(f.travel_cost, 0), 2) end
                                                        as saved_vs_fair,
  case when f.status = 'bought' and p.price_new is not null
       then round(p.price_new * f.quantity - f.paid - coalesce(f.travel_cost, 0), 2) end
                                                        as saved_vs_new
from public.mp_finds f
left join public.mp_profiles p on p.id = f.profile_id;

comment on view public.mp_find_ledger is
  'mp_finds with the price band and savings derived from the profile. saved_vs_fair is net of travel.';

-- ---------------------------------------------------------------
-- mp_totals: the money, by tier.
--
-- A profile wanting nothing yet (hardware with no job) is not "filled".
-- ---------------------------------------------------------------
create or replace view public.mp_totals
with (security_invoker = on) as
select
  b.household_id,
  b.tier,
  min(b.tier_rank)                                      as tier_rank,
  count(*)                                              as profiles,
  count(*) filter (where b.wanted_qty > 0 and b.qty_outstanding = 0) as profiles_filled,
  round(coalesce(sum(b.wanted_qty * b.price_good), 0), 2) as budget_good,
  round(coalesce(sum(b.wanted_qty * b.price_fair), 0), 2) as budget_fair,
  round(coalesce(sum(b.wanted_qty * b.price_max), 0), 2)  as budget_ceiling,
  round(coalesce(sum(b.wanted_qty * b.price_new), 0), 2)  as cost_if_new,
  round(coalesce(sum(b.spent), 0), 2)                   as spent,
  round(coalesce(sum(b.budget_outstanding), 0), 2)      as outstanding_good,
  round(coalesce(sum(b.wanted_qty * b.price_good)
        filter (where b.price_confidence not in ('confirmed','actual')), 0), 2)
                                                        as unconfirmed_budget
from public.mp_board b
where b.status not in ('dropped','idea')
group by b.household_id, b.tier;

comment on view public.mp_totals is
  'Second-hand budget by tier at the good, fair and ceiling prices, against what the same things cost new. unconfirmed_budget is how much rests on thresholds nobody has confirmed.';

-- ---------------------------------------------------------------
-- mp_context: everything a session needs before judging a listing,
-- in one call.
-- ---------------------------------------------------------------
create or replace function public.mp_context(p_household uuid)
returns jsonb
language sql stable
set search_path = public
as $$
  select jsonb_build_object(
    'brief', (select to_jsonb(b) - 'created_at' - 'updated_at'
                from public.mp_brief b where b.household_id = p_household),
    'totals', (select coalesce(jsonb_agg(to_jsonb(t) - 'household_id' order by t.tier_rank), '[]'::jsonb)
                 from public.mp_totals t where t.household_id = p_household),
    'hunting', (select coalesce(jsonb_agg(jsonb_build_object(
                  'key', b.key, 'name', b.name, 'tier', b.tier, 'category', b.category,
                  'outstanding', b.qty_outstanding, 'unit', b.unit,
                  'steal', b.price_steal, 'good', b.price_good, 'fair', b.price_fair,
                  'max', b.price_max, 'new', b.price_new,
                  'price_confidence', b.price_confidence,
                  'size', b.size_class, 'buy_window', b.buy_window,
                  'max_drive_minutes', b.max_drive_minutes,
                  'spec', b.spec, 'reject_if', b.reject_if, 'inspect', b.inspect)
                  order by b.tier_rank, b.sort_order), '[]'::jsonb)
                  from public.mp_board b
                 where b.household_id = p_household and b.status = 'hunting'),
    'live_finds', (select coalesce(jsonb_agg(jsonb_build_object(
                  'id', l.id, 'title', l.title, 'profile', l.profile_key,
                  'asking', l.asking_price, 'band', l.price_band, 'verdict', l.verdict,
                  'opening_offer', l.opening_offer, 'max_offer', l.max_offer,
                  'status', l.status, 'seen_on', l.seen_on) order by l.seen_on desc), '[]'::jsonb)
                  from public.mp_find_ledger l
                 where l.household_id = p_household
                   and l.status in ('spotted','messaged','offered','agreed')),
    'bought', (select coalesce(jsonb_agg(jsonb_build_object(
                  'title', l.title, 'profile', l.profile_key, 'paid', l.paid,
                  'bought_on', l.bought_on, 'saved_vs_fair', l.saved_vs_fair,
                  'saved_vs_new', l.saved_vs_new) order by l.bought_on desc), '[]'::jsonb)
                  from public.mp_find_ledger l
                 where l.household_id = p_household and l.status = 'bought'),
    'alerts', (select coalesce(jsonb_agg(jsonb_build_object(
                  'label', s.label, 'query', s.query, 'max_price', s.max_price,
                  'radius_km', s.radius_km) order by s.sort_order), '[]'::jsonb)
                 from public.mp_searches s
                where s.household_id = p_household and s.is_alert and s.status = 'active')
  );
$$;

comment on function public.mp_context(uuid) is
  'The brief, the money by tier, every profile still being hunted with its thresholds, live finds, purchases and the alerts in force. Call it before judging a listing.';
