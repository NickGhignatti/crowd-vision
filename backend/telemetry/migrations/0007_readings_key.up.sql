-- A retried batch must not be stored twice. The key replaces the lookup index: same columns, now unique.
delete from readings a
using readings b
where a.building_id = b.building_id and a.room_id = b.room_id
  and a.metric = b.metric and a.ts = b.ts
  and a.tableoid = b.tableoid and a.ctid > b.ctid;

drop index readings_lookup_idx;
create unique index readings_key
  on readings (building_id, metric, room_id, ts desc);
