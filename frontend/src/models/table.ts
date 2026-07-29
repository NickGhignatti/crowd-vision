export interface MetricContract {
    metricKey: string
    label: string
    interfaceName: string
    unit?: string
    sourceService?: string
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