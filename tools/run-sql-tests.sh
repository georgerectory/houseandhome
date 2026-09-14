#!/usr/bin/env bash
# Apply the schema to a throwaway Postgres and run the SQL test suites.
#
# There is no Supabase in CI and none is needed: the schema is plain
# Postgres plus a two-line shim for auth.uid() and the anon/authenticated
# roles. Testing against a real server rather than a linter is the only
# way the triggers, policies and the allocation settlement get exercised.
set -euo pipefail

PGBIN="${PGBIN:-$(ls -d /usr/lib/postgresql/*/bin | tail -1)}"
PGDIR="${PGDIR:-/var/tmp/pgdata}"
PGSOCK="${PGSOCK:-/var/tmp}"
PGPORT="${PGPORT:-5433}"
DB=househome_test
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUNAS="${RUNAS:-postgres}"

as_pg() { if [ "$(id -u)" = "0" ]; then su "$RUNAS" -c "$1"; else bash -c "$1"; fi; }

if ! as_pg "$PGBIN/pg_isready -h $PGSOCK -p $PGPORT" >/dev/null 2>&1; then
  echo "Starting a throwaway Postgres in $PGDIR"
  rm -rf "$PGDIR"; mkdir -p "$PGDIR"
  [ "$(id -u)" = "0" ] && chown "$RUNAS:$RUNAS" "$PGDIR" && chmod 700 "$PGDIR"
  as_pg "$PGBIN/initdb -D $PGDIR -U postgres --auth=trust" >/dev/null
  as_pg "$PGBIN/pg_ctl -D $PGDIR -l /var/tmp/pg.log -o '-k $PGSOCK -p $PGPORT -c listen_addresses=' start" >/dev/null
  sleep 2
fi

STAGE=$(mktemp -d /var/tmp/houseandhome-sql.XXXXXX)
cp "$ROOT"/supabase/schema/*.sql "$ROOT"/tests/sql/*.sql "$STAGE"/
cat > "$STAGE/00_shim.sql" <<'SQL'
-- Local-only: Supabase supplies these. Never applied to a real project.
create schema if not exists auth;
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
-- Minimal stand-in for the Supabase-managed auth.users table, so the
-- bootstrap path can be exercised locally.
create table if not exists auth.users (
  id uuid primary key,
  instance_id uuid,
  aud text,
  role text,
  email text unique,
  encrypted_password text,
  email_confirmed_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  raw_app_meta_data jsonb,
  raw_user_meta_data jsonb,
  confirmation_token text, recovery_token text, email_change text,
  email_change_token_new text, email_change_token_current text,
  phone_change text, phone_change_token text, reauthentication_token text
);
create table if not exists auth.identities (
  id uuid primary key, user_id uuid not null, provider_id text not null,
  identity_data jsonb, provider text not null,
  last_sign_in_at timestamptz, created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create or replace function auth.uid() returns uuid
  language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
do $$ begin
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
end $$;
SQL
chmod -R a+r "$STAGE"; chmod a+x "$STAGE"

psql_run() { as_pg "$PGBIN/psql -h $PGSOCK -p $PGPORT -U postgres $*"; }

psql_run "-q -c 'drop database if exists $DB' -c 'create database $DB'" >/dev/null
psql_run "-q -d $DB -v ON_ERROR_STOP=1 -f $STAGE/00_shim.sql" >/dev/null

echo "Applying schema..."
for f in "$ROOT"/supabase/schema/*.sql; do
  b=$(basename "$f")
  if ! psql_run "-q -d $DB -v ON_ERROR_STOP=1 -f $STAGE/$b" 2>&1 | grep -v NOTICE | grep -q .; then :; else
    echo "  schema error in $b"; psql_run "-q -d $DB -v ON_ERROR_STOP=1 -f $STAGE/$b" 2>&1 | grep -v NOTICE | head; exit 1
  fi
done
echo "  schema applied"

pass=0; fail=0
for t in "$ROOT"/tests/sql/*.test.sql; do
  b=$(basename "$t")
  echo ""
  echo "== $b"
  out=$(psql_run "-q -d $DB -f $STAGE/$b" 2>&1 || true)
  echo "$out" | grep -E 'PASS|FAIL|ERROR' | sed 's/^NOTICE:  //; s/psql:[^ ]* //' || true
  pass=$((pass + $(echo "$out" | grep -c 'PASS' || true)))
  fail=$((fail + $(echo "$out" | grep -cE 'FAIL|ERROR' || true)))
done

rm -rf "$STAGE"
echo ""
echo "-------------------------------------"
echo "SQL suites: $pass passed, $fail failed"
[ "$fail" -eq 0 ] || exit 1
