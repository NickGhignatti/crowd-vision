/**
 * Turns a failed response body into one line, whatever wrote it: the edge answers in plain
 * text (`invalid token`), services answer in JSON (`{ type, message }`).
 */
export function errorMessageFrom(status: number, body: string): string {
  const text = body.trim()
  if (!text) return `Request failed (${status})`

  try {
    const parsed = JSON.parse(text) as { message?: string }
    return parsed?.message ?? text
  } catch {
    return text
  }
}
