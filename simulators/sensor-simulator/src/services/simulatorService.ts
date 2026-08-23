import { createHmac } from "node:crypto";
import {
  mySimulationBuildings,
  type ISignalPeopleCount,
  type ISignalTemperature,
  type IBuilding,
} from "../models/signal.js";

const INGEST_SECRET = process.env.TELEMETRY_INGEST_SECRET ?? "";

function signedIngest(url: string, payload: unknown): Promise<Response> {
  const body = JSON.stringify(payload);
  return fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Signature": createHmac("sha256", INGEST_SECRET)
        .update(body)
        .digest("hex"),
    },
    body,
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

  public registerBuilding(building: IBuilding) {
    if (building.targetUrl) {
      let parsedUrl = building.targetUrl.replace(/\/$/, "");
      if (parsedUrl.includes("localhost") || parsedUrl.includes("127.0.0.1")) {
        parsedUrl = parsedUrl
          .replace(/localhost/g, "gateway")
          .replace(/127\.0\.0\.1/g, "gateway")
          .replace(/gateway:\d+/g, "gateway");
      }

      building.targetUrl = parsedUrl;
    }
    this.activeBuildings.push(building);
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

  public startOrAdd(building: IBuilding) {
    this.registerBuilding(building);
    this.start();
  }

  public stop(buildingId: string) {
    if (!this.isRunning || this.activeBuildings.activeBuildings.length === 0)
      return;
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
    const rooms = this.activeBuildings.getRooms(building.buildingId);
    if (rooms.length === 0) return;

    const readings = rooms.flatMap((roomId) => [
      { ...this.temperatureFor(roomId, building), type: "temperature" },
      { ...this.peopleCountFor(roomId, building), type: "peopleCount" },
    ]);

    try {
      const response = await signedIngest(
        `${building.targetUrl}/ingest`,
        { buildingId: building.buildingId, readings },
      );
      if (!response.ok) {
        console.error(
          `[Simulator] Error: batch rejected for building ${building.buildingId} (${response.status})`,
        );
      }
    } catch (error: any) {
      console.error(
        `[Simulator] Network Error connecting to: ${building.targetUrl}`,
      );
      console.error(`[Simulator] Message: ${error.message}`);
      if (error.cause) {
        console.error(`[Simulator] Deep Cause:`, error.cause);
      }
    }
  }

  private temperatureFor(
    roomId: string,
    building: IBuilding,
  ): ISignalTemperature {
    return {
      buildingId: building.buildingId,
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

  private peopleCountFor(
    roomId: string,
    building: IBuilding,
  ): ISignalPeopleCount {
    return {
      buildingId: building.buildingId,
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
