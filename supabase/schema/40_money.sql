-- ------------------------------------------------------------------
-- 40_money.sql - One pot, and the ledger that ties it to the roadmap.
--
-- The rule, in full:
--   * ONE pot funds ONE list. Renovation work and things to buy are not
--     separate pots; they are the same money against a categorised list,
--     because separate pots fragment and drift out of proportion.
--   * EVERY open fundable item receives a NON-ZERO share of EVERY
--     deposit - even a fraction of a penny. Nothing starves.
--   * Share is driven by PRIORITY, not by cost. The top item takes the
--     largest share whether it costs £20 or £4,000.
--   * Completed items release their share back into the pool, so the
--     remaining items accelerate. Waterfall and snowball at once.
--   * Any change to the list re-proportions the NEXT deposit
--     automatically. No manual rebalancing, ever.
--
-- allocations is append-only and is the permanent audit trail of how
-- every penny was distributed. work_items.allocated_balance is a
-- running cache of it, maintained by the trigger below, so the funding
-- view does not have to aggregate the whole ledger on every read.
-- ------------------------------------------------------------------

create table if not exists public.pots (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  name         text not null default 'House pot',
  -- The standing monthly contribution. Nullable on purpose: until the
  -- owner confirms a real figure this is unknown, and the engine
  -- refuses to run rather than inventing one.
  monthly_contribution numeric(12,2) check (monthly_contribution is null or monthly_contribution >= 0),
  contribution_confidence text not null default 'drafted' references public.confidence_levels (key),
  -- Money in the pot not yet attributed to any item (e.g. released by a
  -- cancelled item between deposits).
  unallocated_balance numeric(14,6) not null default 0,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create unique index if not exists pots_one_active_per_household
  on public.pots (household_id) where is_active;

drop trigger if exists pots_updated_at on public.pots;
create trigger pots_updated_at before update on public.pots
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------
-- deposits: a contribution event. Allocation is triggered by a deposit,
-- not accrued daily, because that is how the money actually arrives.
-- ---------------------------------------------------------------
create table if not exists public.deposits (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  pot_id       uuid not null references public.pots (id) on delete cascade,
  amount       numeric(12,2) not null check (amount > 0),
  deposited_on date not null default current_date,
  source       text,
  note         text,
  -- Set once the allocation run for this deposit has been written.
  allocated_at timestamptz,
  -- Snapshot of the weighting parameters used, so a historic run can be
  -- explained even after the settings change.
  weights_snapshot jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now()
);

create index if not exists deposits_pot_idx on public.deposits (pot_id, deposited_on desc);

-- ---------------------------------------------------------------
-- allocations: one row per deposit per item. THE join between the
-- roadmap and the money. Append-only: a correction is a new deposit
-- with a negative-sum adjustment, never an edit, so the ledger always
-- reconstructs the balance.
-- ---------------------------------------------------------------
create table if not exists public.allocations (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  deposit_id   uuid not null references public.deposits (id) on delete cascade,
  work_item_id uuid not null references public.work_items (id) on delete cascade,
  -- Normalised share of this deposit, 0 < weight <= 1.
  weight       numeric(12,10) not null check (weight > 0 and weight <= 1),
  amount       numeric(14,6) not null check (amount >= 0),
  rank_at_run  integer not null,
  created_at   timestamptz not null default now(),
  unique (deposit_id, work_item_id)
);

create index if not exists allocations_item_idx on public.allocations (work_item_id);

-- Keep work_items.allocated_balance in step with the ledger. A cache,
-- not a second source of truth: reconcile_allocated_balances() in
-- 80_functions.sql rebuilds it from allocations and is the arbiter.
create or replace function public.apply_allocation_to_item()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  update public.work_items
     set allocated_balance = allocated_balance + new.amount,
         fully_funded_at = case
           when fully_funded_at is null
                and cost_expected is not null
                and allocated_balance + new.amount >= cost_expected
           then now() else fully_funded_at end
   where id = new.work_item_id;
  return new;
end;
$$;

drop trigger if exists allocations_apply on public.allocations;
create trigger allocations_apply after insert on public.allocations
  for each row execute function public.apply_allocation_to_item();

-- ---------------------------------------------------------------
-- bills and subscriptions. Separated because a bill is a fact of
-- owning the house and a subscription is a choice that gets reviewed;
-- they have different cancellation behaviour and different questions.
-- ---------------------------------------------------------------
create table if not exists public.bills (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  name         text not null,
  provider     text,
  category     text not null default 'other'
    check (category in ('energy','water','council_tax','broadband','mobile','insurance',
      'mortgage','tv_licence','waste','service_charge','ground_rent','maintenance','other')),
  amount       numeric(12,2) check (amount is null or amount >= 0),
  cadence      text not null default 'monthly'
    check (cadence in ('weekly','monthly','quarterly','biannual','annual','one_off','variable')),
  due_day      smallint check (due_day is null or due_day between 1 and 31),
  next_due_on  date,
  is_variable  boolean not null default false,
  is_active    boolean not null default true,
  -- Whether this counts toward the running-cost total. The distinction
  -- between a running cost, a one-off setup cost and renovation spend
  -- is a real classification question, so it is a column rather than an
  -- assumption baked into a query.
  cost_class   text not null default 'running'
    check (cost_class in ('running','setup','renovation','discretionary')),
  confidence   text not null default 'drafted' references public.confidence_levels (key),
  confirmed_at timestamptz,
  notes        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists bills_household_idx
  on public.bills (household_id, is_active, next_due_on);

drop trigger if exists bills_updated_at on public.bills;
create trigger bills_updated_at before update on public.bills
  for each row execute function public.set_updated_at();

create table if not exists public.subscriptions (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  name         text not null,
  provider     text,
  amount       numeric(12,2) check (amount is null or amount >= 0),
  cadence      text not null default 'monthly'
    check (cadence in ('weekly','monthly','quarterly','annual')),
  renews_on    date,
  is_active    boolean not null default true,
  value_rating smallint check (value_rating is null or value_rating between 1 and 5),
  review_on    date,
  confidence   text not null default 'drafted' references public.confidence_levels (key),
  confirmed_at timestamptz,
  notes        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

drop trigger if exists subscriptions_updated_at on public.subscriptions;
create trigger subscriptions_updated_at before update on public.subscriptions
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------
-- spend_events: ad hoc "I just spent £X". Deliberately permissive -
-- money gets reported in whatever form it arrives, and a capture
-- mechanism that demands structure is one that stops being used.
-- ---------------------------------------------------------------
create table if not exists public.spend_events (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  work_item_id uuid references public.work_items (id) on delete set null,
  amount       numeric(12,2) not null,
  spent_on     date not null default current_date,
  description  text not null,
  vendor       text,
  channel      text check (channel is null or channel in ('amazon','marketplace',
    'reclamation','trade_counter','high_street','online','second_hand','other')),
  cost_class   text not null default 'renovation'
    check (cost_class in ('running','setup','renovation','discretionary')),
  confidence   text not null default 'actual' references public.confidence_levels (key),
  created_at   timestamptz not null default now()
);

create index if not exists spend_events_household_idx
  on public.spend_events (household_id, spent_on desc);
create index if not exists spend_events_item_idx on public.spend_events (work_item_id);

-- ---------------------------------------------------------------
-- price_references: what a thing actually costs, per channel, captured
-- on a date. Two jobs: it makes an estimate defensible, and it makes
-- "is this worth buying second hand" answerable with a number.
-- captured_on exists so staleness is visible rather than assumed away.
-- ---------------------------------------------------------------
create table if not exists public.price_references (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  work_item_id uuid references public.work_items (id) on delete set null,
  item_label   text not null,
  channel      text not null
    check (channel in ('amazon','marketplace','reclamation','trade_counter',
      'high_street','online','second_hand','other')),
  price_low    numeric(12,2),
  price_typical numeric(12,2),
  price_high   numeric(12,2),
  unit         text not null default 'each',
  source_note  text,
  captured_on  date not null default current_date,
  confidence   text not null default 'researched' references public.confidence_levels (key),
  created_at   timestamptz not null default now()
);

create index if not exists price_references_item_idx on public.price_references (work_item_id);
create index if not exists price_references_label_idx on public.price_references (household_id, item_label);

-- ---------------------------------------------------------------
-- carried_finance: the archive of the previous system's figures.
--
-- Deliberately a single loose table rather than a normalised model.
-- These rows are NOT a ledger - they are a prompt sheet of things once
-- listed, captured during a property search that has since moved on.
-- Normalising them would dignify them as facts. They exist so nothing
-- is forgotten, are excluded from every total and projection, and are
-- retired as each is reviewed and re-entered properly.
-- ---------------------------------------------------------------
create table if not exists public.carried_finance (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  source_group text not null,
  label        text not null,
  amount       numeric(12,2),
  cadence      text,
  raw          jsonb not null default '{}'::jsonb,
  -- Always 'carried_over' on arrival. A row leaves this table by being
  -- reviewed: either re-entered into bills/subscriptions/work_items and
  -- marked superseded, or dismissed with a reason.
  review_status text not null default 'pending'
    check (review_status in ('pending','superseded','dismissed')),
  superseded_note text,
  reviewed_at  timestamptz,
  -- Provenance and the natural key. These figures cross from another
  -- Supabase account as a JSON file, because this session can only be
  -- authenticated to one account at a time. That makes loading a
  -- REPEATABLE operation: an extract may be re-run and a load may be
  -- interrupted, and neither must leave a second copy of a line.
  -- source_ref is the row's identity in the system it came from.
  source_system text not null default 'rec',
  source_ref   text not null default '',
  captured_at  timestamptz,
  batch_id     uuid,
  created_at   timestamptz not null default now()
);

create unique index if not exists carried_finance_source_key
  on public.carried_finance (household_id, source_system, source_group, source_ref);

create index if not exists carried_finance_review_idx
  on public.carried_finance (household_id, review_status, source_group);

comment on table public.carried_finance is
  'Archive of figures migrated from an earlier system. Never a source of truth: excluded from all totals until reviewed and re-entered.';

-- ---------------------------------------------------------------
-- accounts - what is actually held, right now.
--
-- carried_finance is an ARCHIVE of what another system once said, and
-- pots.unallocated_balance is the house pot. Neither is a statement of
-- present position, so without this table the question "what do I
-- actually have toward the deposit" cannot be answered from the
-- database at all.
--
-- A liability carries a POSITIVE balance meaning "owed", with
-- is_liability true. Keeping the sign out of the number means a total
-- can never be wrong because somebody forgot which way round a debt
-- goes. facility_limit separates "available" from "mine": a bank
-- showing 392.62 available against a 1000 overdraft is 607.38
-- OVERDRAWN, and those are not the same fact.
-- ---------------------------------------------------------------
create table if not exists public.accounts (
  id             uuid primary key default gen_random_uuid(),
  household_id   uuid not null references public.households (id) on delete cascade,
  name           text not null,
  provider       text,
  kind           text not null
    check (kind in ('current_account','savings','isa','investment','pension',
                    'credit_card','overdraft','loan','cash','other')),
  is_liability   boolean not null default false,
  balance        numeric(14,2),
  facility_limit numeric(14,2),
  earmark_pct    smallint not null default 0 check (earmark_pct between 0 and 100),
  earmarked_for  text,
  as_of          date,
  confidence     text not null default 'drafted'
    references public.confidence_levels (key),
  confirmed_at   timestamptz,
  notes          text,
  is_active      boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (household_id, name)
);

create index if not exists accounts_household_idx
  on public.accounts (household_id, is_active, kind);

drop trigger if exists accounts_updated_at on public.accounts;
create trigger accounts_updated_at before update on public.accounts
  for each row execute function public.set_updated_at();

-- Two questions, two answers, neither of them lying.
--
--   net_position      what is actually YOURS. What a deposit is built
--                     from, and what a lender will recognise.
--   available_to_draw net position plus every undrawn facility. What
--                     could be laid hands on today, borrowing included.
--
-- Keeping them apart is the whole point. An overdraft adds to the second
-- and nothing to the first: drawing it moves money from "available" to
-- "owed", it does not create any.
--
-- Only TRUSTED figures count, the same rule the allocation engine lives
-- by, and unconfirmed_accounts is returned alongside so a surface can
-- say how much is being left out rather than quietly understating.
--
-- undrawn works for a facility from either side: an account in credit
-- with a 1000 limit has 1000 undrawn; one overdrawn by 607.38 against
-- the same limit has 392.62 left.
--
-- security_invoker is NOT optional. A view runs with its creator's
-- permissions by default, which would read straight past row-level
-- security and hand one household another's balances.
create or replace view public.house_funds
with (security_invoker = on) as
select a.household_id,
       sum(case when not a.is_liability and cl.is_trusted
                then coalesce(a.balance,0) * a.earmark_pct / 100.0 else 0 end) as earmarked_assets,
       sum(case when not a.is_liability and cl.is_trusted
                then coalesce(a.balance,0) else 0 end) as total_assets,
       sum(case when a.is_liability and cl.is_trusted
                then coalesce(a.balance,0) else 0 end) as total_liabilities,
       sum(case when cl.is_trusted
                then coalesce(a.balance,0) * (case when a.is_liability then -1 else 1 end)
                else 0 end) as net_position,
       sum(case when cl.is_trusted then greatest(
                coalesce(a.facility_limit,0)
                  - (case when a.is_liability then coalesce(a.balance,0) else 0 end), 0)
                else 0 end) as undrawn_facilities,
       sum(case when cl.is_trusted
                then coalesce(a.balance,0) * (case when a.is_liability then -1 else 1 end)
                   + greatest(coalesce(a.facility_limit,0)
                     - (case when a.is_liability then coalesce(a.balance,0) else 0 end), 0)
                else 0 end) as available_to_draw,
       count(*) filter (where not cl.is_trusted) as unconfirmed_accounts
  from public.accounts a
  join public.confidence_levels cl on cl.key = a.confidence
 where a.is_active
 group by a.household_id;

-- ---------------------------------------------------------------
-- basis - the difference between a fact and a forecast.
--
-- A water bill for a house nobody owns cannot ever be observed, so it
-- can never be 'actual'. The owner can still endorse 30 a month as a
-- sensible prediction. confidence says how well evidenced a number is;
-- basis says what KIND of claim it is. Conflating them is how a guess
-- about a house that does not exist ends up reading like a statement.
-- ---------------------------------------------------------------
alter table public.bills
  add column if not exists basis text not null default 'current'
    check (basis in ('current','predicted'));

comment on column public.bills.basis is
  'current: a bill being paid today. predicted: a forecast for a house not yet owned, which can be confirmed as a sensible estimate but never observed.';
