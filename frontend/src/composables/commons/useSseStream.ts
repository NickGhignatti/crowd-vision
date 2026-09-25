/**
 * Reads an SSE response body frame by frame. A frame is routinely split across two
 * network reads, so the tail of each read is held back until its blank-line
 * terminator arrives.
 */
export async function* readSseFrames(body: ReadableStream<Uint8Array>): AsyncGenerator<unknown> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffered = ''

  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break

      buffered += decoder.decode(value, { stream: true })
      let boundary = buffered.indexOf('\n\n')
      while (boundary !== -1) {
        const frame = parseFrame(buffered.slice(0, boundary))
        buffered = buffered.slice(boundary + 2)
        if (frame !== undefined) yield frame
        boundary = buffered.indexOf('\n\n')
      }
    }
  } finally {
    reader.releaseLock()
  }
}

function parseFrame(block: string): unknown {
  const payload = block
    .split('\n')
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).replace(/^ /, ''))
    .join('\n')

  if (!payload.trim()) return undefined
  try {
    return JSON.parse(payload)
  } catch {
    return undefined
  }
}
