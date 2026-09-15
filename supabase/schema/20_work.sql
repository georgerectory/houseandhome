-- ------------------------------------------------------------------
-- 20_work.sql - The unified list.
--
-- Jobs and purchases live in ONE table, work_items, separated by `kind`
-- and projected into different views. "Re-plaster the hallway" and "buy
-- a stepladder" are the same kind of row: both are prioritised, both
-- cost money, both get funded from the same pot, and both can block
-- each other. Splitting them into a backlog table and a shopping table
-- would mean two mechanisms for one job and would make the single
-- savings pot incoherent.
--
-- Every view is a projection over these rows, so moving work between
-- views is a field edit and never a copy:
--   Done     = status 'done'
--   Parked   = not done AND (horizon 'someday' OR status 'dropped')
--   Active   = the rest (horizon now/next/later)
--
-- Nothing here is ever deleted. Rows close with a status and a
-- resolution; the delete guard below refuses a DELETE unless a session
-- opts in explicitly. A closed row keeps its decision, its history, its
-- links and its spend record.
-- ------------------------------------------------------------------

-- ---------------------------------------------------------------
-- trades: the discipline a piece of work belongs to. Replaces the
-- business-function axis a software roadmap would use - here the real
-- axis is skills, tools and materials, because that is what decides
-- who does it and what has to be bought first.
--
-- trade_weight is not a priority input; trades are not inherently more
-- important than each other. Ordering is for display grouping only.
-- ---------------------------------------------------------------
create table if not exists public.trades (
  key        text primary key,
  label      text not null,
  description text,
  sort_order integer not null default 100
);

insert into public.trades (key, label, description, sort_order) values
  ('decorating',   'Decorating',    'Filling, sanding, painting, wallpapering.', 10),
  ('plumbing',     'Plumbing',      'Water in, water out, sanitaryware.', 20),
  ('electrical',   'Electrical',    'Circuits, sockets, switches, lighting, data.', 30),
  ('carpentry',    'Carpentry',     'Timber, doors, skirting, shelving, joinery.', 40),
  ('flooring',     'Flooring',      'Carpets, boards, tiles, underlay, thresholds.', 50),
  ('plastering',   'Plastering',    'Skim, patch, board, render.', 60),
  ('roofing',      'Roofing',       'Coverings, flashing, gutters, fascias.', 70),
  ('heating',      'Heating',       'Boiler, radiators, controls, insulation.', 80),
  ('glazing',      'Glazing',       'Windows, doors, seals, secondary glazing.', 90),
  ('groundwork',   'Groundwork',    'Paths, drainage, hard landscaping, fencing.', 100),
  ('planting',     'Planting',      'Beds, hedging, trees, lawn, growing.', 110),
  ('cleaning',     'Cleaning',      'Deep cleans, clearance, waste removal.', 120),
  ('organisation', 'Organisation',  'Storage, racking, labelling, inventory.', 130),
  ('networking',   'Networking',    'WiFi, ethernet, smart home, AV.', 140),
  ('security',     'Security',      'Locks, alarms, cameras, lighting, access.', 150),
  ('admin',        'Admin',         'Bills, contracts, registrations, paperwork.', 160)
on conflict (key) do nothing;

-- ---------------------------------------------------------------
-- themes: renovation intent. The lane a piece of work sits in, and a
-- real priority input - making the house safe outranks making it
-- pretty, and the weight column is what encodes that rather than a
-- convention everyone has to remember.
-- ---------------------------------------------------------------
create table if not exists public.themes (
  key          text primary key,
  label        text not null,
  description  text not null,
  -- 1 (nice to have) to 5 (do this before anything else).
  theme_weight smallint not null default 3 check (theme_weight between 1 and 5),
  sort_order   integer not null default 100
);

insert into public.themes (key, label, description, theme_weight, sort_order) values
  ('make_safe',    'Make safe',     'Removes a hazard to people in the house.', 5, 10),
  ('make_dry',     'Make dry',      'Keeps water out and stops the fabric rotting.', 5, 20),
  ('make_secure',  'Make secure',   'Keeps the house and its contents secure.', 4, 30),
  ('make_warm',    'Make warm',     'Heating, insulation, draughts, running cost.', 4, 40),
  ('make_working', 'Make working',  'Something is broken and needs to function.', 4, 50),
  ('make_clean',   'Make clean',    'Clearance, deep cleaning, waste.', 3, 60),
  ('systems_tech', 'Systems & tech','Networking, smart home, AV, utilities.', 3, 70),
  ('storage',      'Storage',       'Somewhere for everything to live.', 3, 80),
  ('cosmetic',     'Cosmetic',      'Decoration and finish.', 2, 90),
  ('outdoor',      'Outdoor',       'Garden, grounds, outbuildings.', 2, 100),
  ('comfort',      'Comfort',       'Quality of daily life in the house.', 2, 110)
