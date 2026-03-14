export interface StandardTokenPayload {
    accountId: string
    accountName: string
}

export interface DeviceTokenPayload {
    domainName: string
    buildingId: string
    deviceName: string
    deviceType: string
    isBuildingSpecific: boolean
}