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
  room: string
  roomId: string
  status: string
  teacher: string
  temp: string
  people: string
  capacity: string
  indoorAqi?: string
  [key: string]: any
}
