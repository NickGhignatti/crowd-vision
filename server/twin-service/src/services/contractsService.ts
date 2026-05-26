const getContractsServiceUrl = () =>
  process.env.CONTRACTS_SERVICE_URL ?? "http://localhost:3001";

export const initBuildingPreferences = async (
  buildingId: string,
): Promise<void> => {
  if (process.env.NODE_ENV === "test") return;
  try {
    await fetch(
      `${getContractsServiceUrl()}/preferences/init/${encodeURIComponent(buildingId)}`,
      { method: "POST" },
    );
  } catch (err) {
    console.error("[contracts] failed to init building preferences:", err);
  }
};
