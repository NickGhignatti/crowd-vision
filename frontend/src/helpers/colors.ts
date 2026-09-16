export interface ColorBand {
  /** Exclusive upper bound; the last band has none. */
  below: number | null
  color: string
  key: string
}

const NO_READING = '#000000'

export const TEMPERATURE_BANDS: ColorBand[] = [
  { below: 16, color: '#1E3A8A', key: 'cold' },
  { below: 19, color: '#0EA5E9', key: 'cool' },
  { below: 24, color: '#10B981', key: 'comfortable' },
  { below: 27, color: '#F59E0B', key: 'warm' },
  { below: null, color: '#EF4444', key: 'hot' },
]

export const AQI_BANDS: ColorBand[] = [
  { below: 50, color: '#10B981', key: 'good' },
  { below: 75, color: '#F59E0B', key: 'fair' },
  { below: 100, color: '#D97706', key: 'moderate' },
  { below: null, color: '#EF4444', key: 'poor' },
]

const colorIn = (bands: ColorBand[], value: number) =>
  bands.find((band) => band.below === null || value < band.below)!.color

/** Each band with the bound it starts at, for a legend. */
export const bandRanges = (bands: ColorBand[]) =>
  bands.map((band, index) => ({ ...band, from: bands[index - 1]?.below ?? null, to: band.below }))

export function roomColorStandard(): string {
  return '#e2e8f0'
}

// Callers pass 0 for a room with no reading, so 0 paints as "no data", not as freezing.
export function roomColorByTemperature(temperature: number): string {
  return temperature === 0 ? NO_READING : colorIn(TEMPERATURE_BANDS, temperature)
}

export function roomColorByAirQuality(iaqi: number): string {
  return iaqi === 0 ? NO_READING : colorIn(AQI_BANDS, iaqi)
}

export function roomOpacity(isSelected: boolean): number {
  return isSelected ? 0.17 : 0.1
}