on conflict (key) do nothing;

-- ---------------------------------------------------------------
-- benefit_types: what a piece of work buys the HOUSE. This is the
-- column that answers "how is this adding value", and its weight is
-- the third priority input.
--
-- defect_cost is the honest type for a row whose only benefit is that
-- something is currently broken: that is a cost of leaving it, not a
-- case for doing it, and labelling it as anything else flatters the
-- backlog.
-- ---------------------------------------------------------------
create table if not exists public.benefit_types (
  key            text primary key,
  label          text not null,
  description    text not null,
  benefit_weight smallint not null default 3 check (benefit_weight between 1 and 5),
  sort_order     integer not null default 100
);

insert into public.benefit_types (key, label, description, benefit_weight, sort_order) values
  ('safety',        'Safety',         'Removes a risk of harm.', 5, 10),
  ('habitability',  'Habitability',   'Makes a space usable at all.', 5, 20),
  ('preservation',  'Preservation',   'Stops the fabric deteriorating further.', 4, 30),
  ('running_cost',  'Running cost',   'Reduces ongoing bills.', 4, 40),
  ('defect_cost',   'Defect cost',    'Something is broken; this is the cost of leaving it.', 3, 50),
  ('property_value','Property value', 'Raises what the house is worth.', 3, 60),
  ('time_saved',    'Time saved',     'Saves recurring effort.', 3, 70),
  ('comfort',       'Comfort',        'Improves daily experience.', 2, 80),
  ('enjoyment',     'Enjoyment',      'Pleasure rather than function.', 1, 90)
on conflict (key) do nothing;

create table if not exists public.milestones (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  key          text not null,
  title        text not null,
  description  text,
  due_on       date,
  sort_order   integer not null default 100,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (household_id, key)
);

