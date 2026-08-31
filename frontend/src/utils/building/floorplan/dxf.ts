/// DXF floor plan reader: the second rung of the format ladder in `design/floor-plans.qd`.
///
/// ASCII DXF is a flat list of group-code pairs — an integer code on one line, its value on
/// the next. Only the handful of codes a room outline needs are read; everything else is
/// walked past. Hand-rolled on purpose: a parser library adds coverage that cannot be
/// verified without real drawings, and this file is smaller than the lockfile churn.

import type { PlanReading, PlanShape } from './draft.ts'

interface Pair {
  code: number
  value: string
}

interface Entity {
  type: string
  pairs: Pair[]
}

/** `$INSUNITS` codes, as metres are the twin's unit. Anything unlisted stays unanswered. */
const UNITS_PER_METRE: Record<number, number> = {
  1: 39.3701, // inches
  2: 3.28084, // feet
  4: 1000, // millimetres
  5: 100, // centimetres
  6: 1, // metres
}

const pairsOf = (source: string): Pair[] => {
  if (source.trimStart().startsWith('AutoCAD Binary DXF')) {
    throw new Error('This is a binary DXF. Re-export it as ASCII DXF.')
  }

  const lines = source.split(/\r?\n/)
  const pairs: Pair[] = []
  for (let i = 0; i + 1 < lines.length; i += 2) {
    const code = Number(lines[i]!.trim())
    if (!Number.isInteger(code)) throw new Error('Not a DXF drawing.')
    pairs.push({ code, value: lines[i + 1]!.trim() })
  }

  if (!pairs.some((pair) => pair.code === 0 && pair.value === 'SECTION')) {
    throw new Error('Not a DXF drawing.')
  }
  return pairs
}

/** Splits a section's pairs on code 0, which is what starts every entity. */
const entitiesOf = (pairs: Pair[], section: string): Entity[] => {
  const entities: Entity[] = []
  let current: Entity | null = null
  let inSection = false

  for (let i = 0; i < pairs.length; i += 1) {
    const { code, value } = pairs[i]!
    if (code === 0 && value === 'SECTION') {
      inSection = pairs[i + 1]?.code === 2 && pairs[i + 1]?.value === section
      current = null
      continue
    }
    if (code === 0 && value === 'ENDSEC') {
      inSection = false
      current = null
      continue
    }
    if (!inSection) continue

    if (code === 0) {
      current = { type: value, pairs: [] }
      entities.push(current)
    } else if (current) {
      current.pairs.push({ code, value })
    }
  }
  return entities
}

const valuesOf = (entity: Entity, code: number): string[] =>
  entity.pairs.filter((pair) => pair.code === code).map((pair) => pair.value)

const numberAt = (entity: Entity, code: number): number | null => {
  const raw = valuesOf(entity, code)[0]
  if (raw === undefined) return null
  const value = Number(raw)
  return Number.isFinite(value) ? value : null
}

/**
 * MTEXT carries inline formatting — `\P` for a line break, `{\fArial|b0;…}` for font runs.
 * A room label is the text with all of that stripped.
 */
const plainText = (raw: string): string =>
  raw
    .replace(/\\P/g, ' ')
    .replace(/\\[A-Za-z][^;\\]*;/g, '')
    .replace(/[{}]/g, '')
    .trim()

/**
 * DXF y points up the sheet; the twin's z runs the other way (`useInstancedRooms.ts`).
 * Negating here means `draft.ts` normalises against the flipped extents and the floor comes
 * out the right way round — passing y through unchanged mirrors the whole plan silently.
 */
const flip = (y: number): number => -y

const outlineOf = (entity: Entity): PlanShape | null => {
  const xs = valuesOf(entity, 10).map(Number).filter(Number.isFinite)
  const ys = valuesOf(entity, 20).map(Number).filter(Number.isFinite).map(flip)
  if (xs.length < 3 || ys.length < 3) return null

  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
  }
}

interface Anchor {
  x: number
  y: number
  text: string
}

const anchorOf = (entity: Entity): Anchor | null => {
  const raw = [...valuesOf(entity, 1), ...valuesOf(entity, 3)].join('')
  const text = plainText(raw)
  if (!text) return null

  // 11/21 is the alignment point, which justified TEXT uses in place of 10/20.
  const x = numberAt(entity, 11) ?? numberAt(entity, 10)
  const y = numberAt(entity, 21) ?? numberAt(entity, 20)
  return x === null || y === null ? null : { x, y: flip(y), text }
}

/** The scale the drawing declares, or null when it declares none. Never inferred. */
export function declaredUnitsPerMetre(source: string): number | null {
  let pairs: Pair[]
  try {
    pairs = pairsOf(source)
  } catch {
    return null
  }

  const index = pairs.findIndex((pair) => pair.code === 9 && pair.value === '$INSUNITS')
  if (index === -1) return null

  const code = Number(pairs[index + 1]?.value)
  return UNITS_PER_METRE[code] ?? null
}

export function readDxf(source: string): PlanReading {
  const entities = entitiesOf(pairsOf(source), 'ENTITIES')

  const shapes: PlanShape[] = []
  const anchors: Anchor[] = []
  let blocks = 0

  for (const entity of entities) {
    switch (entity.type) {
      case 'LWPOLYLINE':
      case 'POLYLINE': {
        const outline = outlineOf(entity)
        if (outline) shapes.push(outline)
        break
      }
      case 'TEXT':
      case 'MTEXT': {
        const anchor = anchorOf(entity)
        if (anchor) anchors.push(anchor)
        break
      }
      case 'INSERT':
        blocks += 1
        break
      default:
        break
    }
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

  const warnings =
    blocks > 0
      ? [
          `${blocks} block reference${blocks > 1 ? 's' : ''} skipped: rooms drawn inside a block are not read.`,
        ]
      : []

  return { shapes, warnings }
}
