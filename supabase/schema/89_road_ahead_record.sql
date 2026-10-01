-- ------------------------------------------------------------------
-- 89_road_ahead_record.sql - Road Ahead's record, and the sit-down.
--
-- The decisions in force and the ones they replaced, the owner's words
-- and what reflects them, every logged change, the questions still open,
-- and what a sit-down should cover (docs/road-ahead/CALIBRATION.md).
--
-- Each is ONE view, read alike by road_ahead_agenda() - a session
-- through the connector - and by road.html's Calibration, Decisions and
-- Variables sections, so the page and the sit-down cannot tell the owner
-- different things. All security_invoker: each reads through the
-- caller's own policies on the tables beneath it.
-- ------------------------------------------------------------------

-- ---------------------------------------------------------------
-- Every road decision, in force or replaced, with what it replaced and
-- what replaced it. "In force" is ra_current_decisions' answer, so the
-- two never disagree. Decisions about an archived house are archive,
-- as they are there.
-- ---------------------------------------------------------------
create or replace view public.ra_decision_history
with (security_invoker = on) as
select d.id, d.household_id, d.code, d.topic, d.title, d.decided, d.rationale, d.firmness, d.door,
       d.evidence, d.certainty, d.reopen_if, d.checkpoint, d.source, d.decided_on, d.status,
       exists (select 1 from public.ra_current_decisions c where c.id = d.id) as is_current,
       array(select o.code from public.knowledge_links k join public.decisions o on o.id = k.to_id
              where k.kind = 'supersedes' and k.from_type = 'decision' and k.from_id = d.id
                and k.to_type = 'decision' and k.valid_to is null and o.code is not null
                and public.in_default_scope(o.household_id, o.property_id)
              order by o.code) as supersedes,
       array(select n.code from public.knowledge_links k join public.decisions n on n.id = k.from_id
              where k.kind = 'supersedes' and k.to_type = 'decision' and k.to_id = d.id
                and k.from_type = 'decision' and k.valid_to is null and n.code is not null
                and public.in_default_scope(n.household_id, n.property_id)
              order by n.code) as superseded_by
from public.decisions d
where d.domain = 'road' and public.in_default_scope(d.household_id, d.property_id);

-- ---------------------------------------------------------------
-- The owner's words, each with everything an open link joins it to,
-- read from the signal's end. knowledge_graph gives both ends, because
-- a symmetric link (relates_to) is stored once in canonical order and
-- may well be stored pointing AT the signal.
--
-- A signal is REFLECTED once the model has taken it in: a road, a rule,
-- a variable or a decision carries it. A signal only about a listing
-- has been heard, not yet acted on, so it stays on the agenda.
-- ---------------------------------------------------------------
create or replace view public.ra_signal_record
with (security_invoker = on) as
select s.id, s.household_id, s.code, s.kind, s.words, s.context, s.implies, s.open_question, s.conflicts,
       s.certainty, s.rating, s.said_on, s.source, s.status,
       coalesce((select jsonb_agg(jsonb_build_object('type', g.dst_type, 'code', t.code, 'reads', g.reads)
                                  order by g.dst_type, t.code)
                   from public.knowledge_graph g
                   cross join lateral (select case g.dst_type
                       when 'listing'     then (select l.code from public.ra_listings l where l.id = g.dst_id)
                       when 'road'        then (select r.code from public.ra_roads r where r.id = g.dst_id)
                       when 'ra_rule'     then (select r.code from public.ra_rules r where r.id = g.dst_id)
                       when 'ra_variable' then (select v.key from public.ra_variables v where v.id = g.dst_id)
                       when 'decision'    then (select d.code from public.decisions d where d.id = g.dst_id)
                       when 'signal'      then (select x.code from public.ra_signals x where x.id = g.dst_id)
                       when 'evidence'    then (select e.code from public.ra_evidence e where e.id = g.dst_id)
                     end as code) t
                  where g.src_type = 'signal' and g.src_id = s.id), '[]'::jsonb) as links,
       exists (select 1 from public.knowledge_graph g
                where g.src_type = 'signal' and g.src_id = s.id
                  and g.dst_type in ('road', 'ra_rule', 'ra_variable', 'decision')) as is_reflected
