-- ------------------------------------------------------------------
-- 10_property.sql - The house: candidate or owned, its rooms, what is
-- physically in each room, and where things are stored.
--
-- Designed to run with ZERO properties. The system goes live before a
-- house is found, so every surface must render against an empty table
-- and templated work must exist without a property to attach to.
--
-- Coordinates are METRES, in a per-level plan space whose origin is the
-- level's south-west corner. There is no separate "grid" concept: a
-- storage location is a point (and optional extent) in the same space
-- the walls and rooms occupy, so "where is the Halloween box" resolves
-- against the floor plan directly. Grid overlays are a rendering
-- choice, not a data model.
-- ------------------------------------------------------------------

create table if not exists public.properties (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references public.households (id) on delete cascade,
  -- The stable, human handle: P-001, P-002... Assigned by trigger when
  -- omitted, and never reused - a purged P-003 leaves a gap rather than
  -- a second P-003 that old notes could be confused with.
  ref           text not null,
  name          text not null,
  -- THE LIFECYCLE. A property is a draft until it is bought:
  --   candidate  being evaluated; visible only when named or compared
  --   active     the current favourite; "the house" means this one
  --   committed  offer accepted; replaces active
  --   owned      purchase completed; the only property in the system
  --   sold       gone; its actuals were promoted to the library first
  --   archived   dropped; read only for a cross-property comparison
  -- PURGED is not a status. A purged property has no row at all.
  status        text not null default 'candidate'
    check (status in ('candidate','active','committed','owned','sold','archived')),
  status_reason text,
  status_changed_at timestamptz not null default now(),
  -- Address is deliberately loose text: a candidate may be known only by
  -- a listing title, and forcing structure early loses information.
  address_line  text,
  postcode      text,
  -- The council decides skip rates, tip rules and council tax, so every
  -- region-tagged library rate is checked against it.
  council       text,
  region        text,
  -- The folder under data/buildings/ that holds this building's drawn
  -- geometry, when one has been drawn.
  building_key  text,
  tenure        text check (tenure is null or tenure in ('freehold', 'leasehold', 'share_of_freehold')),
  built_year    integer check (built_year is null or (built_year between 1000 and 2200)),
  epc_rating    text check (epc_rating is null or epc_rating ~ '^[A-G]$'),
  floor_area_m2 numeric(8,2),
  plot_area_m2  numeric(10,2),
  -- Three prices set BEFORE a viewing, so the decision on the day is a
  -- comparison rather than a feeling.
  guide_price     numeric(12,2),
  expected_price  numeric(12,2),
  walk_away_price numeric(12,2),
  offer_status  text not null default 'none'
    check (offer_status in ('none','made','accepted','rejected','withdrawn')),
  purchase_price numeric(12,2),
  completed_on  date,
  -- Fit against the brief, 0-100. Provisional until re-scored at a gate.
  fit_score     numeric(5,2) check (fit_score is null or fit_score between 0 and 100),
  fit_confidence text not null default 'drafted' references public.confidence_levels (key),
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (household_id, ref)
);

-- "The house" is exactly one property, or none. Active, committed and
-- owned are three names for that one slot at different moments, so one
-- index covers all three: two of them at once would be two houses.
create unique index if not exists properties_one_current_per_household
  on public.properties (household_id) where status in ('active','committed','owned');

create index if not exists properties_household_idx
  on public.properties (household_id, status);

-- P-001, P-002... The next number is one past the highest EVER issued,
-- which a purge cannot lower because the counter is not derived from
-- the rows that remain.
create table if not exists public.property_ref_counters (
  household_id uuid primary key references public.households (id) on delete cascade,
  last_issued  integer not null default 0
);

create or replace function public.assign_property_ref()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare n integer;
begin
  if new.ref is null then
    insert into public.property_ref_counters (household_id, last_issued)
    values (new.household_id, 1)
    on conflict (household_id)
      do update set last_issued = property_ref_counters.last_issued + 1
    returning last_issued into n;
    new.ref := 'P-' || lpad(n::text, 3, '0');
  elsif new.ref ~ '^P-[0-9]+$' then
    -- An explicit numbered ref still moves the counter past it.
    insert into public.property_ref_counters (household_id, last_issued)
    values (new.household_id, substring(new.ref from 3)::int)
    on conflict (household_id)
      do update set last_issued = greatest(property_ref_counters.last_issued,
                                           substring(new.ref from 3)::int);
  end if;
  return new;
end;
$$;

revoke all on function public.assign_property_ref() from public, anon, authenticated;

drop trigger if exists properties_assign_ref on public.properties;
create trigger properties_assign_ref before insert on public.properties
  for each row execute function public.assign_property_ref();

create or replace function public.stamp_property_status()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status is distinct from old.status then
    new.status_changed_at := now();
  end if;
  return new;
end;
$$;

revoke all on function public.stamp_property_status() from public, anon, authenticated;

drop trigger if exists properties_status_stamp on public.properties;
create trigger properties_status_stamp before update on public.properties
  for each row execute function public.stamp_property_status();

-- ---------------------------------------------------------------
-- THE DEFAULT SCOPE. Every default view shows the household's own
-- rows (property_id null: USER scope) plus the one current property.
-- A candidate is visible only when named; an archived property only in
-- property_compare. One definition, so no view can disagree with
-- another about which house "the house" is.
-- ---------------------------------------------------------------
create or replace function public.active_property_id(p_household_id uuid)
returns uuid
language sql
stable
security invoker
set search_path = public
as $$
  select p.id from public.properties p
   where p.household_id = p_household_id
     and p.status in ('active','committed','owned');
$$;

