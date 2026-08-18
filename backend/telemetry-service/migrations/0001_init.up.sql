create table buildings (
  id            text primary key,
  name          text not null,
  registered_at timestamptz not null default now()
);

create table building_rooms (
  building_id text not null references buildings(id) on delete cascade,
  room_id     text not null,
  name        text not null,
  primary key (building_id, room_id)
);

create table sensors (
  building_id text not null,
  room_id     text not null,
  sensor_id   text not null,
  sensor_type text not null,
  driver      text,
  endpoint    text,
  created_at  timestamptz not null default now(),
  primary key (building_id, room_id, sensor_id)
);

-- room_id null = building-level. Room-level wins during resolution.
create table thresholds (
  building_id text not null,
  room_id     text,
  metric      text not null,
  bounds      jsonb not null,
  updated_at  timestamptz not null default now()
);
create unique index thresholds_key
  on thresholds (building_id, coalesce(room_id, ''), metric);

create table readings (
  building_id text not null,
  room_id     text not null,
  metric      text not null,
  ts          timestamptz not null,
  value       double precision not null,
  payload     jsonb not null default '{}'::jsonb
);
create index readings_lookup_idx
  on readings (building_id, metric, room_id, ts desc);
