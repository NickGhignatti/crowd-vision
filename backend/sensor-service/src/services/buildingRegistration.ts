import type { SensorKernel } from "../kernel/sensorKernel.js";

/**
 * The building-registration use case: seed every registered sensor module's
 * threshold clone for a building. Called from two driving adapters -- the
 * `PUT /thresholds/buildings/:id` REST route and the Kafka registration
 * consumer -- so it lives here rather than inline in either one.
 */
export async function registerBuilding(
  kernel: SensorKernel,
  buildingId: string,
  payload: unknown,
): Promise<void> {
  await Promise.all(
    kernel.getRegisteredTypes().map((type) => {
      const module = kernel.resolve(type);
      return module?.updateBuildingThreshold(buildingId, payload);
    }),
  );
}
