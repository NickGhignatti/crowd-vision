import { describe, it, expect, jest } from "@jest/globals";
import type { Server } from "socket.io";
import { relayNotification } from "../src/handlers/notification.js";

describe("relayNotification", () => {
  it("broadcasts the parsed notification to all clients", () => {
    jest.spyOn(console, "info").mockImplementation(() => {});
    const emit = jest.fn();
    const io = { emit } as unknown as Server;

    relayNotification(io, JSON.stringify({ message: "hi", type: "info" }));

    expect(emit).toHaveBeenCalledWith("notification", {
      message: "hi",
      type: "info",
    });
  });
});
