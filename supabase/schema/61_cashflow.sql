-- ------------------------------------------------------------------
-- 61_cashflow.sql - money over TIME, and the merge of what was carried.
--
-- NOTHING IN THIS SCHEMA HAD A MONTH. There was a pot, a list of what
-- things cost, bills with a cadence and accounts with a balance - and
-- no way to ask "can I afford this in March". `bills.cost_class` was
-- added expressly so a running-cost total could be computed and was
-- then read by nothing at all. `carried_finance.investments_history`
-- carries a monthly time series from the old system and is flagged
-- "reference only" precisely because this one has nowhere to put it.
--
-- Three things are added:
--
--   THE MONTH. A cadence normaliser, income as a first-class thing,
--   and one view that puts money in against money out.
--
--   THE QUOTE. A priced offer from a named party was representable
--   only by abusing `invoices` with status='quoted'. There was no
--   expiry, no way to hold three competing offers and mark one chosen,
--   and - the giveaway - docs/PLAN.md shows the confidence ladder was
--   designed as guess/researched/QUOTED/actual and shipped without it.
--   A builder's written quote is neither "researched" nor "actual",
--   and forcing it into "confirmed" makes it indistinguishable from
--   something the owner verified personally.
--
--   THE MERGE. carried_finance holds 77 rows whose sum is meaningless,
--   because it adds a balance to a monthly rate to a historical event.
--   Those are different KINDS of number and nothing recorded which was
--   which. Now something does, and a row records where it went.
-- ------------------------------------------------------------------

-- ---------------------------------------------------------------
-- 'quoted' joins the confidence ladder, between researched and
-- confirmed.
--
-- TRUSTED, deliberately. A written quote from a named contractor is a
-- price somebody is offering to hold, which is a far better number
-- than anything this system can derive - and if it did not drive a
-- total, collecting three quotes would improve nothing.
-- ---------------------------------------------------------------
insert into public.confidence_levels (key, label, is_trusted, description, sort_order) values
  ('quoted', 'Quoted', true,
   'A written price from a named party, with a date it expires. Better evidenced than anything derived here, and it is what a contracted job should be planned against.', 35)
on conflict (key) do update
  set label = excluded.label,
      is_trusted = excluded.is_trusted,
      description = excluded.description,
      sort_order = excluded.sort_order;

-- ---------------------------------------------------------------
-- monthly_equivalent: one cadence, one number.
--
-- bills, subscriptions and income all carry a cadence as text and
-- nothing ever converted them, so a monthly bill and an annual one
-- could not be added together. Every caller would otherwise write its
-- own CASE, and they would disagree about how many weeks are in a
-- month within a fortnight.
-- ---------------------------------------------------------------
create or replace function public.monthly_equivalent(
  p_amount numeric, p_cadence text
) returns numeric
language sql immutable parallel safe
set search_path = public
as $$
  select case p_cadence
    when 'weekly'    then round(p_amount * 52 / 12.0, 2)
    when 'monthly'   then p_amount
    when 'quarterly' then round(p_amount / 3.0, 2)
    when 'biannual'  then round(p_amount / 6.0, 2)
    when 'annual'    then round(p_amount / 12.0, 2)
    -- A one-off is not a rate. Returning a twelfth of it would quietly
    -- turn a single payment into a standing cost.
    when 'one_off'   then 0
    -- Variable means the amount is a guess at an average, which is
    -- exactly what a monthly figure wants.
    when 'variable'  then p_amount
    else null
  end;
$$;

comment on function public.monthly_equivalent(numeric, text) is
  'A cadence normalised to one month. A one_off returns 0 - a single payment is not a standing cost - and an unknown cadence returns null rather than guessing.';

