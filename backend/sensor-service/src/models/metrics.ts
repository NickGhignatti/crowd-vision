export type MetricFieldType = "string" | "number" | "boolean" | "integer";

export interface MetricFieldContract {
  name: string;
  type: MetricFieldType;
  required: boolean;
  description?: string;
}

export interface MetricContract {
  metricKey: string;
  label: string;
  interfaceName: string;
  unit?: string;
  fields: MetricFieldContract[];
}

export interface ServiceMetricsContract {
  service: string;
  metrics: MetricContract[];
}

export const SENSOR_METRICS_CONTRACT: ServiceMetricsContract = {
  service: "sensor-service",
  metrics: [
    {
      metricKey: "peopleCount",
      label: "People Count",
      interfaceName: "IPeopleCount",
      unit: "people",
      fields: [
        { name: "building", type: "string", required: true },
        { name: "roomId", type: "string", required: true },
        {
          name: "timestamp",
          type: "integer",
          required: true,
          description: "Unix timestamp in milliseconds",
        },
        { name: "peopleCount", type: "integer", required: true },
      ],
    },
    {
      metricKey: "temperature",
      label: "Temperature",
      interfaceName: "ITemperature",
      unit: "C",
      fields: [
        { name: "building", type: "string", required: true },
        { name: "roomId", type: "string", required: true },
        {
          name: "timestamp",
          type: "integer",
          required: true,
          description: "Unix timestamp in milliseconds",
        },
        { name: "temperature", type: "number", required: true },
      ],
    },
    {
      metricKey: "airQuality",
      label: "Air Quality",
      interfaceName: "IAirQuality",
      fields: [
        { name: "building", type: "string", required: true },
        { name: "roomId", type: "string", required: true },
        {
          name: "timestamp",
          type: "integer",
          required: true,
          description: "Unix timestamp in milliseconds",
        },
        {
          name: "scenario",
          type: "string",
          required: false,
          description: "Simulation scenario identifier",
        },
        { name: "pm25", type: "number", required: true },
        { name: "pm10", type: "number", required: true },
        { name: "co2", type: "number", required: true },
        { name: "voc", type: "number", required: true },
        { name: "temperature", type: "number", required: true },
        { name: "humidity", type: "number", required: true },
        { name: "aqi", type: "number", required: true },
        { name: "indoor_aqi", type: "number", required: true },
      ],
    },
  ],
};
