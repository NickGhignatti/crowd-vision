import { describe, it, expect, jest } from "@jest/globals";
import type { Server } from "socket.io";
import { relayNotification } from "../src/handlers/notification.js";

describe("relayNotification", () => {
  it("broadcasts an unscoped notification to all clients", () => {
    const emit = jest.fn();
    const to = jest.fn();
    const io = { emit, to } as unknown as Server;

    relayNotification(io, JSON.stringify({ message: "hi", type: "info" }));

    expect(emit).toHaveBeenCalledWith("notification", {
      message: "hi",
      type: "info",
    });
    expect(to).not.toHaveBeenCalled();
  });

  it("routes a domain-scoped notification to that domain's room only", () => {
    const roomEmit = jest.fn();
    const to = jest.fn(() => ({ emit: roomEmit }));
    const emit = jest.fn();
    const io = { to, emit } as unknown as Server;

    const payload = { message: "scoped", type: "alert", domainName: "acme" };
    relayNotification(io, JSON.stringify(payload));

    expect(to).toHaveBeenCalledWith("domain:acme");
    expect(roomEmit).toHaveBeenCalledWith("notification", payload);
    expect(emit).not.toHaveBeenCalled();
  });
});
