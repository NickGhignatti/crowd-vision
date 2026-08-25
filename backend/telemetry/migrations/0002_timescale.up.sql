create extension if not exists timescaledb;

select create_hypertable('readings', by_range('ts'));

alter table readings set (
  timescaledb.compress,
  timescaledb.compress_segmentby = 'building_id, room_id, metric',
  timescaledb.compress_orderby   = 'ts desc'
);
select add_compression_policy('readings', interval '7 days');

select add_retention_policy('readings', interval '14 days');
