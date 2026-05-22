import { describe, it, expect, beforeAll } from "@jest/globals";

const METRICS_URL = process.env.CONTRACTS_SERVICE_URL ?? "http://localhost:3100";

// Poll until contracts-service is up (it starts after sensor-service)
async function waitForService(url: string, retries = 20, delayMs = 2000) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch (_e) {
      // Service is not ready, retry
    }
    console.log(`Waiting for contracts-service… (${i + 1}/${retries})`);
    await new Promise((r) => setTimeout(r, delayMs));
  }
  throw new Error(
    `contracts-service not reachable at ${url} after ${retries} attempts`,
  );
}

describe("Contracts Service — GET /contracts", () => {
  let body: { metrics: any[] };

  beforeAll(async () => {
    await waitForService(`${METRICS_URL}/contracts`);
    const res = await fetch(`${METRICS_URL}/contracts`);
    body = await res.json();
  }, 60_000);

  it("returns 200", async () => {
    const res = await fetch(`${METRICS_URL}/contracts`);
    expect(res.status).toBe(200);
  });

  it("response has a metrics array", () => {
    expect(Array.isArray(body.metrics)).toBe(true);
    expect(body.metrics.length).toBeGreaterThan(0);
  });

  it("contains all three sensor metrics", () => {
    const keys = body.metrics.map((m) => m.metricKey);
    expect(keys).toContain("temperature");
    expect(keys).toContain("airQuality");
    expect(keys).toContain("peopleCount");
  });

  it("every metric has a sourceService", () => {
    for (const metric of body.metrics) {
      expect(typeof metric.sourceService).toBe("string");
      expect(metric.sourceService.length).toBeGreaterThan(0);
    }
  });

  it("every metric has at least one field", () => {
    for (const metric of body.metrics) {
      expect(Array.isArray(metric.fields)).toBe(true);
      expect(metric.fields.length).toBeGreaterThan(0);
    }
  });
});
