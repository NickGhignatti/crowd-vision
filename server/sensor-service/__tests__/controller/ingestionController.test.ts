import {
  jest,
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
} from "@jest/globals";
import { createIngestionHandler } from "src/controllers/ingestionController.ts";
import { SensorKernel } from "src/kernel/sensorKernel.ts";
import {
  type ISensorModule,
  ValidationResult,
} from "src/modules/ISensorModule.ts";
import type { Request, Response } from "express";

class SpyModule implements ISensorModule {
  getLatest(buildingId: string, roomId: string): Promise<unknown> {
    throw new Error("Method not implemented.");
  }
  getAllLatest(buildingId: string): Promise<unknown[]> {
    throw new Error("Method not implemented.");
  }
  getDashboardData(
    buildingId: string,
    timeRange: string,
    roomId?: string,
  ): Promise<unknown[]> {
    throw new Error("Method not implemented.");
  }
  public readonly type = "spySensor";
  public validateSpy = jest.fn().mockReturnValue(ValidationResult.ok());
  public processSpy = jest.fn().mockImplementation(async () => {
    return new Promise((resolve) => setTimeout(resolve, 50));
  });

  // FIXED: Cast to 'any' to satisfy TypeScript
  validate(payload: unknown) {
    return this.validateSpy(payload) as any;
  }
  process(payload: unknown) {
    return this.processSpy(payload) as any;
  }
}

describe("IngestionController", () => {
  let kernel: SensorKernel;
  let spyModule: SpyModule;
  let req: Partial<Request>;
  let res: Partial<Response>;
  let jsonMock: any;
  let statusMock: any;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();

    spyModule = new SpyModule();
    kernel = new SensorKernel().register(spyModule);

    jsonMock = jest.fn();
    statusMock = jest.fn().mockReturnValue({ json: jsonMock });

    req = { body: {} };
    res = { status: statusMock } as unknown as Response;
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("returns 400 Bad Request if `type` discriminant is missing", async () => {
    req.body = { temperature: 22 };
    const handler = createIngestionHandler(kernel);

    await handler(req as Request, res as Response);

    expect(statusMock).toHaveBeenCalledWith(400);
    expect(jsonMock).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.stringContaining("Missing or invalid field: `type`"),
      }),
    );
  });

  it("returns 404 Not Found if `type` is not registered in the kernel", async () => {
    req.body = { type: "unknown_hardware" };
    const handler = createIngestionHandler(kernel);

    await handler(req as Request, res as Response);

    expect(statusMock).toHaveBeenCalledWith(404);
    expect(jsonMock).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.stringContaining("No module registered"),
      }),
    );
  });

  it("returns 422 Unprocessable Entity if module validation fails", async () => {
    spyModule.validateSpy.mockReturnValueOnce(
      ValidationResult.fail(["Field X is bad"]) as any,
    );
    req.body = { type: "spySensor", badData: true };

    const handler = createIngestionHandler(kernel);
    await handler(req as Request, res as Response);

    expect(statusMock).toHaveBeenCalledWith(422);
    expect(jsonMock).toHaveBeenCalledWith({
      error: "Payload validation failed.",
      details: ["Field X is bad"],
    });
    expect(spyModule.processSpy).not.toHaveBeenCalled();
  });

  it("CRITICAL: Fast Path - Returns 202 Accepted BEFORE processing database", async () => {
    req.body = { type: "spySensor", validData: 123 };
    const handler = createIngestionHandler(kernel);

    await handler(req as Request, res as Response);

    expect(spyModule.validateSpy).toHaveBeenCalledWith({ validData: 123 });
    expect(statusMock).toHaveBeenCalledWith(202);
    expect(spyModule.processSpy).not.toHaveBeenCalled();

    jest.runAllTimers();

    expect(spyModule.processSpy).toHaveBeenCalledWith({ validData: 123 });
  });
});
