-- ------------------------------------------------------------------
-- 88_road_ahead.sql - Road Ahead: which house next, and why.
--
-- The project system (everything before this file) runs ONE property's
-- renovation. Road Ahead is the step before: the variables the long
-- plan rests on, the roads from here to the forever home, the listings
-- being weighed, the auctions, and the owner's own words about all of
-- it. The two meet at one step, ra_promote_listing(), which hands a
-- listing to new_property().
--
-- PRIVACY. These rows hold the owner's pay, savings, borrowing, plans
-- and bid limits. They live here, behind RLS, and never in the public
-- repository; the engine that reads them (assets/js/engine/road-ahead/)
-- carries no figure of its own.
--
-- THE RULES THIS FILE KEEPS:
--   * Every table is household-scoped, RLS forced, and has no delete
--     policy (90_policies.sql). Rows close with a status and a reason.
--   * Appraisals, judgements, accepted runs and sensitivity snapshots
--     are APPEND-ONLY: a newer row supersedes, an old one is never
--     edited, so how the picture changed is part of the record.
--   * A variable never changes silently: change_log records old, new,
--     why and source, and refuses a change without a reason.
--   * The owner's judgement sits BESIDE the maths, never over it
--     (docs/road-ahead/CALIBRATION.md).
-- ------------------------------------------------------------------

-- ---------------------------------------------------------------
-- ra_variables: every figure the model reads, with both labels.
--
-- `evidence` is the kit's own label (STATED, VERIFIED, ESTIMATE,
-- CHECK); `confidence` is the portal's ladder, where only confirmed and
-- actual may drive money. Both are kept, as bills keeps `basis` beside
-- `confidence`: they answer different questions.
-- ---------------------------------------------------------------
create table if not exists public.ra_variables (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references public.households (id) on delete cascade,
  key           text not null check (key ~ '^[a-z0-9_]+(\.[a-z0-9_]+)+$'),
  label         text,
  -- A number, a [year, month] pair, or a year -> rate map.
  value         jsonb not null,
  unit          text,
  low           jsonb,
  high          jsonb,
  evidence      text not null check (evidence in ('STATED','VERIFIED','ESTIMATE','CHECK')),
  certainty     text check (certainty in ('H','M','L')),
  confidence    text not null default 'drafted' references public.confidence_levels (key),
  confirmed_at  timestamptz,
  source        text,
  source_date   date,
  evidence_refs text[] not null default '{}',
  notes         text,
  status        text not null default 'active' check (status in ('active','retired')),
  resolution    text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (household_id, key),
  constraint ra_variables_retired check (status = 'active' or resolution is not null)
);

drop trigger if exists ra_variables_updated_at on public.ra_variables;
create trigger ra_variables_updated_at before update on public.ra_variables
  for each row execute function public.set_updated_at();
drop trigger if exists ra_variables_log on public.ra_variables;
create trigger ra_variables_log after update on public.ra_variables
  for each row execute function public.log_changes(
    'money:value', 'money:low', 'money:high', 'confidence', 'evidence', 'status');

-- ---------------------------------------------------------------
-- ra_scenarios: a named set of overrides and road transforms.
--
-- A scenario is data, never a branch in code. `frozen` holds a complete
-- input set and its published outputs, so a later session can re-prove
-- the engine against it (the kit-v5 scenario is the Rectory kit exactly
-- as it was on 30 Sep 2026).
-- ---------------------------------------------------------------
create table if not exists public.ra_scenarios (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references public.households (id) on delete cascade,
  key           text not null check (key ~ '^[a-z0-9_-]+$'),
  name          text not null,
  description   text,
  overrides     jsonb not null default '{}',
  works_factor  numeric(6,4) check (works_factor is null or works_factor > 0),
  help          boolean not null default true,
  is_builtin    boolean not null default false,
  is_default    boolean not null default false,
  frozen        jsonb,
  status        text not null default 'active' check (status in ('active','frozen','retired')),
  resolution    text,
  source        text,
  confidence    text not null default 'drafted' references public.confidence_levels (key),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (household_id, key),
  constraint ra_scenarios_retired check (status <> 'retired' or resolution is not null)
);
create unique index if not exists ra_scenarios_one_default
  on public.ra_scenarios (household_id) where is_default;

