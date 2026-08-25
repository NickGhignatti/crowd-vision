-- no-transaction
create materialized view readings_hourly
with (timescaledb.continuous, timescaledb.materialized_only = false) as
select time_bucket('1 hour', ts) as bucket,
       building_id, room_id, metric,
       avg(value) as avg, min(value) as min, max(value) as max,
       sum(value) as sum, count(*) as samples
from readings
group by 1, 2, 3, 4
with no data;

select add_continuous_aggregate_policy('readings_hourly',
  start_offset      => interval '3 days',
  end_offset        => interval '1 hour',
  schedule_interval => interval '1 hour');
