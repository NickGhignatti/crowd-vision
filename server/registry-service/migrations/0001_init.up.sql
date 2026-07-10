-- organizations is a control-plane billing/provisioning entity, deliberately
-- distinct from tenancy-service's `domains`: an organization exists once
-- (registry-service, never deployed inside a cell); a domain is the pooled
-- cell's in-cluster tenant concept. Conflating the two was implicit in
-- earlier iterations of this design; this table keeps them separate.
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
