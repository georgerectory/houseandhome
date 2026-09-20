\set ON_ERROR_STOP on
\pset pager off
begin;

create or replace function pass(t text) returns void language plpgsql as $$
begin raise notice 'PASS %', t; end $$;
create or replace function fail(t text, d text) returns void language plpgsql as $$
begin raise exception 'FAIL % : %', t, d; end $$;

-- Money over time. The whole point of this file is that nothing in the
-- schema had a month before it, so these test the two things that makes
-- possible: adding cadences together correctly, and never adding a
-- trusted figure to an untrusted one.

insert into households (id, name) values
  ('99999999-0000-0000-0000-000000000001','Cashflow house');
insert into household_members (household_id, user_id) values
  ('99999999-0000-0000-0000-000000000001','99999999-1111-1111-1111-111111111111');

-- ---------------------------------------------------------------
-- A CADENCE IS NOT A NUMBER until something normalises it. A one_off
-- is the case that matters: returning a twelfth of it would turn a
-- single payment into a standing cost forever.
-- ---------------------------------------------------------------
do $$
declare v numeric;
begin
  if monthly_equivalent(120, 'annual') <> 10 then
    perform fail('cashflow: annual divides by twelve', 'got ' || monthly_equivalent(120,'annual')); end if;
  if monthly_equivalent(30, 'quarterly') <> 10 then
    perform fail('cashflow: quarterly divides by three', 'got ' || monthly_equivalent(30,'quarterly')); end if;
  if monthly_equivalent(60, 'biannual') <> 10 then
    perform fail('cashflow: biannual divides by six', 'got ' || monthly_equivalent(60,'biannual')); end if;
  if monthly_equivalent(50, 'monthly') <> 50 then
    perform fail('cashflow: monthly is itself', 'got ' || monthly_equivalent(50,'monthly')); end if;
  -- 52 weeks over 12 months, not 4 weeks to a month - which would
  -- under-count by about 8 per cent, or a month of bills a year.
  if monthly_equivalent(10, 'weekly') <> 43.33 then
    perform fail('cashflow: weekly is 52/12, not 4', 'got ' || monthly_equivalent(10,'weekly')); end if;

  if monthly_equivalent(5000, 'one_off') <> 0 then
    perform fail('cashflow: a one-off is not a monthly rate',
      'got ' || monthly_equivalent(5000,'one_off')); end if;

  select monthly_equivalent(10, 'fortnightly') into v;
  if v is not null then perform fail('cashflow: an unknown cadence returns null, not a guess',
    'got ' || v); end if;
  perform pass('cashflow: every cadence normalises, a one-off is not a rate, unknown is null');
end $$;

-- ---------------------------------------------------------------
-- MONEY IN AGAINST MONEY OUT, and only from figures somebody checked.
-- ---------------------------------------------------------------
insert into income_sources (household_id, name, kind, amount, cadence, basis, confidence)
values
  ('99999999-0000-0000-0000-000000000001','Salary','salary', 3500, 'monthly', 'net', 'confirmed'),
  ('99999999-0000-0000-0000-000000000001','Maybe a lodger','rent', 600, 'monthly', 'net', 'drafted');

insert into bills (household_id, name, category, amount, cadence, cost_class, confidence)
values
  ('99999999-0000-0000-0000-000000000001','Council tax','council_tax', 167, 'monthly', 'running', 'confirmed'),
  ('99999999-0000-0000-0000-000000000001','Energy','energy', 150, 'monthly', 'running', 'confirmed'),
  ('99999999-0000-0000-0000-000000000001','Insurance','insurance', 456, 'annual', 'running', 'confirmed'),
  ('99999999-0000-0000-0000-000000000001','Guessed water','water', 40, 'monthly', 'running', 'drafted');

insert into subscriptions (household_id, name, amount, cadence, confidence)
values ('99999999-0000-0000-0000-000000000001','Software', 50, 'monthly', 'confirmed');

do $$
declare inc numeric; out_b numeric; subs numeric; sur numeric;
        inc_u numeric; out_u numeric; run numeric; sur_all numeric;
