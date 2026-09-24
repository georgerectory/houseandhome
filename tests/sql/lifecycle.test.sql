\set ON_ERROR_STOP on
\pset pager off
begin;

create or replace function pass(t text) returns void language plpgsql as $$
begin raise notice 'PASS %', t; end $$;
create or replace function fail(t text, d text) returns void language plpgsql as $$
begin raise exception 'FAIL % : %', t, d; end $$;

-- ---- fixture -------------------------------------------------------
-- One household with a live house (P-001), a job and a tool that job
-- needs, a template line, and a library rate. Then a throwaway P-TEST
-- is run through every lifecycle command and purged, and the test is
-- that nothing about it survives and nothing about P-001 moved.
insert into households (id, name) values
  ('c0000000-0000-0000-0000-000000000001', 'Lifecycle House');

insert into properties (id, household_id, name, status, address_line, region) values
  ('c1000000-0000-0000-0000-000000000001','c0000000-0000-0000-0000-000000000001',
   'Main House','active','1 Main Road, Town','Dorset');

insert into work_items (id, household_id, property_id, title, kind, cost_expected)
values ('c2000000-0000-0000-0000-000000000001','c0000000-0000-0000-0000-000000000001',
        'c1000000-0000-0000-0000-000000000001','Rewire','renovation', 6000),
       ('c2000000-0000-0000-0000-000000000002','c0000000-0000-0000-0000-000000000001',
        null,'SDS drill','purchase', 160);

insert into work_item_templates (key, title, kind, work_phase) values
  ('lifecycle-test-survey', 'Asbestos survey before any strip-out', 'research', 'P1');
insert into work_item_templates (key, title, kind, triggered_by) values
  ('lifecycle-test-thatch', 'Thatch survey', 'research', 'thatch');

do $$
begin
  if (select ref from properties where id = 'c1000000-0000-0000-0000-000000000001') <> 'P-001' then
    perform fail('lifecycle: refs', 'the first property did not get P-001');
  end if;
  perform pass('lifecycle: the first property is issued P-001 without being asked');
end $$;

-- A fingerprint of P-001 and the household's own rows, taken before
-- anything happens and compared at the end.
create temp table before_fp as
select (select count(*) from work_items where household_id = 'c0000000-0000-0000-0000-000000000001') as items,
       (select sum(cost_expected) from work_items where household_id = 'c0000000-0000-0000-0000-000000000001') as cost,
       (select status from properties where ref = 'P-001'
          and household_id = 'c0000000-0000-0000-0000-000000000001') as status;

-- ---- NEW PROPERTY ---------------------------------------------------
do $$
declare v uuid; n int;
begin
  v := new_property('c0000000-0000-0000-0000-000000000001', 'Test Cottage',
                    '9 Test Lane, Elsewhere', 'AB1 2CD', 'Wiltshire Council', 'Wiltshire', 'P-TEST');
  if (select status from properties where id = v) <> 'candidate' then
    perform fail('lifecycle: new', 'a new property is not a candidate');
  end if;
  select count(*) into n from work_items where property_id = v;
  if n <> 1 then
    perform fail('lifecycle: template', 'expected the one untriggered template line, got '||n);
  end if;
  if exists (select 1 from work_items where property_id = v and cost_expected is not null) then
    perform fail('lifecycle: template', 'a cloned line arrived with a cost');
  end if;
  if (select status from properties where ref = 'P-001'
        and household_id = 'c0000000-0000-0000-0000-000000000001') <> 'active' then
    perform fail('lifecycle: new', 'creating a candidate changed the active property');
  end if;
  perform pass('lifecycle: NEW PROPERTY is a candidate with the template cloned, costs NULL, active untouched');
end $$;

do $$
begin
  if exists (select 1 from work_item_readiness r join work_items w on w.id = r.id
              where w.property_id = (select id from properties where ref = 'P-TEST')) then
    perform fail('lifecycle: default scope', 'a candidate''s work is in the default views');
  end if;
  perform pass('lifecycle: a candidate is absent from the default views');
end $$;

