create table domains (
  id           uuid primary key default gen_random_uuid(),
  name         text not null unique,
  display_name text not null,
  sso_config   jsonb,
  join_policy  text not null default 'invite-only'
               check (join_policy in ('open-via-idp', 'invite-only')),
  created_at   timestamptz not null default now()
);

-- account_id is a Keycloak subject id, deliberately NOT a foreign key: identity
-- lives in Keycloak, a separate service with its own database (Postgres-per-
-- service). Cross-service cleanup happens via the account.deleted event
-- consumer (internal/events), not a database constraint.
create table memberships (
  account_id  uuid not null,
  domain_id   uuid not null references domains(id) on delete cascade,
  role        text not null,
  external_id text,
  joined_via  text not null default 'invite'
              check (joined_via in ('self-idp', 'invite', 'local')),
  created_at  timestamptz not null default now(),
  primary key (account_id, domain_id)
);

create index memberships_account_id_idx on memberships (account_id);
