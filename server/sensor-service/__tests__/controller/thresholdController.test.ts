import { jest, describe, it, expect, beforeEach } from "@jest/globals";
import type { Request, Response } from "express";

const mockExec = jest.fn();
const mockFindOne = jest.fn().mockReturnValue({ exec: mockExec });

await jest.unstable_mockModule("src/models/buildingThreshold.js", () => ({
  BuildingThresholdModel: { findOne: mockFindOne },
}));

const { createThresholdHandlers } = await import(
  "src/controllers/thresholdController.js"
);
const { SensorKernel } = await import("src/kernel/sensorKernel.js");

// ── helpers ──────────────────────────────────────────────────────────────────

const makeRes = () => {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  return { res: { status } as unknown as Response, status, json };
};

const makeReq = (
  params: Record<string, string> = {},
  body: Record<string, unknown> = {},
): Partial<Request> => ({ params, body });

const mockModule = {
  type: "mockSensor",
  getThresholds: jest.fn(),
  updateBuildingThreshold: jest.fn(),
  updateRoomThreshold: jest.fn(),
};

// ── kernel-based handlers ─────────────────────────────────────────────────────

describe("Generic Threshold Controller", () => {
  let kernel: InstanceType<typeof SensorKernel>;
  let req: Partial<Request>;
  let res: Partial<Response>;
  let jsonMock: any;
  let statusMock: any;

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

// ── getBuildingThresholdClone ─────────────────────────────────────────────────

describe("getBuildingThresholdClone", () => {
  const emptyKernel = new SensorKernel();
  const { getBuildingThresholdClone } = createThresholdHandlers(emptyKernel);

  beforeEach(() => {
    jest.clearAllMocks();
    mockFindOne.mockReturnValue({ exec: mockExec });
  });

  it("returns null with 200 when no threshold document exists", async () => {
    mockExec.mockResolvedValue(null);
    const { res, status, json } = makeRes();

    await getBuildingThresholdClone(
      makeReq({ buildingId: "bldg-001" }) as Request,
      res,
    );

    expect(status).toHaveBeenCalledWith(200);
    expect(json).toHaveBeenCalledWith(null);
  });

  it("queries by the buildingId from route params", async () => {
    mockExec.mockResolvedValue(null);
    const { res } = makeRes();

    await getBuildingThresholdClone(
      makeReq({ buildingId: "campus-42" }) as Request,
      res,
    );

    expect(mockFindOne).toHaveBeenCalledWith({ buildingId: "campus-42" });
  });

  it("maps temperature.maxTemp to maxTemperature in the response", async () => {
    mockExec.mockResolvedValue({
      buildingId: "bldg-001",
      temperature: { maxTemp: 28, minTemp: 18 },
      rooms: [],
    });
    const { res, status, json } = makeRes();

    await getBuildingThresholdClone(
      makeReq({ buildingId: "bldg-001" }) as Request,
      res,
    );

    expect(status).toHaveBeenCalledWith(200);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ maxTemperature: 28 }),
    );
  });

  it("maps room temperature.maxTemp to room maxTemperature", async () => {
    mockExec.mockResolvedValue({
      buildingId: "bldg-001",
      temperature: { maxTemp: 28 },
      rooms: [
        { id: "room-1", temperature: { maxTemp: 25 } },
        { id: "room-2", temperature: { maxTemp: 27 } },
      ],
    });
    const { res, json } = makeRes();

    await getBuildingThresholdClone(
      makeReq({ buildingId: "bldg-001" }) as Request,
      res,
    );

    const payload = (json as jest.MockedFunction<typeof json>).mock
      .calls[0]![0] as any;
    expect(payload.rooms).toHaveLength(2);
    expect(payload.rooms[0]).toEqual({ id: "room-1", maxTemperature: 25 });
    expect(payload.rooms[1]).toEqual({ id: "room-2", maxTemperature: 27 });
  });

  it("returns undefined maxTemperature when temperature field is absent", async () => {
    mockExec.mockResolvedValue({
      buildingId: "bldg-001",
      temperature: undefined,
      rooms: [],
    });
    const { res, json } = makeRes();

    await getBuildingThresholdClone(
      makeReq({ buildingId: "bldg-001" }) as Request,
      res,
    );

    const payload = (json as jest.MockedFunction<typeof json>).mock
      .calls[0]![0] as any;
    expect(payload.maxTemperature).toBeUndefined();
  });

  it("returns 400 when the database throws", async () => {
    mockExec.mockRejectedValue(new Error("DB failure"));
    const { res, status, json } = makeRes();

    await getBuildingThresholdClone(
      makeReq({ buildingId: "bldg-001" }) as Request,
      res,
    );

    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ error: "DB failure" }),
    );
  });
});