-- ---- MAKE ACTIVE, and back ------------------------------------------
do $$
begin
  perform make_active('c0000000-0000-0000-0000-000000000001', 'P-TEST');
  if (select status from properties where ref = 'P-001'
        and household_id = 'c0000000-0000-0000-0000-000000000001') <> 'candidate' then
    perform fail('lifecycle: make active', 'the previous active was not demoted to candidate');
  end if;
  if not exists (select 1 from work_item_readiness r join work_items w on w.id = r.id
                  where w.property_id = (select id from properties where ref = 'P-TEST')) then
    perform fail('lifecycle: make active', 'the new active property is not in the default views');
  end if;
  if exists (select 1 from work_item_readiness where id = 'c2000000-0000-0000-0000-000000000001') then
    perform fail('lifecycle: make active', 'the demoted property is still in the default views');
  end if;
  if not exists (select 1 from work_item_readiness where id = 'c2000000-0000-0000-0000-000000000002') then
    perform fail('lifecycle: make active', 'a USER-scope row fell out of the default views');
  end if;
  perform make_active('c0000000-0000-0000-0000-000000000001', 'P-001');
  perform pass('lifecycle: MAKE ACTIVE switches every default view and demotes the old one to candidate');
end $$;

do $$
begin
  begin
    update properties set status = 'active' where ref = 'P-TEST';
    perform fail('lifecycle: one live property', 'two active properties were allowed');
  exception when unique_violation then null;
  end;
  perform pass('lifecycle: the database refuses two current properties (F.11.10)');
end $$;

-- ---- ARCHIVE, RESTORE ------------------------------------------------
do $$
begin
  perform set_property_status('c0000000-0000-0000-0000-000000000001', 'P-TEST', 'archived',
                              'Dry run: no longer available');
  if not exists (select 1 from property_compare where ref = 'P-TEST' and status = 'archived') then
    perform fail('lifecycle: archive', 'an archived property is missing from the comparison');
  end if;
  begin
    perform make_active('c0000000-0000-0000-0000-000000000001', 'P-TEST');
    perform fail('lifecycle: archive', 'an archived property was made active without a restore');
  exception when check_violation then null;
  end;
  perform set_property_status('c0000000-0000-0000-0000-000000000001', 'P-TEST', 'candidate',
                              'Dry run: restored');
  perform pass('lifecycle: ARCHIVE shows only in COMPARE, and RESTORE is the only way back');
end $$;

-- ---- PURGE -----------------------------------------------------------
-- Give P-TEST everything a real candidate would accumulate: a room, a
-- fact, a milestone, a bill, a link to a USER tool, a note, a library
-- rate learned there, a stockpile with a haul in the shed.
do $$
declare v uuid := (select id from properties where ref = 'P-TEST');
        r uuid; w uuid; s uuid;
begin
  insert into rooms (household_id, property_id, key, name) values
    ('c0000000-0000-0000-0000-000000000001', v, 'kitchen', 'Kitchen') returning id into r;
  insert into house_facts (household_id, property_id, category, fact) values
    ('c0000000-0000-0000-0000-000000000001', v, 'construction', 'Cob walls');
  insert into milestones (household_id, property_id, key, title) values
    ('c0000000-0000-0000-0000-000000000001', v, 'test-offer', 'Offer on the cottage');
  insert into bills (household_id, property_id, name, amount, category) values
    ('c0000000-0000-0000-0000-000000000001', v, 'Cottage council tax', 200, 'council_tax');
  insert into work_items (household_id, property_id, room_id, title, kind)
    values ('c0000000-0000-0000-0000-000000000001', v, r, 'Strip the kitchen', 'renovation')
    returning id into w;
  insert into knowledge_links (household_id, from_type, from_id, to_type, to_id, kind)
    values ('c0000000-0000-0000-0000-000000000001', 'work_item', w, 'work_item',
            'c2000000-0000-0000-0000-000000000002', 'requires_material');
  insert into work_notes (household_id, work_item_id, kind, body)
    values ('c0000000-0000-0000-0000-000000000001', w, 'risk', 'Cob needs lime');
  insert into price_references (household_id, item_label, channel, price_typical, region,
                                package_key, researched_during_property_id)
    values ('c0000000-0000-0000-0000-000000000001', 'Cob repair per m2', 'benchmark', 90,
            'Wiltshire', 'cob_repair', v);
  insert into stock_targets (household_id, property_id, name, category, spec, unit, quantity_needed)
    values ('c0000000-0000-0000-0000-000000000001', v, 'Reclaimed oak boards', 'timber',
            'Oak, 150mm wide, 22mm thick', 'm2', 20) returning id into s;
  insert into stock_acquisitions (household_id, stock_target_id, quantity, acquired_on)
    values ('c0000000-0000-0000-0000-000000000001', s, 5, current_date);
  perform set_config('house.change_why', 'dry run', true);
  update properties set guide_price = 300000 where id = v;
