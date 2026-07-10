import { jest } from "@jest/globals";

// Force the sync on (it is skipped under NODE_ENV=test) and pin the target URL so
// we can assert on the outbound request shape.
jest.mock("../src/config/config.js", () => ({
  getSensorServiceUrl: () => "http://sensor-test:3000",
  shouldSyncThresholds: () => true,
}));

import { initRoomThresholds, syncBuildingClone } from "../src/services/sensors.js";

describe("syncBuildingClone — auth forwarding to sensor-service", () => {
  const building = {
    id: "b1",
    name: "B1",
    rooms: [{ id: "r1", name: "R1" }],
  } as any;

  afterEach(() => jest.restoreAllMocks());

  const mockFetch = () =>
    jest
      .spyOn(globalThis, "fetch" as any)
      .mockResolvedValue({ ok: true, text: async () => "" } as any);

  it("forwards the caller's token as a Bearer header", async () => {
    const fetchSpy = mockFetch();

    await syncBuildingClone(building, undefined, "tok-123");

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://sensor-test:3000/thresholds/buildings/b1");
    expect(init.method).toBe("PUT");
    expect((init.headers as Record<string, string>).Authorization).toBe(
      "Bearer tok-123",
    );
  });

  it("omits the Authorization header when no token is provided", async () => {
    const fetchSpy = mockFetch();

    await syncBuildingClone(building);

    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(
      (init.headers as Record<string, string>).Authorization,
    ).toBeUndefined();
    expect((init.headers as Record<string, string>)["Content-Type"]).toBe(
      "application/json",
    );
  });
});

describe("initRoomThresholds — safe error logging", () => {
  afterEach(() => jest.restoreAllMocks());

  it("keeps the log message static and escapes the room id instead of interpolating it", async () => {
    jest
      .spyOn(globalThis, "fetch" as any)
      .mockRejectedValue(new Error("boom"));
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});

    const maliciousId = 'r1"\n[sensors] forged entry %s';
    await initRoomThresholds("b1", {
      id: maliciousId,
      capacity: 10,
    } as any);

    expect(errorSpy).toHaveBeenCalledWith(
      "[sensors] failed to init thresholds for room:",
      JSON.stringify(maliciousId),
      expect.any(Error),
    );
  });
});
