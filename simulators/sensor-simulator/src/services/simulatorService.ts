import { createHmac } from "node:crypto";
import {
  mySimulationBuildings,
  type ISignalPeopleCount,
  type ISignalTemperature,
  type IBuilding,
  type ISimulatedSensor,
} from "../models/signal.js";

type Reading = (ISignalTemperature | ISignalPeopleCount) & { type: string };

const INGEST_SECRET = process.env.TELEMETRY_INGEST_SECRET ?? "";
const INGEST_URL =
  process.env.TELEMETRY_INGEST_URL ?? "http://gateway/telemetry/ingest";
// fetch has no timeout of its own: a hung ingest would leave one request open per tick.
const INGEST_TIMEOUT_MS = 8000;

function signedIngest(payload: unknown): Promise<Response> {
  const body = JSON.stringify(payload);
  return fetch(INGEST_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Signature": createHmac("sha256", INGEST_SECRET)
        .update(body)
        .digest("hex"),
    },
    body,
    signal: AbortSignal.timeout(INGEST_TIMEOUT_MS),
  });
}

export class Simulator {
  private isRunning: boolean = false;
  private readonly delay: number = 10000;
  private readonly peopleCountRange: [number, number] = [0, 50];
  private readonly temperatureRange: [number, number] = [18, 30];
  private activeBuildings = mySimulationBuildings;

  public getIsRunning(buildingId: string | string[]): boolean {
    return (
      this.isRunning &&
      this.activeBuildings.activeBuildings.some(
        (t) => t.buildingId === buildingId,
      )
    );
  }

  public getIsRunningAny(): boolean {
    return this.isRunning;
  }

  public start() {
    if (this.activeBuildings.activeBuildings.length === 0) {
      throw new Error("No buildings registered for simulation");
    }
    if (!this.isRunning) {
      this.isRunning = true;
      this.tick();
    }
  }

  /** Replaces what the building simulates; no sensors means stop simulating it. */
  public startOrAdd(building: IBuilding) {
    if (building.sensors.length === 0) {
      this.stop(building.buildingId);
      return;
    }
    this.activeBuildings.push(building);
    this.start();
  }

  public stop(buildingId: string) {
    this.activeBuildings.activeBuildings =
      this.activeBuildings.activeBuildings.filter(
        (t) => t.buildingId !== buildingId,
      );
    if (this.activeBuildings.activeBuildings.length === 0) {
      this.isRunning = false;
    }
  }

  private async tick() {
    if (!this.isRunning) return;

    await Promise.all(
      this.activeBuildings.activeBuildings.map((building) =>
        this.sendSignals(building),
      ),
    );

    setTimeout(() => this.tick(), this.delay);
  }

  private async sendSignals(building: IBuilding) {
    const readings = this.readingsFor(building.sensors);
    // Telemetry rejects an empty batch.
    if (readings.length === 0) return;

    try {
      const response = await signedIngest({
        buildingId: building.buildingId,
        readings,
      });
      if (!response.ok) {
        console.error(
          `[Simulator] Error: batch rejected for building ${building.buildingId} (${response.status})`,
        );
      }
    } catch (error: any) {
      console.error(`[Simulator] Network Error connecting to: ${INGEST_URL}`);
      console.error(`[Simulator] Message: ${error.message}`);
      if (error.cause) {
        console.error(`[Simulator] Deep Cause:`, error.cause);
      }
    }
  }

  private readingsFor(sensors: ISimulatedSensor[]): Reading[] {
    return sensors.flatMap((sensor): Reading[] => {
      switch (sensor.sensorType) {
        case "temperature":
          return [
            { ...this.temperatureFor(sensor.roomId), type: "temperature" },
          ];
        case "peopleCount":
          return [
            { ...this.peopleCountFor(sensor.roomId), type: "peopleCount" },
          ];
        default:
          return [];
      }
    });
  }

  private temperatureFor(roomId: string): ISignalTemperature {
    return {
      roomId,
      timestamp: Date.now(),
      temperature: parseFloat(
        (
          Math.random() *
            (this.temperatureRange[1] - this.temperatureRange[0]) +
          this.temperatureRange[0]
        ).toFixed(2),
      ),
    };
  }

  private peopleCountFor(roomId: string): ISignalPeopleCount {
    return {
      roomId,
      timestamp: Date.now(),
      peopleCount:
        Math.floor(
          Math.random() *
            (this.peopleCountRange[1] - this.peopleCountRange[0] + 1),
        ) + this.peopleCountRange[0],
    };
  }
}
