interface SimulationTwins {
    activeTwins: ITwin[];
    push(twin: ITwin): void;
    getRooms(twinId: string): string[];
}

export const mySimulationTwins: SimulationTwins = {
    activeTwins: [],
    push(twin: ITwin) {
        this.activeTwins = this.activeTwins.filter(t => t.twinId !== twin.twinId);
        this.activeTwins.push(twin);
    },
    getRooms(twinId: string): string[] {
        const twin = this.activeTwins.find(t => t.twinId === twinId);
        return twin ? twin.roomIds : [];
    }
};

export interface ITwin {
    twinId: string;
    roomIds: string[];
}

export interface ISignalPeopleCount {
    twinId: string;
    roomId: string;
    timestamp: number;
    peopleCount: number;
}

export interface ISignalTemperature {
    twinId: string;
    roomId: string;
    timestamp: number;
    temperature: number;
}