end $$;

do $$
begin
  begin
    perform purge_property('c0000000-0000-0000-0000-000000000001', 'P-TEST', 'wrong address');
    perform fail('lifecycle: purge', 'a purge ran without the address typed');
  exception when check_violation then null;
  end;
  begin
    perform purge_property('c0000000-0000-0000-0000-000000000001', 'P-001', '1 Main Road, Town');
    perform fail('lifecycle: purge', 'the active property was purged');
  exception when check_violation then null;
  end;
  perform pass('lifecycle: PURGE refuses a wrong address and refuses the current house');
end $$;

do $$
declare v uuid := (select id from properties where ref = 'P-TEST');
        leftovers int := 0; col record; n int;
begin
  perform purge_property('c0000000-0000-0000-0000-000000000001', 'P-TEST', '9 test lane elsewhere');

  -- Every property_id column in the schema, searched for the purged id.
  for col in select table_name, column_name from information_schema.columns
              where table_schema = 'public'
                and column_name in ('property_id','researched_during_property_id','acquired_for_property_id')
                and table_name in (select table_name from information_schema.tables
                                    where table_schema = 'public' and table_type = 'BASE TABLE') loop
    execute format('select count(*) from public.%I where %I = $1', col.table_name, col.column_name)
      into n using v;
    leftovers := leftovers + n;
  end loop;
  leftovers := leftovers
    + (select count(*) from properties where id = v)
    + (select count(*) from knowledge_links where from_id not in (select id from work_items))
    + (select count(*) from work_notes where body = 'Cob needs lime')
    + (select count(*) from change_log where entity_id = v)
    + (select count(*) from change_log where why like '%P-TEST%' or why like '%Test Cottage%')
    + (select count(*) from properties where status_reason like '%P-TEST%');
  if leftovers <> 0 then
    perform fail('lifecycle: purge', leftovers||' reference(s) to the purged property survived');
  end if;
  perform pass('lifecycle: PURGE leaves no row that references the property');
end $$;

do $$
begin
  if not exists (select 1 from price_references where package_key = 'cob_repair'
                   and researched_during_property_id is null) then
    perform fail('lifecycle: purge', 'the library rate learned on the purged property was lost');
  end if;
  if not exists (select 1 from work_items where id = 'c2000000-0000-0000-0000-000000000002') then
    perform fail('lifecycle: purge', 'the USER tool the purged job needed was deleted');
  end if;
  if not exists (select 1 from stock_targets where name = 'Reclaimed oak boards' and property_id is null) then
    perform fail('lifecycle: purge', 'material already collected went with the building');
  end if;
  perform pass('lifecycle: PURGE keeps the library rate, the tool and the collected stock, unlinked');
end $$;

do $$
declare a before_fp; b record;
begin
  select * into a from before_fp;
  select (select count(*) from work_items where household_id = 'c0000000-0000-0000-0000-000000000001') as items,
         (select sum(cost_expected) from work_items where household_id = 'c0000000-0000-0000-0000-000000000001') as cost,
         (select status from properties where ref = 'P-001'
            and household_id = 'c0000000-0000-0000-0000-000000000001') as status
    into b;
  if a.items <> b.items or a.cost <> b.cost or a.status <> b.status then
    perform fail('lifecycle: fingerprint', format('before %s/%s/%s, after %s/%s/%s',
                 a.items, a.cost, a.status, b.items, b.cost, b.status));
  end if;
  perform pass('lifecycle: P-001 is identical before and after the whole dry run');
end $$;

