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

/** Colour stops in °C relative to a room's own limit; teal marks comfort, and no green/red pair. */
export const TEMPERATURE_SCALE = [
  { offset: -12, color: '#2563EB' },
  { offset: -7, color: '#7DD3FC' },
  { offset: -5, color: '#5EEAD4' },
  { offset: -3, color: '#FBBF24' },
  { offset: -1, color: '#F97316' },
  { offset: 0, color: '#DC2626' },
] as const

const toChannels = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
const toHex = (channels: number[]) =>
  `#${channels.map((c) => Math.round(c).toString(16).padStart(2, '0')).join('')}`

/** Thermal glow: opacity at the floor of a fully deviating room, and how fast it fades upward. */
export const THERMAL_GLOW = { floorOpacity: 0.6, falloff: 1.5 }

// Telemetry's fallback limit when neither the room nor its building sets one.
export const DEFAULT_MAX_TEMPERATURE = 27

/** Smooth colour for `temperature` against the room's `maxTemperature`; 0 means no reading. */
export function temperatureColor(
  temperature: number,
  maxTemperature = DEFAULT_MAX_TEMPERATURE,
): string {
  if (temperature === 0) return NO_READING
  const offset = temperature - maxTemperature
  const upper = TEMPERATURE_SCALE.findIndex((stop) => offset <= stop.offset)
  if (upper === 0) return TEMPERATURE_SCALE[0].color.toLowerCase()
  if (upper === -1) return TEMPERATURE_SCALE[TEMPERATURE_SCALE.length - 1]!.color.toLowerCase()
  const from = TEMPERATURE_SCALE[upper - 1]!
  const to = TEMPERATURE_SCALE[upper]!
  const t = (offset - from.offset) / (to.offset - from.offset)
  const [a, b] = [toChannels(from.color), toChannels(to.color)]
  return toHex(a.map((channel, i) => channel + (b[i]! - channel) * t))
}

/** CSS gradient of the temperature scale, coldest stop at 0% and the limit at 100%. */
export function temperatureGradient(): string {
  const span = -TEMPERATURE_SCALE[0].offset
  const stops = TEMPERATURE_SCALE.map(
    ({ offset, color }) => `${color} ${Number((((offset + span) / span) * 100).toFixed(2))}%`,
  )
  return `linear-gradient(to right, ${stops.join(', ')})`
}

// Callers pass 0 for a room with no reading, so 0 paints as "no data", not as freezing.
export function roomColorByTemperature(temperature: number): string {
  return temperature === 0 ? NO_READING : colorIn(TEMPERATURE_BANDS, temperature)
}

export function roomColorByAirQuality(iaqi: number): string {
  return iaqi === 0 ? NO_READING : colorIn(AQI_BANDS, iaqi)
}
