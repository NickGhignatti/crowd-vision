import { describe, expect, it } from "@jest/globals";
import { readFileSync } from "node:fs";

import { Simulator } from "../src/services/simulatorService.js";

// The batch this simulator POSTs is hand-built here, in TypeScript, and hand-parsed by
// telemetry, in Rust. `schemas/fixtures/ingest-batch.json` is the only thing holding the
// two to one shape: a rename here has to fail here rather than stopping readings silently.
const fixture = JSON.parse(
  readFileSync("../../schemas/fixtures/ingest-batch.json", "utf8"),
) as {
  cases: {
    producer: string;
    body: { readings: Record<string, unknown>[] };
  }[];
};

const pinned = (type: string): Record<string, unknown> => {
  const reading = fixture.cases
    .filter((c) => c.producer === "sensor-simulator")
    .flatMap((c) => c.body.readings)
    .find((r) => r["type"] === type);
  if (!reading) throw new Error(`the fixture pins no ${type} reading`);
  return reading;
};

// The builders are private: they are the seam the batch is assembled from, and reaching
// them here is cheaper than exporting them only so a test can see them.
const simulator = new Simulator() as unknown as {
  temperatureFor(roomId: string): Record<string, unknown>;
  peopleCountFor(roomId: string): Record<string, unknown>;
};

const builders: [string, () => Record<string, unknown>][] = [
  ["temperature", () => simulator.temperatureFor("room-lab-2")],
  ["peopleCount", () => simulator.peopleCountFor("room-lab-2")],
];

describe("the readings match the shape telemetry pins", () => {
  it.each(builders)(
    "%s carries exactly the fixture's fields",
    (type, build) => {
      // `type` is added by sendSignals when it assembles the batch, not by the builder.
      const expected = Object.keys(pinned(type))
        .filter((key) => key !== "type")
        .sort();

      expect(Object.keys(build()).sort()).toEqual(expected);
    },
  );

  // buildingId belongs to the batch. Telemetry stamps it onto every reading and rejects one
  // naming a different building, so sending it per reading can only agree or break.
  it.each(builders)(
    "%s does not repeat the batch's building",
    (_type, build) => {
      expect(build()).not.toHaveProperty("buildingId");
    },
  );

  it("counts people as a non-negative integer, which is what the plugin accepts", () => {
    const { peopleCount } = simulator.peopleCountFor("room-lab-2");

    expect(Number.isInteger(peopleCount)).toBe(true);
    expect(peopleCount as number).toBeGreaterThanOrEqual(0);
  });
});
