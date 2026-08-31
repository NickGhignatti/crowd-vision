/// Vector PDF floor plan reader: the third rung of the format ladder in
/// `design/floor-plans.qd`.
///
/// Unlike SVG and DXF, this one needs a library — a PDF content stream is compressed binary,
/// not a text format anyone should hand-roll. pdf.js is loaded through a dynamic import so
/// it stays out of the main bundle: it is over a megabyte, and most sessions never open a PDF.

import type { PlanReading, PlanShape } from './draft.ts'

/**
 * pdf.js hands back a path's bounding box already resolved into page space, which is the
 * whole of what a room outline needs — no need to track the graphics-state matrix.
 */
const PATH_BOUNDS_ARGUMENT = 2

interface Anchor {
  x: number
  y: number
  text: string
}

/**
 * PDF's origin is bottom-left with y pointing up, the same disagreement DXF has with the
 * twin's z. Negate on the way in and `draft.ts` normalises against the flipped extents.
 */
const flip = (y: number): number => -y

/**
 * Vite serves the worker as a hashed asset, so its URL is only knowable at build time.
 * An already-set `workerSrc` is left alone: that is how the tests point pdf.js at the
 * worker on disk, since there is no dev server serving assets under vitest.
 */
const load = async () => {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  if (!pdfjs.GlobalWorkerOptions.workerSrc) {
    pdfjs.GlobalWorkerOptions.workerSrc = (
      await import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url')
    ).default
  }
  return pdfjs
}

export async function readPdf(bytes: ArrayBuffer): Promise<PlanReading> {
  const header = new TextDecoder().decode(bytes.slice(0, 5))
  if (header !== '%PDF-') throw new Error('Not a PDF drawing.')

  const pdfjs = await load()
  // Teardown lives on the loading task, not on the document, so keep hold of it.
  const task = pdfjs.getDocument({ data: new Uint8Array(bytes) })
  let file
  try {
    file = await task.promise
  } catch (error) {
    await task.destroy()
    // Carry the reason: a failed open is rare, and "could not be opened" alone is a
    // dead end for whoever has to work out why.
    const reason = error instanceof Error ? error.message : String(error)
    throw new Error(`That PDF could not be opened: ${reason}`)
  }

  const warnings: string[] = []
  if (file.numPages > 1) {
    warnings.push(
      `Only page 1 was read: a drawing is one floor, and this PDF has ${file.numPages} pages.`,
    )
  }

  const page = await file.getPage(1)
  const operators = await page.getOperatorList()

  const shapes: PlanShape[] = []
  for (let index = 0; index < operators.fnArray.length; index += 1) {
    if (operators.fnArray[index] !== pdfjs.OPS.constructPath) continue

    const bounds = operators.argsArray[index]?.[PATH_BOUNDS_ARGUMENT] as
      | ArrayLike<number>
      | undefined
    if (!bounds || bounds.length < 4) continue

    const [minX, minY, maxX, maxY] = [bounds[0]!, bounds[1]!, bounds[2]!, bounds[3]!]
    if (!(maxX > minX) || !(maxY > minY)) continue

    shapes.push({ minX, maxX, minY: flip(maxY), maxY: flip(minY) })
  }

  const content = await page.getTextContent()
  const anchors: Anchor[] = []
  for (const item of content.items) {
    if (!('str' in item)) continue
    const text = item.str.trim()
    if (!text) continue
    anchors.push({ x: item.transform[4], y: flip(item.transform[5]), text })
  }

  // A label belongs to the tightest shape enclosing it: a room, not the sheet it sits on.
  for (const anchor of anchors) {
    const enclosing = shapes
      .filter(
        (shape) =>
          !shape.label &&
          anchor.x >= shape.minX &&
          anchor.x <= shape.maxX &&
          anchor.y >= shape.minY &&
          anchor.y <= shape.maxY,
      )
      .sort((a, b) => (a.maxX - a.minX) * (a.maxY - a.minY) - (b.maxX - b.minX) * (b.maxY - b.minY))
    if (enclosing[0]) enclosing[0].label = anchor.text
  }

  await task.destroy()
  return { shapes, warnings }
}