drop trigger if exists ra_scenarios_updated_at on public.ra_scenarios;
create trigger ra_scenarios_updated_at before update on public.ra_scenarios
  for each row execute function public.set_updated_at();
-- A scenario's overrides are figures: changing one needs a reason, as a
-- variable does. The frozen kit set is not logged; it is never changed.
drop trigger if exists ra_scenarios_log on public.ra_scenarios;
create trigger ra_scenarios_log after update on public.ra_scenarios
  for each row execute function public.log_changes('money:overrides', 'money:works_factor', 'help', 'status');

-- ---------------------------------------------------------------
-- ra_roads: the ways from here to the forever home.
--
-- `stages` is the engine's own shape (a rent, a buy, a sell, the
-- forever purchase, each at a month). Retired roads stay, with the
-- decision that retired them: "why not that way" is worth keeping.
-- `fit` is the road's criteria, which fit.js checks the owner's own
-- scores against.
-- ---------------------------------------------------------------
create table if not exists public.ra_roads (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references public.households (id) on delete cascade,
  code          text not null,
  name          text not null,
  kind          text not null default 'road' check (kind in ('road','ladder')),
  rank_label    text,
  family        text,
  near          boolean,
  stages        jsonb not null default '[]',
  fit           jsonb not null default '[]',
  narrative     text,
  sort_order    integer not null default 100,
  status        text not null default 'active' check (status in ('active','retired')),
  retired_by    text,
  resolution    text,
  source        text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (household_id, code),
  constraint ra_roads_retired check (status = 'active' or resolution is not null)
);

drop trigger if exists ra_roads_updated_at on public.ra_roads;
create trigger ra_roads_updated_at before update on public.ra_roads
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------
-- ra_road_runs: results the owner has accepted, as a baseline.
--
-- The page computes live; a run is written when results are accepted,
-- so the next change can be measured against it (a move of £1k or more
-- is explained). Append-only.
-- ---------------------------------------------------------------
create table if not exists public.ra_road_runs (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references public.households (id) on delete cascade,
  scenario_key  text not null,
  road_code     text not null,
  run_name      text not null default 'base',
  source        text not null check (source in ('kit','engine')),
  engine_version text not null,
  inputs_hash   text,
  summary       jsonb not null,
  ledger        jsonb,
  trace         jsonb,
  accepted_at   timestamptz not null default now(),
  accepted_note text,
  created_at    timestamptz not null default now()
);
create index if not exists ra_road_runs_lookup
  on public.ra_road_runs (household_id, scenario_key, road_code, run_name, accepted_at desc);

-- ---------------------------------------------------------------
-- ra_rules: the hard lines and the defaults, in plain words.
-- ---------------------------------------------------------------
create table if not exists public.ra_rules (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references public.households (id) on delete cascade,
  code          text not null,
  scope         text not null check (scope in ('all','house1','forever','golden_egg','renting')),
  kind          text not null default 'hard' check (kind in ('hard','default')),
  rule          text not null,
  check_id      text,
  params        jsonb not null default '[]',
  severity      text not null default 'block' check (severity in ('block','warn')),
  decision_code text,
  source        text,
  status        text not null default 'active' check (status in ('active','retired')),
  resolution    text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (household_id, code),
  constraint ra_rules_retired check (status = 'active' or resolution is not null)
);

drop trigger if exists ra_rules_updated_at on public.ra_rules;
create trigger ra_rules_updated_at before update on public.ra_rules
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------
-- ra_signals: the owner's own words, and what they imply.
--
-- A signal (S-), a reaction to one listing (R1-) or a pattern across
-- several (PT-). These are the raw material every calibration rests on,
-- so the words are kept as said.
-- ---------------------------------------------------------------
create table if not exists public.ra_signals (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references public.households (id) on delete cascade,
  code          text not null,
  kind          text not null check (kind in ('signal','reaction','pattern')),
  words         text not null,
  context       text,
  implies       text,
  open_question text,
  conflicts     text[] not null default '{}',
  certainty     text check (certainty in ('H','M','L')),
  rating        text,
  said_on       date,
  source        text,
  notes         text,
  status        text not null default 'active' check (status in ('active','retired')),
  resolution    text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (household_id, code),
  constraint ra_signals_retired check (status = 'active' or resolution is not null)
);

