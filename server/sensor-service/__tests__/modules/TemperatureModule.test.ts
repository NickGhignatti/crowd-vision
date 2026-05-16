import { jest, describe, it, expect, beforeEach } from "@jest/globals";

jest.unstable_mockModule("src/models/temperatureSignal.ts", () => ({
  Temperature: { create: jest.fn(), findOne: jest.fn(), aggregate: jest.fn() },
}));
jest.unstable_mockModule("src/models/buildingThreshold.ts", () => ({
  BuildingThresholdModel: { findOne: jest.fn(), findOneAndUpdate: jest.fn() },
}));

const { TemperatureModule } = await import(
  "src/modules/TemperatureModule.ts"
);
const { Temperature } = await import("src/models/temperatureSignal.ts");
const { BuildingThresholdModel } = await import(
  "src/models/buildingThreshold.ts"
);

const mockChain = (val: any) => ({
  sort: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(val as never) }),
  exec: jest.fn().mockResolvedValue(val as never),
});

describe("Temperature Domain (Module + Service)", () => {
  let module: any;

  beforeEach(() => {
    module = new TemperatureModule();
    jest.clearAllMocks();
  });

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
