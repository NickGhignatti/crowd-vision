import { jest, describe, it, expect, beforeEach } from "@jest/globals";

jest.unstable_mockModule("src/models/airQualitySignal.ts", () => ({
  AirQuality: { create: jest.fn(), findOne: jest.fn(), aggregate: jest.fn() },
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

const { AirQualityModule } = await import(
  "src/modules/AirQualityModule.ts"
);
const { AirQuality } = await import("src/models/airQualitySignal.ts");
const { BuildingThresholdModel } = await import(
  "src/models/buildingThreshold.ts"
);

describe("Air Quality Domain (Module + Service)", () => {
  let module: any;

  beforeEach(() => {
    module = new AirQualityModule();
    jest.clearAllMocks();
  });

  // ── validate() ─────────────────────────────────────────────────────────────

  describe("validate()", () => {
    const validPayload = {
      buildingId: "Lab1",
      roomId: "CleanRoom",
      timestamp: 1680000000,
      pm25: 12.5,
      co2: 410,
    };

    it("accepts a fully valid payload", () => {
      const result = module.validate(validPayload);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("rejects a payload with missing buildingId", () => {
      const result = module.validate({ ...validPayload, buildingId: undefined });
      expect(result.isValid).toBe(false);
      expect(result.errors.some((e: string) => e.startsWith("buildingId:"))).toBe(true);
    });

    it("rejects a payload with an empty-string buildingId", () => {
      const result = module.validate({ ...validPayload, buildingId: "" });
      expect(result.isValid).toBe(false);
      expect(result.errors.some((e: string) => e.startsWith("buildingId:"))).toBe(true);
    });

    it("rejects a payload with missing roomId", () => {
      const result = module.validate({ ...validPayload, roomId: undefined });
      expect(result.isValid).toBe(false);
      expect(result.errors.some((e: string) => e.startsWith("roomId:"))).toBe(true);
    });

    it("rejects a payload with an empty-string roomId", () => {
      const result = module.validate({ ...validPayload, roomId: "" });
      expect(result.isValid).toBe(false);
      expect(result.errors.some((e: string) => e.startsWith("roomId:"))).toBe(true);
    });

    it("rejects a payload where timestamp is not a number", () => {
      const result = module.validate({ ...validPayload, timestamp: "not-a-number" });
      expect(result.isValid).toBe(false);
      expect(result.errors.some((e: string) => e.startsWith("timestamp:"))).toBe(true);
    });

    it("rejects a payload with missing timestamp", () => {
      const result = module.validate({ ...validPayload, timestamp: undefined });
      expect(result.isValid).toBe(false);
      expect(result.errors.some((e: string) => e.startsWith("timestamp:"))).toBe(true);
    });

    it("rejects a payload where pm25 is not a number", () => {
      const result = module.validate({ ...validPayload, pm25: "high" });
      expect(result.isValid).toBe(false);
      expect(result.errors.some((e: string) => e.startsWith("pm25:"))).toBe(true);
    });

    it("rejects a payload with missing pm25", () => {
      const result = module.validate({ ...validPayload, pm25: undefined });
      expect(result.isValid).toBe(false);
      expect(result.errors.some((e: string) => e.startsWith("pm25:"))).toBe(true);
    });

    it("rejects a payload where co2 is not a number", () => {
      const result = module.validate({ ...validPayload, co2: "400ppm" });
      expect(result.isValid).toBe(false);
      expect(result.errors.some((e: string) => e.startsWith("co2:"))).toBe(true);
    });

    it("rejects a payload with missing co2", () => {
      const result = module.validate({ ...validPayload, co2: undefined });
      expect(result.isValid).toBe(false);
      expect(result.errors.some((e: string) => e.startsWith("co2:"))).toBe(true);
    });

    it("collects all errors when multiple required fields are absent", () => {
      const result = module.validate({});
      expect(result.isValid).toBe(false);
      // Must report all five missing required fields
      expect(result.errors.length).toBeGreaterThanOrEqual(5);
    });

    it("accepts numeric zero as a valid co2 value (typeof 0 === 'number')", () => {
      // co2 = 0 is unusual but structurally valid
      const result = module.validate({ ...validPayload, co2: 0 });
      expect(result.isValid).toBe(true);
    });

    it("accepts numeric zero as a valid pm25 value", () => {
      const result = module.validate({ ...validPayload, pm25: 0 });
      expect(result.isValid).toBe(true);
    });

    it("accepts negative numbers as valid (range checking is service-layer responsibility)", () => {
      const result = module.validate({ ...validPayload, pm25: -1, co2: -100 });
      // The module validates types only, not domain ranges
      expect(result.isValid).toBe(true);
    });

    it("accepts extra unknown fields without failing", () => {
      const result = module.validate({ ...validPayload, extraField: "ignored" });
      expect(result.isValid).toBe(true);
    });
  });

  // ── process() ──────────────────────────────────────────────────────────────

  it("persists data and normalizes indoor_aqi", async () => {
    const payload = {
      buildingId: "Lab1",
      roomId: "CleanRoom",
      timestamp: 1680,
      pm25: 12.5,
      co2: 410,
      indoorAqi: 85,
    };
    (AirQuality.create as any).mockResolvedValueOnce({});
    (BuildingThresholdModel.findOne as any).mockReturnValue({
      exec: jest.fn().mockResolvedValue(null as never),
    });

    await module.process(payload);

    expect(AirQuality.create).toHaveBeenCalledWith(
      expect.objectContaining({
        building: "Lab1",
        pm25: 12.5,
        indoor_aqi: 85, // Checks normalizer logic
      }),
    );
  });

  // ── getAllLatest() ──────────────────────────────────────────────────────────

  it("getAllLatest() projects indoor_aqi fallback", async () => {
    const mockResult = [{ roomId: "CleanRoom", pm25: 12.5 }];
    (AirQuality.aggregate as any).mockReturnValue({
      exec: jest.fn().mockResolvedValue(mockResult as never),
    });

    await module.getAllLatest("Lab1");

    const pipelineArg = (AirQuality.aggregate as any).mock.calls[0][0] as any[];
    const projectStage = pipelineArg.find((stage) => stage.$project);

    expect(projectStage.$project.indoor_aqi).toEqual({
      $ifNull: ["$indoor_aqi", 0],
    });
  });
});
