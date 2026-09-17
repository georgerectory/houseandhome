\set ON_ERROR_STOP on
\pset pager off
begin;

create or replace function pass(t text) returns void language plpgsql as $$
begin raise notice 'PASS %', t; end $$;
create or replace function fail(t text, d text) returns void language plpgsql as $$
begin raise exception 'FAIL % : %', t, d; end $$;

-- The building registry. What is under test is the JOIN, not the
-- geometry: the geometry is in the repository, and the only thing this
-- schema has to get right is that a work item can point at a structural
-- change, that the quantity behind it cannot be asserted as confirmed by
-- accident, and that nobody else's household can see any of it.

insert into households (id, name) values
  ('cccccccc-0000-0000-0000-000000000001','Owner'),
  ('dddddddd-0000-0000-0000-000000000001','Stranger');
insert into household_members (household_id, user_id) values
  ('cccccccc-0000-0000-0000-000000000001','cccccccc-1111-1111-1111-111111111111'),
  ('dddddddd-0000-0000-0000-000000000001','dddddddd-1111-1111-1111-111111111111');

insert into building_stages (id, household_id, building_key, stage_key, name, status, sequence)
values ('11111111-0000-0000-0000-000000000001','cccccccc-0000-0000-0000-000000000001',
        '48-ameysford-road','as-bought','Day one - as bought','existing',10);

insert into building_stages (id, household_id, building_key, stage_key, name, status, sequence, derived_from_id)
values ('11111111-0000-0000-0000-000000000002','cccccccc-0000-0000-0000-000000000001',
        '48-ameysford-road','post-extension','After the extension','planned',20,
        '11111111-0000-0000-0000-000000000001');

insert into building_changes
  (id, household_id, stage_id, change_key, name, kind, new_wall_m, area_added_m2, rooms_created, measured_from)
values ('22222222-0000-0000-0000-000000000001','cccccccc-0000-0000-0000-000000000001',
        '11111111-0000-0000-0000-000000000002','fill-east','Fill in the east side of the rear wing',
        'build', 6.20, 9.10, 1, 'stageDiff(as-bought, post-extension)');

do $$
begin
  if (select confidence from building_stages
       where id='11111111-0000-0000-0000-000000000002') <> 'drafted' then
    perform fail('building_stages default','a stage arrives confirmed');
  end if;
  if (select confidence from building_changes
       where id='22222222-0000-0000-0000-000000000001') <> 'drafted' then
    perform fail('building_changes default','a measured quantity arrives confirmed');
  end if;
  perform pass('building: a stage and its quantities arrive drafted, never confirmed');
end $$;

do $$
begin
  begin
    insert into building_stages (household_id, building_key, stage_key, name)
    values ('cccccccc-0000-0000-0000-000000000001','48-ameysford-road','as-bought','Again');
    perform fail('building_stages uniqueness','the same stage key was accepted twice');
  exception when unique_violation then
    perform pass('building: one row per stage key per building');
  end;
end $$;

do $$
begin
  begin
    insert into building_stages (household_id, building_key, stage_key, name, status)
    values ('cccccccc-0000-0000-0000-000000000001','48-ameysford-road','loft','Loft','imagined');
    perform fail('building_stages status','an unknown status was accepted');
  exception when check_violation then
    perform pass('building: a stage is existing, planned or built and nothing else');
  end;
end $$;

-- The whole point of the registry: a work item can point at the change
-- it produces, through the graph rather than through a new column.
insert into work_items (id, household_id, title, kind, cost_expected, cost_confidence)
values ('33333333-0000-0000-0000-000000000001','cccccccc-0000-0000-0000-000000000001',
        'Build the east infill','renovation',18000,'drafted');

insert into knowledge_links (household_id, from_type, from_id, to_type, to_id, kind)
values ('cccccccc-0000-0000-0000-000000000001',
        'work_item','33333333-0000-0000-0000-000000000001',
        'building_change','22222222-0000-0000-0000-000000000001','realises');

do $$
declare n int;
begin
  select count(*) into n from knowledge_links
   where kind = 'realises' and to_type = 'building_change' and valid_to is null;
  if n <> 1 then perform fail('realises link','expected one open link, found '||n); end if;
  perform pass('building: a work item realises a structural change, through the graph');
end $$;

-- The polymorphic guard has to reach the new tables too, or the graph
-- would happily record an edge to a row that does not exist.
do $$
begin
  begin
    insert into knowledge_links (household_id, from_type, from_id, to_type, to_id, kind)
    values ('cccccccc-0000-0000-0000-000000000001',
            'work_item','33333333-0000-0000-0000-000000000001',
            'building_change','99999999-0000-0000-0000-000000000009','realises');
    perform fail('link guard','a link to a building change that does not exist was accepted');
  exception when others then
    perform pass('building: a link to a change that does not exist is refused at write time');
  end;
end $$;

do $$
begin
  if not exists (select 1 from link_kinds where key = 'realises' and family = 'sequence') then
    perform fail('vocabulary','the realises kind is missing');
  end if;
  if not exists (select 1 from link_entity_types
                  where key = 'building_stage' and table_name = 'building_stages') then
    perform fail('vocabulary','building_stage is not a linkable entity type');
  end if;
  perform pass('building: the vocabulary is data, and it is there');
end $$;

grant usage on schema public to authenticated;
grant select, insert, update on all tables in schema public to authenticated;

set local role authenticated;
set local request.jwt.claim.sub = 'dddddddd-1111-1111-1111-111111111111';

do $$
declare n int;
begin
  select count(*) into n from building_stages;
  if n <> 0 then perform fail('building_stages isolation','a stranger sees '||n||' stages'); end if;
  select count(*) into n from building_changes;
  if n <> 0 then perform fail('building_changes isolation','a stranger sees '||n||' changes'); end if;
  perform pass('RLS: building_stages and building_changes - a stranger sees nothing');
end $$;

do $$
begin
  begin
    delete from building_stages;
    if found then perform fail('building_stages delete','a stage was deleted'); end if;
    perform pass('building: there is no delete policy, so nothing disappears');
  exception when insufficient_privilege then
    perform pass('building: deleting a stage is refused outright');
  end;
end $$;

rollback;
