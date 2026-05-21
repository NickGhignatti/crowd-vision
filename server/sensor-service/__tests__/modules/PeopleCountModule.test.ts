import { jest, describe, it, expect, beforeEach } from "@jest/globals";

jest.unstable_mockModule("src/models/peopleCountSignal.ts", () => ({
  PeopleCount: { create: jest.fn(), findOne: jest.fn(), aggregate: jest.fn() },
}));
jest.unstable_mockModule("src/models/buildingThreshold.ts", () => ({
  BuildingThresholdModel: { findOne: jest.fn(), findOneAndUpdate: jest.fn() },
}));
// Redis is touched by:
//   - BaseSensorModule.publishTelemetry (publish)
//   - getAllLatest read-path cache (get + setEx)
// All are stubbed so tests don't try to open a real socket.
jest.unstable_mockModule("src/config/redis.ts", () => ({
  default: {
    publish: jest.fn().mockResolvedValue(0 as never),
    get: jest.fn().mockResolvedValue(null as never),
    setEx: jest.fn().mockResolvedValue("OK" as never),
  },
}));

const { PeopleCountModule } = await import(
  "src/modules/PeopleCountModule.ts"
);
const { PeopleCount } = await import("src/models/peopleCountSignal.ts");

describe("People Count Domain (Module + Service)", () => {
  let module: any;

  beforeEach(() => {
    module = new PeopleCountModule();
    jest.clearAllMocks();
  });

  it("fails validation if peopleCount is negative", () => {
    const result = module.validate({
      buildingId: "HQ",
      roomId: "Lobby",
      timestamp: 1680,
      peopleCount: -5,
    });
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain(
      "peopleCount: must be a non-negative integer.",
    );
  });

  it("getAllLatest() executes aggregation pipeline", async () => {
    const mockResult = [{ roomId: "Lobby", value: 10 }];
    (PeopleCount.aggregate as any).mockReturnValue({
      exec: jest.fn().mockResolvedValue(mockResult as never),
    });

    const result = await module.getAllLatest("HQ");

    expect(PeopleCount.aggregate).toHaveBeenCalledWith(
      expect.arrayContaining([{ $match: { building: "HQ" } }]),
    );
    expect(result).toEqual(mockResult);
  });
});
