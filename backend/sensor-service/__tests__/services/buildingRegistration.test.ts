import { jest, describe, it, expect, beforeEach } from "@jest/globals";

const { registerBuilding } =
  await import("src/services/buildingRegistration.js");
const { SensorKernel } = await import("src/kernel/sensorKernel.js");

const mockModule = (type: string) => ({
  type,
  updateBuildingThreshold: jest.fn().mockResolvedValue(undefined),
});

describe("registerBuilding", () => {
  let kernel: InstanceType<typeof SensorKernel>;
  let temperature: ReturnType<typeof mockModule>;
  let peopleCount: ReturnType<typeof mockModule>;

  beforeEach(() => {
    temperature = mockModule("temperature");
    peopleCount = mockModule("peopleCount");
    kernel = new SensorKernel()
      .register(temperature as any)
      .register(peopleCount as any);
  });

  it("seeds every registered module's threshold clone", async () => {
    const payload = { name: "HQ", rooms: [{ id: "r1", name: "Lobby" }] };

    await registerBuilding(kernel, "b1", payload);

    expect(temperature.updateBuildingThreshold).toHaveBeenCalledWith(
      "b1",
      payload,
    );
    expect(peopleCount.updateBuildingThreshold).toHaveBeenCalledWith(
      "b1",
      payload,
    );
  });

  it("propagates a module's failure to the caller", async () => {
    temperature.updateBuildingThreshold.mockRejectedValue(
      new Error("write failed"),
    );

    await expect(registerBuilding(kernel, "b1", {})).rejects.toThrow(
      "write failed",
    );
  });
});
