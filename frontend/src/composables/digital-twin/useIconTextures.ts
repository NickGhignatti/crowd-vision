import { CanvasTexture, SRGBColorSpace } from 'three'
import type { Texture } from 'three'

import { glyphOf } from '@/utils/digital-twin/icons.ts'
import { sensorIcon } from '@/utils/digital-twin/sensors.ts'

// Drawn once per kind and state, then reused: a pin is a texture, not a DOM element, because an
// Html overlay costs ~0.35 ms of main thread every frame while a sprite costs none.
const SIZE = 128
const DISC = SIZE * 0.44
const cache = new Map<string, Texture>()

/** The glyph the icon font draws for a Phosphor icon name, or `null` when the font has none. */
function glyphFor(icon: string): string | null {
  const probe = document.createElement('i')
  probe.className = `ph-bold ph-${icon}`
  probe.style.position = 'absolute'
  probe.style.visibility = 'hidden'
  document.body.append(probe)
  try {
    return glyphOf(getComputedStyle(probe, '::before').content)
  } finally {
    probe.remove()
  }
}

/** A disc with something drawn in the middle: an icon glyph, or a room's sensor count. */
function drawDisc(fill: string, ink: string, paint: (context: CanvasRenderingContext2D) => void) {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = SIZE
  const context = canvas.getContext('2d')!
  const centre = SIZE / 2

  context.fillStyle = fill
  context.beginPath()
  context.arc(centre, centre, DISC, 0, Math.PI * 2)
  context.fill()
  context.lineWidth = SIZE * 0.06
  context.strokeStyle = ink
  context.stroke()

  context.fillStyle = ink
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  paint(context)

  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  return texture
}

function draw(icon: string, fill: string, ink: string): Texture {
  const glyph = glyphFor(icon)
  return drawDisc(fill, ink, (context) => {
    if (!glyph) return
    context.font = `${SIZE * 0.5}px Phosphor-Bold`
    context.fillText(glyph, SIZE / 2, SIZE / 2)
  })
}

/** A pin texture per device kind and state, drawn on first use and kept for the session. */
export function useIconTextures() {
  const textureFor = (sensorType: string, fill: string, ink: string): Texture => {
    const icon = sensorIcon(sensorType)
    const key = `${icon}:${fill}:${ink}`
    const existing = cache.get(key)
    if (existing) return existing

    const texture = draw(icon, fill, ink)
    cache.set(key, texture)
    return texture
  }

  /** A room badge: the same disc with its sensor count, drawn once per number and colour. */
  const countTextureFor = (count: number, fill: string, ink: string): Texture => {
    const key = `count:${count}:${fill}:${ink}`
    const existing = cache.get(key)
    if (existing) return existing

    const texture = drawDisc(fill, ink, (context) => {
      context.font = `bold ${SIZE * (count > 9 ? 0.4 : 0.5)}px system-ui, sans-serif`
      context.fillText(String(count), SIZE / 2, SIZE / 2)
    })
    cache.set(key, texture)
    return texture
  }

  return { textureFor, countTextureFor }
}