do $$
declare v uuid;
begin
  v := new_property('c0000000-0000-0000-0000-000000000001', 'Next House');
  if (select ref from properties where id = v) <> 'P-002' then
    perform fail('lifecycle: refs', 'the next ref was '||(select ref from properties where id = v));
  end if;
  perform pass('lifecycle: the next property is P-002 - refs count issued, not surviving, rows');
end $$;

-- ---- A figure never changes silently --------------------------------
do $$
begin
  perform set_config('house.change_why', '', true);
  begin
    update work_items set cost_expected = 6500 where id = 'c2000000-0000-0000-0000-000000000001';
    perform fail('lifecycle: change log', 'a cost changed with no reason');
  exception when check_violation then null;
  end;
  perform set_config('house.change_why', 'from-scratch heating uplift', true);
  perform set_config('house.change_source', 'Checkatrade 2026', true);
  update work_items set cost_expected = 6500 where id = 'c2000000-0000-0000-0000-000000000001';
  if not exists (select 1 from change_log where entity_id = 'c2000000-0000-0000-0000-000000000001'
                   and field = 'cost_expected' and old_value = '6000.00' and new_value = '6500.00'
                   and why = 'from-scratch heating uplift' and source = 'Checkatrade 2026') then
    perform fail('lifecycle: change log', 'the change was not logged OLD -> NEW -> WHY -> SOURCE');
  end if;
  perform pass('lifecycle: a money change needs a reason and is logged OLD -> NEW -> WHY -> SOURCE');
end $$;

-- ---- No double counting (F.11.1) ------------------------------------
do $$
begin
  begin
    insert into work_items (household_id, property_id, parent_id, title, kind, cost_expected)
    values ('c0000000-0000-0000-0000-000000000001','c1000000-0000-0000-0000-000000000001',
            'c2000000-0000-0000-0000-000000000001','Rewire materials','purchase', 1100);
    perform fail('lifecycle: double count', 'a costed child of a costed parent was accepted');
  exception when check_violation then null;
  end;
  perform pass('lifecycle: a costed component under a costed parent is refused');
end $$;

-- ---- The allocator only funds the pot (F.11.3) ----------------------
do $$
begin
  perform set_config('house.change_why', 'shell is build finance', true);
  insert into work_items (household_id, property_id, title, kind, cost_expected, funding_stream)
  values ('c0000000-0000-0000-0000-000000000001','c1000000-0000-0000-0000-000000000001',
          'Build the shell','renovation', 89000, 'build_finance');
  if exists (select 1 from v_funding_queue where title = 'Build the shell') then
    perform fail('lifecycle: funding', 'a build-finance row is competing for savings');
  end if;
  -- A pot whose contribution was withdrawn (NULL) is not permission to
  -- allocate, even though no unconfirmed figure is sitting there.
  insert into pots (household_id, name, monthly_contribution, contribution_confidence)
  values ('c0000000-0000-0000-0000-000000000001', 'Pot', null, 'confirmed');
  insert into deposits (household_id, pot_id, amount)
  select household_id, id, 100 from pots where household_id = 'c0000000-0000-0000-0000-000000000001';
  begin
    perform run_deposit_allocation((select id from deposits
                                     where household_id = 'c0000000-0000-0000-0000-000000000001'));
    perform fail('lifecycle: funding', 'the allocator ran with no contribution figure');
  exception when check_violation then null;
  end;
  perform pass('lifecycle: build finance never enters the funding queue, and no contribution means no allocation');
end $$;

-- ---- RLS on properties ----------------------------------------------
insert into households (id, name) values ('d0000000-0000-0000-0000-000000000001', 'Other House');
insert into household_members (household_id, user_id) values
  ('d0000000-0000-0000-0000-000000000001','d1111111-1111-1111-1111-111111111111');
grant usage on schema public to authenticated;
grant select, insert, update on all tables in schema public to authenticated;
set local role authenticated;
set local request.jwt.claim.sub = 'd1111111-1111-1111-1111-111111111111';

do $$
begin
  if exists (select 1 from properties) or exists (select 1 from property_compare)
     or exists (select 1 from change_log) then
    perform fail('lifecycle RLS', 'another household''s properties are visible');
  end if;
  perform pass('lifecycle RLS: properties, the comparison and the change log are household-scoped');
end $$;

rollback;
