/// Picks a reader by file extension, then builds every uploaded drawing into one building.
/// A switch, deliberately, not a plugin registry: a new format is one entry here and one
/// reader beside `svg.ts` — see `design/floor-plans.qd`.

import {
  floorsToBuilding,
  type ExtractionResult,
  type PlanOptions,
  type PlanReading,
} from './draft.ts'
import { declaredUnitsPerMetre, readDxf } from './dxf.ts'
import { readPdf } from './pdf.ts'
import { readSvg } from './svg.ts'

const decode = (bytes: ArrayBuffer): string => new TextDecoder().decode(bytes)

/**
 * Readers take bytes, not text: a PDF is binary, and `File.text()` would replace every
 * invalid UTF-8 sequence before the reader ever saw it. The two text formats decode here,
 * which keeps their own modules free of the distinction.
 */
type Reader = (bytes: ArrayBuffer) => PlanReading | Promise<PlanReading>

const READERS: Record<string, Reader> = {
  svg: (bytes) => readSvg(decode(bytes)),
  dxf: (bytes) => readDxf(decode(bytes)),
  pdf: readPdf,
}

/**
 * Formats that state their own scale. SVG never does; DXF has `$INSUNITS`. Used to pre-fill
 * the calibration field — never to replace it, because drawings lie about their units.
 */
const SCALE_READERS: Record<string, (bytes: ArrayBuffer) => number | null> = {
  dxf: (bytes) => declaredUnitsPerMetre(decode(bytes)),
}

/** Extensions the upload accepts as a drawing, without the dot. */
export const PLAN_EXTENSIONS = Object.keys(READERS)

const extensionOf = (fileName: string): string =>
  fileName.slice(fileName.lastIndexOf('.') + 1).toLowerCase()

export const isPlanFile = (fileName: string): boolean =>
  fileName.includes('.') && extensionOf(fileName) in READERS

/** The scale a drawing declares, when its format can carry one. */
export const declaredScaleOf = (fileName: string, bytes: ArrayBuffer): number | null =>
  SCALE_READERS[extensionOf(fileName)]?.(bytes) ?? null

/** One drawing and the storey it represents. */
export interface PlanUpload {
  name: string
  bytes: ArrayBuffer
  floorIndex: number
}

/**
 * Every storey is read before any of it is placed, so the floors share one origin and one
 * id namespace. Warnings carry their floor, since a drawing is only identifiable by which
 * row of the upload it came from.
 */
export async function extractPlans(
  uploads: PlanUpload[],
  options: PlanOptions,
): Promise<ExtractionResult> {
  const warnings: string[] = []
  const floors = []

  for (const upload of uploads) {
    const extension = extensionOf(upload.name)
    const read = READERS[extension]
    if (!read) throw new Error(`No floor plan extractor for .${extension} drawings.`)

    const reading = await read(upload.bytes)
    warnings.push(...reading.warnings.map((warning) => `Floor ${upload.floorIndex}: ${warning}`))
    floors.push({ floorIndex: upload.floorIndex, shapes: reading.shapes })
  }

  return { building: floorsToBuilding(floors, options), warnings }
}
