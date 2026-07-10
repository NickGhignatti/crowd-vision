drop index if exists domains_is_public_idx;
alter table domains drop column if exists is_public;
