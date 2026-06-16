// @ts-nocheck
import { jest, describe, it, expect, beforeEach } from "@jest/globals";
import type { Request, Response } from "express";

const sensorModulePath = ["src", "models", "sensor.ts"].join("/");
const readControllerPath = ["src", "controllers", "readController.ts"].join("/");
const sensorKernelPath = ["src", "kernel", "sensorKernel.ts"].join("/");

jest.unstable_mockModule(sensorModulePath, () => ({
  Sensors: { find: jest.fn() },
}));

const { Sensors } = await import(sensorModulePath);
const { createReadHandlers } = await import(readControllerPath);
const { SensorKernel: SensorKernelClass } = await import(sensorKernelPath);

describe("Generic Read Controller", () => {
  let kernel: any;
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
    kernel = new SensorKernelClass().register(mockModule as any);
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

  it("returns room sensors for a building and room", async () => {
    req.params = { buildingId: "bldg1", roomId: "room1" };
    const findMock = Sensors.find as unknown as jest.Mock;
    findMock.mockReturnValue({
      lean: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue([{ sensorId: "s-1" }] as never) }),
    });

    await createReadHandlers(kernel).getRoomSensors(req as Request, res as Response);

    expect(Sensors.find).toHaveBeenCalledWith({ buildingId: "bldg1", roomId: "room1" });
    expect(statusMock).toHaveBeenCalledWith(200);
    expect(jsonMock).toHaveBeenCalledWith({ data: [{ sensorId: "s-1" }] });
  });

  it("returns all sensors for a building", async () => {
    req.params = { buildingId: "bldg1" };
    const findMock = Sensors.find as unknown as jest.Mock;
    findMock.mockReturnValue({
      lean: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue([{ sensorId: "s-1" }, { sensorId: "s-2" }] as never) }),
    });

    await createReadHandlers(kernel).getBuildingSensors(req as Request, res as Response);

    expect(Sensors.find).toHaveBeenCalledWith({ buildingId: "bldg1" });
    expect(statusMock).toHaveBeenCalledWith(200);
    expect(jsonMock).toHaveBeenCalledWith({ data: [{ sensorId: "s-1" }, { sensorId: "s-2" }] });
  });
});
