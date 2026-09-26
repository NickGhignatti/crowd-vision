interface SimulationBuildings {
  activeBuildings: IBuilding[];
  push(building: IBuilding): void;
}

export const mySimulationBuildings: SimulationBuildings = {
  activeBuildings: [],
  push(building: IBuilding) {
    this.activeBuildings = this.activeBuildings.filter(
      (t) => t.buildingId !== building.buildingId,
    );
    this.activeBuildings.push(building);
  },
};

export interface ISimulatedSensor {
  sensorId: string;
  sensorType: string;
  roomId: string;
}

export interface IBuilding {
  buildingId: string;
  sensors: ISimulatedSensor[];
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const onlyKeys = (value: Record<string, unknown>, keys: string[]) =>
  Object.keys(value).every((key) => keys.includes(key));

const nonEmpty = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0;

const parseSensor = (value: unknown): ISimulatedSensor => {
  const keys = ["sensorId", "sensorType", "roomId"];
  if (!isRecord(value) || !onlyKeys(value, keys)) {
    throw new Error(`a sensor must carry exactly ${keys.join(", ")}`);
  }
  const { sensorId, sensorType, roomId } = value;
  if (!nonEmpty(sensorId) || !nonEmpty(sensorType) || !nonEmpty(roomId)) {
    throw new Error(
      "a sensor's sensorId, sensorType and roomId must be non-empty strings",
    );
  }
  return { sensorId, sensorType, roomId };
};

/** Reads the body telemetry sends to /control/start, throwing on any other shape. */
export const parseStart = (body: unknown): IBuilding => {
  // An extra key is refused so the old `targetUrl` can never choose where readings go.
  if (!isRecord(body) || !onlyKeys(body, ["buildingId", "sensors"])) {
    throw new Error("the body must carry exactly buildingId and sensors");
  }
  if (!nonEmpty(body["buildingId"])) {
    throw new Error("buildingId must be a non-empty string");
  }
  if (!Array.isArray(body["sensors"])) {
    throw new Error("sensors must be an array");
  }
  return {
    buildingId: body["buildingId"],
    sensors: body["sensors"].map(parseSensor),
  };
};

export interface ISignalPeopleCount {
  roomId: string;
  timestamp: number;
  peopleCount: number;
}

export interface ISignalTemperature {
  roomId: string;
  timestamp: number;
  temperature: number;
}
