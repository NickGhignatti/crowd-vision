import { time } from 'console';
import { mySimulationTwins, type ITwin } from '../models/signal.js';

export class Simulator {
    private isRunning: boolean = false;
    private readonly targetUrlTemp: string = "http://localhost:80/sensor/temperature";
    private readonly targetUrlPeople: string = "http://localhost:80/sensor/peopleCount";
    private readonly delay: number = 5000;  // 5 seconds
    private readonly peopleCountRange: [number, number] = [0, 50];
    private readonly temperatureRange: [number, number] = [18, 30];
    private activeTwins = mySimulationTwins;

    public startOrAdd(twin: ITwin) {
        this.activeTwins.push(twin);
        if (!this.isRunning) {
            this.isRunning = true;
            this.tick();
        }
    }

    public stop() {
        this.isRunning = false;
    }

    private async tick() {
        if (!this.isRunning) return;

        for (const twin of this.activeTwins.activeTwins) {
            await this.sendSignals(twin.twinId);
        }
        
        console.log(`[Simulator] Sleeping for ${this.delay / 1000}s...`);
        setTimeout(() => this.tick(), this.delay);
    }

    private async sendSignals(twinId: string) {
        const rooms = this.activeTwins.getRooms(twinId);
        for (const roomId of rooms) {
            await this.sendSingleSignal(roomId, twinId);
        }
    }

    private async sendSingleSignal(roomId: string, twinId: string) {
        try {
            console.log(`[Simulator] Sending data for ${twinId}...`);

            const payloadPeople = {
                twinId,
                roomId: roomId,
                timestamp: Date.now(),
                value: Math.floor(Math.random() * 
                    (this.peopleCountRange[1] - this.peopleCountRange[0] + 1)) + this.peopleCountRange[0]
            };

            const payloadTemp = {
                twinId,
                roomId: roomId,
                timestamp: Date.now(),
                value: parseFloat((Math.random() * 
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
                console.warn(`[Simulator] API Error: ${responseTemperature.status} ${responseTemperature.statusText}`);
                console.warn(`[Simulator] API Error: ${responsePeopleCount.status} ${responsePeopleCount.statusText}`);
            } else {
                console.log(`[Simulator] Success: Sent value ${payloadTemp.value} 
                    for temperature and ${payloadPeople.value} 
                    for people count to twin ${twinId}`);
            }

        } catch (error) {
            console.error(`[Simulator] Network Error: ${(error as Error).message}`);
        }
    }
}