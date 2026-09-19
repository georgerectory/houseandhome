-- ------------------------------------------------------------------
-- 56_shopping.sql - The shopping list, and the rule that keeps it
-- honest.
--
-- THE PROBLEM THIS SOLVES. A renovation shopping list written in one
-- sitting is a list of everything anybody might ever need. It contains
-- a mini digger, a scaffold tower and a plate compactor on the day the
-- keys are collected, none of which will be touched for two years, and
-- the total at the bottom is therefore wrong by thousands. Worse, it is
-- wrong in the direction that makes the whole plan look unaffordable.
--
-- The owner's rule, in their words: "if there's no need to have a
-- digger the digger should be omitted from the project until a date
-- comes up where we're clearly gonna be needing a digger".
--
-- So an item is not in the list because somebody thought of it. It is
-- in the list because a JOB THAT IS ACTUALLY LIVE requires it. That
-- join already exists - `requires_material` in knowledge_links, "the
-- join that turns a job into a shopping list" - so this file adds no
-- column for it. It adds the DERIVATION: given the links and the state
-- of the jobs, which purchases are live right now.
--
-- Nothing here is stored. Change a job from someday to now and the
-- digger appears; drop the groundwork and it goes again. That is the
-- "adapts when the plans change" requirement, and it only holds because
-- the answer is computed every time it is asked.
-- ------------------------------------------------------------------

-- A stock target is a thing a job can require, like any other. Without
-- this a brick target cannot be joined to the wall it builds.
insert into public.link_entity_types (key, table_name, label, sort_order) values
  ('stock_target', 'stock_targets', 'Stockpile target', 135)
on conflict (key) do nothing;

-- ---------------------------------------------------------------
-- What counts as LIVE work.
--
-- One definition, one home. The shopping list, the totals and any
-- review session all have to agree on it or the list will say one thing
-- and the total another.
--
-- Live means somebody is about to need it: the job is under way, or it
-- is planned and sits in the near horizon. A `someday` job is a real
-- intention and keeps its links; it just does not put a jackhammer on
-- this month's list.
-- ---------------------------------------------------------------
create or replace function public.work_item_is_live(
  p_status text, p_horizon text
) returns boolean
language sql immutable parallel safe as $$
  select p_status in ('ready','in_progress')
      or (p_status = 'planned' and p_horizon in ('now','next'));
$$;

comment on function public.work_item_is_live(text, text) is
  'The single definition of "somebody is about to need this". Used by the shopping list and its totals so they cannot disagree.';

-- ---------------------------------------------------------------
-- shopping_list: every purchase, with the demand behind it.
--
-- SECURITY INVOKER IS NOT OPTIONAL - see the note in 55_stock.sql. A
-- view runs as its owner by default and would read past RLS.
-- ---------------------------------------------------------------
create or replace view public.shopping_list
with (security_invoker = on) as
select
  w.id,
  w.household_id,
  w.property_id,
  w.room_id,
  r.name                                        as room_name,
  w.title,
  w.summary,
  w.kind,
  w.trade,
  w.theme,
  w.phase,
  w.acquisition,
  w.status,
  w.horizon,
  w.cost_best,
  w.cost_expected,
  w.cost_worst,
  w.cost_confidence,
  w.effort,
  w.physical_demand,
  w.skill_level,
  w.benefit_type,
  w.priority,
  w.priority_score,
  w.tags,
  w.confidence,
  w.confirmed_at,
  -- Hire is not a purchase. A skip and a mini digger are real money and
  -- belong on the list, but they are never owned and must not be added
  -- to the value of what is in the shed.
  (w.acquisition = 'hire')                      as is_hire,
  -- Already owned: the row exists so the plan can see the need is
  -- covered, and it costs nothing.
  (w.acquisition = 'owned')                     as is_covered,
  coalesce(d.demand_count, 0)                   as demand_count,
  coalesce(d.live_demand_count, 0)              as live_demand_count,
  d.demanded_by,
  case
    when w.status in ('done','dropped')         then 'closed'
    when coalesce(d.demand_count, 0) = 0        then 'standalone'
    when coalesce(d.live_demand_count, 0) > 0   then 'live'
    else                                             'dormant'
  end                                           as demand_state,
  -- What it costs the list THIS time round. A dormant item is not
  -- zero-cost - it is not yet a cost at all - so it is excluded here
  -- and reported separately rather than quietly folded in.
  case
    when w.status in ('done','dropped')         then 0
    when w.acquisition = 'owned'                then 0
    when coalesce(d.demand_count, 0) > 0
     and coalesce(d.live_demand_count, 0) = 0   then 0
    else coalesce(w.cost_expected, 0)
  end                                           as cost_in_scope
