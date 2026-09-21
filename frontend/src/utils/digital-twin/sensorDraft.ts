import type { Coordinates } from '@/types/digital-twin/building.ts'
import type { Sensor } from '@/types/digital-twin/sensor.ts'

/** A sensor the user added but has not saved; `ref` is its key until telemetry gives it an id. */
export interface NewSensorDraft {
  ref: string
  name: string
  sensorType: string
  roomId: string | null
  position: Coordinates | null
}

/** What the user changed about a sensor that is already saved. */
export interface SensorEdit {
  name?: string
  roomId?: string | null
  position?: Coordinates | null
}

export interface SensorDraft {
  added: NewSensorDraft[]
  edited: Record<string, SensorEdit>
  removed: string[]
}

export interface TelemetryBatch {
  create: { ref: string; name: string; sensorType: string; roomId: string | null }[]
  update: ({ sensorId: string } & SensorEdit)[]
  delete: string[]
}

export interface PlacementBatch {
  upsert: { sensorId: string; position: Coordinates }[]
  delete: string[]
}

export const emptyDraft = (): SensorDraft => ({ added: [], edited: {}, removed: [] })

const isNew = (target: Sensor | { ref: string }): target is { ref: string } => 'ref' in target

export function addSensor(draft: SensorDraft, sensor: NewSensorDraft): SensorDraft {
  return { ...draft, added: [...draft.added, sensor] }
}

function editNew(draft: SensorDraft, ref: string, patch: Partial<NewSensorDraft>): SensorDraft {
  return {
    ...draft,
    added: draft.added.map((sensor) => (sensor.ref === ref ? { ...sensor, ...patch } : sensor)),
  }
}

function editSaved(draft: SensorDraft, sensorId: string, patch: SensorEdit): SensorDraft {
  return {
    ...draft,
    edited: { ...draft.edited, [sensorId]: { ...draft.edited[sensorId], ...patch } },
  }
}

export function renameSensor(
  draft: SensorDraft,
  target: Sensor | { ref: string },
  name: string,
): SensorDraft {
  return isNew(target)
    ? editNew(draft, target.ref, { name })
    : editSaved(draft, target.sensorId, { name })
}

export function moveSensor(
  draft: SensorDraft,
  target: Sensor | { ref: string },
  to: { roomId: string | null; position: Coordinates | null },
): SensorDraft {
  return isNew(target) ? editNew(draft, target.ref, to) : editSaved(draft, target.sensorId, to)
}

/** Removing a sensor that was never saved just drops it; nothing is sent for it. */
export function removeSensor(draft: SensorDraft, target: Sensor | { ref: string }): SensorDraft {
  if (isNew(target)) {
    return { ...draft, added: draft.added.filter((sensor) => sensor.ref !== target.ref) }
  }
  const { [target.sensorId]: _dropped, ...edited } = draft.edited
  return { ...draft, edited, removed: [...draft.removed, target.sensorId] }
}

/** How many sensors the draft touches, counting each one once. */
export function changeCount(draft: SensorDraft): number {
  return draft.added.length + Object.keys(draft.edited).length + draft.removed.length
}

export function toTelemetryBatch(draft: SensorDraft): TelemetryBatch {
  return {
    create: draft.added.map(({ ref, name, sensorType, roomId }) => ({
      ref,
      name,
      sensorType,
      roomId,
    })),
    update: Object.entries(draft.edited).map(([sensorId, edit]) => {
      const { position: _position, ...rest } = edit
      return { sensorId, ...rest }
    }),
    delete: [...draft.removed],
  }
}

/**
 * `idsByRef` maps a new sensor's `ref` to the id telemetry just gave it. A ref with no id yet
 * is left out rather than guessed, so the next save can place it.
 */
export function toPlacementBatch(
  draft: SensorDraft,
  idsByRef: Record<string, string>,
): PlacementBatch {
  const upsert: PlacementBatch['upsert'] = []

  for (const sensor of draft.added) {
    const sensorId = idsByRef[sensor.ref]
    if (sensorId && sensor.position) upsert.push({ sensorId, position: sensor.position })
  }
  for (const [sensorId, edit] of Object.entries(draft.edited)) {
    if (edit.position) upsert.push({ sensorId, position: edit.position })
  }

  return { upsert, delete: [...draft.removed] }
}

/** Folds a batch that still has to be sent into the next one; the newer batch wins. */
export function mergePlacementBatches(
  older: PlacementBatch,
  newer: PlacementBatch,
): PlacementBatch {
  const deleted = new Set([...older.delete, ...newer.delete])
  const byId = new Map<string, Coordinates>()
  for (const { sensorId, position } of [...older.upsert, ...newer.upsert]) {
    byId.set(sensorId, position)
  }

  return {
    upsert: [...byId.entries()]
      .filter(([sensorId]) => !deleted.has(sensorId))
      .map(([sensorId, position]) => ({ sensorId, position })),
    delete: [...deleted],
  }
}
