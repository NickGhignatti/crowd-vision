# Sensor Service

API service for ingesting and querying sensor data (people count, temperature, air quality).

## Air Quality API

- `POST /air-quality`
- `GET /air-quality?building=...&roomId=...`
- `GET /air-quality/entireBuilding?building=...`
- `GET /air-quality/dashboard?building=...&roomId=...&timeRange=1D`
- `GET /air-quality/dashboard/entireBuilding?building=...&timeRange=1W`

### Example payload

```json
{
  "buildingId": "building-123",
  "roomId": "room-A",
  "timestamp": 1712836800000,
  "scenario": "clean_indoor",
  "pm25": 6.2,
  "pm10": 12.5,
  "co2": 520,
  "voc": 120,
  "temperature": 21.8,
  "humidity": 45,
  "aqi": 32
}
```

