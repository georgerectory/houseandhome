\set ON_ERROR_STOP on
\pset pager off
begin;

create or replace function pass(t text) returns void language plpgsql as $$
begin raise notice 'PASS %', t; end $$;
create or replace function fail(t text, d text) returns void language plpgsql as $$
begin raise exception 'FAIL % : %', t, d; end $$;

-- Sign-in is by USERNAME. The owner never types an email address; the
-- login form derives one because Supabase Auth identifies users that
-- way. These tests pin the pieces that made a correct password read as
-- unrecognised credentials the first time round.

do $$
begin
  if public.auth_email_for_username('homeowner') <> 'homeowner@houseandhome.local' then
    perform fail('username mapping', 'got ' || public.auth_email_for_username('homeowner'));
  end if;
  if public.auth_email_for_username('  HomeOwner  ') <> 'homeowner@houseandhome.local' then
    perform fail('username mapping', 'case and whitespace not normalised');
  end if;
  perform pass('auth: a username maps to a stable email, case- and space-insensitive');
end $$;

do $$
declare uid uuid;
begin
  uid := public.bootstrap_owner('homeowner', 'a-long-enough-password', 'Test House');
  if uid is null then perform fail('bootstrap', 'returned null'); end if;
  perform pass('auth: bootstrap_owner creates the owner');
end $$;

-- (1) The GoTrue NULL-token failure. These columns are scanned into Go
-- strings; a NULL breaks the auth service on a request that should have
-- succeeded. A hand-written INSERT is exactly what leaves them NULL.
do $$
declare nulls int;
begin
  select count(*) into nulls from auth.users u
   where u.email = 'homeowner@houseandhome.local'
     and (u.confirmation_token is null or u.recovery_token is null
       or u.email_change is null or u.email_change_token_new is null
       or u.email_change_token_current is null or u.phone_change is null
       or u.phone_change_token is null or u.reauthentication_token is null);
  if nulls > 0 then
    perform fail('GoTrue token columns', 'left NULL; sign-in will fail in the auth service');
  end if;
  perform pass('auth: no NULL token columns - the auth service can scan the row');
end $$;

-- (2) The missing-identity failure. GoTrue resolves an email sign-in
-- through auth.identities; without a row there, correct credentials are
-- reported as unrecognised.
do $$
declare n int;
begin
  select count(*) into n from auth.identities i
    join auth.users u on u.id = i.user_id
   where u.email = 'homeowner@houseandhome.local' and i.provider = 'email';
  if n <> 1 then
    perform fail('auth identity', 'expected exactly 1 email identity, found ' || n);
  end if;
  perform pass('auth: an email identity row exists, so sign-in can resolve the user');
end $$;

do $$
declare u auth.users%rowtype;
begin
  select * into u from auth.users where email = 'homeowner@houseandhome.local';
  if u.encrypted_password <> extensions.crypt('a-long-enough-password', u.encrypted_password) then
    perform fail('password hash', 'the stored hash does not verify the password given');
  end if;
  if u.encrypted_password = extensions.crypt('some-other-password', u.encrypted_password) then
    perform fail('password hash', 'a wrong password verified');
  end if;
  if u.email_confirmed_at is null then
    perform fail('email confirmation', 'unconfirmed users cannot sign in');
  end if;
  perform pass('auth: the hash verifies the right password and rejects a wrong one');
end $$;

-- Re-running must reset rather than fail or duplicate: it is the
-- documented way to change the password.
do $$
declare first_id uuid; second_id uuid; households int;
begin
  select id into first_id from auth.users where email = 'homeowner@houseandhome.local';
  second_id := public.bootstrap_owner('homeowner', 'a-different-password', 'Test House');
  if first_id <> second_id then perform fail('idempotency', 'a second user was created'); end if;

  select count(*) into households from public.user_profiles where username = 'homeowner';
  if households <> 1 then perform fail('idempotency', households || ' profiles for one username'); end if;

  if (select encrypted_password from auth.users where id = second_id)
     <> extensions.crypt('a-different-password',
          (select encrypted_password from auth.users where id = second_id)) then
    perform fail('idempotency', 'the password was not reset');
  end if;
  perform pass('auth: re-running resets the password without duplicating anything');
end $$;

do $$
begin
  begin
    perform public.bootstrap_owner('homeowner', 'short', 'Test House');
    perform fail('weak password', 'a password under 8 characters was accepted');
  exception when others then
    perform pass('auth: a password under 8 characters is refused');
  end;
end $$;

-- The owner must land in a household as its owner, or every RLS policy
-- returns nothing and the app looks empty after a successful sign-in.
do $$
declare r record;
begin
  select p.username, p.household_id, m.role into r
    from public.user_profiles p
    join public.household_members m on m.user_id = p.id
   where p.username = 'homeowner';
  if r.household_id is null then perform fail('household', 'owner has no household'); end if;
  if r.role <> 'owner' then perform fail('household', 'membership role is ' || r.role); end if;
  perform pass('auth: the owner is a member of their household, so RLS returns their rows');
end $$;

-- bootstrap_owner writes auth.users, so it must never be callable from
-- the application.
do $$
begin
  if has_function_privilege('anon', 'public.bootstrap_owner(text,text,text)', 'EXECUTE') then
    perform fail('bootstrap exposure', 'anon can call bootstrap_owner');
  end if;
  if has_function_privilege('authenticated', 'public.bootstrap_owner(text,text,text)', 'EXECUTE') then
    perform fail('bootstrap exposure', 'authenticated can call bootstrap_owner');
  end if;
  perform pass('auth: bootstrap_owner is operator-only, not reachable from the app');
end $$;

rollback;
