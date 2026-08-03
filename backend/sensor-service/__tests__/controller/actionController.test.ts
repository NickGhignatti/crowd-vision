import { jest, describe, it, expect, beforeEach } from "@jest/globals";
import type { Request, Response } from "express";

const actionControllerPath = ["src", "controllers", "actionController.ts"].join(
  "/",
);

const maliciousName = "evil\n[INFO] forged log line for action='trusted'";

const actionsConfig = {
  [maliciousName]: {
    [maliciousName]: { url: "https://downstream.example/api" },
  },
};

jest.unstable_mockModule("node:fs/promises", () => ({
  readFile: jest.fn().mockResolvedValue(JSON.stringify(actionsConfig)),
}));

const { createActionHandler } = await import(actionControllerPath);

describe("Action Controller", () => {
  let req: Partial<Request>;
  let res: Partial<Response>;
  let jsonMock: any;
  let statusMock: any;
  let consoleErrorSpy: any;

  beforeEach(() => {
    jest.clearAllMocks();
    jsonMock = jest.fn();
    statusMock = jest.fn().mockReturnValue({ json: jsonMock });
    res = { status: statusMock } as unknown as Response;
    consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    (globalThis.fetch as any) = jest
      .fn()
      .mockRejectedValue(new Error("connection refused"));
  });

  it("strips newlines from actionName/sensorId before logging a downstream failure", async () => {
    req = {
      body: {
        actionData: {
          actionName: maliciousName,
          sensorId: maliciousName,
          actionArguments: [],
        },
      },
    };

    await createActionHandler({} as any)(req as Request, res as Response);

    expect(statusMock).toHaveBeenCalledWith(502);
    expect(consoleErrorSpy).toHaveBeenCalled();
    for (const call of consoleErrorSpy.mock.calls) {
      for (const arg of call) {
        if (typeof arg === "string") {
          expect(arg).not.toContain("\n");
        }
      }
    }
  });

  it("rejects a non-http(s) endpoint URL without calling fetch", async () => {
    const { readFile } = await import("node:fs/promises");
    (readFile as any).mockResolvedValue(
      JSON.stringify({
        burn: { sensor1: { url: "file:///etc/passwd" } },
      }),
    );

    req = {
      body: {
        actionData: {
          actionName: "burn",
          sensorId: "sensor1",
          actionArguments: [],
        },
      },
    };

    await createActionHandler({} as any)(req as Request, res as Response);

    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(statusMock).toHaveBeenCalledWith(500);
  });
});
