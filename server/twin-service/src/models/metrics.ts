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

interface IRoomName {
    buildingId: string;
    roomId: string;
    name: string;
}

interface IRoomMaxOccupancy {
    buildingId: string;
    roomId: string;
    maxOccupancy: number;
}

export const DIGITAL_TWIN_METRICS_CONTRACT: ServiceMetricsContract = {
    service: "digital-twin-service",
    metrics: [
        {
            metricKey: "roomName",
            label: "Room Name",
            interfaceName: "IRoomName",
            unit: "string",
            fields: [
                { name: "buildingId", type: "string", required: true },
                { name: "roomId", type: "string", required: true },
                { name: "name", type: "string", required: true },
            ],
        },
        {
            metricKey: "roomMaxOccupancy",
            label: "Room Max Occupancy",
            interfaceName: "IRoomMaxOccupancy",
            unit: "people",
            fields: [
                { name: "buildingId", type: "string", required: true },
                { name: "roomId", type: "string", required: true },
                { name: "maxOccupancy", type: "integer", required: true },
            ],
        }
    ],
};
