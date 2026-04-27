const MAX_TEMPERATURE = 27.0;
export const getServerUrl = () =>
  process.env.VITE_SERVER_URL || "http://localhost:3000";

export const checkTemperature = (buildingName: string, roomName: string, temperature: number) => {
  if (temperature > MAX_TEMPERATURE) {
    fetch(`${getServerUrl()}/notification/trigger`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: "Temperature Alert: " + temperature + "°C in " + buildingName + " - " + roomName,
        type: "alert",
        buildingName,
      }),
    });
  }
}
