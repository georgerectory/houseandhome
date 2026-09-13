-- ------------------------------------------------------------------
-- 70_learning.sql - Learning from what actually happened.
--
-- Every completed item produces one estimate_outcomes row: what was
-- estimated, what it really cost and how long it really took. Those
-- accumulate into learned_factors - correction multipliers keyed by a
-- token like 'trade:decorating' or 'room:bathroom'.
--
-- THE DISCIPLINE THAT MATTERS HERE. With a handful of completed jobs
-- these factors are noise, and a noisy factor applied to a real budget
-- is worse than no factor at all. So:
--   * outcomes derived from unconfirmed data never count (is_trusted)
--   * a factor carries its sample size and a confidence tier
--   * a factor below the sample floor is 'forming' and is NOT applied
--   * the gate statistics of every run are logged, so the thresholds
--     get calibrated against real data rather than guessed once and
--     never revisited
--
-- The thresholds below are STARTING VALUES chosen to be conservative,
-- not derived constants. learning_runs exists precisely so they can be
-- corrected from evidence.
-- ------------------------------------------------------------------

create table if not exists public.estimate_outcomes (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references public.households (id) on delete cascade,
  work_item_id  uuid not null references public.work_items (id) on delete cascade,
  -- Denormalised at completion time on purpose: the item may later be
  -- re-categorised, and an outcome must describe the world as it was
  -- when the work happened.
  trade         text,
  room_type     text,
  kind          text,
  skill_level   text,
  cost_expected numeric(12,2),
  cost_actual   numeric(12,2),
  cost_ratio    numeric(10,4),
  minutes_expected integer,
  minutes_actual   integer,
  minutes_ratio numeric(10,4),
  -- False when the estimate it is measured against was never confirmed.
  -- Untrusted outcomes are recorded (they are still history) but are
  -- excluded from factor derivation.
  is_trusted    boolean not null default false,
  completed_on  date not null default current_date,
  created_at    timestamptz not null default now()
);

create index if not exists estimate_outcomes_household_idx
  on public.estimate_outcomes (household_id, completed_on desc);
create index if not exists estimate_outcomes_trusted_idx
  on public.estimate_outcomes (household_id, trade) where is_trusted;

-- Correction factors, keyed by token. A factor of 1.30 on
-- 'trade:decorating' means decorating jobs have historically cost 30%
-- more than estimated.
create table if not exists public.learned_factors (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references public.households (id) on delete cascade,
  token         text not null,
  metric        text not null check (metric in ('cost','duration')),
  factor        numeric(10,4) not null,
  sample_count  integer not null default 0,
  -- Exponentially time-decayed sample count. Recent evidence counts for
  -- more, so a factor learned from last year's habits fades rather than
  -- persisting as fact.
  effective_sample numeric(10,4) not null default 0,
  -- forming: below the sample floor, NOT applied to any estimate.
  tier          text not null default 'forming'
    check (tier in ('forming','probable','confident','strong')),
  is_applied    boolean not null default false,
  last_run_at   timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (household_id, token, metric)
);

create index if not exists learned_factors_applied_idx
  on public.learned_factors (household_id, metric) where is_applied;

drop trigger if exists learned_factors_updated_at on public.learned_factors;
create trigger learned_factors_updated_at before update on public.learned_factors
  for each row execute function public.set_updated_at();

-- One row per derivation run. gate_stats records how many candidate
-- tokens cleared each gate, which is what makes the thresholds
-- calibratable instead of permanently guessed.
create table if not exists public.learning_runs (
  id             uuid primary key default gen_random_uuid(),
  household_id   uuid not null references public.households (id) on delete cascade,
  ran_at         timestamptz not null default now(),
  outcomes_considered integer not null default 0,
  outcomes_trusted    integer not null default 0,
  tokens_evaluated    integer not null default 0,
  factors_applied     integer not null default 0,
  config         jsonb not null default '{}'::jsonb,
  gate_stats     jsonb not null default '{}'::jsonb
);

create index if not exists learning_runs_household_idx
  on public.learning_runs (household_id, ran_at desc);

-- Adaptive messaging. A trend is only useful if it is reported in
-- specific terms - what is happening, what it means, what to do - so
-- the template carries all three rather than a bare warning string.
create table if not exists public.insight_messages (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references public.households (id) on delete cascade,
  key           text not null,
  severity      text not null default 'info'
    check (severity in ('info','watch','warning','urgent')),
  headline      text not null,
  what_it_means text,
  what_to_do    text,
  evidence      jsonb not null default '{}'::jsonb,
  status        text not null default 'active'
    check (status in ('active','acknowledged','dismissed','resolved')),
  -- A dismissed message must not reappear next run. Mirrors the
  -- dismissals pattern that stops a suggestion engine nagging.
  dismissed_until date,
  first_seen_at timestamptz not null default now(),
  last_seen_at  timestamptz not null default now(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (household_id, key)
);

create index if not exists insight_messages_active_idx
  on public.insight_messages (household_id, severity) where status = 'active';

drop trigger if exists insight_messages_updated_at on public.insight_messages;
create trigger insight_messages_updated_at before update on public.insight_messages
  for each row execute function public.set_updated_at();
