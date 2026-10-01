-- ------------------------------------------------------------------
-- 60_knowledge.sql - The house handbook, the calendar and the people.
--
-- house_facts and decisions are the long-memory of the system. In five
-- years the question is not "what did we do" - the roadmap has that -
-- but "why did we do it that way, and what did we reject". That is
-- decisions, and nothing else in the system holds it.
-- ------------------------------------------------------------------

create table if not exists public.house_facts (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  property_id  uuid references public.properties (id) on delete cascade,
  room_id      uuid references public.rooms (id) on delete set null,
  category     text not null default 'general'
    check (category in ('general','construction','services','history','measurement',
      'legal','quirk','access','warranty','neighbour')),
  fact         text not null,
  detail       text,
  source       text,
  as_of        date not null default current_date,
  confidence   text not null default 'drafted' references public.confidence_levels (key),
  confirmed_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists house_facts_property_idx
  on public.house_facts (property_id, category);

drop trigger if exists house_facts_updated_at on public.house_facts;
create trigger house_facts_updated_at before update on public.house_facts
  for each row execute function public.set_updated_at();

-- What was decided, when, why, and what was rejected. The rejected
-- option is the half that is always lost otherwise, and it is the half
-- that stops the same debate being had twice.
create table if not exists public.decisions (
  id             uuid primary key default gen_random_uuid(),
  household_id   uuid not null references public.households (id) on delete cascade,
  -- A decision of principle (strip everything, DIY-heavy) is USER scope
  -- and follows the household; a decision about a building is PROPERTY.
  property_id    uuid references public.properties (id) on delete cascade,
  room_id        uuid references public.rooms (id) on delete set null,
  title          text not null,
  decided        text not null,
  rationale      text,
  alternatives_rejected text,
  decided_on     date not null default current_date,
  status         text not null default 'active'
    check (status in ('active','superseded','reversed')),
  superseded_by_id uuid references public.decisions (id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

drop trigger if exists decisions_updated_at on public.decisions;
create trigger decisions_updated_at before update on public.decisions
  for each row execute function public.set_updated_at();

-- Colours and finishes, with the codes. Six months later "the green in
-- the hallway" is unrecoverable without this.
create table if not exists public.palettes (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  room_id      uuid references public.rooms (id) on delete set null,
  name         text not null,
  surface      text not null default 'wall'
    check (surface in ('wall','ceiling','woodwork','floor','exterior','metalwork','feature')),
  brand        text,
  colour_name  text,
  colour_code  text,
  finish       text,
  hex          text check (hex is null or hex ~* '^#[0-9a-f]{6}$'),
  litres_used  numeric(8,2),
  notes        text,
  confidence   text not null default 'drafted' references public.confidence_levels (key),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists palettes_room_idx on public.palettes (room_id);

drop trigger if exists palettes_updated_at on public.palettes;
create trigger palettes_updated_at before update on public.palettes
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------
-- People and time
-- ---------------------------------------------------------------
create table if not exists public.contractors (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  name         text not null,
  company      text,
  trade        text references public.trades (key),
  phone        text,
  email        text,
  day_rate     numeric(10,2),
  hourly_rate  numeric(10,2),
  rating       smallint check (rating is null or rating between 1 and 5),
  status       text not null default 'prospect'
    check (status in ('prospect','quoted','engaged','completed','avoid')),
  notes        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

drop trigger if exists contractors_updated_at on public.contractors;
create trigger contractors_updated_at before update on public.contractors
  for each row execute function public.set_updated_at();

create table if not exists public.invoices (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references public.households (id) on delete cascade,
  contractor_id uuid references public.contractors (id) on delete set null,
  work_item_id  uuid references public.work_items (id) on delete set null,
  reference     text,
  amount        numeric(12,2) not null,
  issued_on     date,
  due_on        date,
  paid_on       date,
  status        text not null default 'received'
    check (status in ('quoted','received','approved','paid','disputed')),
  document_path text,
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists invoices_household_idx on public.invoices (household_id, status, due_on);

drop trigger if exists invoices_updated_at on public.invoices;
create trigger invoices_updated_at before update on public.invoices
  for each row execute function public.set_updated_at();

create table if not exists public.scheduled_events (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  property_id  uuid references public.properties (id) on delete cascade,
  work_item_id uuid references public.work_items (id) on delete set null,
  contractor_id uuid references public.contractors (id) on delete set null,
  asset_id     uuid references public.assets (id) on delete set null,
  bill_id      uuid references public.bills (id) on delete set null,
  title        text not null,
  kind         text not null default 'work'
    check (kind in ('work','delivery','visit','service','bill_due','deadline','seasonal','other')),
  starts_at    timestamptz not null,
  ends_at      timestamptz,
  all_day      boolean not null default false,
  location     text,
  notes        text,
  status       text not null default 'planned'
    check (status in ('planned','confirmed','done','cancelled')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists scheduled_events_household_idx
  on public.scheduled_events (household_id, starts_at);

drop trigger if exists scheduled_events_updated_at on public.scheduled_events;
create trigger scheduled_events_updated_at before update on public.scheduled_events
  for each row execute function public.set_updated_at();
