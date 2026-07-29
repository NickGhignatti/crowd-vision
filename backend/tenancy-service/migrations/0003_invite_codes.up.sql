-- Replaces auth-service's TOTP-QR domain invite flow: a business_admin
-- generates a redeemable code for a domain+role, handed out (link, QR,
-- whatever) to someone whose account isn't known in advance. Any
-- authenticated user can redeem it once. This is a proper invite token
-- rather than a ported TOTP scheme — TOTP was a workaround for not having a
-- real IdP; Keycloak's login already covers "prove who you are", so the
-- invite code only needs to answer "which domain, which role, still valid?".
create table invite_codes (
  id           uuid primary key default gen_random_uuid(),
  domain_id    uuid not null references domains(id) on delete cascade,
  code         text not null unique,
  role         text not null,
  created_by   uuid not null,
  expires_at   timestamptz not null,
  redeemed_by  uuid,
  redeemed_at  timestamptz,
  created_at   timestamptz not null default now()
);

create index invite_codes_domain_id_idx on invite_codes (domain_id);
