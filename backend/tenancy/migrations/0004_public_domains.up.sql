-- Replaces auth-service's Mongoose `isVisibleFromOutside`: whether a domain
-- appears in the public "browse domains" listing. Deliberately independent
-- of join_policy — visibility and joinability are different axes (see
-- service.CreateOwnDomain's doc comment for how the two combine by default).
alter table domains add column is_public boolean not null default false;
create index domains_is_public_idx on domains (is_public) where is_public;
