export interface MetricFieldContract {
  name: string
  type: string
  required: boolean
  description?: string
}

export interface MetricContract {
  kind: string
  label: string
  interface: string
  unit?: string
  value: string
  fields: MetricFieldContract[]
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
