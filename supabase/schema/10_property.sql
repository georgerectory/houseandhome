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
  name          text not null,
  status        text not null default 'considering'
    check (status in ('considering', 'offer_made', 'under_offer', 'owned', 'rejected')),
  -- Address is deliberately loose text: a candidate may be known only by
  -- a listing title, and forcing structure early loses information.
  address_line  text,
  postcode      text,
  tenure        text check (tenure is null or tenure in ('freehold', 'leasehold', 'share_of_freehold')),
  built_year    integer check (built_year is null or (built_year between 1000 and 2200)),
  epc_rating    text check (epc_rating is null or epc_rating ~ '^[A-G]$'),
  floor_area_m2 numeric(8,2),
  plot_area_m2  numeric(10,2),
  purchase_price numeric(12,2),
  completed_on  date,
  notes         text,
  -- Exactly one property may be the active one. Everything that renders
  -- "the house" reads this; candidates stay visible but inert.
  is_active     boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create unique index if not exists properties_one_active_per_household
  on public.properties (household_id) where is_active;

create index if not exists properties_household_idx
  on public.properties (household_id, status);

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
