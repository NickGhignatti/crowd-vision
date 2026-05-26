interface SimulationBuildings {
  activeBuildings: IBuilding[];
  push(building: IBuilding): void;
  getRooms(buildingId: string): string[];
}

export const mySimulationBuildings: SimulationBuildings = {
  activeBuildings: [],
  push(building: IBuilding) {
    this.activeBuildings = this.activeBuildings.filter(
      (t) => t.buildingId !== building.buildingId,
    );
    this.activeBuildings.push(building);
  },
  getRooms(buildingId: string): string[] {
    const building = this.activeBuildings.find(
      (t) => t.buildingId === buildingId,
    );
    return building ? building.roomIds : [];
  },
};

export interface IBuilding {
  buildingId: string;
  roomIds: string[];
  targetUrl: string;
}

export interface ISignalPeopleCount {
  buildingId: string;
  roomId: string;
  timestamp: number;
  peopleCount: number;
}

export interface ISignalTemperature {
  buildingId: string;
  roomId: string;
  timestamp: number;
  temperature: number;
}
