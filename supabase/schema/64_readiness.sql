-- ------------------------------------------------------------------
-- 64_readiness.sql - what is actually doable, as opposed to what is next.
--
-- The roadmap ranks work by importance. That is a DIFFERENT QUESTION
-- from "what can I do this afternoon", and answering the second with
-- the first is how a list sends somebody to plaster a wall whose wiring
-- is not in, or to start a job whose materials are still a purchase
-- nobody has made.
--
-- Readiness is DERIVED from the links that already exist, never typed:
-- `must_precede` says what has to happen first, `requires_material`
-- says what has to be in the house first. Both already drive the
-- shopping list, which is the point - one set of edges, read three ways.
--
-- Numbered after 63 because it reads work_items and knowledge_links,
-- and the schema applies in numeric order.
-- ------------------------------------------------------------------

create or replace view public.work_item_readiness
with (security_invoker = on) as
with predecessors as (
  -- Open work that must happen before this item. Closed work is not a
  -- blocker: a job you have already done cannot hold anything up.
  select l.to_id as item_id, count(*) as open_count,
         string_agg(w.title, '; ' order by w.title) as waiting_on
  from public.knowledge_links l
  join public.work_items w on w.id = l.from_id
  where l.kind = 'must_precede' and l.valid_to is null
    and l.from_type = 'work_item' and l.to_type = 'work_item'
    and w.status not in ('done', 'dropped')
  group by l.to_id
),
materials as (
  -- Things this job needs that are not in the house yet. `owned` counts
  -- as in hand: the whole reason acquisition exists is that a thing you
  -- already have is not a thing you have to buy.
  select l.from_id as item_id, count(*) as missing_count,
         string_agg(m.title, '; ' order by m.title) as missing
  from public.knowledge_links l
  join public.work_items m on m.id = l.to_id
  where l.kind = 'requires_material' and l.valid_to is null
    and l.from_type = 'work_item' and l.to_type = 'work_item'
    and m.status not in ('done', 'dropped')
    and coalesce(m.acquisition, 'new') <> 'owned'
  group by l.from_id
)
select
  w.id, w.household_id, w.title, w.kind, w.trade, w.theme, w.status,
  w.horizon, w.phase, w.priority, w.priority_score, w.room_id,
  w.effort, w.skill_level, w.performed_by, w.physical_demand, w.two_person_job,
  w.setting, w.needs_daylight, w.weather_needs, w.season_window,
  w.duration_min_minutes, w.duration_max_minutes, w.min_session_minutes,
  w.cost_expected, w.cost_confidence, w.allocated_balance, w.tools_required,
  coalesce(p.open_count, 0)   as blocked_by,
  p.waiting_on,
  coalesce(m.missing_count, 0) as materials_missing,
  m.missing                    as missing_materials,
  -- FUNDED means the pot has already put the money aside, which is a
  -- different thing from affordable.
  coalesce(w.allocated_balance, 0) >= coalesce(w.cost_expected, 0) as is_funded,
  -- ONE label, in the order the obstacles actually bite. A job that is
  -- both blocked and unfunded is blocked: buying the materials would not
  -- let you start it.
  case
    when w.status in ('done', 'dropped')                then 'closed'
    when w.status = 'idea'                              then 'not_decided'
    when coalesce(p.open_count, 0) > 0                  then 'waiting_on_work'
    when coalesce(m.missing_count, 0) > 0               then 'waiting_on_materials'
    when w.status = 'blocked'                           then 'blocked'
    when coalesce(w.cost_expected, 0) > 0
         and coalesce(w.allocated_balance, 0) < coalesce(w.cost_expected, 0)
                                                        then 'waiting_on_money'
    else 'ready'
  end as readiness
from public.work_items w
left join predecessors p on p.item_id = w.id
left join materials m on m.item_id = w.id
where public.in_default_scope(w.household_id, w.property_id);

comment on view public.work_item_readiness is
  'Why each item cannot be started yet, derived from must_precede and requires_material rather than typed. The roadmap answers what matters most; this answers what is actually doable.';

-- ---------------------------------------------------------------
-- what_can_i_do_today(minutes, budget, setting)
--
-- SECURITY INVOKER, deliberately. It reads work_item_readiness, which
-- is security_invoker too, so the caller's own RLS decides what comes
-- back and this function cannot become a way round the policies.
--
-- AN UNKNOWN DURATION IS NOT A DURATION OF ZERO. The first cut used
-- coalesce(duration_min_minutes, 0) <= p_minutes, which quietly
-- answered "yes, it fits" for every item nobody has estimated - and
-- most are unestimated. That is the same mistake as letting a drafted
-- figure drive an allocation: the answer looks confident and is made of
-- nothing. Hiding those items is no better, because the list then
-- silently shrinks to the handful somebody happened to time. So they
-- come back flagged and sorted last, the same shape as shopping_totals
-- reporting unconfirmed_cost.
-- ---------------------------------------------------------------
create or replace function public.what_can_i_do_today(
  p_minutes integer default 120,
  p_budget  numeric default null,
  p_setting text default null
)
returns table (
  id uuid, title text, room_id uuid, trade text, priority integer,
  duration_min_minutes integer, duration_max_minutes integer,
  duration_known boolean, effort text, skill_level text,
  physical_demand text, two_person_job boolean,
  cost_expected numeric, is_funded boolean, tools_required text
)
language sql
stable
security invoker
set search_path = public
as $$
  select r.id, r.title, r.room_id, r.trade, r.priority,
         r.duration_min_minutes, r.duration_max_minutes,
         r.duration_min_minutes is not null as duration_known,
         r.effort, r.skill_level, r.physical_demand, r.two_person_job,
         r.cost_expected, r.is_funded, r.tools_required
  from public.work_item_readiness r
  where r.readiness = 'ready'
    -- The SHORTEST honest estimate has to fit. A job whose minimum is
    -- three hours is not an afternoon job, whatever its maximum says.
    and (r.duration_min_minutes is null or r.duration_min_minutes <= p_minutes)
    -- And it must be worth starting: a job needing a two-hour minimum
    -- session does not fit in ninety minutes even if its duration does.
    and coalesce(r.min_session_minutes, 0) <= p_minutes
    and (p_budget is null
         or r.is_funded
         or coalesce(r.cost_expected, 0) <= p_budget)
    and (p_setting is null or r.setting is null or r.setting = p_setting)
  order by (r.duration_min_minutes is null), r.priority nulls last,
           r.duration_min_minutes nulls last
$$;

comment on function public.what_can_i_do_today(integer, numeric, text) is
  'The jobs that fit the time, the money and the place right now. Ready means nothing must happen first and the materials are in the house. Items with no duration estimate come back with duration_known false and sort last: an unknown duration is reported, never assumed to be zero.';

revoke execute on function public.what_can_i_do_today(integer, numeric, text) from anon;
grant execute on function public.what_can_i_do_today(integer, numeric, text) to authenticated;
