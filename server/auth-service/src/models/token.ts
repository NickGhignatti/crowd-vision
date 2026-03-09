export interface StandardTokenPayload {
    userId: string
    username: string
}

export interface DeviceTokenPayload {
    domainName: string
    buildingId: string
    deviceName: string
    deviceType: string
    isBuildingSpecific: boolean
}