begin
  select income_in, bills_out, subscriptions_out, surplus,
         income_unconfirmed, outgoings_unconfirmed, running_cost,
         surplus_including_unconfirmed
    into inc, out_b, subs, sur, inc_u, out_u, run, sur_all
  from cash_flow_month where household_id = '99999999-0000-0000-0000-000000000001';

  if inc <> 3500 then perform fail('cashflow: only trusted income counts',
    'income_in is ' || inc || ' - the drafted lodger has leaked in'); end if;
  -- 167 + 150 + 38 (456/12). The drafted water is NOT in it.
  if out_b <> 355 then perform fail('cashflow: bills normalise and exclude the untrusted',
    'bills_out is ' || out_b || ', expected 355'); end if;
  if subs <> 50 then perform fail('cashflow: subscriptions are counted apart from bills',
    'subs is ' || subs); end if;
  if sur <> 3095 then perform fail('cashflow: surplus is in less out',
    'surplus is ' || sur || ', expected 3095'); end if;

  -- And what was left out is reported, not silently dropped.
  if inc_u <> 600 then perform fail('cashflow: unconfirmed income is reported beside',
    'is ' || inc_u); end if;
  if out_u <> 40 then perform fail('cashflow: unconfirmed outgoings are reported beside',
    'is ' || out_u); end if;
  if run <> 355 then perform fail('cashflow: cost_class finally means something',
    'running_cost is ' || run); end if;
  -- BOTH ANSWERS. The trusted surplus is 3095; counting the drafted
  -- lodger and the drafted water gives 3655. On a household whose
  -- bills are ALL carried over, the trusted surplus reads as though
  -- there are no outgoings at all - true, and useless - so the gap
  -- between the two is what confirming the bills is worth.
  if sur_all <> 3655 then perform fail('cashflow: the everything-counted surplus is reported too',
    'is ' || sur_all || ', expected 3655'); end if;
  perform pass('cashflow: 3095 surplus from checked figures, 3655 counting the guesses - both stated');
end $$;

-- ---------------------------------------------------------------
-- THE SAME COST CANNOT BE ENTERED TWICE. There was no uniqueness of
-- any kind on bills or subscriptions before this.
-- ---------------------------------------------------------------
do $$
begin
  begin
    insert into bills (household_id, name, category, amount, cadence)
    values ('99999999-0000-0000-0000-000000000001','COUNCIL TAX','council_tax', 167, 'monthly');
    perform fail('cashflow: a duplicate bill name is refused', 'the insert succeeded');
  exception when unique_violation then
    perform pass('cashflow: the same bill cannot be entered twice, whatever its capitals');
  end;
end $$;

-- A CLOSED bill and its replacement may legitimately share a name.
update bills set is_active = false
 where household_id = '99999999-0000-0000-0000-000000000001' and name = 'Energy';
insert into bills (household_id, name, category, amount, cadence, confidence)
values ('99999999-0000-0000-0000-000000000001','Energy','energy', 180, 'monthly', 'confirmed');
do $$
begin
  perform pass('cashflow: a replacement may reuse the name of the bill it replaces');
end $$;

-- ---------------------------------------------------------------
-- QUOTED IS TRUSTED, and it is a distinct thing from confirmed.
-- ---------------------------------------------------------------
do $$
declare n int;
begin
  select count(*) into n from confidence_levels where key = 'quoted' and is_trusted;
  if n <> 1 then perform fail('cashflow: quoted joins the ladder as trusted',
    'found ' || n); end if;
  -- It has to sort between researched and confirmed, or a surface
  -- ordering by strength puts a builder's price below a guess.
  if (select sort_order from confidence_levels where key='quoted')
     not between (select sort_order from confidence_levels where key='researched')
             and (select sort_order from confidence_levels where key='confirmed')
  then perform fail('cashflow: quoted sorts between researched and confirmed', 'it does not'); end if;
  perform pass('cashflow: a written quote is trusted, and ranks between researched and confirmed');
end $$;

-- ---------------------------------------------------------------
-- A QUOTE, ITS STAGES, AND WHAT IS STILL OWED.
-- ---------------------------------------------------------------
insert into contractors (id, household_id, name, trade)
values ('99999999-3333-0000-0000-000000000001','99999999-0000-0000-0000-000000000001','A Builder','groundwork');

insert into work_items (id, household_id, title, kind, status, horizon)
values ('99999999-4444-0000-0000-000000000001','99999999-0000-0000-0000-000000000001',
        'Build the extension shell','renovation','planned','later');

