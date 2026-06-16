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

const { PeopleCountService } = await import(
  "src/services/PeopleCountModuleService.ts"
);
const { PeopleCount } = await import("src/models/peopleCountSignal.ts");

const svc = new PeopleCountService();
const NOW = Date.now();

beforeAll(startMongo);
afterAll(stopMongo);
afterEach(clearCollections);

describe("PeopleCountService.persistSignal / getLatest", () => {
  it("persists a reading that getLatest returns", async () => {
    await svc.persistSignal("b1", "r1", NOW, 42);
    const latest = (await svc.getLatest("b1", "r1")) as { peopleCount: number };
    expect(latest.peopleCount).toBe(42);
  });

  it("throws when no reading exists", async () => {
    await expect(svc.getLatest("b1", "missing")).rejects.toThrow();
  });
});

describe("PeopleCountService.getAllLatest", () => {
  it("aggregates the latest reading per room and caches it", async () => {
    await svc.persistSignal("b1", "r1", NOW - 1000, 5);
    await svc.persistSignal("b1", "r1", NOW, 9);
    const result = (await svc.getAllLatest("b1")) as Array<{ value: number }>;
    expect(result).toHaveLength(1);
    expect(result[0]?.value).toBe(9);
    expect(redisMock.setEx).toHaveBeenCalled();
  });

  it("returns the cached payload without querying Mongo", async () => {
    redisMock.get.mockResolvedValueOnce(
      JSON.stringify([{ roomId: "c", value: 1 }]),
    );
    expect(await svc.getAllLatest("b1")).toEqual([{ roomId: "c", value: 1 }]);
    expect(redisMock.setEx).not.toHaveBeenCalled();
  });
});

describe("PeopleCountService.getDashboardData", () => {
  it("buckets readings and sums them", async () => {
    await PeopleCount.create([
      { building: "b1", roomId: "r1", timestamp: NOW, peopleCount: 3 },
      { building: "b1", roomId: "r1", timestamp: NOW, peopleCount: 7 },
    ]);
    const rows = (await svc.getDashboardData("b1", "1D", "r1", "sum")) as Array<{
      value: number;
    }>;
    expect(rows).toHaveLength(1);
    expect(rows[0]?.value).toBe(10);
  });
});

describe("PeopleCountService thresholds", () => {
  it("returns null when no threshold is configured", async () => {
    expect(await svc.getBuildingThresholds("b1")).toBeNull();
  });

  it("upserts a building threshold and reads it back", async () => {
    await svc.updateBuildingThresholds("b1", 100);
    const t = (await svc.getBuildingThresholds("b1")) as { maxPeople: number };
    expect(t.maxPeople).toBe(100);
  });

  it("creates the threshold document when setting a room override", async () => {
    await svc.updateRoomThresholds("b1", "r1", 50);
    expect(await svc.getBuildingThresholds("b1")).not.toBeNull();
  });
});

describe("PeopleCountService.evaluateThresholds (via persistSignal)", () => {
  it("warns when occupancy exceeds the building max", async () => {
    await svc.updateBuildingThresholds("b1", 10);
    await svc.persistSignal("b1", "r1", NOW, 50);
    expect(jest.mocked(console.warn)).toHaveBeenCalledWith(
      expect.stringContaining("Overcrowding"),
    );
  });

  it("does not warn when no threshold is configured", async () => {
    await svc.persistSignal("b1", "r1", NOW, 50);
    expect(jest.mocked(console.warn)).not.toHaveBeenCalled();
  });
});
