import { jest, describe, it, expect, beforeEach } from "@jest/globals";

jest.unstable_mockModule("src/models/temperatureSignal.ts", () => ({
  Temperature: { create: jest.fn(), findOne: jest.fn(), aggregate: jest.fn() },
}));
jest.unstable_mockModule("src/models/buildingThreshold.ts", () => ({
  BuildingThresholdModel: { findOne: jest.fn(), findOneAndUpdate: jest.fn() },
}));
// Redis is touched by publishTelemetry (publish) and getAllLatest's cache (get/setEx);
// all stubbed so tests don't open a real socket.
jest.unstable_mockModule("src/config/redis.ts", () => ({
  default: {
    publish: jest.fn().mockResolvedValue(0 as never),
    get: jest.fn().mockResolvedValue(null as never),
    setEx: jest.fn().mockResolvedValue("OK" as never),
  },
}));

const { TemperatureModule } = await import("src/modules/TemperatureModule.ts");
const { Temperature } = await import("src/models/temperatureSignal.ts");
const { BuildingThresholdModel } = await import(
  "src/models/buildingThreshold.ts"
);

const mockChain = (val: any) => ({
  sort: jest
    .fn()
    .mockReturnValue({ exec: jest.fn().mockResolvedValue(val as never) }),
  exec: jest.fn().mockResolvedValue(val as never),
});

describe("Temperature Domain (Module + Service)", () => {
  let module: any;

  beforeEach(() => {
    module = new TemperatureModule();
    jest.clearAllMocks();
  });

  // ── validate() ─────────────────────────────────────────────────────────────

  describe("validate()", () => {
    const validPayload = {
      buildingId: "bldg_1",
      roomId: "room_a",
      timestamp: 1600000000,
      temperature: 22.5,
    };

    it("accepts a fully valid payload", () => {
      const result = module.validate(validPayload);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("rejects a payload with missing buildingId", () => {
      const result = module.validate({
        ...validPayload,
        buildingId: undefined,
      });
      expect(result.isValid).toBe(false);
      expect(
        result.errors.some((e: string) => e.startsWith("buildingId:")),
      ).toBe(true);
    });

    it("rejects a payload with an empty-string buildingId", () => {
      const result = module.validate({ ...validPayload, buildingId: "" });
      expect(result.isValid).toBe(false);
      expect(
        result.errors.some((e: string) => e.startsWith("buildingId:")),
      ).toBe(true);
    });

    it("rejects a payload with missing roomId", () => {
      const result = module.validate({ ...validPayload, roomId: undefined });
      expect(result.isValid).toBe(false);
      expect(result.errors.some((e: string) => e.startsWith("roomId:"))).toBe(
        true,
      );
    });

    it("rejects a payload with an empty-string roomId", () => {
      const result = module.validate({ ...validPayload, roomId: "" });
      expect(result.isValid).toBe(false);
      expect(result.errors.some((e: string) => e.startsWith("roomId:"))).toBe(
        true,
      );
    });

    it("rejects a payload where timestamp is not a number", () => {
      const result = module.validate({
        ...validPayload,
        timestamp: "1600000000",
      });
      expect(result.isValid).toBe(false);
      expect(
        result.errors.some((e: string) => e.startsWith("timestamp:")),
      ).toBe(true);
    });

    it("rejects a payload with missing timestamp", () => {
      const result = module.validate({ ...validPayload, timestamp: undefined });
      expect(result.isValid).toBe(false);
      expect(
        result.errors.some((e: string) => e.startsWith("timestamp:")),
      ).toBe(true);
    });

    it("rejects a payload where temperature is a string", () => {
      const result = module.validate({ ...validPayload, temperature: "warm" });
      expect(result.isValid).toBe(false);
      expect(
        result.errors.some((e: string) => e.startsWith("temperature:")),
      ).toBe(true);
    });

    it("rejects a payload with missing temperature", () => {
      const result = module.validate({
        ...validPayload,
        temperature: undefined,
      });
      expect(result.isValid).toBe(false);
      expect(
        result.errors.some((e: string) => e.startsWith("temperature:")),
      ).toBe(true);
    });

    it("collects all errors when the payload is completely empty", () => {
      const result = module.validate({});
      expect(result.isValid).toBe(false);
      // Expects errors for buildingId, roomId, timestamp, temperature
      expect(result.errors.length).toBeGreaterThanOrEqual(4);
    });

    it("accepts numeric zero as a valid temperature (typeof 0 === 'number')", () => {
      const result = module.validate({ ...validPayload, temperature: 0 });
      expect(result.isValid).toBe(true);
    });

    it("accepts negative temperatures (type-valid even if physically unusual)", () => {
      const result = module.validate({ ...validPayload, temperature: -40 });
      expect(result.isValid).toBe(true);
    });

    it("accepts a high temperature like 100°C (type-valid, no range enforcement)", () => {
      const result = module.validate({ ...validPayload, temperature: 100 });
      expect(result.isValid).toBe(true);
    });

    it("accepts extra unknown fields without failing", () => {
      const result = module.validate({ ...validPayload, humidity: 65 });
      expect(result.isValid).toBe(true);
    });
  });

  // ── Write Path ──────────────────────────────────────────────────────────────

  describe("Write Path", () => {
    it("persists data and triggers threshold evaluation safely", async () => {
      const payload = {
        buildingId: "bldg_1",
        roomId: "room_a",
        timestamp: 1600,
        temperature: 25.0,
      };
      (Temperature.create as any).mockResolvedValueOnce({});
      (BuildingThresholdModel.findOne as any).mockReturnValue(
        mockChain({ temperature: { maxTemp: 24 } }),
      );

      await module.process(payload);

      expect(Temperature.create).toHaveBeenCalledWith(
        expect.objectContaining({ temperature: 25.0 }),
      );
      expect(BuildingThresholdModel.findOne).toHaveBeenCalledWith({
        buildingId: "bldg_1",
      });
    });
  });

  // ── Read Path ───────────────────────────────────────────────────────────────

  describe("Read Path", () => {
    it("getLatest() fetches and sorts correctly", async () => {
      (Temperature.findOne as any).mockReturnValue(
        mockChain({ temperature: 22 }),
      );
      const result = await module.getLatest("bldg_1", "room_a");
      expect(Temperature.findOne).toHaveBeenCalledWith({
        building: "bldg_1",
        roomId: "room_a",
      });
      expect(result).toEqual({ temperature: 22 });
    });
  });

  // ── Thresholds ──────────────────────────────────────────────────────────────

  describe("Thresholds", () => {
    it("updateBuildingThreshold() updates only the temperature slice", async () => {
      (BuildingThresholdModel.findOneAndUpdate as any).mockReturnValue(
        mockChain({ temperature: { maxTemp: 25 } }),
      );

      await module.updateBuildingThreshold("bldg_1", {
        maxTemp: 25,
        minTemp: 18,
      });

      expect(BuildingThresholdModel.findOneAndUpdate).toHaveBeenCalledWith(
        { buildingId: "bldg_1" },
        { $set: { "temperature.maxTemp": 25, "temperature.minTemp": 18 } },
        expect.any(Object),
      );
    });
  });
});
