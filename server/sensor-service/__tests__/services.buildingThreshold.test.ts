import { afterAll, afterEach, beforeAll, describe, expect, it } from '@jest/globals';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import {
  resolveThreshold,
  syncBuildingThreshold,
  updateBuildingThreshold,
  updateRoomThreshold,
} from '../src/services/buildingThresholdService.js';
import { BuildingThresholdModel } from '../src/models/buildingThreshold.js';

let mongoServer: MongoMemoryServer;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

describe('buildingThresholdService', () => {
  afterEach(async () => {
    await BuildingThresholdModel.deleteMany({});
  });

  it('uses the default max temperature when sync payload omits maxTemperature', async () => {
    await syncBuildingThreshold({
      buildingId: 'building-default',
      name: 'Building Default',
      rooms: [{ id: 'room-1', name: 'Room 1' }],
    });

    await expect(resolveThreshold('building-default', 'room-1')).resolves.toBe(27);
  });

  it('defaults room thresholds to the building max temperature on sync', async () => {
    await syncBuildingThreshold({
      buildingId: 'building-1',
      name: 'Building 1',
      maxTemperature: 29,
      rooms: [{ id: 'room-1', name: 'Room 1' }],
    });

    await expect(resolveThreshold('building-1', 'room-1')).resolves.toBe(29);
  });

  it('propagates building max changes only to rooms still on the old default', async () => {
    await syncBuildingThreshold({
      buildingId: 'building-2',
      name: 'Building 2',
      maxTemperature: 26,
      rooms: [
        { id: 'room-1', name: 'Room 1', maxTemperature: 26 },
        { id: 'room-2', name: 'Room 2', maxTemperature: 31 },
      ],
    });

    await updateBuildingThreshold('building-2', { maxTemperature: 30 });

    await expect(resolveThreshold('building-2', 'room-1')).resolves.toBe(30);
    await expect(resolveThreshold('building-2', 'room-2')).resolves.toBe(31);
  });

  it('updates individual room thresholds without touching the building default', async () => {
    await syncBuildingThreshold({
      buildingId: 'building-3',
      name: 'Building 3',
      maxTemperature: 27,
      rooms: [{ id: 'room-1', name: 'Room 1' }],
    });

    await updateRoomThreshold('building-3', 'room-1', { maxTemperature: 33 });

    await expect(resolveThreshold('building-3', 'room-1')).resolves.toBe(33);
  });
});

