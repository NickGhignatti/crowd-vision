import { describe, it, expect, jest } from "@jest/globals";
import type { Server } from "socket.io";
import { relayTelemetry } from "../src/handlers/telemetry.js";
import { telemetryRelayedTotal } from "../src/config/registry.js";

describe("relayTelemetry", () => {
  it("emits the parsed message to the building's room and counts it", () => {
    const emit = jest.fn();
    const to = jest.fn(() => ({ emit }));
    const io = { to } as unknown as Server;
    const incSpy = jest.spyOn(telemetryRelayedTotal, "inc");

    relayTelemetry(
      io,
      JSON.stringify({ temperature: 22 }),
      "telemetry:filtered:bldg-1",
    );

    expect(to).toHaveBeenCalledWith("building:bldg-1");
    expect(emit).toHaveBeenCalledWith("telemetry", { temperature: 22 });
    expect(incSpy).toHaveBeenCalledTimes(1);
  });
});