from public.ra_signals s;

-- ---------------------------------------------------------------
-- Every logged change to Road Ahead's figures, listings and scenarios:
-- old, new, why, source and when, named by the row's own code.
-- ---------------------------------------------------------------
create or replace view public.ra_changes
with (security_invoker = on) as
select c.id, c.household_id, c.entity_type,
       coalesce(v.key, l.code, s.key) as code,
       coalesce(v.label, l.name, s.name) as label,
       c.field, c.old_value, c.new_value, c.why, c.source, c.changed_at
from public.change_log c
left join public.ra_variables v on c.entity_type = 'ra_variables' and v.id = c.entity_id
left join public.ra_listings l on c.entity_type = 'ra_listings' and l.id = c.entity_id
left join public.ra_scenarios s on c.entity_type = 'ra_scenarios' and s.id = c.entity_id
where c.entity_type in ('ra_variables', 'ra_listings', 'ra_scenarios');

-- ---------------------------------------------------------------
-- The questions still open, the household's and the house's in force.
-- Not Road Ahead's alone: any page that shows them reads them here.
-- ---------------------------------------------------------------
create or replace view public.open_contradictions
with (security_invoker = on) as
select c.id, c.household_id, c.key, c.topic, c.source_a, c.position_a, c.source_b, c.position_b,
       c.what_it_changes, c.value_at_stake, c.created_at
from public.contradictions c
where c.status = 'open' and public.in_default_scope(c.household_id, c.property_id);

-- ---------------------------------------------------------------
-- What to confirm first: each input once, at its largest weighted swing
-- across every answer it moves, top eight. Eight questions that matter
-- beat forty that repeat. calibrationAgenda() in sensitivity.js is the
-- same aggregation for the command line.
-- ---------------------------------------------------------------
create or replace view public.ra_calibration_agenda
with (security_invoker = on) as
select a.household_id, a.variable_key, a.label, a.score, a.swing, a.moves, a.evidence, a.confidence, a.place
from (select q.household_id, q.variable_key, max(q.label) as label, max(q.score) as score, max(q.swing) as swing,
             jsonb_agg(q.output order by q.score desc, q.output) as moves,
             max(q.evidence) as evidence, max(q.confidence) as confidence,
             row_number() over (partition by q.household_id order by max(q.score) desc, q.variable_key) as place
        from public.ra_calibration_queue q
       where q.score > 0
       group by q.household_id, q.variable_key) a
where a.place <= 8;

-- ---------------------------------------------------------------
-- The owner's judgements due a second look: more than three months old,
-- or the listing appraised again since it was said. A feeling about a
-- house is worth checking against what has been learned since.
-- ---------------------------------------------------------------
create or replace view public.ra_judgements_to_revisit
with (security_invoker = on) as
select j.id, j.household_id, l.code as listing_code, l.name as listing_name, j.field, j.value, j.reason, j.kind,
       j.said_on, (j.said_on < public.london_today() - 90) as is_old, a.appraised_since
from public.ra_current_judgements j
join public.ra_listings l on l.id = j.listing_id
left join lateral (select max(x.appraised_on) as appraised_since from public.ra_appraisals x
                    where x.listing_id = j.listing_id and x.appraised_on > j.said_on) a on true
where j.said_on < public.london_today() - 90 or a.appraised_since is not null;

