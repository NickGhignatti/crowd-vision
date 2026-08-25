select remove_retention_policy('readings', if_exists => true);
select remove_compression_policy('readings', if_exists => true);
alter table readings set (timescaledb.compress = false);
