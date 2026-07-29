create table organizations (
  id             uuid primary key default gen_random_uuid(),
  name           text not null unique,
  display_name   text not null,
  tier           text not null check (tier in ('pooled', 'dedicated', 'on-prem')),
  host           text,
  identity_mode  text not null default 'platform' check (identity_mode in ('platform', 'byo-idp')),
  issuer         text,
  license_status text not null default 'active' check (license_status in ('active', 'suspended', 'expired')),
  status         text not null default 'provisioning' check (status in ('provisioning', 'ready', 'failed', 'suspended')),
  status_detail  text,
  created_at     timestamptz not null default now()
);