insert into quotes (id, household_id, work_item_id, contractor_id, amount, quoted_on, valid_until, status)
values ('99999999-5555-0000-0000-000000000001','99999999-0000-0000-0000-000000000001',
        '99999999-4444-0000-0000-000000000001','99999999-3333-0000-0000-000000000001',
        60000, current_date, current_date + 30, 'accepted');

insert into payment_schedule (household_id, quote_id, stage_no, description, amount, due_on, paid_on)
values
  ('99999999-0000-0000-0000-000000000001','99999999-5555-0000-0000-000000000001',1,'Deposit', 18000, current_date, current_date),
  ('99999999-0000-0000-0000-000000000001','99999999-5555-0000-0000-000000000001',2,'Weathertight', 24000, current_date + 60, null),
  ('99999999-0000-0000-0000-000000000001','99999999-5555-0000-0000-000000000001',3,'Retention', 3000, current_date + 120, null);

do $$
-- v_ prefixes because a plpgsql variable sharing a name with a column
-- in the query below is ambiguous, and Postgres says so rather than
-- guessing - which is the right call and worth not fighting.
declare v_staged numeric; v_paid numeric; v_outstanding numeric; v_unscheduled numeric;
begin
  select staged_total, paid_total, outstanding, unscheduled
    into v_staged, v_paid, v_outstanding, v_unscheduled
  from quote_status where id = '99999999-5555-0000-0000-000000000001';

  if v_paid <> 18000 then perform fail('cashflow: paid is the stages actually paid',
    'is ' || v_paid); end if;
  if v_outstanding <> 42000 then perform fail('cashflow: outstanding is contract less paid',
    'is ' || v_outstanding); end if;
  -- 18 + 24 + 3 = 45 of a 60 contract. The 15k gap is where a surprise
  -- final invoice comes from, so it is a reported number.
  if v_unscheduled <> 15000 then perform fail('cashflow: the unscheduled balance is visible',
    'is ' || v_unscheduled || ', expected 15000'); end if;
  perform pass('cashflow: 18k paid of 60k, 15k of the contract not yet in any stage');
end $$;

-- ONE accepted quote per job. Two is either a mistake or two jobs.
do $$
begin
  begin
    insert into quotes (household_id, work_item_id, quoted_by, amount, status)
    values ('99999999-0000-0000-0000-000000000001','99999999-4444-0000-0000-000000000001',
            'Someone else', 55000, 'accepted');
    perform fail('cashflow: a second accepted quote is refused', 'the insert succeeded');
  exception when unique_violation then
    perform pass('cashflow: only one quote per job can be the accepted one');
  end;
end $$;

-- A quote has to come from somebody, and a rejection has to say why.
do $$
begin
  begin
    insert into quotes (household_id, amount) values ('99999999-0000-0000-0000-000000000001', 100);
    perform fail('cashflow: an anonymous quote is refused', 'the insert succeeded');
  exception when check_violation then null;
  end;
  begin
    insert into quotes (household_id, quoted_by, amount, status)
    values ('99999999-0000-0000-0000-000000000001','B', 100, 'rejected');
    perform fail('cashflow: a rejection without a reason is refused', 'the insert succeeded');
  exception when check_violation then null;
  end;
  perform pass('cashflow: a quote names its source, and a rejection says why');
end $$;

-- ---------------------------------------------------------------
-- THE ARCHIVE MERGE. A carried row records WHAT KIND of number it is
-- and WHERE IT WENT, so the same line cannot be re-entered twice
-- unnoticed and the total can stop being meaningless.
-- ---------------------------------------------------------------
insert into carried_finance (household_id, source_group, label, amount, money_kind, source_ref)
values
  ('99999999-0000-0000-0000-000000000001','savings','ISA balance', 36265, 'balance', 'r1'),
  ('99999999-0000-0000-0000-000000000001','savings','Monthly saved', 2306, 'monthly_rate', 'r2'),
  ('99999999-0000-0000-0000-000000000001','ongoing_bills','Council tax', 167, 'monthly_rate', 'r3');

