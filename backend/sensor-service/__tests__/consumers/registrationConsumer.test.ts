import { jest, describe, it, expect, beforeEach } from "@jest/globals";

const registerBuildingMock = jest.fn<(...args: any[]) => Promise<void>>();
jest.unstable_mockModule("src/services/buildingRegistration.ts", () => ({
  registerBuilding: registerBuildingMock,
}));

const subscribeMock = jest.fn();
const runMock = jest.fn();
const sendMock = jest.fn();

jest.unstable_mockModule("src/config/kafka.ts", () => ({
  registrationConsumer: { subscribe: subscribeMock, run: runMock },
  registrationProducer: { send: sendMock },
  BUILDING_REGISTRATION_REQUESTED_TOPIC: "building-registration-requested",
  BUILDING_REGISTRATION_COMPLETED_TOPIC: "building-registration-completed",
}));

const { startRegistrationConsumer } =
  await import("src/consumers/registrationConsumer.js");
const { SensorKernel } = await import("src/kernel/sensorKernel.js");

const message = (body: Record<string, unknown>) => ({
  message: { value: Buffer.from(JSON.stringify(body)) },
});

describe("startRegistrationConsumer", () => {
  let kernel: InstanceType<typeof SensorKernel>;

  beforeEach(() => {
    jest.clearAllMocks();
    kernel = new SensorKernel();
  });

  type EachMessage = (payload: {
    message: { value: Buffer | null };
  }) => Promise<void>;

  const eachMessage = async (): Promise<EachMessage> => {
    await startRegistrationConsumer(kernel);
    return (runMock.mock.calls[0][0] as { eachMessage: EachMessage })
      .eachMessage;
  };

  it("subscribes to the requested topic", async () => {
    await startRegistrationConsumer(kernel);

    expect(subscribeMock).toHaveBeenCalledWith({
      topic: "building-registration-requested",
      fromBeginning: false,
    });
  });

  it("registers the building and reports ready on success", async () => {
    registerBuildingMock.mockResolvedValue(undefined);
    const handler = await eachMessage();

    await handler(message({ buildingId: "b1", name: "HQ", rooms: [] }));

    expect(registerBuildingMock).toHaveBeenCalledWith(kernel, "b1", {
      name: "HQ",
      rooms: [],
    });
    expect(sendMock).toHaveBeenCalledWith({
      topic: "building-registration-completed",
      messages: [
        {
          key: "b1",
          value: JSON.stringify({ buildingId: "b1", status: "ready" }),
        },
      ],
    });
  });

  it("reports failed without throwing when registration fails", async () => {
    registerBuildingMock.mockRejectedValue(new Error("write failed"));
    const handler = await eachMessage();

    await handler(message({ buildingId: "b1" }));

    expect(sendMock).toHaveBeenCalledWith({
      topic: "building-registration-completed",
      messages: [
        {
          key: "b1",
          value: JSON.stringify({
            buildingId: "b1",
            status: "failed",
            error: "write failed",
          }),
        },
      ],
    });
  });
});
