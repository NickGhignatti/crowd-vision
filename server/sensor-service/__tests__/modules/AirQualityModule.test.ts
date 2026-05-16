import { jest, describe, it, expect, beforeEach } from "@jest/globals";

jest.unstable_mockModule("src/models/airQualitySignal.ts", () => ({
  AirQuality: { create: jest.fn(), findOne: jest.fn(), aggregate: jest.fn() },
}));
jest.unstable_mockModule("src/models/buildingThreshold.ts", () => ({
  BuildingThresholdModel: { findOne: jest.fn(), findOneAndUpdate: jest.fn() },
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
