drop index readings_key;
create index readings_lookup_idx
  on readings (building_id, metric, room_id, ts desc);
