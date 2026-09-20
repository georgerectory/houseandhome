\set ON_ERROR_STOP on
\pset pager off
begin;

create or replace function pass(t text) returns void language plpgsql as $$
begin raise notice 'PASS %', t; end $$;
create or replace function fail(t text, d text) returns void language plpgsql as $$
begin raise exception 'FAIL % : %', t, d; end $$;

-- A review over a hundred rows does not finish in one sitting. These
-- test the two things that make it resumable: the queue knows what to
-- ask about first, and a row that has been asked about says so.

insert into households (id, name) values
  ('11111111-9999-0000-0000-000000000001','Review house');
insert into household_members (household_id, user_id) values
  ('11111111-9999-0000-0000-000000000001','11111111-9999-1111-1111-111111111111');

insert into work_items (id, household_id, title, kind, status, horizon, phase,
                        cost_expected, cost_confidence, effort, benefit_type, theme)
values
  -- Expensive, never asked about, drafted. Should be first.
  ('11111111-8888-0000-0000-000000000001','11111111-9999-0000-0000-000000000001',
   'Rewire throughout','renovation','planned','next','strip_out',
   5500,'drafted','large','safety','make_safe'),
  -- Cheap, never asked about.
  ('11111111-8888-0000-0000-000000000002','11111111-9999-0000-0000-000000000001',
   'Dustpan and brush','purchase','planned','now','move_in',
   12,'drafted','small','time_saved','make_clean'),
  -- Expensive but already confirmed: the conversation has been had.
  ('11111111-8888-0000-0000-000000000003','11111111-9999-0000-0000-000000000001',
   'Replaster in lime','renovation','planned','next','fit_out',
   5500,'confirmed','large','preservation','make_dry'),
  -- Closed. Never asked about again.
  ('11111111-8888-0000-0000-000000000004','11111111-9999-0000-0000-000000000001',
   'Old job','renovation','done','now','strip_out',
   400,'actual','small','safety','make_safe');

-- ---------------------------------------------------------------
-- THE QUEUE ASKS ABOUT MONEY FIRST, AND ONLY WHERE THE FIGURE IS
-- STILL IN QUESTION.
-- ---------------------------------------------------------------
do $$
declare first_title text; n int;
begin
  select title into first_title from review_queue
  where household_id = '11111111-9999-0000-0000-000000000001'
  order by review_score desc limit 1;
  if first_title <> 'Rewire throughout' then perform fail(
    'review: the expensive unconfirmed row is asked about first',
    'first is ' || first_title); end if;

  -- A confirmed figure outranks nothing: the same money, already
  -- settled, must sit below the drafted one.
  if (select review_score from review_queue
       where id = '11111111-8888-0000-0000-000000000003')
     >= (select review_score from review_queue
          where id = '11111111-8888-0000-0000-000000000001')
  then perform fail('review: a confirmed cost is less worth asking about than a drafted one',
    'the confirmed row scores at or above the drafted one'); end if;

  select count(*) into n from review_queue
   where household_id = '11111111-9999-0000-0000-000000000001'
     and id = '11111111-8888-0000-0000-000000000004';
  if n <> 0 then perform fail('review: a done row is not in the queue', 'it is'); end if;
  perform pass('review: the queue leads on money still in question and drops closed rows');
end $$;

-- ---------------------------------------------------------------
-- GAPS ARE THE AGENDA. A row with nothing missing still appears - to
-- confirm its figures - but it has nothing to be asked.
-- ---------------------------------------------------------------
do $$
declare g text[];
begin
  select gaps into g from review_queue where id = '11111111-8888-0000-0000-000000000003';
  if 'never reviewed' <> all(g) then perform fail(
    'review: an unasked row says so in its gaps', 'gaps are ' || g::text); end if;
  if 'cost unconfirmed' = any(g) then perform fail(
    'review: a confirmed cost is not a gap', 'gaps are ' || g::text); end if;
  if 'phase' = any(g) then perform fail('review: a placed row has no phase gap',
    'gaps are ' || g::text); end if;
  perform pass('review: gaps name exactly what the row cannot answer yet');
end $$;

-- ---------------------------------------------------------------
-- A DORMANT PURCHASE IS NOT A USEFUL QUESTION. Asking whether a
-- digger is worth hiring in a year with no digging in it wastes the
-- evening the review was supposed to be.
-- ---------------------------------------------------------------
insert into work_items (id, household_id, title, kind, status, horizon, phase, cost_expected)
values ('11111111-8888-0000-0000-000000000005','11111111-9999-0000-0000-000000000001',
        'Dig the foundations','renovation','idea','someday','extension', null),
       ('11111111-8888-0000-0000-000000000006','11111111-9999-0000-0000-000000000001',
        'Mini digger hire','purchase','idea','someday','extension', 750);
