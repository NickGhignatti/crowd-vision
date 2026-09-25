import { beforeEach, describe, expect, it } from "@jest/globals";
import express from "express";
import { readFileSync } from "node:fs";
import request from "supertest";

import { mySimulationBuildings, parseStart } from "../src/models/signal.js";
import router from "../src/router.js";
import { Simulator } from "../src/services/simulatorService.js";

// Telemetry builds the start body in Rust and this simulator parses it by hand;
// `schemas/fixtures/simulation-start.json` is the only thing holding the two to one shape.
type Body = Record<string, unknown>;
const fixture = JSON.parse(
  readFileSync("../../schemas/fixtures/simulation-start.json", "utf8"),
) as {
  cases: { name: string; consumer: string; body: Body }[];
  rejected: { name: string; reason: string; body: Body }[];
};

const bodyFor = (consumer: string): Body => {
  const found = fixture.cases.find((c) => c.consumer === consumer);
  if (!found) throw new Error(`the fixture has no ${consumer} case`);
  return found.body;
};

const sensor = (sensorType: string) => ({
  sensorId: `id-${sensorType}`,
  sensorType,
  roomId: "room-lab-2",
});

// readingsFor is private: reaching it through a cast is cheaper than exporting it for a test.
const internals = (simulator: Simulator) =>
  simulator as unknown as {
    readingsFor(sensors: unknown): Record<string, unknown>[];
  };

beforeEach(() => {
  mySimulationBuildings.activeBuildings = [];
});

describe("the start body telemetry sends", () => {
  it.each(fixture.cases.map((c) => [c.name, c.body] as const))(
    "parses %s",
    (_name, body) => {
      expect(parseStart(body)).toEqual(body);
    },
  );

  it.each(fixture.rejected.map((c) => [c.name, c.body] as const))(
    "refuses %s",
    (_name, body) => {
      expect(() => parseStart(body)).toThrow();
    },
  );
});

describe("readings follow the sensors, not the rooms", () => {
  it("produces one reading per sensor, of its kind, in its room", () => {
    const readings = internals(new Simulator()).readingsFor(
      bodyFor("sensor-simulator")["sensors"],
    );

    expect(readings.map((r) => [r["type"], r["roomId"]])).toEqual([
      ["temperature", "room-lab-2"],
      ["peopleCount", "room-lab-2"],
    ]);
  });

  it("produces nothing for a kind it does not simulate", () => {
    const readings = internals(new Simulator()).readingsFor([
      sensor("airQuality"),
      sensor("router"),
    ]);

    expect(readings).toEqual([]);
  });
});

describe("start and stop", () => {
  it("drops the building when told to simulate no sensors", () => {
    const simulator = new Simulator();
    mySimulationBuildings.push({
      buildingId: "bldg-3f2b4c5d",
      sensors: [sensor("temperature")],
    });

    simulator.startOrAdd(parseStart(bodyFor("any")));

    expect(mySimulationBuildings.activeBuildings).toEqual([]);
    expect(simulator.getIsRunning("bldg-3f2b4c5d")).toBe(false);
  });

  it("stopping a building it never simulated is not an error", () => {
    expect(() => new Simulator().stop("ghost")).not.toThrow();
  });
});

describe("POST /control/start", () => {
  const app = express().use(express.json()).use(router);

  it("refuses the old body that chose its own ingest target", async () => {
    const response = await request(app)
      .post("/control/start")
      .send({
        buildingId: "bldg-3f2b4c5d",
        roomIds: ["room-lab-2"],
        targetUrl: "http://localhost/telemetry/",
      });

    expect(response.status).toBe(400);
  });

  it("accepts the body telemetry sends", async () => {
    const response = await request(app)
      .post("/control/start")
      .send(bodyFor("any"));

    expect(response.status).toBe(200);
  });
});
