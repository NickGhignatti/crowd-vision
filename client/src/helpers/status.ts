export function getStatusByOccupants(occupants: number, roomCapacity: number): string {
  const occupantsPercentage = occupants / roomCapacity
  if (occupantsPercentage === 0.0) return 'dashboards.table.rooms.status.empty'
  if (occupantsPercentage <= 0.5) return 'dashboards.table.rooms.status.normal'
  if (occupantsPercentage <= 0.95) return 'dashboards.table.rooms.status.crowded'
  if (occupantsPercentage <= 1.0) return 'dashboards.table.rooms.status.full'
  return 'dashboards.table.rooms.status.overcrowded'
}

export function getStatusColor(statusKey: string) {
  if (!statusKey) return ''
  switch (statusKey) {
    case 'dashboards.table.rooms.status.empty':
      return 'text-emerald-600 font-semibold'
    case 'dashboards.table.rooms.status.normal':
      return 'text-blue-600'
    case 'dashboards.table.rooms.status.crowded':
      return 'text-orange-600'
    case 'dashboards.table.rooms.status.full':
      return 'text-red-600 font-semibold'
    default:
      return 'text-red-600 font-semibold'
  }
}

