export function roomBorderColorByTemperature(temperature: number): string {
  if (temperature < 16.0) return '#1E3A8A'
  if (temperature < 19.0) return '#0EA5E9'
  if (temperature < 24.0) return '#10B981'
  if (temperature < 27.0) return '#F59E0B'
  return '#EF4444'
}

export function roomOpacity(isSelected: boolean): number {
  return isSelected ? 0.17 : 0.1
}