create or replace function public.in_default_scope(p_household_id uuid, p_property_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select p_property_id is null
      or p_property_id = public.active_property_id(p_household_id);
$$;

comment on function public.in_default_scope(uuid, uuid) is
  'True for USER-scope rows (no property) and for rows of the one active, committed or owned property. Every default view filters on it.';

drop trigger if exists properties_updated_at on public.properties;
create trigger properties_updated_at before update on public.properties
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------
-- levels: a floor of a property. Separated from rooms because plan
-- coordinates are per-level and stairs connect levels.
-- ---------------------------------------------------------------
create table if not exists public.levels (
  id             uuid primary key default gen_random_uuid(),
  property_id    uuid not null references public.properties (id) on delete cascade,
  key            text not null,
  name           text not null,
  -- Height of this level's floor above the site datum, in metres.
  elevation_m    numeric(6,3) not null default 0,
  ceiling_height_m numeric(6,3),
  sort_order     integer not null default 100,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (property_id, key)
);

drop trigger if exists levels_updated_at on public.levels;
create trigger levels_updated_at before update on public.levels
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------
-- rooms: the filing taxonomy AND a physical space. Work items file
-- against a room; storage locations and assets sit inside one.
--
-- room_weight is the owner-tunable "how much does this room matter
-- right now" input to the priority score (see 20_work.sql). It lives
-- as a column on a row, not a constant in code, so re-prioritising the
-- house is an edit rather than a deploy.
-- ---------------------------------------------------------------
create table if not exists public.rooms (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  property_id  uuid references public.properties (id) on delete cascade,
  level_id     uuid references public.levels (id) on delete set null,
  key          text not null,
  name         text not null,
  room_type    text not null default 'other'
    check (room_type in ('hallway','living','kitchen','dining','office','bedroom',
      'bathroom','wc','utility','pantry','boot_room','landing','stairs','loft',
      'cellar','garage','shed','greenhouse','outbuilding','garden','yard',
      'driveway','gym','store','other')),
  -- Plan rectangle in metres: x, y, width, depth. Null for a room that
  -- is known to exist but not yet measured - which is the normal state
  -- before a survey, and must not block the room being used for filing.
  plan_x_m     numeric(7,3),
  plan_y_m     numeric(7,3),
  plan_w_m     numeric(7,3),
  plan_d_m     numeric(7,3),
  floor_area_m2 numeric(8,2),
  aspect       text check (aspect is null or aspect in ('N','NE','E','SE','S','SW','W','NW')),
  condition    text not null default 'unknown'
    check (condition in ('unknown','derelict','poor','tired','sound','good','finished')),
  -- 1 (barely matters) to 5 (most important room in the house).
  room_weight  smallint not null default 3 check (room_weight between 1 and 5),
  confidence   text not null default 'drafted' references public.confidence_levels (key),
  confirmed_at timestamptz,
  notes        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (household_id, property_id, key)
);

create index if not exists rooms_property_idx on public.rooms (property_id, room_type);
create index if not exists rooms_household_idx on public.rooms (household_id, room_type);

drop trigger if exists rooms_updated_at on public.rooms;
create trigger rooms_updated_at before update on public.rooms
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------
-- room_features: what a room physically contains that work depends on.
--
-- This is the table that makes "the bathroom has a light switch in it"
-- a FACT rather than an inference. Without it, an assistant asked to
-- plan bathroom lighting has to guess what is already there, and a
-- shopping trip cannot know how many switches to buy.
-- ---------------------------------------------------------------
create table if not exists public.room_features (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  room_id      uuid not null references public.rooms (id) on delete cascade,
  feature_type text not null
    check (feature_type in ('socket','light_switch','light_fitting','radiator',
      'window','door','doorway','loft_hatch','extractor','boiler','consumer_unit',
      'stopcock','tv_point','ethernet_point','smoke_alarm','co_alarm','thermostat',
      'floor_finish','wall_finish','ceiling_finish','skirting','fireplace','other')),
  quantity     integer not null default 1 check (quantity >= 0),
  spec         text,
  condition    text not null default 'unknown'
    check (condition in ('unknown','faulty','poor','tired','sound','good','new')),
  plan_x_m     numeric(7,3),
  plan_y_m     numeric(7,3),
  confidence   text not null default 'drafted' references public.confidence_levels (key),
  confirmed_at timestamptz,
  notes        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists room_features_room_idx
  on public.room_features (room_id, feature_type);

drop trigger if exists room_features_updated_at on public.room_features;
create trigger room_features_updated_at before update on public.room_features
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------
-- storage_locations: nested containers. A box on a rack in the garage
-- is three rows deep; resolving "where is it" walks parent_id upward
-- and reports the chain plus the room and plan coordinate.
-- ---------------------------------------------------------------
create table if not exists public.storage_locations (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  room_id      uuid references public.rooms (id) on delete set null,
  parent_id    uuid references public.storage_locations (id) on delete set null,
  name         text not null,
  kind         text not null default 'box'
    check (kind in ('room','cupboard','wardrobe','shelf','rack','drawer','box',
      'crate','loft_space','under_stairs','outbuilding','other')),
  label_code   text,
  plan_x_m     numeric(7,3),
  plan_y_m     numeric(7,3),
  height_m     numeric(6,3),
  notes        text,
  confidence   text not null default 'drafted' references public.confidence_levels (key),
  confirmed_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint storage_locations_not_self check (parent_id is null or parent_id <> id)
);

create index if not exists storage_locations_room_idx on public.storage_locations (room_id);
create index if not exists storage_locations_parent_idx on public.storage_locations (parent_id);

drop trigger if exists storage_locations_updated_at on public.storage_locations;
create trigger storage_locations_updated_at before update on public.storage_locations
  for each row execute function public.set_updated_at();
