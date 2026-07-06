import { getSensorServiceUrl, shouldSyncThresholds } from "../config/config.js";
import type { IBuilding } from "../models/building.js";

const syncThresholdClone = async (path: string, init: RequestInit) => {
  if (!shouldSyncThresholds()) return;

  const response = await fetch(`${getSensorServiceUrl()}${path}`, init);
  if (!response.ok) {
    const details = await response.text();
    throw new Error(
      `Failed to sync sensor threshold clone: ${response.status} ${details}`,
    );
  }
};

// sensor-service guards its threshold routes, so forward the caller's JWT as a
// bearer token on this service-to-service call.
const authHeaders = (authToken?: string): Record<string, string> => ({
  "Content-Type": "application/json",
  ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
});

const createPayload = (
  building: Pick<IBuilding, "id" | "name" | "rooms">,
  maxTemperature?: number,
) => ({
  name: building.name,
  ...(maxTemperature !== undefined && { maxTemperature }), // Add it to payload if provided
  rooms: building.rooms.map((room) => ({
    id: room.id,
    name: room.name?.trim() || room.id,
  })),
});

export const syncBuildingClone = async (
  building: Pick<IBuilding, "id" | "name" | "rooms">,
  maxTemperature?: number,
  authToken?: string,
) => {
  await syncThresholdClone(
    `/thresholds/buildings/${encodeURIComponent(building.id)}`,
    {
      method: "PUT",
      headers: authHeaders(authToken),
      body: JSON.stringify(createPayload(building, maxTemperature)),
    },
  );
};

// Best-effort default-threshold init for a newly created room. Never throws —
// a room with no threshold row yet just means telemetry has nothing to alert
// on until an admin sets one, which is harmless; a failed geometry save is not.
export const initRoomThresholds = async (
  buildingId: string,
  room: Pick<IBuilding["rooms"][number], "id" | "capacity">,
  authToken?: string,
): Promise<void> => {
  if (!shouldSyncThresholds()) return;
  try {
    await fetch(
      `${getSensorServiceUrl()}/thresholds/peopleCount/buildings/${encodeURIComponent(
        buildingId,
      )}/rooms/${encodeURIComponent(room.id)}`,
      {
        method: "PATCH",
        headers: authHeaders(authToken),
        body: JSON.stringify({ maxPeople: room.capacity }),
      },
    );
  } catch (err) {
    console.error(
      `[sensors] failed to init thresholds for room "${room.id}":`,
      err,
    );
  }
};