do $$
declare balances numeric; rates numeric;
begin
  select sum(amount) filter (where money_kind = 'balance'),
         sum(amount) filter (where money_kind = 'monthly_rate')
    into balances, rates
  from carried_finance where household_id = '99999999-0000-0000-0000-000000000001';
  if balances <> 36265 then perform fail('cashflow: balances total apart', 'is ' || balances); end if;
  if rates <> 2473 then perform fail('cashflow: rates total apart', 'is ' || rates); end if;
  -- The point: adding them would give 38,738, a number that describes
  -- nothing. The kind is what makes the archive addable at all.
  perform pass('cashflow: a balance and a monthly rate total separately, never together');
end $$;

do $$
begin
  begin
    update carried_finance set review_status = 'superseded'
     where household_id = '99999999-0000-0000-0000-000000000001' and source_ref = 'r3';
    perform fail('cashflow: superseding without saying where it went is refused',
      'the update succeeded');
  exception when check_violation then
    perform pass('cashflow: a superseded line has to name where it went');
  end;
end $$;

update carried_finance
   set review_status = 'superseded', superseded_into_type = 'bill',
       superseded_into_id = (select id from bills
                              where household_id = '99999999-0000-0000-0000-000000000001'
                                and name = 'Council tax' limit 1)
 where household_id = '99999999-0000-0000-0000-000000000001' and source_ref = 'r3';

do $$
declare n int;
begin
  select count(*) into n from carried_finance c
    join bills b on b.id = c.superseded_into_id
   where c.household_id = '99999999-0000-0000-0000-000000000001'
     and c.superseded_into_type = 'bill';
  if n <> 1 then perform fail('cashflow: the archive-to-ledger hop is queryable',
    'joined ' || n || ' rows'); end if;
  perform pass('cashflow: which carried line became which bill is now a join, not prose');
end $$;

-- ---------------------------------------------------------------
-- RLS on every new table AND view.
-- ---------------------------------------------------------------
insert into households (id, name) values
  ('88888888-0000-0000-0000-000000000001','Other cashflow house');
insert into household_members (household_id, user_id) values
  ('88888888-0000-0000-0000-000000000001','88888888-1111-1111-1111-111111111111');
insert into income_sources (household_id, name, amount, cadence, confidence)
values ('88888888-0000-0000-0000-000000000001','Their salary', 1000, 'monthly', 'confirmed');

grant usage on schema public to authenticated;
grant select, insert, update on all tables in schema public to authenticated;
grant select on public.cash_flow_month, public.quote_status to authenticated;

set local role authenticated;
set local request.jwt.claim.sub = '88888888-1111-1111-1111-111111111111';

do $$
declare n int; mine int;
begin
  -- Prove the session is somebody first. "Sees nothing" is also the
  -- answer when auth.uid() is null, and a test that cannot tell the
  -- difference proves nothing at all.
  select count(*) into mine from income_sources
   where household_id = '88888888-0000-0000-0000-000000000001';
  if mine <> 1 then perform fail('cashflow RLS: the other household sees its OWN income',
    'saw ' || mine || ' - auth.uid() has not resolved'); end if;

  select count(*) into n from income_sources
   where household_id = '99999999-0000-0000-0000-000000000001';
  if n <> 0 then perform fail('cashflow RLS: income does not leak', 'saw ' || n); end if;

  select count(*) into n from quotes
   where household_id = '99999999-0000-0000-0000-000000000001';
  if n <> 0 then perform fail('cashflow RLS: quotes do not leak', 'saw ' || n); end if;

  select count(*) into n from payment_schedule
   where household_id = '99999999-0000-0000-0000-000000000001';
  if n <> 0 then perform fail('cashflow RLS: payment stages do not leak', 'saw ' || n); end if;

  select count(*) into n from cash_flow_month
   where household_id = '99999999-0000-0000-0000-000000000001'
     and (income_in > 0 or bills_out > 0);
  if n <> 0 then perform fail('cashflow RLS: the cash flow VIEW does not leak either',
    'saw ' || n || ' - probably missing security_invoker'); end if;

  select count(*) into n from quote_status
   where household_id = '99999999-0000-0000-0000-000000000001';
  if n <> 0 then perform fail('cashflow RLS: quote_status does not leak', 'saw ' || n); end if;

  perform pass('cashflow RLS: three tables and two views, all household-scoped');
end $$;

reset role;

rollback;
