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

// Redis is the service's cache + alert bus — mock it so tests exercise Mongo
// logic without a broker. unstable_mockModule (unlike jest.mock) is not hoisted
// and may close over `redisMock`.
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

const { TemperatureService } = await import(
  "src/services/TemperatureModuleService.ts"
);
const { Temperature } = await import("src/models/temperatureSignal.ts");

const svc = new TemperatureService();
const NOW = Date.now();

beforeAll(startMongo);
afterAll(stopMongo);
afterEach(clearCollections);

describe("TemperatureService.persistSignal / getLatest", () => {
  it("persists a reading that getLatest returns", async () => {
    await svc.persistSignal("b1", "r1", NOW, 21.5);
    const latest = (await svc.getLatest("b1", "r1")) as {
      temperature: number;
      building: string;
    };
    expect(latest.temperature).toBe(21.5);
    expect(latest.building).toBe("b1");
  });

  it("returns the most recent reading by timestamp", async () => {
    await svc.persistSignal("b1", "r1", NOW - 1000, 10);
    await svc.persistSignal("b1", "r1", NOW, 30);
    const latest = (await svc.getLatest("b1", "r1")) as { temperature: number };
    expect(latest.temperature).toBe(30);
  });

  it("throws when no reading exists", async () => {
    await expect(svc.getLatest("b1", "missing")).rejects.toThrow();
  });
});

describe("TemperatureService.getAllLatest", () => {
  it("aggregates the latest reading per room and caches the result", async () => {
    await svc.persistSignal("b1", "r1", NOW - 1000, 10);
    await svc.persistSignal("b1", "r1", NOW, 20);
    await svc.persistSignal("b1", "r2", NOW, 25);

    const result = (await svc.getAllLatest("b1")) as Array<{
      roomId: string;
      value: number;
    }>;

    expect(result).toHaveLength(2);
    expect(result.find((r) => r.roomId === "r1")?.value).toBe(20);
    expect(redisMock.setEx).toHaveBeenCalledWith(
      "sensor:latest:temperature:b1",
      10,
      expect.any(String),
    );
  });

  it("returns the cached payload without querying Mongo", async () => {
    redisMock.get.mockResolvedValueOnce(
      JSON.stringify([{ roomId: "cached", value: 99 }]),
    );
    const result = await svc.getAllLatest("b1");
    expect(result).toEqual([{ roomId: "cached", value: 99 }]);
    expect(redisMock.setEx).not.toHaveBeenCalled();
  });
});

describe("TemperatureService.getDashboardData", () => {
  it("buckets readings and aggregates with the requested mode", async () => {
    await Temperature.create([
      { building: "b1", roomId: "r1", timestamp: NOW, temperature: 20 },
      { building: "b1", roomId: "r1", timestamp: NOW, temperature: 30 },
    ]);
    const rows = (await svc.getDashboardData("b1", "1D", "r1", "avg")) as Array<{
      value: number;
    }>;
    expect(rows).toHaveLength(1);
    expect(rows[0]?.value).toBe(25);
  });
});

describe("TemperatureService thresholds", () => {
  it("returns null when no threshold is configured", async () => {
    expect(await svc.getBuildingThresholds("b1")).toBeNull();
  });

  it("upserts building thresholds and reads them back", async () => {
    await svc.updateBuildingThresholds("b1", 26, 18);
    const t = (await svc.getBuildingThresholds("b1")) as {
      maxTemp: number;
      minTemp: number;
    };
    expect(t.maxTemp).toBe(26);
    expect(t.minTemp).toBe(18);
  });

  it("creates the threshold document when setting a room override", async () => {
    await svc.updateRoomThresholds("b1", "r1", 24, 16);
    expect(await svc.getBuildingThresholds("b1")).not.toBeNull();
  });
});

describe("TemperatureService.evaluateThresholds (via persistSignal)", () => {
  it("publishes an alert when temperature exceeds the building max", async () => {
    await svc.updateBuildingThresholds("b1", 25, 15);
    await svc.persistSignal("b1", "r1", NOW, 40);
    expect(redisMock.publish).toHaveBeenCalledWith(
      "alerts:temperature",
      expect.any(String),
    );
  });

  it("does not publish when no threshold is configured", async () => {
    await svc.persistSignal("b1", "r1", NOW, 40);
    expect(redisMock.publish).not.toHaveBeenCalled();
  });

  const publishedPayload = () =>
    JSON.parse(redisMock.publish.mock.calls[0]?.[1] as string);

  it("tags an over-max breach as a high alert with the breached threshold", async () => {
    await svc.updateBuildingThresholds("b1", 25, 15);
    await svc.persistSignal("b1", "r1", NOW, 40);
    expect(publishedPayload()).toMatchObject({
      type: "temperature",
      direction: "high",
      threshold: 25,
      temperature: 40,
    });
  });

  it("tags an under-min breach as a low alert with the breached threshold", async () => {
    await svc.updateBuildingThresholds("b1", 25, 15);
    await svc.persistSignal("b1", "r1", NOW, 5);
    expect(publishedPayload()).toMatchObject({
      type: "temperature",
      direction: "low",
      threshold: 15,
      temperature: 5,
    });
  });

  it("does not publish when the reading sits within the threshold band", async () => {
    await svc.updateBuildingThresholds("b1", 25, 15);
    await svc.persistSignal("b1", "r1", NOW, 20);
    expect(redisMock.publish).not.toHaveBeenCalled();
  });
});
