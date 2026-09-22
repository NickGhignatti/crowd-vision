-- A sensor is a device, not a metric: one router reports both device counts.
update sensors
set sensor_type = 'router'
where sensor_type in ('totalDeviceCount', 'ratioDeviceCount');