-- ---------------------------------------------------------------
-- The latest accepted run of each road under each scenario - the
-- baseline today's figures are held against - with the forever budget
-- of the run it replaced, so what moved between acceptances is a read.
-- ---------------------------------------------------------------
create or replace view public.ra_accepted_runs
with (security_invoker = on) as
select r.household_id, r.scenario_key, r.road_code, r.run_name, r.source, r.engine_version, r.summary,
       r.accepted_at, r.accepted_note, r.was_forever_today, r.was_accepted_at
from (select x.*,
             lag((x.summary ->> 'forever_today')::numeric) over w as was_forever_today,
             lag(x.accepted_at) over w as was_accepted_at,
             row_number() over (partition by x.household_id, x.road_code, x.scenario_key, x.run_name
                                order by x.accepted_at desc) as latest
        from public.ra_road_runs x
      window w as (partition by x.household_id, x.road_code, x.scenario_key, x.run_name order by x.accepted_at)) r
where r.latest = 1;

-- ---------------------------------------------------------------
-- road_ahead_agenda: what a sit-down should cover, in order
-- (docs/road-ahead/CALIBRATION.md). Every part but the dates is one of
-- the views above, so the page's Calibration section shows the same.
-- ---------------------------------------------------------------
create or replace function public.road_ahead_agenda(p_household uuid)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select jsonb_build_object(
    'dated', (select coalesce(jsonb_agg(jsonb_build_object('on', w.on_date, 'days', w.days_until, 'what', w.title)
                order by w.on_date), '[]')
                from public.whats_next w where w.household_id = p_household and w.days_until between 0 and 21),
    'contradictions', (select coalesce(jsonb_agg(jsonb_build_object('key', c.key, 'topic', c.topic,
                'a', c.position_a, 'b', c.position_b, 'what_it_changes', c.what_it_changes) order by c.created_at), '[]')
                from public.open_contradictions c where c.household_id = p_household),
    -- The model's figure against the owner's own trusted records, where
    -- they differ by the drift rule's £1k.
    'ledger_gaps', (select coalesce(jsonb_agg(jsonb_build_object('measure', g.measure, 'model', g.model_value,
                'ledger', g.ledger_value, 'as_of', g.ledger_as_of)
                order by abs(g.model_value - g.ledger_value) desc), '[]')
                from public.ra_model_vs_ledger g
               where g.household_id = p_household and abs(g.model_value - g.ledger_value) >= 1000),
    'calibrate', (select coalesce(jsonb_agg(jsonb_build_object('variable', c.variable_key, 'label', c.label,
                'score', c.score, 'swing', c.swing, 'moves', c.moves, 'evidence', c.evidence,
                'confidence', c.confidence) order by c.place), '[]')
                from public.ra_calibration_agenda c where c.household_id = p_household),
    'judgements_to_revisit', (select coalesce(jsonb_agg(jsonb_build_object('listing', j.listing_code,
                'field', j.field, 'value', j.value, 'reason', j.reason, 'said_on', j.said_on)
                order by j.said_on, j.listing_code), '[]')
                from public.ra_judgements_to_revisit j where j.household_id = p_household),
    'signals_unreflected', (select coalesce(jsonb_agg(jsonb_build_object('code', s.code, 'words', s.words,
                'implies', s.implies) order by s.said_on desc nulls last, s.code), '[]')
                from public.ra_signal_record s
               where s.household_id = p_household and s.status = 'active' and s.kind = 'signal'
                 and not s.is_reflected),
    'moved', (select coalesce(jsonb_agg(jsonb_build_object('road', m.road_code, 'scenario', m.scenario_key,
                'run', m.run_name, 'was', m.was_forever_today, 'now', (m.summary ->> 'forever_today')::numeric,
                'accepted_at', m.accepted_at, 'note', m.accepted_note)
                order by abs((m.summary ->> 'forever_today')::numeric - m.was_forever_today) desc), '[]')
                from public.ra_accepted_runs m
               where m.household_id = p_household
                 and abs((m.summary ->> 'forever_today')::numeric - m.was_forever_today) >= 1000));
$$;
