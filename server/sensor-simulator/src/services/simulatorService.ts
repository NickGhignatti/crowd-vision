import { 
    mySimulationBuildings, 
    type ISignalPeopleCount, 
    type ISignalTemperature, 
    type IBuilding 
} from '../models/signal.js';

export class Simulator {
    private isRunning: boolean = false;
    private readonly targetUrlTemp: string = "http://gateway:80/sensor/temperature";
    private readonly targetUrlPeople: string = "http://gateway:80/sensor/peopleCount";
    private readonly delay: number = 10000;  // 10 seconds
    private readonly peopleCountRange: [number, number] = [0, 50];
    private readonly temperatureRange: [number, number] = [18, 30];
    private activeBuildings = mySimulationBuildings;

    public getIsRunning(buildingId: string | string[]): boolean {
        return this.isRunning && this.activeBuildings.activeBuildings.some(t => t.buildingId === buildingId);
    }

    public startOrAdd(building: IBuilding) {
        this.activeBuildings.push(building);
        if (!this.isRunning) {
            this.isRunning = true;
            this.tick();
        }
    }

    public stop(buildingId: string) {
        if (!this.isRunning || this.activeBuildings.activeBuildings.length === 0) return;
        this.activeBuildings.activeBuildings = this.activeBuildings.activeBuildings.filter(t => t.buildingId !== buildingId);
        if (this.activeBuildings.activeBuildings.length === 0) {
            this.isRunning = false;
        }
    }

    private async tick() {
        if (!this.isRunning) return;

        for (const building of this.activeBuildings.activeBuildings) {
            await this.sendSignals(building.buildingId);
        }
        
        console.log(`[Simulator] Sleeping for ${this.delay / 1000}s...`);
        setTimeout(() => this.tick(), this.delay);
    }

    private async sendSignals(buildingId: string) {
        const rooms = this.activeBuildings.getRooms(buildingId);
        for (const roomId of rooms) {
            this.sendSingleSignal(roomId, buildingId);
        }
    }

    private async sendSingleSignal(roomId: string, buildingId: string) {
        try {
            console.log(`[Simulator] Sending data for ${buildingId}...`);

            const payloadPeople: ISignalPeopleCount = {
                buildingId,
                roomId: roomId,
                timestamp: Date.now(),
                peopleCount: Math.floor(Math.random() * 
                    (this.peopleCountRange[1] - this.peopleCountRange[0] + 1)) + this.peopleCountRange[0]
            };

            const payloadTemp: ISignalTemperature = {
                buildingId,
                roomId: roomId,
                timestamp: Date.now(),
                temperature: parseFloat((Math.random() * 
                    (this.temperatureRange[1] - this.temperatureRange[0]) + this.temperatureRange[0]).toFixed(2))
            };
            
            const responseTemperature = await fetch(this.targetUrlTemp, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payloadTemp)
            });

            const responsePeopleCount = await fetch(this.targetUrlPeople, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payloadPeople)
            });

            if (!responseTemperature.ok || !responsePeopleCount.ok) {
                console.error(`[Simulator] Error: Something went wrong sending data to building ${buildingId}`);
                console.warn(`[Simulator] API Result: ${responseTemperature.status} ${responseTemperature.statusText}`);
                console.warn(`[Simulator] API Result: ${responsePeopleCount.status} ${responsePeopleCount.statusText}`);
            } else {
                console.log(`[Simulator] Success: Sent value ${payloadTemp.temperature} 
                    for temperature and ${payloadPeople.peopleCount} 
                    for people count to building ${buildingId}`);
            }

        } catch (error) {
            console.error(`[Simulator] Network Error: ${(error as Error).message}`);
        }
    }
}