from public.work_items w
left join public.rooms r on r.id = w.room_id
left join (
  select
    l.to_id,
    count(*)                                                as demand_count,
    count(*) filter (
      where public.work_item_is_live(j.status, j.horizon)
    )                                                       as live_demand_count,
    array_agg(j.title order by j.priority)                   as demanded_by
  from public.knowledge_links l
  join public.work_items j on j.id = l.from_id
  where l.kind = 'requires_material'
    and l.valid_to is null
    and l.from_type = 'work_item'
    and l.to_type = 'work_item'
    and j.status not in ('dropped')
  group by l.to_id
) d on d.to_id = w.id
where w.kind = 'purchase';

comment on view public.shopping_list is
  'Purchases with the demand behind them. demand_state is live, dormant, standalone or closed; cost_in_scope is zero for anything not yet needed, so a total over this view is what the project actually owes now.';

-- ---------------------------------------------------------------
-- shopping_totals: the number at the bottom, by phase.
--
-- Split three ways because they are three different kinds of money:
-- what will be owned, what is only rented, and what is parked until a
-- job wakes it up. A single total hides the third and flatters the
-- second.
-- ---------------------------------------------------------------
create or replace view public.shopping_totals
with (security_invoker = on) as
select
  s.household_id,
  coalesce(s.phase, 'unplaced')                 as phase,
  count(*) filter (where s.demand_state in ('live','standalone'))  as items_in_scope,
  count(*) filter (where s.demand_state = 'dormant')               as items_dormant,
  count(*) filter (where s.demand_state = 'closed')                as items_closed,
  -- coalesce, not bare sum: a FILTER that matches no row returns null,
  -- and a null in a money column reads as "unknown" when the answer is
  -- "nothing". Those are different answers and only one of them is true.
  round(coalesce(sum(s.cost_in_scope) filter (where not s.is_hire), 0), 2) as buy_cost,
  round(coalesce(sum(s.cost_in_scope) filter (where s.is_hire), 0), 2)     as hire_cost,
  round(coalesce(sum(s.cost_in_scope), 0), 2)                             as total_in_scope,
  -- What is waiting in the wings, so it is visible rather than a
  -- surprise in eighteen months.
  round(coalesce(sum(coalesce(s.cost_expected, 0))
        filter (where s.demand_state = 'dormant'), 0), 2)                 as dormant_cost,
  -- How much of the total rests on a figure nobody has checked. A
  -- total made of drafted estimates is a projection, and it has to say
  -- so on its own face.
  round(coalesce(sum(s.cost_in_scope)
        filter (where s.cost_confidence not in ('confirmed','actual')), 0), 2)
                                                                          as unconfirmed_cost
from public.shopping_list s
group by s.household_id, coalesce(s.phase, 'unplaced');

comment on view public.shopping_totals is
  'Shopping list money by phase. buy_cost and hire_cost are separate because hire is never owned; dormant_cost is what is parked behind work nobody has started; unconfirmed_cost is how much of the total is drafted rather than confirmed.';

-- ---------------------------------------------------------------
-- stock_plan: a stockpile target with the job it feeds.
--
-- The stockpile answers "how many do we have of how many we need".
-- This answers the question after it: is it on track for the date it
-- is needed, and is the job it feeds even live yet.
-- ---------------------------------------------------------------
create or replace view public.stock_plan
with (security_invoker = on) as
select
  s.*,
  -- Months left, and the rate the pile has to keep up to make it.
  case when s.needed_by is null then null
       else greatest(0, round(
         extract(epoch from (s.needed_by::timestamptz - now())) / (86400 * 30.44), 1)) end
                                                as months_remaining,
  case when s.needed_by is null or s.quantity_outstanding is null then null
       when s.needed_by <= current_date then s.quantity_outstanding
       else round(s.quantity_outstanding / greatest(0.5,
         extract(epoch from (s.needed_by::timestamptz - now())) / (86400 * 30.44)), 2) end
                                                as required_rate_per_month,
  -- Money already committed against the cap, so a cap can actually
  -- stop something.
  case when s.budget_cap is null then null
       else round(s.budget_cap - s.spent_so_far, 2) end
                                                as budget_remaining,
  case when s.budget_cap is null then null
       else s.spent_so_far > s.budget_cap end   as over_budget
from public.stock_status s;

comment on view public.stock_plan is
  'stock_status with the collecting rate the deadline implies and what is left of the budget cap. Everything derived; nothing stored.';