drop trigger if exists ra_signals_updated_at on public.ra_signals;
create trigger ra_signals_updated_at before update on public.ra_signals
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------
-- ra_auction_houses and ra_auction_calendar.
-- ---------------------------------------------------------------
create table if not exists public.ra_auction_houses (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references public.households (id) on delete cascade,
  code          text not null,
  name          text not null,
  format        text,
  covers        text,
  cadence       text,
  link          text,
  why           text,
  status        text not null default 'active' check (status in ('active','retired')),
  resolution    text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (household_id, code),
  constraint ra_auction_houses_retired check (status = 'active' or resolution is not null)
);

drop trigger if exists ra_auction_houses_updated_at on public.ra_auction_houses;
create trigger ra_auction_houses_updated_at before update on public.ra_auction_houses
  for each row execute function public.set_updated_at();

-- Auctioneers move dates, so every row says when it was last checked.
create table if not exists public.ra_auction_calendar (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references public.households (id) on delete cascade,
  house_code    text not null,
  kind          text not null default 'auction' check (kind in ('auction','catalogue','bidding_opens')),
  on_date       date not null,
  title         text,
  notes         text,
  checked_on    date not null,
  status        text not null default 'scheduled' check (status in ('scheduled','moved','cancelled','held')),
  resolution    text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (household_id, house_code, kind, on_date, title)
);

drop trigger if exists ra_auction_calendar_updated_at on public.ra_auction_calendar;
create trigger ra_auction_calendar_updated_at before update on public.ra_auction_calendar
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------
-- ra_listings: every house weighed, bought or not.
--
-- The listings register is household history: completing a purchase
-- does not touch it. A listing promoted to a property goes with that
-- property only if the property is purged, which keeps a purge meaning
-- what it says.
-- ---------------------------------------------------------------
create table if not exists public.ra_listings (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references public.households (id) on delete cascade,
  code          text not null check (code ~ '^[LG][0-9]{2,3}$'),
  kit_ref       text,
  name          text not null,
  address       text,
  postcode      text,
  links         text[] not null default '{}',
  source        text,
  house_code    text,
  lot           text,
  auction_on    date,
  auction_at    timestamptz,
  sale_method   text check (sale_method in ('auction','mmoa','private','tender','unknown')),
  property_type text,
  detached      boolean,
  beds          integer check (beds is null or beds >= 0),
  baths         integer check (baths is null or baths >= 0),
  floor_area_m2 numeric(8,2),
  plot_acres    numeric(8,3),
  condition     text,
  minutes_from_home integer check (minutes_from_home is null or minutes_from_home >= 0),
  guide_price   numeric(12,2),
  asking_price  numeric(12,2),
  fee           numeric(12,2) not null default 0,
  fee_pct       numeric(6,4) not null default 0,
  purpose       text not null default 'candidate' check (purpose in ('candidate','benchmark')),
  status        text not null default 'watch' check (status in ('watch','chase','viewing','legal','survey',
                  'bid','offer','won','lost','dropped','closed','unreviewed')),
  status_reason text,
  reaction      text,
  flag          text,
  category      text,
  notes         text,
  property_id   uuid references public.properties (id) on delete cascade,
  confidence    text not null default 'drafted' references public.confidence_levels (key),
  checked_on    date,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (household_id, code),
  constraint ra_listings_closing check (status not in ('dropped','closed','lost') or status_reason is not null)
);
create index if not exists ra_listings_auction on public.ra_listings (household_id, auction_on);

drop trigger if exists ra_listings_updated_at on public.ra_listings;
create trigger ra_listings_updated_at before update on public.ra_listings
  for each row execute function public.set_updated_at();
drop trigger if exists ra_listings_log on public.ra_listings;
create trigger ra_listings_log after update on public.ra_listings
  for each row execute function public.log_changes(
    'status', 'money:guide_price', 'money:asking_price', 'auction_on', 'property_id');

