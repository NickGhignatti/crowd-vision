import { describe, it, expect, jest } from "@jest/globals";
import type { Socket } from "socket.io";
import { handleConnection } from "../src/handlers/connection.js";
import { connectedClients } from "../src/config/registry.js";

// A fake socket that records registered handlers so a test can fire events.
function fakeSocket() {
  const handlers: Record<string, (arg: string) => void> = {};
  const socket = {
    on: jest.fn((event: string, cb: (arg: string) => void) => {
      handlers[event] = cb;
    }),
    join: jest.fn(),
    leave: jest.fn(),
  } as unknown as Socket;
  return {
    socket,
    fire: (event: string, arg?: string) => handlers[event]?.(arg as string),
  };
}

describe("handleConnection", () => {
  it("joins a building room on subscribe_building", () => {
    const { socket, fire } = fakeSocket();
    handleConnection(socket);
    fire("subscribe_building", "bldg-1");
    expect(socket.join).toHaveBeenCalledWith("building:bldg-1");
  });

  it("leaves a building room on unsubscribe_building", () => {
    const { socket, fire } = fakeSocket();
    handleConnection(socket);
    fire("unsubscribe_building", "bldg-1");
    expect(socket.leave).toHaveBeenCalledWith("building:bldg-1");
  });

  it("joins a user room on join_room", () => {
    const { socket, fire } = fakeSocket();
    handleConnection(socket);
    fire("join_room", "user-9");
    expect(socket.join).toHaveBeenCalledWith("user-9");
  });

  it("increments on connect and decrements on disconnect", () => {
    const incSpy = jest.spyOn(connectedClients, "inc");
    const decSpy = jest.spyOn(connectedClients, "dec");
    const { socket, fire } = fakeSocket();

    handleConnection(socket);
    expect(incSpy).toHaveBeenCalledTimes(1);

    fire("disconnect");
    expect(decSpy).toHaveBeenCalledTimes(1);
  });
});