insert into knowledge_links (household_id, from_type, from_id, to_type, to_id, kind)
values ('11111111-9999-0000-0000-000000000001','work_item',
        '11111111-8888-0000-0000-000000000005','work_item',
        '11111111-8888-0000-0000-000000000006','requires_material');

do $$
declare n int;
begin
  select count(*) into n from review_queue
   where id = '11111111-8888-0000-0000-000000000006';
  if n <> 0 then perform fail('review: a dormant purchase is not asked about', 'it is'); end if;
  -- But the JOB behind it still is - that is the question worth having.
  select count(*) into n from review_queue
   where id = '11111111-8888-0000-0000-000000000005';
  if n <> 1 then perform fail('review: the job that would wake it IS asked about',
    'it is not in the queue'); end if;
  perform pass('review: dormant purchases are skipped, the job behind them is not');
end $$;

-- ---------------------------------------------------------------
-- MARKING A ROW REVIEWED KEEPS WHAT WAS SAID, not just that it was
-- asked. A timestamp alone records the question and loses the answer.
-- ---------------------------------------------------------------
grant usage on schema public to authenticated;
grant select, insert, update on all tables in schema public to authenticated;
grant select on public.review_queue to authenticated;

set local role authenticated;
set local request.jwt.claim.sub = '11111111-9999-1111-1111-111111111111';

do $$
declare ts timestamptz; n int; s numeric; before_s numeric; g2 text[];
begin
  select review_score into before_s from review_queue
   where id = '11111111-8888-0000-0000-000000000001';

  perform mark_reviewed('11111111-8888-0000-0000-000000000001',
    'Confirmed: a full rewire, contracted, while the walls are open.');

  select reviewed_at into ts from work_items
   where id = '11111111-8888-0000-0000-000000000001';
  if ts is null then perform fail('review: mark_reviewed stamps the row', 'still null'); end if;

  select count(*) into n from work_notes
   where work_item_id = '11111111-8888-0000-0000-000000000001'
     and kind = 'decision' and tags @> array['review'];
  if n <> 1 then perform fail('review: what was said survives as a work_note',
    'found ' || n || ' notes'); end if;

  -- And having been asked, it drops down the queue rather than coming
  -- round again next session.
  select review_score into s from review_queue
   where id = '11111111-8888-0000-0000-000000000001';
  if s >= before_s then perform fail('review: an asked row falls in the queue',
    'score went from ' || before_s || ' to ' || s); end if;

  select gaps into g2 from review_queue
   where id = '11111111-8888-0000-0000-000000000001';
  if 'never reviewed' = any(g2) then perform fail(
    'review: an asked row stops claiming it was never asked', 'it still does'); end if;
  perform pass('review: marking a row keeps the answer and moves it down the queue');
end $$;

-- A row belonging to somebody else cannot be marked at all.
do $$
begin
  begin
    perform mark_reviewed('11111111-8888-0000-0000-00000000dead', 'sneaky');
    perform fail('review: mark_reviewed refuses a row outside the household',
      'it succeeded');
  exception when others then
    perform pass('review: mark_reviewed refuses a row outside the household');
  end;
end $$;

reset role;

-- ---------------------------------------------------------------
-- RLS on the queue, which is a view and therefore the easy place to
-- leak a whole household's plan.
-- ---------------------------------------------------------------
insert into households (id, name) values
  ('22222222-9999-0000-0000-000000000001','Other review house');
insert into household_members (household_id, user_id) values
  ('22222222-9999-0000-0000-000000000001','22222222-9999-1111-1111-111111111111');

insert into work_items (id, household_id, title, kind, status, horizon, cost_expected)
values ('22222222-8888-0000-0000-000000000001','22222222-9999-0000-0000-000000000001',
        'Their own job','renovation','planned','now', 100);

set local role authenticated;
set local request.jwt.claim.sub = '22222222-9999-1111-1111-111111111111';

do $$
declare n int; mine int;
begin
  select count(*) into mine from review_queue
   where household_id = '22222222-9999-0000-0000-000000000001';
  if mine <> 1 then perform fail('review RLS: the other household sees its OWN row',
    'saw ' || mine || ' - auth.uid() has probably not resolved, so the rest of this '
    || 'test proves nothing'); end if;

  select count(*) into n from review_queue
   where household_id = '11111111-9999-0000-0000-000000000001';
  if n <> 0 then perform fail('review RLS: the queue does not leak',
    'saw ' || n || ' - review_queue is probably missing security_invoker'); end if;
  perform pass('review RLS: the queue is household-scoped, and the session is somebody');
end $$;

reset role;

rollback;
