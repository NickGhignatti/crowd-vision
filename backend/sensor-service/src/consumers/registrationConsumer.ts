import type { SensorKernel } from "../kernel/sensorKernel.js";
import { registerBuilding } from "../services/buildingRegistration.js";
import {
  registrationConsumer,
  registrationProducer,
  BUILDING_REGISTRATION_REQUESTED_TOPIC,
  BUILDING_REGISTRATION_COMPLETED_TOPIC,
} from "../config/kafka.js";

interface RegistrationRequested {
  buildingId: string;
  [key: string]: unknown;
}

/**
 * The second driving adapter for `registerBuilding`, alongside the REST route
 * -- same use case, triggered by a Kafka event instead of an HTTP request.
 * Twin-service publishes once its own write has succeeded; this consumer
 * never blocks that publish, and reports its own outcome back on
 * `building-registration-completed` so twin-service can close the loop.
 */
export async function startRegistrationConsumer(
  kernel: SensorKernel,
): Promise<void> {
  await registrationConsumer.subscribe({
    topic: BUILDING_REGISTRATION_REQUESTED_TOPIC,
    fromBeginning: false,
  });

  await registrationConsumer.run({
    eachMessage: async ({ message }) => {
      if (!message.value) return;
      const { buildingId, ...payload } = JSON.parse(
        message.value.toString(),
      ) as RegistrationRequested;

      try {
        await registerBuilding(kernel, buildingId, payload);
        await registrationProducer.send({
          topic: BUILDING_REGISTRATION_COMPLETED_TOPIC,
          messages: [
            {
              key: buildingId,
              value: JSON.stringify({ buildingId, status: "ready" }),
            },
          ],
        });
      } catch (error: any) {
        console.error(
          `[sensor-service] registration failed for building ${buildingId}:`,
          error,
        );
        await registrationProducer.send({
          topic: BUILDING_REGISTRATION_COMPLETED_TOPIC,
          messages: [
            {
              key: buildingId,
              value: JSON.stringify({
                buildingId,
                status: "failed",
                error: error.message,
              }),
            },
          ],
        });
      }
    },
  });
}
