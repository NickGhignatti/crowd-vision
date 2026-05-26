import type { IDomainMembership } from "./domain.js";

export interface StandardTokenPayload {
  accountId: string;
  accountName: string;
  accountMemberships?: IDomainMembership[];
}

export interface DeviceTokenPayload {
  domainName: string;
  buildingId: string;
  deviceName: string;
  deviceType: string;
  isBuildingSpecific: boolean;
}
