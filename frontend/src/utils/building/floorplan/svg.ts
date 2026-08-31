/// SVG floor plan reader: the first rung of the format ladder in `design/floor-plans.qd`.

import {
  shapesToBuilding,
  type ExtractionResult,
  type PlanOptions,
  type PlanShape,
} from './draft.ts'

/** Translation and scale accumulated from ancestor `transform` attributes. */
interface Transform {
  tx: number
  ty: number
  sx: number
  sy: number
}

const IDENTITY: Transform = { tx: 0, ty: 0, sx: 1, sy: 1 }

const numbers = (source: string): number[] =>
  (source.match(/-?\d*\.?\d+(?:[eE][-+]?\d+)?/g) ?? []).map(Number)

/**
 * Only translate and scale are honoured. A rotated or skewed room is not an
 * axis-aligned box, so there is no correct value to produce — those are reported
 * rather than squared off into a plausible-looking wrong rectangle.
 */
const parseTransform = (attribute: string | null): Transform | { unsupported: string } => {
  if (!attribute?.trim()) return IDENTITY

  let combined = IDENTITY
  for (const [, name, argsText] of attribute.matchAll(/([a-zA-Z]+)\s*\(([^)]*)\)/g)) {
    const args = numbers(argsText!)
    let step: Transform
    if (name === 'translate') step = { tx: args[0] ?? 0, ty: args[1] ?? 0, sx: 1, sy: 1 }
    else if (name === 'scale')
      step = { tx: 0, ty: 0, sx: args[0] ?? 1, sy: args[1] ?? args[0] ?? 1 }
    else return { unsupported: name! }

    combined = {
      tx: combined.tx + combined.sx * step.tx,
      ty: combined.ty + combined.sy * step.ty,
      sx: combined.sx * step.sx,
      sy: combined.sy * step.sy,
    }
  }
  return combined
}

const compose = (parent: Transform, child: Transform): Transform => ({
  tx: parent.tx + parent.sx * child.tx,
  ty: parent.ty + parent.sy * child.ty,
  sx: parent.sx * child.sx,
  sy: parent.sy * child.sy,
})

const applyX = (t: Transform, x: number): number => t.tx + t.sx * x
const applyY = (t: Transform, y: number): number => t.ty + t.sy * y

const attr = (element: Element, name: string): number => Number(element.getAttribute(name) ?? 0)

/**
 * Line commands only. A room outline is straight-sided; a path carrying curves is
 * something else on the sheet (a door swing, a logo) and is left alone.
 */
const pathPoints = (d: string): Array<[number, number]> | null => {
  const points: Array<[number, number]> = []
  let x = 0
  let y = 0

  for (const chunk of d.match(/[a-zA-Z][^a-zA-Z]*/g) ?? []) {
    const command = chunk[0]!
    const args = numbers(chunk.slice(1))
    const relative = command === command.toLowerCase()

    switch (command.toUpperCase()) {
      case 'M':
      case 'L':
        for (let i = 0; i + 1 < args.length; i += 2) {
          x = relative ? x + args[i]! : args[i]!
          y = relative ? y + args[i + 1]! : args[i + 1]!
          points.push([x, y])
        }
        break
      case 'H':
        for (const value of args) {
          x = relative ? x + value : value
          points.push([x, y])
        }
        break
      case 'V':
        for (const value of args) {
          y = relative ? y + value : value
          points.push([x, y])
        }
        break
      case 'Z':
        break
      default:
        return null
    }
  }
  return points.length > 0 ? points : null
}

const boundsOf = (points: Array<[number, number]>) => ({
  minX: Math.min(...points.map(([px]) => px)),
  minY: Math.min(...points.map(([, py]) => py)),
  maxX: Math.max(...points.map(([px]) => px)),
  maxY: Math.max(...points.map(([, py]) => py)),
})

/** Local-space corners of a shape element, or null when it is not a closed outline. */
const cornersOf = (element: Element): Array<[number, number]> | null => {
  switch (element.tagName.toLowerCase()) {
    case 'rect': {
      const [x, y, width, height] = ['x', 'y', 'width', 'height'].map((n) => attr(element, n)) as [
        number,
        number,
        number,
        number,
      ]
      return width > 0 && height > 0
        ? [
            [x, y],
            [x + width, y + height],
          ]
        : null
    }
    case 'polygon':
    case 'polyline': {
      const values = numbers(element.getAttribute('points') ?? '')
      const points: Array<[number, number]> = []
      for (let i = 0; i + 1 < values.length; i += 2) points.push([values[i]!, values[i + 1]!])
      return points.length > 0 ? points : null
    }
    case 'path':
      return pathPoints(element.getAttribute('d') ?? '')
    default:
      return null
  }
}

interface Anchor {
  x: number
  y: number
  text: string
}

const parse = (source: string): Document => {
  const document = new DOMParser().parseFromString(source, 'image/svg+xml')
  const root = document.documentElement
  if (!root || root.tagName.toLowerCase() !== 'svg' || document.querySelector('parsererror')) {
    throw new Error('Not an SVG drawing.')
  }
  return document
}

export function extractSvg(source: string, options: PlanOptions): ExtractionResult {
  const shapes: PlanShape[] = []
  const anchors: Anchor[] = []
  const skipped = new Map<string, number>()

  const walk = (element: Element, inherited: Transform): void => {
    const own = parseTransform(element.getAttribute('transform'))
    if ('unsupported' in own) {
      skipped.set(own.unsupported, (skipped.get(own.unsupported) ?? 0) + 1)
      return
    }
    const transform = compose(inherited, own)
    const tag = element.tagName.toLowerCase()

    if (tag === 'text') {
      const text = element.textContent?.trim()
      const source =
        (element.getAttribute('x') ? element : element.querySelector('tspan')) ?? element
      if (text) {
        anchors.push({
          x: applyX(transform, attr(source, 'x')),
          y: applyY(transform, attr(source, 'y')),
          text,
        })
      }
      return
    }

    const corners = cornersOf(element)
    if (corners) {
      const local = boundsOf(corners)
      shapes.push({
        minX: applyX(transform, local.minX),
        minY: applyY(transform, local.minY),
        maxX: applyX(transform, local.maxX),
        maxY: applyY(transform, local.maxY),
      })
    }

    for (const child of Array.from(element.children)) walk(child, transform)
  }

  walk(parse(source).documentElement, IDENTITY)

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

  const warnings = Array.from(
    skipped,
    ([name, count]) =>
      `${count} shape${count > 1 ? 's' : ''} skipped: the transform "${name}" cannot produce an axis-aligned room.`,
  )

  return { building: shapesToBuilding(shapes, options), warnings }
}
