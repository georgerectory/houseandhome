-- ------------------------------------------------------------------
-- 55_stock.sql - Things bought a few at a time, long before they are
-- needed.
--
-- WHY THIS IS NOT JUST A PURCHASE.
--
-- A work_item of kind 'purchase' answers "buy this thing, once, for
-- about this much". That is the right shape for a paint steamer. It is
-- the wrong shape for four thousand reclaimed Victorian bricks, and the
-- difference is not size - it is that the brick has four properties a
-- purchase does not:
--
--   A QUANTITY YOU HAVE TO COUNT TOWARD. Not "bought / not bought" but
--   380 of 4,200. Progress is a fraction, and the useful question is
--   how far off you are.
--
--   AN ACQUISITION THAT HAPPENS MANY TIMES. Fifty here, two hundred
--   there, over two years, at different prices from different sellers.
--   Each haul is a fact with a date and a price, and the running total
--   is the sum of them - DERIVED, never typed, because a stored total
--   and a list of hauls will disagree within a month.
--
--   A SPECIFICATION TIGHT ENOUGH TO MATCH AGAINST. "Reclaimed brick" is
--   not a specification; you cannot look at a Marketplace listing and
--   tell whether it counts. "Imperial, 9 x 4 3/8 x 2 5/8in, soft red,
--   sand-struck, circa 1880" is. Without that, a stockpile becomes a
--   pile of things that nearly match, which is worse than no stockpile:
--   you cannot build a wall out of nearly.
--
--   A REASON THE QUANTITY IS WHAT IT IS. 4,200 has to come from
--   somewhere checkable - a wall area off the building model times a
--   bricks-per-square-metre rate - or it is a guess that will be out by
--   a thousand and nobody will know until the wall stops.
--
-- The whole point is money. Reclaimed materials collected over two
-- years cost a fraction of the same thing bought in a week when the
-- builder needs it, and the same is true of anything bought in bulk
-- ahead of a decision. That only works if the target, the spec and the
-- running total live somewhere that survives between conversations.
-- ------------------------------------------------------------------

-- ---------------------------------------------------------------
-- stock_targets: a thing we are accumulating, and how many.
-- ---------------------------------------------------------------
create table if not exists public.stock_targets (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references public.households (id) on delete cascade,
  property_id   uuid references public.properties (id) on delete set null,
  room_id       uuid references public.rooms (id) on delete set null,
  -- The job this feeds. A stockpile with no job behind it is hoarding.
  work_item_id  uuid references public.work_items (id) on delete set null,
  -- Which structural state needs it, where that is known: a brick for
  -- the extension is not needed until the extension is.
  stage_key     text,

  name          text not null,
  category      text not null default 'other'
    check (category in ('brick','block','slab','gravel','aggregate','timber',
      'tile','sanitaryware','radiator','tap','sink','ironmongery','glazing',
      'flooring','insulation','planting','fixture','other')),

  -- THE MATCHING FINGERPRINT. Prose, deliberately: dimensions, colour,
  -- texture, age, finish, whatever makes a listing recognisable as the
  -- same thing. This is the field that decides whether a stockpile is
  -- usable, so it is not null.
  spec          text not null,
  -- A second chance at the same job: what would disqualify a candidate
  -- that otherwise looks right.
  reject_if     text,

  -- Where it comes from. 'either' is honest for things where reclaimed
  -- is preferred but new would do.
  acquisition   text not null default 'either'
    check (acquisition in ('reclaimed','new','either','salvaged_on_site')),

  unit          text not null default 'each',
  quantity_needed numeric(12,2) check (quantity_needed is null or quantity_needed >= 0),
  -- HOW THAT NUMBER WAS ARRIVED AT, in words. A quantity with no basis
  -- is a guess wearing a decimal point.
  quantity_basis text,
  quantity_confidence text not null default 'drafted'
    references public.confidence_levels (key),
  -- Breakage, cutting and the ones that turn out not to match. Applied
  -- on top of quantity_needed to give the number actually to collect.
  wastage_pct   numeric(5,2) not null default 0
    check (wastage_pct >= 0 and wastage_pct <= 100),

  -- Money. Both prices, because the whole argument for stockpiling is
  -- the gap between them.
  unit_price_reclaimed numeric(12,2) check (unit_price_reclaimed is null or unit_price_reclaimed >= 0),
  unit_price_new       numeric(12,2) check (unit_price_new is null or unit_price_new >= 0),
  price_confidence text not null default 'drafted' references public.confidence_levels (key),
  price_source  text,
  budget_cap    numeric(12,2) check (budget_cap is null or budget_cap >= 0),

  -- Where the pile physically is, because a stockpile you cannot find
  -- or cannot keep dry is a liability.
  storage_location_id uuid references public.storage_locations (id) on delete set null,
  storage_note  text,

  -- When collecting has to start and stop being useful.
  collect_from  date,
  needed_by     date,

  status        text not null default 'collecting'
    check (status in ('idea','collecting','complete','paused','dropped')),
  -- Closes, never deletes.
  resolution    text,
  resolved_at   timestamptz,

  notes         text,
  tags          text[] not null default '{}',
  confidence    text not null default 'drafted' references public.confidence_levels (key),
  confirmed_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  -- A spec is the whole value of the row, so an empty one is refused.
  constraint stock_targets_spec_not_blank check (length(btrim(spec)) > 0),
  -- Closing a line says why, like everything else here.
  constraint stock_targets_resolution_required
    check (status not in ('complete','dropped') or resolution is not null)
);