-- ---------------------------------------------------------------
-- ra_appraisals: every assessment of a listing, kept. Append-only.
--
-- The inputs and the outputs are both stored, so the page can show the
-- live numbers and say plainly when they have moved since. The road-fit
-- scores are an ORDERED list of [road, score] pairs: the best road is
-- the first highest, and a jsonb object would lose the order.
-- ---------------------------------------------------------------
create table if not exists public.ra_appraisals (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references public.households (id) on delete cascade,
  listing_id    uuid not null references public.ra_listings (id) on delete cascade,
  appraised_on  date not null,
  scenario_key  text,
  authored_by   text not null check (authored_by in ('owner','claude_chat','claude_code','kit')),
  protocol      text not null check (protocol in ('register-v5','part-n','road-ahead-1')),
  engine_version text,
  inputs        jsonb not null default '{}',
  outputs       jsonb,
  fits          jsonb not null default '[]',
  fit_check     jsonb,
  verdict       text,
  override_grade text,
  override_reason text,
  positives     text[] not null default '{}',
  negatives     text[] not null default '{}',
  red_flags     text[] not null default '{}',
  next_checks   text[] not null default '{}',
  sources       jsonb not null default '[]',
  labels        jsonb not null default '{}',
  narrative     jsonb,
  notes         text,
  created_at    timestamptz not null default now(),
  constraint ra_appraisals_override_reason check (override_grade is null or override_reason is not null),
  constraint ra_appraisals_fits_ordered check (jsonb_typeof(fits) = 'array')
);
create index if not exists ra_appraisals_listing on public.ra_appraisals (listing_id, appraised_on desc, created_at desc);

