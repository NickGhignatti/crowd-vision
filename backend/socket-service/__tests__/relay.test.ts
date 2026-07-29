import { describe, it, expect } from "@jest/globals";
import { buildingIdFromChannel, roomForBuilding } from "../src/core/relay.js";

describe("buildingIdFromChannel", () => {
  it("extracts the id from a telemetry:filtered channel", () => {
    expect(buildingIdFromChannel("telemetry:filtered:bldg-1")).toBe("bldg-1");
  });

  it("returns an empty string when the channel is only the prefix", () => {
    expect(buildingIdFromChannel("telemetry:filtered:")).toBe("");
  });
});

describe("roomForBuilding", () => {
  it("namespaces the building id into a room name", () => {
    expect(roomForBuilding("bldg-1")).toBe("building:bldg-1");
  });
});
