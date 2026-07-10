drop index if exists domains_parent_id_idx;
alter table domains drop column if exists parent_id;
