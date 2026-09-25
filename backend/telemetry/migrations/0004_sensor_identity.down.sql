-- Lossy: an outdoor sensor has no room to key on under the old primary key.
drop index sensors_building_room_idx;
delete from sensors where room_id is null;
alter table sensors drop column name;
alter table sensors alter column room_id set not null;
alter table sensors drop constraint sensors_pkey;
alter table sensors add primary key (building_id, room_id, sensor_id);
