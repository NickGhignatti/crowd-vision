import { jest, describe, it, expect, beforeEach } from "@jest/globals";
import { createThresholdHandlers } from "src/controllers/thresholdController.ts";
import { SensorKernel } from "src/kernel/sensorKernel.ts";
import type { Request, Response } from "express";

describe("Generic Threshold Controller", () => {
  let kernel: SensorKernel;
  let req: Partial<Request>;
  let res: Partial<Response>;
  let jsonMock: any;
  let statusMock: any;

  const mockModule = {
    type: "mockSensor",
    getThresholds: jest.fn(),
    updateBuildingThreshold: jest.fn(),
    updateRoomThreshold: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    kernel = new SensorKernel().register(mockModule as any);
    jsonMock = jest.fn();
    statusMock = jest.fn().mockReturnValue({ json: jsonMock });
    req = { params: {}, body: {} };
    res = { status: statusMock } as unknown as Response;
  });

  it("delegates patchBuildingThreshold to the resolved module", async () => {
    req.params = { sensorType: "mockSensor", buildingId: "HQ" };
    req.body = { max: 100 };
    (mockModule.updateBuildingThreshold as any).mockResolvedValue({ max: 100 });

    await createThresholdHandlers(kernel).patchBuildingThreshold(
      req as Request,
      res as Response,
    );

    expect(mockModule.updateBuildingThreshold).toHaveBeenCalledWith("HQ", {
      max: 100,
    });
    expect(statusMock).toHaveBeenCalledWith(200);
  });
});
