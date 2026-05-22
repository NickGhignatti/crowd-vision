import {
  mySimulationBuildings,
  type ISignalPeopleCount,
  type ISignalTemperature,
  type IBuilding,
} from "../models/signal.js";

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
          .replace(/localhost/g, "host.docker.internal")
          .replace(/127\.0\.0\.1/g, "host.docker.internal");
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

    for (const building of this.activeBuildings.activeBuildings) {
      await this.sendSignals(building);
    }

    setTimeout(() => this.tick(), this.delay);
  }

  private async sendSignals(building: IBuilding) {
    const rooms = this.activeBuildings.getRooms(building.buildingId);
    for (const roomId of rooms) {
      this.sendSingleSignal(roomId, building);
    }
  }

  private async sendSingleSignal(roomId: string, building: IBuilding) {
    try {
      const url = `${building.targetUrl}/ingest`;
      
      const payloadPeople: ISignalPeopleCount = {
        buildingId: building.buildingId,
        roomId: roomId,
        timestamp: Date.now(),
        peopleCount:
          Math.floor(
            Math.random() *
              (this.peopleCountRange[1] - this.peopleCountRange[0] + 1),
          ) + this.peopleCountRange[0],
      };

      const payloadTemp: ISignalTemperature = {
        buildingId: building.buildingId,
        roomId: roomId,
        timestamp: Date.now(),
        temperature: parseFloat(
          (
            Math.random() *
              (this.temperatureRange[1] - this.temperatureRange[0]) +
            this.temperatureRange[0]
          ).toFixed(2),
        ),
      };

      const microkernelTempPayload = {
        ...payloadTemp,
        type: "temperature",
      };

      const microkernelPeopPayload = {
        ...payloadPeople,
        type: "peopleCount",
      };

      const responseTemperature = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(microkernelTempPayload),
      });

      const responsePeopleCount = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(microkernelPeopPayload),
      });

      if (!responseTemperature.ok || !responsePeopleCount.ok) {
        console.error(
          `[Simulator] Error: Something went wrong sending data to building ${building.buildingId}`,
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
}
