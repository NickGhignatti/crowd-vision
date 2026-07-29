import { describe, it, expect, beforeAll, afterAll } from "@jest/globals";
import mongoose from "mongoose";
import { startMongo, stopMongo } from "../helpers/mongo.js";
import { Temperature } from "src/models/temperatureSignal.ts";
import { PeopleCount } from "src/models/peopleCountSignal.ts";
import { AirQuality } from "src/models/airQualitySignal.ts";

beforeAll(startMongo);
afterAll(stopMongo);

const NINETY_DAYS = 60 * 60 * 24 * 90;

async function collectionInfo(name: string) {
  const infos = await mongoose.connection
    .db!.listCollections({ name })
    .toArray();
  return infos[0];
}

const models: Array<[string, mongoose.Model<unknown>]> = [
  ["Temperature", Temperature as mongoose.Model<unknown>],
  ["PeopleCount", PeopleCount as mongoose.Model<unknown>],
  ["AirQuality", AirQuality as mongoose.Model<unknown>],
];

describe("signal collections are MongoDB time-series", () => {
  it.each(models)(
    "%s is provisioned as a time-series collection with retention",
    async (_label, model) => {
      const info = await collectionInfo(model.collection.collectionName);
      const options = (info?.options ?? {}) as {
        timeseries?: { timeField?: string; metaField?: string };
        expireAfterSeconds?: number;
      };

      expect(info?.type).toBe("timeseries");
      expect(options.timeseries?.timeField).toBe("createdAt");
      expect(options.timeseries?.metaField).toBe("building");
      expect(options.expireAfterSeconds).toBe(NINETY_DAYS);
    },
  );
});

describe("time axis", () => {
  it("stamps createdAt automatically on insert", async () => {
    const doc = await Temperature.create({
      building: "b1",
      roomId: "r1",
      timestamp: Date.now(),
      temperature: 21,
    });
    expect(doc.createdAt).toBeInstanceOf(Date);
  });
});
