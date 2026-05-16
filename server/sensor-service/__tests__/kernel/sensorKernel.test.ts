import { jest, describe, it, expect, beforeEach } from "@jest/globals";
import { SensorKernel } from "src/kernel/sensorKernel.ts";
import {
  type ISensorModule,
  ValidationResult,
} from "src/modules/ISensorModule.ts";

class MockModule implements ISensorModule {
  constructor(public readonly type: string) {}
  getThresholds(buildingId: string): Promise<unknown> {
    throw new Error("Method not implemented.");
  }
  updateBuildingThreshold(
    buildingId: string,
    payload: unknown,
  ): Promise<unknown> {
    throw new Error("Method not implemented.");
  }
  updateRoomThreshold(
    buildingId: string,
    roomId: string,
    payload: unknown,
  ): Promise<unknown> {
    throw new Error("Method not implemented.");
  }

  validate = jest.fn().mockReturnValue(ValidationResult.ok()) as any;
  process = jest.fn().mockResolvedValue(undefined as never) as any;

  // ── Added missing read methods to satisfy the new interface ──
  getLatest = jest.fn() as any;
  getAllLatest = jest.fn() as any;
  getDashboardData = jest.fn() as any;
}

describe("SensorKernel", () => {
  let kernel: SensorKernel;

  beforeEach(() => {
    kernel = new SensorKernel();
  });

  it("registers and resolves a module correctly", () => {
    const tempModule = new MockModule("temperature");
    kernel.register(tempModule);
    expect(kernel.resolve("temperature")).toBe(tempModule);
  });

  it("returns undefined when resolving an unknown module type", () => {
    expect(kernel.resolve("unknown")).toBeUndefined();
  });

  it("throws a synchronous error if a duplicate type is registered", () => {
    kernel.register(new MockModule("duplicate"));
    expect(() => kernel.register(new MockModule("duplicate"))).toThrow(
      /already registered/,
    );
  });

  it("returns an array of all registered types", () => {
    kernel.register(new MockModule("temp")).register(new MockModule("co2"));
    const types = kernel.getRegisteredTypes();
    expect(types).toContain("temp");
    expect(types).toContain("co2");
    expect(types).toHaveLength(2);
  });
});
