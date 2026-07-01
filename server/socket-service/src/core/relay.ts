const TELEMETRY_CHANNEL_PREFIX = "telemetry:filtered:";

/** Extracts the building id from a `telemetry:filtered:<id>` channel name. */
export function buildingIdFromChannel(channel: string): string {
  return channel.slice(TELEMETRY_CHANNEL_PREFIX.length);
}

/** The Socket.IO room that a building's subscribers join. */
export function roomForBuilding(buildingId: string): string {
  return `building:${buildingId}`;
}

/** The Socket.IO room a domain's members join, for scoped notifications. */
export function roomForDomain(domainName: string): string {
  return `domain:${domainName}`;
}