-- ---------------------------------------------------------------
-- income_sources: the side of the ledger that did not exist.
--
-- Without this there is no cash flow, only a spend list. `deposits`
-- looks like money in and is not: it is a contribution to the pot,
-- which is money that has already arrived being moved around.
-- ---------------------------------------------------------------
create table if not exists public.income_sources (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references public.households (id) on delete cascade,
  name          text not null,
  kind          text not null default 'salary'
    check (kind in ('salary','self_employed','benefit','rent','interest',
      'dividend','gift','one_off','other')),
  amount        numeric(12,2) check (amount is null or amount >= 0),
  cadence       text not null default 'monthly'
    check (cadence in ('weekly','monthly','quarterly','biannual','annual','one_off','variable')),
  -- NET OR GROSS is not a detail. Confusing the two is a 20-30% error
  -- on the single largest number in the whole system, and it is the
  -- mistake somebody makes at midnight rather than in a spreadsheet.
  basis         text not null default 'net'
    check (basis in ('net','gross')),
  starts_on     date,
  ends_on       date,
  is_active     boolean not null default true,
  confidence    text not null default 'drafted' references public.confidence_levels (key),
  confirmed_at  timestamptz,
  source_note   text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint income_sources_dates check (ends_on is null or starts_on is null or ends_on >= starts_on)
);

create unique index if not exists income_sources_name_uniq
  on public.income_sources (household_id, lower(name)) where is_active;

drop trigger if exists income_sources_updated_at on public.income_sources;
create trigger income_sources_updated_at before update on public.income_sources
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------
-- SOFT UNIQUENESS on bills and subscriptions.
--
-- There was no uniqueness of ANY kind on either, and the two tables
-- have near-identical shapes - so "TV licence" could live in both, or
-- twice in one, and nothing would notice. The moment a running-cost
-- total exists, that becomes a wrong number rather than a harmless
-- duplicate. Scoped to active rows, because a closed bill and its
-- replacement legitimately share a name.
-- ---------------------------------------------------------------
create unique index if not exists bills_name_uniq
  on public.bills (household_id, lower(name)) where is_active;
create unique index if not exists subscriptions_name_uniq
  on public.subscriptions (household_id, lower(name)) where is_active;

-- ---------------------------------------------------------------
-- quotes: a priced offer from a named party.
-- ---------------------------------------------------------------
create table if not exists public.quotes (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references public.households (id) on delete cascade,
  work_item_id  uuid references public.work_items (id) on delete set null,
  contractor_id uuid references public.contractors (id) on delete set null,
  -- Who quoted, when a contractor row does not exist yet. A price from
  -- a name scribbled on a pad is still a better number than an
  -- estimate, and demanding the contractor be entered first is how a
  -- quote ends up in a photograph instead.
  quoted_by     text,
  reference     text,
  amount        numeric(12,2) not null check (amount >= 0),
  -- Gross, net and the VAT rate, because a house empty two years may
  -- attract 5% rather than 20% and a quote that does not say which is
  -- a quote that cannot be compared with the one beside it.
  vat_rate      numeric(5,2) check (vat_rate is null or (vat_rate >= 0 and vat_rate <= 100)),
  includes_vat  boolean not null default true,
  includes_materials boolean not null default true,
  scope_note    text,
  excludes      text,
  quoted_on     date not null default current_date,
  -- A quote without an expiry is a price nobody is holding.
  valid_until   date,
  status        text not null default 'received'
    check (status in ('requested','received','accepted','rejected','expired','withdrawn')),
  -- Why this one, or why not. The rejected alternative is the half
  -- that is always lost, and it is the half that stops the same
  -- comparison being made twice.
  decision_note text,
  document_path text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint quotes_dates check (valid_until is null or valid_until >= quoted_on),
  constraint quotes_has_a_source check (contractor_id is not null or quoted_by is not null),
  constraint quotes_decision_note check (status not in ('rejected','withdrawn') or decision_note is not null)
);

create index if not exists quotes_item_idx on public.quotes (work_item_id, status);
create index if not exists quotes_household_idx on public.quotes (household_id, status);

-- ONE accepted quote per work item. Two accepted quotes for one job is
-- either a mistake or two jobs, and the database should say which.
create unique index if not exists quotes_one_accepted
  on public.quotes (work_item_id) where status = 'accepted' and work_item_id is not null;

