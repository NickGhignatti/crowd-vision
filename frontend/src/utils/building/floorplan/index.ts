/// Picks a reader by file extension, then builds every uploaded drawing into one building.
/// A switch, deliberately, not a plugin registry: a new format is one entry here and one
/// reader beside `svg.ts` — see `design/floor-plans.qd`.

import {
  floorsToBuilding,
  type ExtractionResult,
  type PlanOptions,
  type PlanReading,
} from './draft.ts'
import { readSvg } from './svg.ts'

const READERS: Record<string, (source: string) => PlanReading> = {
  svg: readSvg,
}

/** Extensions the upload accepts as a drawing, without the dot. */
export const PLAN_EXTENSIONS = Object.keys(READERS)

const extensionOf = (fileName: string): string =>
  fileName.slice(fileName.lastIndexOf('.') + 1).toLowerCase()

export const isPlanFile = (fileName: string): boolean =>
  fileName.includes('.') && extensionOf(fileName) in READERS

/** One drawing and the storey it represents. */
export interface PlanUpload {
  name: string
  source: string
  floorIndex: number
}

/**
 * Every storey is read before any of it is placed, so the floors share one origin and one
 * id namespace. Warnings carry their floor, since a drawing is only identifiable by which
 * row of the upload it came from.
 */
export function extractPlans(uploads: PlanUpload[], options: PlanOptions): ExtractionResult {
  const warnings: string[] = []
  const floors = uploads.map((upload) => {
    const extension = extensionOf(upload.name)
    const read = READERS[extension]
    if (!read) throw new Error(`No floor plan extractor for .${extension} drawings.`)

    const reading = read(upload.source)
    warnings.push(...reading.warnings.map((warning) => `Floor ${upload.floorIndex}: ${warning}`))
    return { floorIndex: upload.floorIndex, shapes: reading.shapes }
  })

  return { building: floorsToBuilding(floors, options), warnings }
}
