-- ------------------------------------------------------------------
-- 65_diary.sql - the dates, as one list.
--
-- Milestones and scheduled events answer the same question from two
-- tables. A MILESTONE is a date the plan has to hit; an EVENT is a date
-- somebody else set. A dashboard showing only one of them would be
-- confidently wrong in exactly the week that matters - the agent's open
-- house is not in the plan's gift, and on the day this was written it
-- was the most urgent thing in the system by a wide margin.
--
-- `days_until` is computed HERE rather than in the page, because two
-- surfaces counting days from a date is two chances to get a timezone
-- wrong, and a countdown that is a day out is worse than no countdown.
-- The event side converts through Europe/London before taking the date,
-- so an 11am viewing does not land on the previous day in summer.
-- ------------------------------------------------------------------

create or replace view public.whats_next
with (security_invoker = on) as
select
  'milestone'                       as source,
  m.id,
  m.key,
  m.title,
  m.description,
  m.due_on                          as on_date,
  null::timestamptz                 as starts_at,
  null::text                        as location,
  'planned'::text                   as status,
  (m.due_on - current_date)         as days_until,
  m.household_id,
  -- How much open work is pinned to this date. A milestone nothing
  -- points at is a date in a document; one with work behind it is a
  -- deadline.
  (select count(*) from public.work_items w
    where w.milestone_id = m.id and w.status not in ('done', 'dropped')) as open_items
from public.milestones m
where public.in_default_scope(m.household_id, m.property_id)
union all
select
  'event'                           as source,
  e.id,
  null                              as key,
  e.title,
  e.notes                           as description,
  (e.starts_at at time zone 'Europe/London')::date as on_date,
  e.starts_at,
  e.location,
  e.status,
  ((e.starts_at at time zone 'Europe/London')::date - current_date) as days_until,
  e.household_id,
  0                                 as open_items
from public.scheduled_events e
where e.status <> 'cancelled'
  and public.in_default_scope(e.household_id, e.property_id);

comment on view public.whats_next is
  'Milestones and scheduled events as one diary, with days_until computed once. A milestone is a date the plan has to hit; an event is a date somebody else set.';
