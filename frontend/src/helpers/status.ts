import type { Tone } from '@/helpers/tone.ts'

const STATUS = 'dashboard.table.rooms.status'

const TONES: Record<string, Tone> = {
  [`${STATUS}.empty`]: 'neutral',
  [`${STATUS}.normal`]: 'success',
  [`${STATUS}.crowded`]: 'warning',
  [`${STATUS}.full`]: 'danger',
  [`${STATUS}.overcrowded`]: 'danger',
}

const ALERTS = new Set([`${STATUS}.full`, `${STATUS}.overcrowded`])

export function getStatusByOccupants(occupants: number, roomCapacity: number): string {
  const occupantsPercentage = occupants / roomCapacity
  if (occupantsPercentage === 0.0) return `${STATUS}.empty`
  if (occupantsPercentage <= 0.5) return `${STATUS}.normal`
  if (occupantsPercentage <= 0.95) return `${STATUS}.crowded`
  if (occupantsPercentage <= 1.0) return `${STATUS}.full`
  return `${STATUS}.overcrowded`
}

export const statusTone = (statusKey: string): Tone => TONES[statusKey] ?? 'neutral'

export const isAlertStatus = (statusKey: string): boolean => ALERTS.has(statusKey)
