-- A building's device key is derived from the master key and this epoch; bumping it revokes the key.
alter table buildings add column device_key_epoch integer not null default 0;
