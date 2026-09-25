-- Sensor ids are server-generated, so unique on their own; room_id null = outside every room.
alter table sensors drop constraint sensors_pkey;
alter table sensors add primary key (sensor_id);
alter table sensors alter column room_id drop not null;

alter table sensors add column name text;
update sensors set name = sensor_id;
alter table sensors alter column name set not null;

create index sensors_building_room_idx on sensors (building_id, room_id);
