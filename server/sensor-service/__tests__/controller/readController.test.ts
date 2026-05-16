import { jest, describe, it, expect, beforeEach } from "@jest/globals";
import { createReadHandlers } from "src/controllers/readController.ts";
import { SensorKernel } from "src/kernel/sensorKernel.ts";
import type { Request, Response } from "express";

describe("Generic Read Controller", () => {
  let kernel: SensorKernel;
  let req: Partial<Request>;
  let res: Partial<Response>;
  let jsonMock: any;
  let statusMock: any;

  const mockModule = {
    type: "mockSensor",
    getLatest: jest.fn(),
    getAllLatest: jest.fn(),
    getDashboardData: jest.fn(),
    validate: jest.fn(),
    process: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    kernel = new SensorKernel().register(mockModule as any);
    jsonMock = jest.fn();
    statusMock = jest.fn().mockReturnValue({ json: jsonMock });
    req = { params: {}, query: {} };
    res = { status: statusMock } as unknown as Response;
  });

  it("delegates getLatestSingle to the resolved module", async () => {
    req.params = { sensorType: "mockSensor" };
    req.query = { building: "bldg1", roomId: "room1" };
    (mockModule.getLatest as any).mockResolvedValue({ val: 42 });

    await createReadHandlers(kernel).getLatestSingle(
      req as Request,
      res as Response,
    );

    expect(mockModule.getLatest).toHaveBeenCalledWith("bldg1", "room1");
    expect(statusMock).toHaveBeenCalledWith(200);
    expect(jsonMock).toHaveBeenCalledWith({ data: { val: 42 } });
  });

  it("returns 404 if requested sensor type is not registered", async () => {
    req.params = { sensorType: "unknown" };
    await createReadHandlers(kernel).getLatestSingle(
      req as Request,
      res as Response,
    );
    expect(statusMock).toHaveBeenCalledWith(404);
  });
});