create index if not exists stock_targets_household_idx
  on public.stock_targets (household_id, status);
create index if not exists stock_targets_category_idx
  on public.stock_targets (household_id, category);
create index if not exists stock_targets_work_item_idx
  on public.stock_targets (work_item_id) where work_item_id is not null;

drop trigger if exists stock_targets_updated_at on public.stock_targets;
create trigger stock_targets_updated_at before update on public.stock_targets
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------
-- stock_acquisitions: one haul.
--
-- The running total is the sum of these and is never stored on the
-- target. Two places holding one number is how a stockpile ends up
-- saying 400 when there are 340 in the shed.
-- ---------------------------------------------------------------
create table if not exists public.stock_acquisitions (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references public.households (id) on delete cascade,
  stock_target_id uuid not null references public.stock_targets (id) on delete cascade,

  acquired_on   date not null default current_date,
  quantity      numeric(12,2) not null check (quantity <> 0),
  -- Negative quantities are how breakage and rejects leave the pile
  -- without a row being deleted: "twelve turned out to be wirecut, not
  -- sand-struck" is a fact worth keeping.
  reason        text,

  unit_price    numeric(12,2) check (unit_price is null or unit_price >= 0),
  total_paid    numeric(12,2) check (total_paid is null or total_paid >= 0),
  source        text,
  condition     text not null default 'good'
    check (condition in ('new','good','used','worn','broken','mixed')),
  -- Did it actually match the spec? Recorded per haul, because the
  -- answer is usually "mostly".
  matches_spec  boolean,
  notes         text,
  confidence    text not null default 'actual' references public.confidence_levels (key),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists stock_acquisitions_target_idx
  on public.stock_acquisitions (stock_target_id, acquired_on desc);

drop trigger if exists stock_acquisitions_updated_at on public.stock_acquisitions;
create trigger stock_acquisitions_updated_at before update on public.stock_acquisitions
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------
-- stock_status: the target with its running total attached.
--
-- A VIEW, so the total cannot drift from the hauls it is made of. Every
-- figure on it is derived; nothing here is stored.
-- ---------------------------------------------------------------
-- SECURITY INVOKER IS NOT OPTIONAL. A Postgres view runs with the
-- privileges of its OWNER by default, which means it reads straight
-- past the row level security on the tables underneath it. This
-- repository is public and ships the anon key; a view without this
-- setting would hand every household's stockpile to anyone holding it.
-- The same rule as rule 2 in CLAUDE.md, one level up.
create or replace view public.stock_status
with (security_invoker = on) as
select
  t.*,
  coalesce(a.held, 0)                         as quantity_held,
  coalesce(a.hauls, 0)                        as haul_count,
  coalesce(a.spent, 0)                        as spent_so_far,
  a.last_acquired_on,
  -- With wastage applied: what actually has to be collected.
  case when t.quantity_needed is null then null
       else round(t.quantity_needed * (1 + t.wastage_pct / 100), 2) end
                                              as quantity_to_collect,
  case when t.quantity_needed is null then null
       else greatest(0, round(t.quantity_needed * (1 + t.wastage_pct / 100)
                              - coalesce(a.held, 0), 2)) end
                                              as quantity_outstanding,
  case when t.quantity_needed is null or t.quantity_needed = 0 then null
       else least(100, round(coalesce(a.held, 0)
            / (t.quantity_needed * (1 + t.wastage_pct / 100)) * 100, 1)) end
                                              as pct_collected,
  -- What the outstanding balance would cost at each price, so the
  -- saving the stockpile is chasing is visible rather than assumed.
  case when t.unit_price_reclaimed is null or t.quantity_needed is null then null
       else round(greatest(0, t.quantity_needed * (1 + t.wastage_pct / 100)
                           - coalesce(a.held, 0)) * t.unit_price_reclaimed, 2) end
                                              as outstanding_cost_reclaimed,
  case when t.unit_price_new is null or t.quantity_needed is null then null
       else round(greatest(0, t.quantity_needed * (1 + t.wastage_pct / 100)
                           - coalesce(a.held, 0)) * t.unit_price_new, 2) end
                                              as outstanding_cost_new,
  -- The whole argument, in one number: what buying the lot new at the
  -- end would cost against collecting it reclaimed.
  case when t.unit_price_new is null or t.unit_price_reclaimed is null
         or t.quantity_needed is null then null
       else round(t.quantity_needed * (1 + t.wastage_pct / 100)
                  * (t.unit_price_new - t.unit_price_reclaimed), 2) end
                                              as saving_if_reclaimed
from public.stock_targets t
left join (
  select stock_target_id,
         sum(quantity)                        as held,
         count(*)                             as hauls,
         sum(coalesce(total_paid, quantity * coalesce(unit_price, 0))) as spent,
         max(acquired_on)                     as last_acquired_on
  from public.stock_acquisitions
  group by stock_target_id
) a on a.stock_target_id = t.id;

comment on view public.stock_status is
  'stock_targets with the running total derived from stock_acquisitions. Never store quantity_held on the target.';

-- ---------------------------------------------------------------
-- work_items gains two columns the shopping list needs.
-- ---------------------------------------------------------------

-- HOW a purchase is come by. Hire is the one that matters most: a
-- digger is not bought, and a list that cannot say so will either price
-- it as a purchase or leave it out.
alter table public.work_items
  add column if not exists acquisition text not null default 'new'
    check (acquisition in ('new','reclaimed','either','hire','owned','gift'));

comment on column public.work_items.acquisition is
  'new by default. hire covers plant and skips; owned means it is already in the inventory and the row exists only so the plan can see it is covered.';

-- WHICH PHASE of the project needs it. `horizon` says when the work is
-- affordable; this says which part of the project it belongs to, and
-- they are not the same question. A dust suit is needed during the
-- strip-out whenever that happens to fall.
alter table public.work_items
  add column if not exists phase text
    check (phase in ('before_purchase','move_in','strip_out','first_year',
      'second_year','extension','fit_out','garden','ongoing'));

comment on column public.work_items.phase is
  'Which part of the project needs this, as opposed to when it can be afforded. Null means it has not been placed yet.';

create index if not exists work_items_phase_idx
  on public.work_items (household_id, phase) where phase is not null;
