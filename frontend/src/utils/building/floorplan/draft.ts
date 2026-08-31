/// Shared between every floor plan format: a drawing yields axis-aligned shapes in
/// drawing units, and this turns them into the room list `/twin/register` accepts.
/// Nothing here knows what SVG or DXF is — the next format reuses it untouched.

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

export interface PlanOptions {
  name?: string
  /** Drawing units per metre. Never inferred — see `design/floor-plans.qd`. */
  unitsPerMetre: number
  /** Which storey this drawing is. Sets the elevation; the plan itself cannot say. */
  floorIndex?: number
  floorHeight?: number
}

export interface ExtractedRoom {
  id: string
  name: string
  position: { x: number; y: number; z: number }
  dimensions: { width: number; height: number; depth: number }
}

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
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

/**
 * Ids key telemetry thresholds (`.../rooms/{roomId}`), so re-extracting the same
 * drawing has to mint the same ids. Position is the fallback because drawing tools
 * reorder their entity lists freely — an array index would not survive a re-export.
 */
const mintId = (shape: PlanShape, taken: Set<string>): string => {
  const base =
    slugify(shape.label ?? '') || `room-${Math.round(shape.minX)}-${Math.round(shape.minY)}`
  let id = base
  for (let n = 2; taken.has(id); n += 1) id = `${base}-${n}`
  taken.add(id)
  return id
}

/** A shape enclosing another room is the sheet border or the building outline, not a room. */
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

/**
 * The renderer instances a unit cube at `position` with `dimensions` as its scale
 * (`useInstancedRooms.ts`), and a Three.js box is centred on its origin — so position
 * is the centre on every axis, and Y is up. The plan's two axes are therefore X and Z.
 */
export function shapesToBuilding(shapes: PlanShape[], options: PlanOptions): ExtractedBuilding {
  const rooms = shapes.filter((shape) => shape.label && !isContainer(shape, shapes))
  if (rooms.length === 0) throw new Error('Found no rooms: no labelled shape in the drawing.')

  const scale = options.unitsPerMetre
  const floorHeight = options.floorHeight ?? DEFAULT_FLOOR_HEIGHT
  const elevation = (options.floorIndex ?? 0) * floorHeight + floorHeight / 2

  // A drawing can sit anywhere in its own coordinate space; the twin expects a
  // building near the origin.
  const originX = Math.min(...rooms.map((room) => room.minX))
  const originY = Math.min(...rooms.map((room) => room.minY))

  const taken = new Set<string>()
  return {
    name: options.name?.trim() ?? '',
    rooms: rooms.map((shape) => {
      const width = (shape.maxX - shape.minX) / scale
      const depth = (shape.maxY - shape.minY) / scale
      return {
        id: mintId(shape, taken),
        name: shape.label!.trim(),
        position: {
          x: (shape.minX - originX) / scale + width / 2,
          y: elevation,
          z: (shape.minY - originY) / scale + depth / 2,
        },
        dimensions: { width, height: floorHeight, depth },
      }
    }),
  }
}
