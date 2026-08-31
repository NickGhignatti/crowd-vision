/// Picks an extractor by file extension. A switch, deliberately, not a plugin registry:
/// a new format is one entry here and one reader beside `svg.ts` — see `design/floor-plans.qd`.

import type { ExtractionResult, PlanOptions } from './draft.ts'
import { extractSvg } from './svg.ts'

const EXTRACTORS: Record<string, (source: string, options: PlanOptions) => ExtractionResult> = {
  svg: extractSvg,
}

/** Extensions the upload accepts as a drawing, without the dot. */
export const PLAN_EXTENSIONS = Object.keys(EXTRACTORS)

const extensionOf = (fileName: string): string =>
  fileName.slice(fileName.lastIndexOf('.') + 1).toLowerCase()

export const isPlanFile = (fileName: string): boolean =>
  fileName.includes('.') && extensionOf(fileName) in EXTRACTORS

export function extractPlan(
  fileName: string,
  source: string,
  options: PlanOptions,
): ExtractionResult {
  const extension = extensionOf(fileName)
  const extract = EXTRACTORS[extension]
  if (!extract) throw new Error(`No floor plan extractor for .${extension} drawings.`)
  return extract(source, options)
}
