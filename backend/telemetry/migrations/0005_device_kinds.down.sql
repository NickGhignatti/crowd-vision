-- Lossy: a router cannot say which of its two metrics it was registered under.
update sensors
set sensor_type = 'totalDeviceCount'
where sensor_type = 'router';
