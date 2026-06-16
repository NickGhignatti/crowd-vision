import {
  jest,
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  afterEach,
} from "@jest/globals";
import { startMongo, stopMongo, clearCollections } from "../helpers/mongo.js";

const redisMock = {
  get: jest.fn<(key: string) => Promise<string | null>>(async () => null),
  setEx: jest.fn(async () => "OK"),
  publish: jest.fn(async () => 0),
};

jest.unstable_mockModule("src/config/redis.ts", () => ({
  __esModule: true,
  default: redisMock,
  connectRedis: jest.fn(),
}));

const { AirQualityService } = await import(
  "src/services/AirQualityModuleService.ts"
);

const svc = new AirQualityService();
const NOW = Date.now();

// AirQuality documents require every pollutant field; this fills them with a
// clean baseline so each test only overrides what it cares about.
const aqPayload = (over: Record<string, unknown> = {}) => ({
  buildingId: "b1",
  roomId: "r1",
  timestamp: NOW,
  pm25: 5,
  pm10: 10,
  co2: 400,
  voc: 0.1,
  temperature: 22,
  humidity: 40,
  aqi: 30,
  indoor_aqi: 25,
  ...over,
});

beforeAll(startMongo);
afterAll(stopMongo);
afterEach(clearCollections);

describe("AirQualityService.persistSignal / getLatest", () => {
  it("persists a reading that getLatest returns", async () => {
    await svc.persistSignal(aqPayload({ co2: 500 }));
    const latest = (await svc.getLatest("b1", "r1")) as { co2: number };
    expect(latest.co2).toBe(500);
  });

  it("throws when no reading exists", async () => {
    await expect(svc.getLatest("b1", "missing")).rejects.toThrow();
  });
});

describe("AirQualityService.getAllLatest", () => {
  it("aggregates the latest reading per room and caches it", async () => {
    await svc.persistSignal(aqPayload({ timestamp: NOW - 1000, indoor_aqi: 10 }));
    await svc.persistSignal(aqPayload({ timestamp: NOW, indoor_aqi: 40, pm25: 8 }));
    const result = (await svc.getAllLatest("b1")) as Array<{
      indoor_aqi: number;
      pm25: number;
    }>;
    expect(result).toHaveLength(1);
    expect(result[0]?.indoor_aqi).toBe(40);
    expect(result[0]?.pm25).toBe(8);
    expect(redisMock.setEx).toHaveBeenCalled();
  });

  it("returns the cached payload without querying Mongo", async () => {
    redisMock.get.mockResolvedValueOnce(
      JSON.stringify([{ roomId: "c", indoor_aqi: 1 }]),
    );
    expect(await svc.getAllLatest("b1")).toEqual([{ roomId: "c", indoor_aqi: 1 }]);
    expect(redisMock.setEx).not.toHaveBeenCalled();
  });
});

describe("AirQualityService.getDashboardData", () => {
  it("buckets readings and averages indoor AQI", async () => {
    await svc.persistSignal(aqPayload({ indoor_aqi: 20 }));
    await svc.persistSignal(aqPayload({ indoor_aqi: 40 }));
    const rows = (await svc.getDashboardData("b1", "1D", "r1", "avg")) as Array<{
      value: number;
    }>;
    expect(rows).toHaveLength(1);
    expect(rows[0]?.value).toBe(30);
  });
});

describe("AirQualityService thresholds", () => {
  it("returns null when no threshold is configured", async () => {
    expect(await svc.getBuildingThresholds("b1")).toBeNull();
  });

  it("upserts building thresholds and reads them back", async () => {
    await svc.updateBuildingThresholds("b1", 1200, 60);
    const t = (await svc.getBuildingThresholds("b1")) as {
      maxCo2: number;
      maxAqi: number;
    };
    expect(t.maxCo2).toBe(1200);
    expect(t.maxAqi).toBe(60);
  });

  it("creates the threshold document when setting a room override", async () => {
    await svc.updateRoomThresholds("b1", "r1", 1200, 60);
    expect(await svc.getBuildingThresholds("b1")).not.toBeNull();
  });
});

describe("AirQualityService.evaluateThresholds (via persistSignal)", () => {
  it("warns when CO2 exceeds the building max", async () => {
    await svc.updateBuildingThresholds("b1", 1000, 50);
    await svc.persistSignal(aqPayload({ co2: 5000, pm25: 5 }));
    expect(jest.mocked(console.warn)).toHaveBeenCalledWith(
      expect.stringContaining("CO2 anomaly"),
    );
  });

  it("does not warn when readings are within thresholds", async () => {
    await svc.updateBuildingThresholds("b1", 1000, 50);
    await svc.persistSignal(aqPayload({ co2: 400, pm25: 5 }));
    expect(jest.mocked(console.warn)).not.toHaveBeenCalled();
  });
});