-- An appraisal made by Road Ahead's protocol shows its working: every
-- source says what it is, every figure carries one of the kit's four
-- evidence labels, the computed answer is stored beside the inputs, and
-- the lists stay as short as the answer format says. The kit's own
-- appraisals (register-v5, part-n) are left as the kit wrote them.
create or replace function public.ra_shows_working(p_sources jsonb, p_labels jsonb)
returns boolean
language sql
immutable
set search_path = public
as $$
  select case
    when jsonb_typeof(p_sources) <> 'array' or jsonb_array_length(p_sources) = 0 then false
    when jsonb_typeof(p_labels) <> 'object' or p_labels = '{}'::jsonb then false
    else not exists (select 1 from jsonb_array_elements(p_sources) s
                      where jsonb_typeof(s) <> 'object' or coalesce(btrim(s ->> 'what'), '') = '')
     and not exists (select 1 from jsonb_each(p_labels) l
                      where jsonb_typeof(l.value) <> 'string'
                         or l.value #>> '{}' not in ('STATED', 'VERIFIED', 'ESTIMATE', 'CHECK'))
  end
$$;

alter table public.ra_appraisals drop constraint if exists ra_appraisals_shows_working;
alter table public.ra_appraisals add constraint ra_appraisals_shows_working check (
  protocol <> 'road-ahead-1' or (
    coalesce(outputs ? 'walk_away_opt', false)
    and public.ra_shows_working(sources, labels)
    and cardinality(positives) <= 3 and cardinality(negatives) <= 3 and cardinality(next_checks) <= 3));

-- ---------------------------------------------------------------
-- ra_judgements: the owner's judgement beside the maths. Append-only.
--
-- "I would pay more for this one, because ..." The maths is never
-- overwritten; this row sits beside it with its reason and its kind,
-- and a newer judgement supersedes by pointing at the one it replaces.
-- A judgement without a reason is refused.
-- ---------------------------------------------------------------
create table if not exists public.ra_judgements (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references public.households (id) on delete cascade,
  listing_id    uuid references public.ra_listings (id) on delete cascade,
  road_code     text,
  field         text not null check (field in ('walk_away','premium','finished_value','works','fit','verdict','other')),
  value         jsonb,
  reason        text not null check (length(btrim(reason)) > 0),
  kind          text not null check (kind in ('emotional','personal','strategic','information')),
  said_on       date not null default current_date,
  signal_code   text,
  supersedes_id uuid references public.ra_judgements (id),
  created_at    timestamptz not null default now(),
  constraint ra_judgements_about check (listing_id is not null or road_code is not null)
);
create index if not exists ra_judgements_listing on public.ra_judgements (listing_id, field, said_on desc);

-- ---------------------------------------------------------------
-- ra_comparables: prices somebody actually paid or asked, dated.
-- ---------------------------------------------------------------
create table if not exists public.ra_comparables (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references public.households (id) on delete cascade,
  listing_id    uuid references public.ra_listings (id) on delete set null,
  address       text not null,
  property_type text,
  price         numeric(12,2) not null check (price > 0),
  kind          text not null default 'sold' check (kind in ('sold','asking','guide','estimate')),
  when_text     text,
  on_date       date,
  source        text,
  url           text,
  notes         text,
  confidence    text not null default 'researched' references public.confidence_levels (key),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (household_id, address, price, when_text)
);

drop trigger if exists ra_comparables_updated_at on public.ra_comparables;
create trigger ra_comparables_updated_at before update on public.ra_comparables
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------
-- ra_auction_results and ra_playbook.
-- ---------------------------------------------------------------
create table if not exists public.ra_auction_results (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references public.households (id) on delete cascade,
  house_code    text not null,
  listing_id    uuid references public.ra_listings (id) on delete set null,
  sold_on       date not null,
  lot           text,
  property_type text,
  guide         numeric(12,2),
  sold          numeric(12,2),
  -- 'watched': a sale followed live with no lot of interest to record.
  outcome       text not null default 'sold' check (outcome in ('sold','unsold','withdrawn','sold_prior','postponed','watched')),
  lesson        text,
  source        text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (household_id, house_code, sold_on, lot)
);

drop trigger if exists ra_auction_results_updated_at on public.ra_auction_results;
create trigger ra_auction_results_updated_at before update on public.ra_auction_results
  for each row execute function public.set_updated_at();

create table if not exists public.ra_playbook (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references public.households (id) on delete cascade,
  code          text not null,
  kind          text not null check (kind in ('setup','daily','weekly','did_not_work','rule')),
  body          text not null,
  sort_order    integer not null default 100,
  status        text not null default 'active' check (status in ('active','retired')),
  resolution    text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (household_id, code),
  constraint ra_playbook_retired check (status = 'active' or resolution is not null)
);

drop trigger if exists ra_playbook_updated_at on public.ra_playbook;
create trigger ra_playbook_updated_at before update on public.ra_playbook
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------
-- The auction countdown: a vocabulary of steps and each lot's progress.
--
-- The template is vocabulary, like trades: the same eight steps for
-- every lot, each with the decision it settles. Due dates are DERIVED
-- from the auction date, never stored, so a moved auction moves them.
-- ---------------------------------------------------------------
create table if not exists public.ra_pipeline_template (
  key           text primary key,
  offset_days   integer not null,
  label         text not null,
  settles       text not null,
  sort_order    integer not null
);

insert into public.ra_pipeline_template (key, offset_days, label, settles, sort_order) values
  ('t-21', -21, 'Catalogue out: appraise, set the walk-away, book the viewing, request the legal pack', 'Keep or drop', 10),
  ('t-14', -14, 'Viewing', 'Still keen?', 20),
  ('t-12', -12, 'Legal pack read', 'Any deal-breakers?', 30),
  ('t-10', -10, 'Survey and lender', 'Mortgageable?', 40),
  ('t-7',   -7, 'Go or no-go', 'Maximum bid fixed', 50),
  ('t-2',   -2, 'Ready: registered, deposit moved, remote bidding tested', 'Ready to bid', 60),
  ('t-0',    0, 'Auction day', 'Won, or walk away', 70),
  ('t+1',    1, 'Unsold: a post-auction offer', 'Offer or let go', 80)
on conflict (key) do update set offset_days = excluded.offset_days, label = excluded.label,
  settles = excluded.settles, sort_order = excluded.sort_order;

create table if not exists public.ra_pipeline_steps (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references public.households (id) on delete cascade,
  listing_id    uuid not null references public.ra_listings (id) on delete cascade,
  step_key      text not null references public.ra_pipeline_template (key),
  done_on       date,
  outcome       text,
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (listing_id, step_key),
  constraint ra_pipeline_steps_outcome check (done_on is null or outcome is not null)
);

drop trigger if exists ra_pipeline_steps_updated_at on public.ra_pipeline_steps;
create trigger ra_pipeline_steps_updated_at before update on public.ra_pipeline_steps
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------
-- ra_evidence: the kit's evidence register, E01 onwards.
-- ---------------------------------------------------------------
create table if not exists public.ra_evidence (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references public.households (id) on delete cascade,
  code          text not null,
  period        text,
  topic         text,
  claim         text not null,
  figure        text,
  source        text,
  used_in       text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (household_id, code)
);

drop trigger if exists ra_evidence_updated_at on public.ra_evidence;
create trigger ra_evidence_updated_at before update on public.ra_evidence
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------
-- ra_sensitivity: which inputs moved which answer, and by how much.
-- Written by the engine (node tools/road-ahead.mjs agenda --snapshot)
-- and read by the calibration queue. Append-only.
-- ---------------------------------------------------------------
create table if not exists public.ra_sensitivity (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references public.households (id) on delete cascade,
  run_at        timestamptz not null default now(),
  scenario_key  text not null default 'base',
  output        text not null,
  variable_key  text not null,
  low           jsonb,
  high          jsonb,
  at_low        numeric(14,2),
  at_high       numeric(14,2),
  swing         numeric(14,2) not null,
  engine_version text not null,
  created_at    timestamptz not null default now()
);
create index if not exists ra_sensitivity_latest on public.ra_sensitivity (household_id, output, run_at desc);

-- ---------------------------------------------------------------
-- Append-only, enforced in the database as well as by policy, because
-- the connector runs as the owner of the tables and RLS does not bind
-- it. A superseding row is a new row.
-- ---------------------------------------------------------------
create or replace function public.ra_append_only()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception using errcode = 'restrict_violation',
    message = format('%s rows are never edited', TG_TABLE_NAME),
    hint = 'Write a new row; a newer one supersedes. Nothing here is rewritten.';
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['ra_road_runs','ra_appraisals','ra_judgements','ra_sensitivity'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_append_only', t);
    execute format('create trigger %I before update on public.%I for each row execute function public.ra_append_only()',
                   t || '_append_only', t);
  end loop;
end $$;

-- ---------------------------------------------------------------
-- decisions learns the road's vocabulary.
--
-- The kit's decisions log (G-D19 and the rest) lands in the same table
-- as the house's decisions, told apart by `domain`, so the Handbook
-- still shows only the house's. A decision still OPEN has no answer
-- yet, and may say so.
-- ---------------------------------------------------------------
alter table public.decisions add column if not exists code text;
alter table public.decisions add column if not exists domain text not null default 'house';
alter table public.decisions add column if not exists topic text;
alter table public.decisions add column if not exists firmness text;
alter table public.decisions add column if not exists door text;
alter table public.decisions add column if not exists evidence text;
alter table public.decisions add column if not exists certainty text;
alter table public.decisions add column if not exists reopen_if text;
alter table public.decisions add column if not exists checkpoint text;
alter table public.decisions add column if not exists source text;
alter table public.decisions alter column decided drop not null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'decisions_domain_check') then
    alter table public.decisions add constraint decisions_domain_check check (domain in ('house','road'));
    alter table public.decisions add constraint decisions_firmness_check check (firmness is null or firmness in ('locked','lean','open'));
    alter table public.decisions add constraint decisions_door_check check (door is null or door in ('one-way','two-way'));
    alter table public.decisions add constraint decisions_evidence_check check (evidence is null or evidence in ('STATED','VERIFIED','ESTIMATE','CHECK'));
    alter table public.decisions add constraint decisions_certainty_check check (certainty is null or certainty in ('H','M','L'));
    -- An unanswered decision is either still open or no longer in force (a
    -- question superseded before it was answered). coalesce: with no
    -- firmness the comparison is null, and a null CHECK passes.
    alter table public.decisions add constraint decisions_answered
      check (decided is not null or coalesce(firmness = 'open', false) or status <> 'active');
  end if;
end $$;

create unique index if not exists decisions_code_unique on public.decisions (household_id, code) where code is not null;

-- ---------------------------------------------------------------
-- The things Road Ahead lets knowledge_links point at.
-- ---------------------------------------------------------------
insert into public.link_entity_types (key, table_name, label, sort_order) values
  ('listing',     'ra_listings',   'Listing',              140),
  ('signal',      'ra_signals',    'Signal',               150),
  ('road',        'ra_roads',      'Road',                 160),
  ('ra_rule',     'ra_rules',      'Road Ahead rule',      170),
  ('ra_variable', 'ra_variables',  'Road Ahead variable',  180),
  ('judgement',   'ra_judgements', 'Judgement',            190),
  ('appraisal',   'ra_appraisals', 'Appraisal',            200),
  ('evidence',    'ra_evidence',   'Evidence',             210)
on conflict (key) do nothing;
