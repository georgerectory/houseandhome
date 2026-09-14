-- ------------------------------------------------------------------
-- 05_auth.sql - Who may sign in, and which household they belong to.
--
-- Supabase Auth owns credentials. Passwords live hashed in auth.users
-- and are never stored, mirrored or logged here. This file only holds
-- the mapping from an authenticated user to a household and a username.
--
-- USERNAME, NOT EMAIL. The owner signs in as "homeowner", but Supabase
-- Auth identifies users by email, so the login form appends a fixed
-- local domain: homeowner -> homeowner@houseandhome.local. The domain
-- is a constant in one place (auth_email_for_username below and its
-- mirror in assets/js/core/auth.js), because a username scheme spelled
-- differently in two places stops working the first time either moves.
--
-- NO PASSWORD APPEARS IN THIS REPOSITORY. bootstrap_owner() takes the
-- password as a parameter, so the operator supplies it at setup time
-- and it is hashed by Supabase's own crypt() before it lands anywhere.
--
-- TWO THINGS THAT MUST BE RIGHT WHEN CREATING A USER BY HAND, both of
-- which broke sign-in the first time and were found by calling the live
-- auth endpoint rather than by reading the row:
--
--   1. auth.users has a set of token columns GoTrue scans into Go
--      strings. Leaving them NULL - which a hand-written INSERT does -
--      makes the auth service fail on them. They must be ''.
--   2. GoTrue resolves an email sign-in through auth.identities. A user
--      row with no matching identity is reported as unrecognised
--      credentials, which reads exactly like a wrong password.
--
-- Supabase's own signup path does both. Anything that writes auth.users
-- directly has to do them too.
-- ------------------------------------------------------------------

create table if not exists public.user_profiles (
  -- Same id as auth.users. No foreign key: auth is a separate schema
  -- Supabase manages, and a hard FK here makes the migration order
  -- brittle for no benefit. The insert path checks the user exists.
  id           uuid primary key,
  household_id uuid not null references public.households (id) on delete cascade,
  username     text not null unique
    check (username ~ '^[a-z0-9_-]{3,32}$'),
  display_name text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists user_profiles_household_idx
  on public.user_profiles (household_id);

drop trigger if exists user_profiles_updated_at on public.user_profiles;
create trigger user_profiles_updated_at before update on public.user_profiles
  for each row execute function public.set_updated_at();

-- The one home for the username-to-email rule.
create or replace function public.auth_email_for_username(p_username text)
returns text
language sql
immutable
set search_path = public
as $$
  select lower(trim(p_username)) || '@houseandhome.local';
$$;

-- A signed-in user reads their own profile, and any profile in their
-- household. Same shape as every other policy in this schema: one
-- helper, one rule.
alter table public.user_profiles enable row level security;
alter table public.user_profiles force row level security;

drop policy if exists user_profiles_read on public.user_profiles;
create policy user_profiles_read on public.user_profiles
  for select to authenticated
  using (id = auth.uid() or public.is_household_member(household_id));

drop policy if exists user_profiles_update on public.user_profiles;
create policy user_profiles_update on public.user_profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

grant select, update on public.user_profiles to authenticated;
revoke all on public.user_profiles from anon;

-- ---------------------------------------------------------------
-- bootstrap_owner: create the first user, household and membership in
-- one idempotent call. Run once after applying the schema:
--
--   select public.bootstrap_owner('homeowner', '<the password>', 'House & Home');
--
-- Re-running it is safe: it resets the password of an existing owner
-- rather than failing or duplicating the household.
--
-- SECURITY DEFINER because it writes to auth.users, and revoked from
-- everyone: it is called once by the operator through the SQL editor or
-- an MCP session, never from the application. A bootstrap function
-- reachable by anon would be a way to mint accounts.
-- ---------------------------------------------------------------
create or replace function public.bootstrap_owner(
  p_username text,
  p_password text,
  p_household_name text default 'My Household'
)
returns uuid
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  v_email text := public.auth_email_for_username(p_username);
  v_user  uuid;
  v_hh    uuid;
begin
  if p_password is null or length(p_password) < 8 then
    raise exception 'password must be at least 8 characters';
  end if;

  select id into v_user from auth.users where email = v_email;

  if v_user is null then
    v_user := gen_random_uuid();
    insert into auth.users (
      id, instance_id, aud, role, email, encrypted_password,
      email_confirmed_at, created_at, updated_at,
      raw_app_meta_data, raw_user_meta_data,
      -- Empty strings, never NULL. See note (1) in the header.
      confirmation_token, recovery_token, email_change,
      email_change_token_new, email_change_token_current,
      phone_change, phone_change_token, reauthentication_token
    ) values (
      v_user, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
      v_email, extensions.crypt(p_password, extensions.gen_salt('bf')),
      now(), now(), now(),
      jsonb_build_object('provider', 'email', 'providers', array['email']),
      jsonb_build_object('username', lower(trim(p_username))),
      '', '', '', '', '', '', '', ''
    );
  else
    -- Already exists: reset the password rather than failing, so the
    -- call stays safe to repeat. Also repairs the NULL token columns on
    -- a row created before this was understood.
    update auth.users
       set encrypted_password = extensions.crypt(p_password, extensions.gen_salt('bf')),
           email_confirmed_at = coalesce(email_confirmed_at, now()),
           updated_at = now(),
           confirmation_token = coalesce(confirmation_token, ''),
           recovery_token = coalesce(recovery_token, ''),
           email_change = coalesce(email_change, ''),
           email_change_token_new = coalesce(email_change_token_new, ''),
           email_change_token_current = coalesce(email_change_token_current, ''),
           phone_change = coalesce(phone_change, ''),
           phone_change_token = coalesce(phone_change_token, ''),
           reauthentication_token = coalesce(reauthentication_token, '')
     where id = v_user;
  end if;

  -- See note (2) in the header: without this row, sign-in is refused as
  -- unrecognised credentials even though the password hash is correct.
  insert into auth.identities (
    id, user_id, provider_id, identity_data, provider,
    last_sign_in_at, created_at, updated_at)
  select gen_random_uuid(), v_user, v_user::text,
         jsonb_build_object('sub', v_user::text, 'email', v_email, 'email_verified', true),
         'email', now(), now(), now()
   where not exists (
     select 1 from auth.identities i where i.user_id = v_user and i.provider = 'email');

  select p.household_id into v_hh from public.user_profiles p where p.id = v_user;

  if v_hh is null then
    insert into public.households (name) values (p_household_name) returning id into v_hh;
    insert into public.household_members (household_id, user_id, role)
      values (v_hh, v_user, 'owner')
      on conflict (household_id, user_id) do nothing;
    insert into public.user_profiles (id, household_id, username, display_name)
      values (v_user, v_hh, lower(trim(p_username)), p_household_name)
      on conflict (id) do update set household_id = excluded.household_id;

    -- Give the new household the things every household needs exactly
    -- one of, so the app has somewhere to put a contribution and a
    -- curve on day one.
    insert into public.pots (household_id, name, contribution_confidence)
      values (v_hh, 'House pot', 'drafted');
    insert into public.allocation_settings (household_id) values (v_hh)
      on conflict (household_id) do nothing;
  end if;

  return v_user;
end;
$$;

revoke all on function public.bootstrap_owner(text, text, text) from public, anon, authenticated;

comment on function public.bootstrap_owner(text, text, text) is
  'Operator-only. Creates or resets the owner account and its household. Never callable from the application; the password is a parameter so it is never stored in the repository.';
