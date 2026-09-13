-- ------------------------------------------------------------------
-- 50_assets.sql - Equipment, inventory and where things live.
--
-- Two related but distinct registers:
--   assets          things that can BREAK and need fixing - boiler,
--                   router, lawn mower, fuse box. They carry a model,
--                   a warranty, a service interval and a fault history.
--   inventory_items things we simply OWN and need to find again -
--                   decorations, tools, spare parts, linen.
--
-- A cordless drill is both, and that is fine: it is an asset (it has a
-- battery that dies and a warranty) and it is findable (it lives in a
-- box on a rack). The tables are linked rather than merged, because
-- merging them would give every Christmas bauble a service interval.
--
-- tools_required on a work item resolves against BOTH, which is what
-- lets the matcher refuse to suggest a job needing a tool that is not
-- owned.
-- ------------------------------------------------------------------

create table if not exists public.assets (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references public.households (id) on delete cascade,
  room_id       uuid references public.rooms (id) on delete set null,
  name          text not null,
  -- Short stable handle used by work_items.tools_required, so a job can
  -- say it needs a 'drill' without knowing which drill.
  tool_key      text,
  category      text not null default 'other'
    check (category in ('heating','plumbing','electrical','appliance','power_tool',
      'hand_tool','garden_machine','network','security','av','vehicle','other')),
  make          text,
  model         text,
  serial_number text,
  purchased_on  date,
  purchase_price numeric(12,2),
  supplier      text,
  warranty_expires_on date,
  service_interval_months smallint,
  last_serviced_on date,
  manual_url    text,
  manual_path   text,
  status        text not null default 'working'
    check (status in ('working','degraded','broken','retired','wanted')),
  plan_x_m      numeric(7,3),
  plan_y_m      numeric(7,3),
  notes         text,
  confidence    text not null default 'drafted' references public.confidence_levels (key),
  confirmed_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists assets_household_idx on public.assets (household_id, category, status);
create index if not exists assets_room_idx on public.assets (room_id);
create index if not exists assets_tool_key_idx on public.assets (household_id, tool_key)
  where tool_key is not null;

drop trigger if exists assets_updated_at on public.assets;
create trigger assets_updated_at before update on public.assets
  for each row execute function public.set_updated_at();

-- Consumables and spares, with the part numbers that are impossible to
-- find again at the moment you need them.
create table if not exists public.asset_parts (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  asset_id     uuid not null references public.assets (id) on delete cascade,
  name         text not null,
  part_number  text,
  fit_note     text,
  typical_price numeric(10,2),
  replace_interval_months smallint,
  last_replaced_on date,
  supplier     text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists asset_parts_asset_idx on public.asset_parts (asset_id);

drop trigger if exists asset_parts_updated_at on public.asset_parts;
create trigger asset_parts_updated_at before update on public.asset_parts
  for each row execute function public.set_updated_at();

-- Fault history per device. The point is cumulative: the third time the
-- boiler does the same thing, the fix is already written down.
create table if not exists public.asset_faults (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  asset_id     uuid not null references public.assets (id) on delete cascade,
  symptom      text not null,
  diagnosis    text,
  fix          text,
  occurred_on  date not null default current_date,
  resolved_on  date,
  cost         numeric(10,2),
  fixed_by     text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists asset_faults_asset_idx on public.asset_faults (asset_id, occurred_on desc);

drop trigger if exists asset_faults_updated_at on public.asset_faults;
create trigger asset_faults_updated_at before update on public.asset_faults
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------
-- inventory_items: what we own and where it is.
-- ---------------------------------------------------------------
create table if not exists public.inventory_items (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references public.households (id) on delete cascade,
  storage_location_id uuid references public.storage_locations (id) on delete set null,
  asset_id      uuid references public.assets (id) on delete set null,
  name          text not null,
  tool_key      text,
  category      text not null default 'other'
    check (category in ('tool','material','consumable','decoration','seasonal',
      'furniture','textile','kitchen','garden','spare_part','document','other')),
  quantity      numeric(10,2) not null default 1,
  unit          text not null default 'each',
  condition     text not null default 'good'
    check (condition in ('new','good','used','worn','broken')),
  -- Seasonal items surface when relevant instead of never.
  season_window text[] not null default '{}',
  purchased_on  date,
  purchase_price numeric(12,2),
  notes         text,
  confidence    text not null default 'drafted' references public.confidence_levels (key),
  confirmed_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists inventory_items_household_idx
  on public.inventory_items (household_id, category);
create index if not exists inventory_items_location_idx
  on public.inventory_items (storage_location_id);
create index if not exists inventory_items_tool_key_idx
  on public.inventory_items (household_id, tool_key) where tool_key is not null;

drop trigger if exists inventory_items_updated_at on public.inventory_items;
create trigger inventory_items_updated_at before update on public.inventory_items
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------
-- consumables and recipes: the regular re-buy loop.
-- ---------------------------------------------------------------
create table if not exists public.consumables (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  name         text not null,
  category     text not null default 'household'
    check (category in ('household','cleaning','food','spice','garden','diy','pet','other')),
  typical_price numeric(10,2),
  reorder_interval_days smallint,
  last_bought_on date,
  is_staple    boolean not null default false,
  notes        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

drop trigger if exists consumables_updated_at on public.consumables;
create trigger consumables_updated_at before update on public.consumables
  for each row execute function public.set_updated_at();

create table if not exists public.recipes (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  name         text not null,
  serves       smallint,
  prep_minutes integer,
  cook_minutes integer,
  method       text,
  source       text,
  tags         text[] not null default '{}',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

drop trigger if exists recipes_updated_at on public.recipes;
create trigger recipes_updated_at before update on public.recipes
  for each row execute function public.set_updated_at();

create table if not exists public.recipe_ingredients (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references public.households (id) on delete cascade,
  recipe_id     uuid not null references public.recipes (id) on delete cascade,
  consumable_id uuid references public.consumables (id) on delete set null,
  label         text not null,
  quantity      text,
  created_at    timestamptz not null default now()
);

create index if not exists recipe_ingredients_recipe_idx on public.recipe_ingredients (recipe_id);