drop trigger if exists quotes_updated_at on public.quotes;
create trigger quotes_updated_at before update on public.quotes
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------
-- payment_schedule: stage payments against an accepted quote.
--
-- invoices held one amount and one due date, so a 30/40/30 contract
-- had to be three unrelated rows with nothing tying them to one
-- agreement and no way to ask how much of the contract value is paid.
-- ---------------------------------------------------------------
create table if not exists public.payment_schedule (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references public.households (id) on delete cascade,
  quote_id      uuid not null references public.quotes (id) on delete cascade,
  stage_no      smallint not null check (stage_no > 0),
  description   text not null,
  amount        numeric(12,2) not null check (amount >= 0),
  due_on        date,
  -- What has to be true before it is payable. "On completion of the
  -- roof" is the difference between a schedule and a wish.
  trigger_note  text,
  paid_on       date,
  paid_amount   numeric(12,2) check (paid_amount is null or paid_amount >= 0),
  -- A retention is money deliberately NOT paid until snags are fixed,
  -- and it is the one part of a contract people forget they still owe.
  is_retention  boolean not null default false,
  invoice_id    uuid references public.invoices (id) on delete set null,
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (quote_id, stage_no)
);

create index if not exists payment_schedule_due_idx
  on public.payment_schedule (household_id, due_on) where paid_on is null;

drop trigger if exists payment_schedule_updated_at on public.payment_schedule;
create trigger payment_schedule_updated_at before update on public.payment_schedule
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------
-- carried_finance gains a KIND and a destination.
--
-- The archive sums to a number that means nothing, because it adds a
-- 36,265 ISA balance to a 2,306 monthly saving rate to a historical
-- investment event to a one-off cost. Those are four different kinds
-- of quantity. Recording which is what makes the merge possible; it
-- also makes it obvious why the total was never worth printing.
--
-- superseded_into_type / _id replace a free-prose superseded_note. A
-- note cannot answer "which carried lines became which bills", and
-- cannot detect a line re-entered twice into two different tables.
-- ---------------------------------------------------------------
alter table public.carried_finance
  add column if not exists money_kind text
    check (money_kind is null or money_kind in
      ('balance','monthly_rate','one_off','historical_event','asset','liability'));

alter table public.carried_finance
  add column if not exists superseded_into_type text
    check (superseded_into_type is null or superseded_into_type in
      ('bill','subscription','work_item','account','income_source','spend_event','stock_target'));
alter table public.carried_finance
  add column if not exists superseded_into_id uuid;

comment on column public.carried_finance.money_kind is
  'What KIND of quantity this is. A balance, a monthly rate and a historical event may never be added together, and the archive total was meaningless because nothing recorded the difference.';
comment on column public.carried_finance.superseded_into_type is
  'Where the row went when it was reviewed. Replaces free prose so the archive-to-ledger migration is queryable and a line re-entered twice is detectable.';

-- A superseded row has to say where it went.
alter table public.carried_finance
  drop constraint if exists carried_finance_superseded_destination;
alter table public.carried_finance
  add constraint carried_finance_superseded_destination
    check (review_status <> 'superseded'
           or superseded_into_type is not null
           or superseded_note is not null);

