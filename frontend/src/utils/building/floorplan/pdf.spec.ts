import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { GlobalWorkerOptions } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { describe, expect, it } from 'vitest'
import { floorsToBuilding } from './draft.ts'
import { readPdf } from './pdf.ts'

// No dev server here, so point pdf.js at the worker on disk. In the browser `pdf.ts`
// resolves it through Vite instead; that path is covered by the build, not by this suite.
GlobalWorkerOptions.workerSrc = pathToFileURL(
  'node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs',
).href

/**
 * Read from the package root rather than `import.meta.url`: under Vite that is not a file
 * URL, and a PDF is bytes, so the `?raw` import the text fixtures use does not apply.
 */
const fixture = (name: string): ArrayBuffer => {
  const file = readFileSync(`src/utils/building/floorplan/__fixtures__/${name}`)
  return file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength) as ArrayBuffer
}

const office = () => fixture('office.pdf')

const build = async (bytes: ArrayBuffer, unitsPerMetre: number) => {
  const { shapes, warnings } = await readPdf(bytes)
  return { building: floorsToBuilding([{ floorIndex: 0, shapes }], { unitsPerMetre }), warnings }
}

describe('readPdf', () => {
  it('turns stroked outlines with a label inside them into rooms', async () => {
    const { building } = await build(office(), 20)

    expect(
      building.rooms.map((room) => [room.id, room.dimensions.width, room.dimensions.depth]),
    ).toEqual([
      ['f0-meeting-room', 8, 6],
      ['f0-open-space', 9, 6],
      ['f0-store', 8, 6],
    ])
  })

  /** PDF's origin is bottom-left, so an unflipped read mirrors the whole floor silently. */
  it('flips the y axis, so a room drawn higher up the page is nearer the origin', async () => {
    const { building } = await build(office(), 20)
    const meeting = building.rooms.find((room) => room.name === 'Meeting Room')!
    const store = building.rooms.find((room) => room.name === 'Store')!

    expect(meeting.position.z).toBeLessThan(store.position.z)
  })

  it('drops the unlabelled wall strip', async () => {
    const { building } = await build(office(), 20)

    expect(building.rooms).toHaveLength(3)
  })

  it('refuses input that is not a PDF', async () => {
    const notPdf = new TextEncoder().encode('{"rooms":[]}').buffer as ArrayBuffer

    await expect(readPdf(notPdf)).rejects.toThrow(/pdf/i)
  })
})