drop trigger if exists milestones_updated_at on public.milestones;
create trigger milestones_updated_at before update on public.milestones
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------
-- work_item_templates: generic, property-agnostic work with per-unit
-- estimates. The whole point of the system running before a house is
-- bought: "paint a wall" costs £X per square metre and takes Y minutes
-- per square metre whatever house it is in, so a backlog and a budget
-- can exist now and be instantiated against real rooms later.
-- ---------------------------------------------------------------
create table if not exists public.work_item_templates (
  id            uuid primary key default gen_random_uuid(),
  key           text not null unique,
  title         text not null,
  summary       text,
  details       text,
  kind          text not null default 'renovation',
  trade         text references public.trades (key),
  theme         text references public.themes (key),
  benefit_type  text references public.benefit_types (key),
  -- The unit the estimates are per. 'item' means a flat cost.
  unit          text not null default 'item'
    check (unit in ('item','m2','linear_m','each','room','door','window','socket','radiator')),
  cost_best_per_unit  numeric(10,2),
  cost_worst_per_unit numeric(10,2),
  minutes_per_unit_min integer,
  minutes_per_unit_max integer,
  skill_level   text not null default 'basic'
    check (skill_level in ('none','basic','confident','skilled','professional')),
  -- Matcher attributes travel with the template so an instantiated item
  -- arrives already answerable to "what can I do in 15 minutes".
  matcher       jsonb not null default '{}'::jsonb,
  applies_to_room_types text[] not null default '{}',
  confidence    text not null default 'drafted' references public.confidence_levels (key),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

drop trigger if exists work_item_templates_updated_at on public.work_item_templates;
create trigger work_item_templates_updated_at before update on public.work_item_templates
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------
-- work_items
-- ---------------------------------------------------------------
create table if not exists public.work_items (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references public.households (id) on delete cascade,
  property_id   uuid references public.properties (id) on delete set null,
  room_id       uuid references public.rooms (id) on delete set null,
  template_id   uuid references public.work_item_templates (id) on delete set null,
  milestone_id  uuid references public.milestones (id) on delete set null,

  -- Parent, for breaking a project into ordered jobs and a job into
  -- steps. SET NULL rather than CASCADE: in a table whose governing
  -- rule is that nothing is deleted, a cascade would silently take
  -- every child of a removed project with it.
  parent_id     uuid references public.work_items (id) on delete set null,

  -- PRESENTATION hierarchy. rooms/trades stay the FILING taxonomy.
  level         text not null default 'job'
    check (level in ('project', 'job', 'step')),

  title         text not null,
  summary       text,
  details       text,

  -- Jobs and purchases in one table. 'purchase' is a thing to buy;
  -- everything else is work to do.
  kind          text not null default 'renovation'
    check (kind in ('repair','renovation','decoration','improvement','maintenance',
      'cleaning','purchase','admin','research','disposal')),

  trade         text references public.trades (key),
  -- Trades that want visibility without owning the item. A bathroom
  -- rewire is owned by 'electrical' but an 'organisation' view should
  -- still surface it. Filtering matches owner OR association.
  associated_trades text[] not null default '{}',
  theme         text references public.themes (key),

  status        text not null default 'idea'
    check (status in ('idea','planned','ready','in_progress','blocked','done','dropped')),
  -- Start band, and the band the item runs THROUGH so long work spans
  -- columns. 'someday' is the parked band.
  horizon       text not null default 'someday'
    check (horizon in ('now','next','later','someday')),
  end_horizon   text check (end_horizon in ('now','next','later','someday')),
  progress      smallint not null default 0 check (progress between 0 and 100),

  -- Priority is COMPUTED, never typed. recompute_priorities()
  -- (80_functions.sql) derives priority_score from room weight, theme
  -- weight, benefit weight and pressure terms, then assigns `priority`
  -- as the rank over that score. Storing both means the roadmap can
  -- always explain its own order instead of presenting a bare number.
  --   priority_score  higher is more important
  --   priority        1 = most important. Lower sorts first.
  priority_score integer not null default 0,
  priority      integer not null default 1000,
  priority_explain jsonb not null default '{}'::jsonb,
  -- Manual override, for the case the formula gets it wrong. Null means
  -- "use the computed value". Recorded separately so an override is
  -- visible as an override rather than silently baked into priority.
  priority_override integer,
  sort_order    integer not null default 100,

  -- WHY this work exists, as opposed to what it is.
  house_benefit text,
  benefit_type  text references public.benefit_types (key),
  -- A benefit an assistant wrote must never read identically to one the
  -- owner checked. Enforced by the constraint below.
  benefit_status text check (benefit_status in ('drafted','confirmed')),
  daily_living_value text,
  guest_value        text,
  resale_value       text,

  performed_by  text not null default 'self'
    check (performed_by in ('self','partner','contractor','mixed','unknown')),
  assignee      text,

  -- Money. cost_expected is what the allocation engine targets.
  cost_best     numeric(12,2) check (cost_best is null or cost_best >= 0),
  cost_worst    numeric(12,2) check (cost_worst is null or cost_worst >= 0),
  cost_expected numeric(12,2) check (cost_expected is null or cost_expected >= 0),
  cost_confidence text not null default 'drafted' references public.confidence_levels (key),
  cost_source   text,
  -- Running total of money allocated to this item. numeric(14,6)
  -- because the allocation rule guarantees every open item a non-zero
  -- share of every deposit, which means fractions of a penny; rounding
  -- happens only at the point of real spend.
  allocated_balance numeric(14,6) not null default 0 check (allocated_balance >= 0),
  fully_funded_at timestamptz,
  spent_actual  numeric(12,2) check (spent_actual is null or spent_actual >= 0),
  spent_at      timestamptz,
  -- Opt out of funding: a job needing no money, or one deliberately
  -- excluded from the pot. Excluded items still appear on the roadmap.
  is_fundable   boolean not null default true,

  -- Time.
  duration_min_minutes integer check (duration_min_minutes is null or duration_min_minutes >= 0),
  duration_max_minutes integer check (duration_max_minutes is null or duration_max_minutes >= 0),
  duration_actual_minutes integer check (duration_actual_minutes is null or duration_actual_minutes >= 0),
  effort        text check (effort is null or effort in ('small','medium','large')),
  skill_level   text not null default 'basic'
    check (skill_level in ('none','basic','confident','skilled','professional')),

  -- Matcher attributes: what makes "I have 15 minutes and a drill, my
  -- back hurts, and it is raining" an answerable question. Columns
  -- rather than a jsonb bag because the matcher has to filter on them.
  min_session_minutes integer,
  setting       text not null default 'indoor'
    check (setting in ('indoor','outdoor','either')),
  needs_daylight boolean not null default false,
  weather_needs text[] not null default '{}',
  physical_demand text not null default 'moderate'
    check (physical_demand in ('light','moderate','heavy')),
  posture       text[] not null default '{}',
  noise_level   text not null default 'quiet'
    check (noise_level in ('silent','quiet','loud')),
  mess_level    text not null default 'clean'
    check (mess_level in ('clean','dusty','wet','very_messy')),
  tools_required text[] not null default '{}',
  materials_ready boolean not null default false,
  blocks_room_use boolean not null default false,
  drying_or_curing_hours integer,
  season_window text[] not null default '{}',
  two_person_job boolean not null default false,

  tags          text[] not null default '{}',
  -- Closing note; resolved_at is stamped by the trigger below.
  resolution    text,
  resolved_at   timestamptz,
  confidence    text not null default 'drafted' references public.confidence_levels (key),
  confirmed_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint work_items_parent_not_self check (parent_id is null or parent_id <> id),
  constraint work_items_project_top_level check (level <> 'project' or parent_id is null),
  -- A stored benefit always carries its checked state, or the point of
  -- benefit_status is lost the first time somebody forgets to set it.
  constraint work_items_benefit_status_present
    check (house_benefit is null or benefit_status is not null),
  -- A cost range must be a range.
  constraint work_items_cost_range
    check (cost_best is null or cost_worst is null or cost_best <= cost_worst),
  constraint work_items_duration_range
    check (duration_min_minutes is null or duration_max_minutes is null
           or duration_min_minutes <= duration_max_minutes)
);

create index if not exists work_items_household_idx
  on public.work_items (household_id, status, horizon, priority, sort_order);
create index if not exists work_items_room_idx on public.work_items (room_id);
create index if not exists work_items_parent_idx on public.work_items (parent_id, sort_order);
create index if not exists work_items_kind_idx on public.work_items (household_id, kind, status);
create index if not exists work_items_trade_idx on public.work_items (trade) where trade is not null;
create index if not exists work_items_assoc_trades_idx
  on public.work_items using gin (associated_trades);
create index if not exists work_items_tools_idx
  on public.work_items using gin (tools_required);
-- The funding read path: open, fundable, costed items, in rank order.
create index if not exists work_items_funding_idx
  on public.work_items (household_id, priority)
  where is_fundable and status not in ('done','dropped');

-- Deleting a work item is not an operation this system has. Rows close
-- with status done/dropped plus a resolution, which keeps the decision,
-- the money that went to it and the links that point at it. A delete
-- would take all of that with no undo, so the guard refuses unless a
-- session opts in explicitly:
--
--   set local house.allow_work_item_delete = 'on';
--
-- That makes an accidental delete fail loudly rather than succeed
-- quietly, while leaving a deliberate cleanup possible in one
-- transaction.
create or replace function public.work_item_delete_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if coalesce(current_setting('house.allow_work_item_delete', true), 'off') <> 'on' then
    raise exception using
      errcode = 'restrict_violation',
      message = format('work_items rows are closed, not deleted (id %s, "%s")', old.id, old.title),
      hint = 'Set status to done or dropped with a resolution. To delete anyway: '
        || 'set local house.allow_work_item_delete = ''on'';';
  end if;
  return old;
end;
$$;

drop trigger if exists work_items_delete_guard on public.work_items;
create trigger work_items_delete_guard before delete on public.work_items
  for each row execute function public.work_item_delete_guard();

-- Closing an item stamps resolved_at; reopening clears it. Also keeps
-- updated_at fresh, so this is work_items' only row-level update trigger.
create or replace function public.set_work_item_resolution()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  if new.status in ('done','dropped') then
    new.resolved_at = coalesce(new.resolved_at, now());
  else
    new.resolved_at = null;
  end if;
  return new;
end;
$$;

drop trigger if exists work_items_resolution on public.work_items;
create trigger work_items_resolution before update on public.work_items
  for each row execute function public.set_work_item_resolution();

-- ---------------------------------------------------------------
-- work_notes: atomic distilled records tied to whatever they concern.
-- An assistant that changes something records WHY here, so the next
-- session inherits the judgement instead of re-deriving it.
-- ---------------------------------------------------------------
create table if not exists public.work_notes (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  work_item_id uuid references public.work_items (id) on delete set null,
  room_id      uuid references public.rooms (id) on delete set null,
  kind         text not null default 'note'
    check (kind in ('decision','fact','risk','question','action','note')),
  body         text not null,
  status       text not null default 'active'
    check (status in ('active','resolved','superseded')),
  tags         text[] not null default '{}',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists work_notes_item_idx on public.work_notes (work_item_id, kind);
create index if not exists work_notes_household_idx on public.work_notes (household_id, status);

drop trigger if exists work_notes_updated_at on public.work_notes;
create trigger work_notes_updated_at before update on public.work_notes
  for each row execute function public.set_updated_at();

-- Until a property is bound, every renovation cost is a forecast against
-- a generic house rather than a quote for a real one. See the note on
-- bills.basis in 40_money.sql.
alter table public.work_items
  add column if not exists cost_basis text not null default 'predicted'
    check (cost_basis in ('current','predicted'));

comment on column public.work_items.cost_basis is
  'predicted by default: until a property is bound, every renovation cost is a forecast against a generic house.';
