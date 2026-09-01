/// Shared between every floor plan format: a drawing yields axis-aligned shapes in
/// drawing units, and this turns them into the room list `/twin/register` accepts.
/// Nothing here knows what SVG or DXF is — the next format reuses it untouched.

import type { Room } from '@/models/building.ts'

/** Ceiling height in metres. A plan is a horizontal section and never states one. */
export const DEFAULT_FLOOR_HEIGHT = 3

/** An axis-aligned shape in drawing units, y growing downwards as it does on a plan. */
export interface PlanShape {
  minX: number
  minY: number
  maxX: number
  maxY: number
  label?: string
}

/** What a format reader produces: geometry, plus what it had to leave behind. */
export interface PlanReading {
  shapes: PlanShape[]
  warnings: string[]
}

/** One drawing, and which storey of the building it is. */
export interface PlanFloor {
  floorIndex: number
  shapes: PlanShape[]
}

export interface PlanOptions {
  name?: string
  /** Drawing units per metre. Never inferred — see `design/floor-plans.qd`. */
  unitsPerMetre: number
  floorHeight?: number
}

/**
 * Exactly the fields a drawing can supply. Derived from `Room` rather than restated so
 * a change to the room's geometry — a footprint, say — reaches extraction as a type error
 * instead of as silent drift.
 */
export type ExtractedRoom = Pick<Room, 'id' | 'name' | 'position' | 'dimensions'>

/** The shape `useBuildingDraft.loadFromJson` already consumes, so nothing downstream changes. */
export interface ExtractedBuilding {
  name: string
  rooms: ExtractedRoom[]
}

export interface ExtractionResult {
  building: ExtractedBuilding
  warnings: string[]
}

const slugify = (label: string): string =>
  label
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

/**
 * Ids key telemetry thresholds (`.../rooms/{roomId}`), so re-extracting the same drawing
 * has to mint the same ids. The floor prefix is what keeps `Office 1` on two storeys from
 * colliding: a shared collision suffix would instead depend on upload order, and removing
 * one floor would silently renumber another. Position is the fallback within a floor
 * because drawing tools reorder their entity lists freely — an array index would not
 * survive a re-export.
 */
const mintId = (shape: PlanShape, floorIndex: number, taken: Set<string>): string => {
  const name =
    slugify(shape.label ?? '') || `room-${Math.round(shape.minX)}-${Math.round(shape.minY)}`
  const base = `f${floorIndex}-${name}`
  let id = base
  for (let n = 2; taken.has(id); n += 1) id = `${base}-${n}`
  taken.add(id)
  return id
}

/**
 * A shape enclosing another *room* is the sheet border or the building outline, not a room.
 * Only labelled shapes count: a plan draws desks, fixtures and stair treads inside rooms,
 * and testing against those would delete the room that contains them.
 */
const isContainer = (shape: PlanShape, others: PlanShape[]): boolean =>
  others.some(
    (other) =>
      other !== shape &&
      other.minX >= shape.minX &&
      other.maxX <= shape.maxX &&
      other.minY >= shape.minY &&
      other.maxY <= shape.maxY &&
      (other.maxX - other.minX) * (other.maxY - other.minY) <
        (shape.maxX - shape.minX) * (shape.maxY - shape.minY),
  )

const roomShapesOf = (shapes: PlanShape[]): PlanShape[] => {
  const labelled = shapes.filter((shape) => shape.label)
  return labelled.filter((shape) => !isContainer(shape, labelled))
}

/**
 * The renderer instances a unit cube at `position` with `dimensions` as its scale
 * (`useInstancedRooms.ts`), and a Three.js box is centred on its origin — so position
 * is the centre on every axis, and Y is up. The plan's two axes are therefore X and Z.
 *
 * Every floor is normalised against one shared origin, not against its own: storeys drawn
 * with different sheet margins would otherwise stack visibly offset from each other.
 */
export function floorsToBuilding(floors: PlanFloor[], options: PlanOptions): ExtractedBuilding {
  const storeys = floors
    .map((floor) => ({ floorIndex: floor.floorIndex, rooms: roomShapesOf(floor.shapes) }))
    .filter((storey) => storey.rooms.length > 0)
    .sort((a, b) => a.floorIndex - b.floorIndex)

  if (storeys.length === 0) throw new Error('Found no rooms: no labelled shape in the drawing.')

  const scale = options.unitsPerMetre
  const floorHeight = options.floorHeight ?? DEFAULT_FLOOR_HEIGHT
  const every = storeys.flatMap((storey) => storey.rooms)

  // A drawing can sit anywhere in its own coordinate space; the twin expects a
  // building near the origin.
  const originX = Math.min(...every.map((room) => room.minX))
  const originY = Math.min(...every.map((room) => room.minY))

  const taken = new Set<string>()
  return {
    name: options.name?.trim() ?? '',
    rooms: storeys.flatMap((storey) =>
      storey.rooms.map((shape) => {
        const width = (shape.maxX - shape.minX) / scale
        const depth = (shape.maxY - shape.minY) / scale
        return {
          id: mintId(shape, storey.floorIndex, taken),
          name: shape.label!.trim(),
          position: {
            x: (shape.minX - originX) / scale + width / 2,
            y: storey.floorIndex * floorHeight + floorHeight / 2,
            z: (shape.minY - originY) / scale + depth / 2,
          },
          dimensions: { width, height: floorHeight, depth },
        }
      }),
    ),
  }
}
