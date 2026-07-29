-- Subdomains: a domain hierarchy, replacing auth-service's Mongoose
-- `subdomains: [ObjectId]` array. Kept as a self-referencing parent_id
-- (not a join table) since a subdomain has exactly one parent — mirrors
-- the original model's shape. ON DELETE CASCADE: deleting a parent domain
-- removes its subdomains too, same cascade philosophy as the
-- domains -> memberships relationship in 0001.
alter table domains add column parent_id uuid references domains(id) on delete cascade;
create index domains_parent_id_idx on domains (parent_id);
