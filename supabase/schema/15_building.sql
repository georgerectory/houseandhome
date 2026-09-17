-- ------------------------------------------------------------------
-- 15_building.sql - the registry of building stages, and what each one
-- changes.
--
-- THE GEOMETRY IS NOT IN HERE, AND THAT IS DELIBERATE.
--
-- Walls, rooms, openings and furniture live in the repository, under
-- data/buildings/, because they are drawing data read off a public
-- listing: nothing about them is private, they have to be unit-testable
-- from disk with no authentication, and git is a better version history
-- for a model than a table would be.
--
-- What lives here is the JOIN. A stage of the building is a thing the
-- roadmap has to be able to point at - "this job is what turns the
-- as-bought model into the post-extension one" - and a work item cannot
-- link to a JSON file. So each stage gets a row, each structural change
-- between one stage and its parent gets a row, and the knowledge graph
-- does the rest.
--
-- The quantities on building_changes are MEASURED OFF THE GEOMETRY by
-- stageDiff() in assets/js/engine/building.js, not typed. That is what
-- makes them worth having: twelve metres of new outer wall is a number
-- the model can defend. It is also why they are drafted and drive
-- nothing: the geometry they come from is researched at best, and
-- run_deposit_allocation() already refuses unconfirmed figures.
-- ------------------------------------------------------------------

-- A structural state of the building. `stage_key` matches the id in
-- data/buildings/<building>/index.json, and that is the only thread
-- between the two stores: everything else about the shape of the house
-- is read from the file, never from here.
create table if not exists public.building_stages (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  property_id  uuid references public.properties (id) on delete cascade,
  building_key text not null,
  stage_key    text not null,
  name         text not null,
  -- existing  the house as it stands today
  -- planned   a state somebody intends to build
  -- built     a planned state that has since been built
  status       text not null default 'planned'
    check (status in ('existing', 'planned', 'built')),
  sequence     integer not null default 100,
  derived_from_id uuid references public.building_stages (id) on delete set null,
  summary      text,
  notes        text,
  confidence   text not null default 'drafted' references public.confidence_levels (key),
  confirmed_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (household_id, building_key, stage_key),
  constraint building_stages_not_own_parent check (derived_from_id is null or derived_from_id <> id)
);

create index if not exists building_stages_property_idx
  on public.building_stages (property_id, sequence);

drop trigger if exists building_stages_touch on public.building_stages;
create trigger building_stages_touch before update on public.building_stages
  for each row execute function public.set_updated_at();

-- One structural delta between a stage and its parent: fill in the east
-- side of the wing, remove the rear wall upstairs, replace both roofs.
-- This is the row a work item links to, and the row that carries the
-- quantity behind it.
create table if not exists public.building_changes (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  stage_id     uuid not null references public.building_stages (id) on delete cascade,
  change_key   text not null,
  name         text not null,
  kind         text not null default 'build'
    check (kind in ('build', 'demolish', 'convert', 'reroof', 'structure',
                    'first_fix', 'second_fix', 'fit_out', 'external')),
  -- Measured off the two models by stageDiff(). Null means the diff does
  -- not yield that quantity for this change, which is not the same as
  -- zero and must not be totalled as if it were.
  new_wall_m      numeric(8,2),
  demolition_m    numeric(8,2),
  area_added_m2   numeric(8,2),
  roof_area_m2    numeric(8,2),
  rooms_created   integer check (rooms_created is null or rooms_created >= 0),
  -- Where the quantity came from, so a session that finds it surprising
  -- can go and look rather than guess.
  measured_from   text,
  notes           text,
  confidence      text not null default 'drafted' references public.confidence_levels (key),
  confirmed_at    timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (stage_id, change_key)
);

create index if not exists building_changes_stage_idx
  on public.building_changes (stage_id);

drop trigger if exists building_changes_touch on public.building_changes;
create trigger building_changes_touch before update on public.building_changes
  for each row execute function public.set_updated_at();

-- Nothing here may be deleted, for the same reason nothing else may be:
-- a change that turned out to be wrong is a change somebody decided
-- against, and that is worth keeping. Close it with a status instead.