-- ---------------------------------------------------------------
-- cash_flow_month: money in against money out, per month.
--
-- SECURITY INVOKER IS NOT OPTIONAL - a view runs as its owner and
-- would read straight past RLS. The repository is public and ships the
-- anon key.
--
-- Only TRUSTED figures count, the same rule house_funds uses, and the
-- untrusted ones are reported beside rather than folded in - so a
-- surface can say what it left out instead of quietly understating.
-- ---------------------------------------------------------------
create or replace view public.cash_flow_month
with (security_invoker = on) as
with hh as (select id from public.households),
income as (
  select i.household_id,
         sum(public.monthly_equivalent(i.amount, i.cadence))
           filter (where cl.is_trusted)                        as income_in,
         sum(public.monthly_equivalent(i.amount, i.cadence))
           filter (where not cl.is_trusted)                    as income_unconfirmed
    from public.income_sources i
    join public.confidence_levels cl on cl.key = i.confidence
   where i.is_active
   group by i.household_id
),
billed as (
  select b.household_id,
         sum(public.monthly_equivalent(b.amount, b.cadence))
           filter (where cl.is_trusted)                        as bills_out,
         sum(public.monthly_equivalent(b.amount, b.cadence))
           filter (where not cl.is_trusted)                    as bills_unconfirmed,
         sum(public.monthly_equivalent(b.amount, b.cadence))
           filter (where cl.is_trusted and b.cost_class = 'running') as running_cost
    from public.bills b
    join public.confidence_levels cl on cl.key = b.confidence
   where b.is_active
   group by b.household_id
),
subbed as (
  select s.household_id,
         sum(public.monthly_equivalent(s.amount, s.cadence))
           filter (where cl.is_trusted)                        as subs_out,
         sum(public.monthly_equivalent(s.amount, s.cadence))
           filter (where not cl.is_trusted)                    as subs_unconfirmed
    from public.subscriptions s
    join public.confidence_levels cl on cl.key = s.confidence
   where s.is_active
   group by s.household_id
)
select
  hh.id                                        as household_id,
  coalesce(income.income_in, 0)                as income_in,
  coalesce(billed.bills_out, 0)                as bills_out,
  coalesce(subbed.subs_out, 0)                 as subscriptions_out,
  coalesce(billed.running_cost, 0)             as running_cost,
  round(coalesce(income.income_in, 0)
        - coalesce(billed.bills_out, 0)
        - coalesce(subbed.subs_out, 0), 2)     as surplus,
  -- What is NOT in the figures above, so a surplus cannot be read as
  -- fact when half its inputs are guesses.
  round(coalesce(income.income_unconfirmed, 0), 2)  as income_unconfirmed,
  round(coalesce(billed.bills_unconfirmed, 0)
        + coalesce(subbed.subs_unconfirmed, 0), 2)  as outgoings_unconfirmed,
  -- BOTH ANSWERS, neither of them lying - the pattern house_funds uses
  -- for net_position against available_to_draw.
  --
  -- `surplus` counts only what has been checked, which is right, and on
  -- a household whose bills are all carried-over it reads as though
  -- there are no outgoings at all. That is true and useless. This one
  -- counts everything, so the gap between the two IS the cost of not
  -- having confirmed the bills.
  round(coalesce(income.income_in, 0) + coalesce(income.income_unconfirmed, 0)
        - coalesce(billed.bills_out, 0) - coalesce(billed.bills_unconfirmed, 0)
        - coalesce(subbed.subs_out, 0) - coalesce(subbed.subs_unconfirmed, 0), 2)
                                                    as surplus_including_unconfirmed
from hh
left join income on income.household_id = hh.id
left join billed on billed.household_id = hh.id
left join subbed on subbed.household_id = hh.id;

comment on view public.cash_flow_month is
  'Money in against money out for a typical month, from trusted figures only, with the unconfirmed remainder reported beside rather than folded in.';

-- ---------------------------------------------------------------
-- quote_status: a quote with what is owed against it.
-- ---------------------------------------------------------------
create or replace view public.quote_status
with (security_invoker = on) as
select
  q.*,
  c.name                                       as contractor_name,
  w.title                                      as work_item_title,
  coalesce(p.staged, 0)                        as staged_total,
  coalesce(p.paid, 0)                          as paid_total,
  round(q.amount - coalesce(p.paid, 0), 2)     as outstanding,
  -- A schedule that does not add up to the contract is the error that
  -- shows up as a surprise final invoice.
  case when p.staged is null then null
       else round(q.amount - p.staged, 2) end  as unscheduled,
  (q.valid_until is not null and q.valid_until < current_date
     and q.status = 'received')                as has_expired
from public.quotes q
left join public.contractors c on c.id = q.contractor_id
left join public.work_items w on w.id = q.work_item_id
left join (
  select quote_id,
         sum(amount)                                   as staged,
         sum(coalesce(paid_amount, amount)) filter (where paid_on is not null) as paid
    from public.payment_schedule
   group by quote_id
) p on p.quote_id = q.id;

comment on view public.quote_status is
  'Quotes with what has been scheduled and paid against them. `unscheduled` is the contract value not yet covered by a stage, which is where a surprise final invoice comes from.';
