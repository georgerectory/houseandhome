\set ON_ERROR_STOP on
\pset pager off
begin;

create or replace function pass(t text) returns void language plpgsql as $$
begin raise notice 'PASS %', t; end $$;
create or replace function fail(t text, d text) returns void language plpgsql as $$
begin raise exception 'FAIL % : %', t, d; end $$;

-- Two households, two users. The test is simply: can user B see or
-- touch anything of household A's? The answer must be no, on every
-- table, with no exceptions and no reliance on the client behaving.
insert into households (id, name) values
  ('aaaaaaaa-0000-0000-0000-000000000001','House A'),
  ('bbbbbbbb-0000-0000-0000-000000000001','House B');

insert into household_members (household_id, user_id) values
  ('aaaaaaaa-0000-0000-0000-000000000001','aaaaaaaa-1111-1111-1111-111111111111'),
  ('bbbbbbbb-0000-0000-0000-000000000001','bbbbbbbb-1111-1111-1111-111111111111');

insert into work_items (household_id, title, kind, cost_expected, cost_confidence)
values ('aaaaaaaa-0000-0000-0000-000000000001','A private job','renovation',100,'confirmed'),
       ('bbbbbbbb-0000-0000-0000-000000000001','B private job','renovation',100,'confirmed');

insert into bills (household_id, name, amount) values
  ('aaaaaaaa-0000-0000-0000-000000000001','A energy bill', 120),
  ('bbbbbbbb-0000-0000-0000-000000000001','B energy bill', 130);

grant usage on schema public to authenticated;
grant select, insert, update on all tables in schema public to authenticated;

-- Become user B.
set local role authenticated;
set local request.jwt.claim.sub = 'bbbbbbbb-1111-1111-1111-111111111111';

do $$
declare n int;
begin
  select count(*) into n from work_items;
  if n <> 1 then perform fail('work_items isolation','user B sees '||n||' rows, expected only their own'); end if;
  if not exists (select 1 from work_items where title='B private job') then
    perform fail('work_items isolation','user B cannot see their own row'); end if;
  perform pass('RLS: work_items - user B sees only their own household');
end $$;

do $$
declare n int;
begin
  select count(*) into n from bills;
  if n <> 1 then perform fail('bills isolation','user B sees '||n||' bill rows'); end if;
  perform pass('RLS: bills - user B sees only their own household');
end $$;

do $$
declare n int;
begin
  select count(*) into n from households;
  if n <> 1 then perform fail('households isolation','user B sees '||n||' households'); end if;
  perform pass('RLS: households - user B sees only their own');
end $$;

-- Writing into someone else's household must be refused outright.
do $$
begin
  begin
    insert into work_items (household_id, title, kind)
    values ('aaaaaaaa-0000-0000-0000-000000000001','Injected into A','renovation');
    perform fail('cross-household insert','user B wrote a row into household A');
  exception when insufficient_privilege then
    perform pass('RLS: user B cannot insert into another household');
  end;
end $$;

-- Updating a row they cannot see must affect nothing.
do $$
declare n int;
begin
  update work_items set title = 'hijacked' where title = 'A private job';
  get diagnostics n = row_count;
  if n <> 0 then perform fail('cross-household update','user B updated '||n||' of household A''s rows'); end if;
  perform pass('RLS: user B cannot update another household''s rows');
end $$;

-- current_household() must resolve to B's, never A's.
do $$
begin
  if current_household() <> 'bbbbbbbb-0000-0000-0000-000000000001' then
    perform fail('current_household','resolved to the wrong household');
  end if;
  perform pass('RLS: current_household() resolves to the caller''s own household');
end $$;

-- house_context() is the assistant's entry point; it must be scoped too.
do $$
declare ctx jsonb;
begin
  ctx := house_context(null);
  if ctx::text like '%A private job%' then
    perform fail('house_context leak','another household''s work appeared in context');
  end if;
  perform pass('RLS: house_context() does not leak across households');
end $$;

-- A user with no membership at all sees nothing anywhere.
set local request.jwt.claim.sub = 'cccccccc-1111-1111-1111-111111111111';
do $$
declare n int;
begin
  select count(*) into n from work_items;
  if n <> 0 then perform fail('stranger isolation','a non-member saw '||n||' work items'); end if;
  select count(*) into n from bills;
  if n <> 0 then perform fail('stranger isolation','a non-member saw '||n||' bills'); end if;
  if current_household() is not null then
    perform fail('stranger isolation','a non-member resolved a household'); end if;
  perform pass('RLS: a user with no membership sees nothing at all');
end $$;

reset role;
rollback;
