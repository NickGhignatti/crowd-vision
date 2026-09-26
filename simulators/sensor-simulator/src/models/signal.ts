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

export interface ICoordinates {
  x: number;
  y: number;
  z: number;
}

export interface ISimulatedSensor {
  sensorId: string;
  sensorType: string;
  roomId: string;
  position?: ICoordinates;
}

export interface IRoom {
  roomId: string;
  position: ICoordinates;
  dimensions: { width: number; height: number; depth: number };
}

export interface IBuilding {
  buildingId: string;
  sensors: ISimulatedSensor[];
  rooms?: IRoom[];
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const onlyKeys = (value: Record<string, unknown>, keys: string[]) =>
  Object.keys(value).every((key) => keys.includes(key));

const nonEmpty = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0;

const numbers = <K extends string>(
  value: unknown,
  keys: readonly K[],
  what: string,
): Record<K, number> => {
  if (
    !isRecord(value) ||
    !onlyKeys(value, [...keys]) ||
    !keys.every((key) => Number.isFinite(value[key]))
  ) {
    throw new Error(`${what} must carry exactly ${keys.join(", ")} as numbers`);
  }
  return value as Record<K, number>;
};

const parsePosition = (value: unknown): ICoordinates =>
  numbers(value, ["x", "y", "z"] as const, "a position");

const parseSensor = (value: unknown): ISimulatedSensor => {
  if (
    !isRecord(value) ||
    !onlyKeys(value, ["sensorId", "sensorType", "roomId", "position"])
  ) {
    throw new Error(
      "a sensor must carry sensorId, sensorType, roomId and an optional position",
    );
  }
  const { sensorId, sensorType, roomId, position } = value;
  if (!nonEmpty(sensorId) || !nonEmpty(sensorType) || !nonEmpty(roomId)) {
    throw new Error(
      "a sensor's sensorId, sensorType and roomId must be non-empty strings",
    );
  }
  return position === undefined
    ? { sensorId, sensorType, roomId }
    : { sensorId, sensorType, roomId, position: parsePosition(position) };
};

const parseRoom = (value: unknown): IRoom => {
  if (
    !isRecord(value) ||
    !onlyKeys(value, ["roomId", "position", "dimensions"]) ||
    !nonEmpty(value["roomId"])
  ) {
    throw new Error("a room must carry roomId, position and dimensions");
  }
  const dimensions = numbers(
    value["dimensions"],
    ["width", "height", "depth"] as const,
    "a room's dimensions",
  );
  if (Object.values(dimensions).some((side) => side <= 0)) {
    throw new Error("every side of a room must be greater than zero");
  }
  return {
    roomId: value["roomId"],
    position: parsePosition(value["position"]),
    dimensions,
  };
};

/** Reads the body telemetry sends to /control/start, throwing on any other shape. */
export const parseStart = (body: unknown): IBuilding => {
  // An extra key is refused so the old `targetUrl` can never choose where readings go.
  if (!isRecord(body) || !onlyKeys(body, ["buildingId", "sensors", "rooms"])) {
    throw new Error(
      "the body must carry buildingId, sensors and optional rooms",
    );
  }
  if (!nonEmpty(body["buildingId"])) {
    throw new Error("buildingId must be a non-empty string");
  }
  if (!Array.isArray(body["sensors"])) {
    throw new Error("sensors must be an array");
  }
  const start: IBuilding = {
    buildingId: body["buildingId"],
    sensors: body["sensors"].map(parseSensor),
  };
  if (body["rooms"] === undefined) return start;
  if (!Array.isArray(body["rooms"]) || body["rooms"].length === 0) {
    throw new Error("rooms, when sent, must be a non-empty array");
  }
  return { ...start, rooms: body["rooms"].map(parseRoom) };
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
