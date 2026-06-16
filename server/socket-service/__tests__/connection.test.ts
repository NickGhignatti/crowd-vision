import { describe, it, expect, jest } from "@jest/globals";
import type { Socket } from "socket.io";
import { handleConnection } from "../src/handlers/connection.js";
import { connectedClients } from "../src/config/registry.js";
import type { SocketIdentity } from "../src/auth.js";

// A fake socket that records registered handlers so a test can fire events.
// `data.identity` mimics what the handshake middleware attaches before the
// connection handler runs.
function fakeSocket(domains: string[] = ["acme"]) {
  const handlers: Record<string, (arg: string) => void> = {};
  const identity: SocketIdentity = {
    accountId: "acc-1",
    accountName: "alice",
    domains,
  };
  const socket = {
    data: { identity },
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
  it("joins a room for each domain membership on connect", () => {
    const { socket } = fakeSocket(["acme", "globex"]);
    handleConnection(socket);
    expect(socket.join).toHaveBeenCalledWith("domain:acme");
    expect(socket.join).toHaveBeenCalledWith("domain:globex");
  });

  it("joins a building room on subscribe_building for a member", () => {
    const { socket, fire } = fakeSocket(["acme"]);
    handleConnection(socket);
    fire("subscribe_building", "bldg-1");
    expect(socket.join).toHaveBeenCalledWith("building:bldg-1");
  });

  it("ignores subscribe_building when the account has no domains", () => {
    const { socket, fire } = fakeSocket([]);
    handleConnection(socket);
    fire("subscribe_building", "bldg-1");
    expect(socket.join).not.toHaveBeenCalledWith("building:bldg-1");
  });

  it("leaves a building room on unsubscribe_building", () => {
    const { socket, fire } = fakeSocket();
    handleConnection(socket);
    fire("unsubscribe_building", "bldg-1");
    expect(socket.leave).toHaveBeenCalledWith("building:bldg-1");
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
