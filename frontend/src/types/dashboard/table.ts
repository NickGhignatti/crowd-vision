export interface MetricContract {
  kind: string
  label: string
  interface: string
  unit?: string
  source?: string
}

export interface TableHeader {
  key: string
  metricKey?: string
  label: string
  cellClass?: string
}

export interface TableBody {
  roomId: string
  roomName: string
  roomMaxOccupancy: number
  status: string
  [metric: string]: unknown
}
