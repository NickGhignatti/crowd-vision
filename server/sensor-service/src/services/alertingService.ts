import { resolveThreshold } from './buildingThresholdService.js';

export const getServerUrl = () =>
  process.env.VITE_SERVER_URL || 'http://localhost:3000';

export const checkTemperature = async (
  buildingId: string,
  roomId: string,
  temperature: number,
) => {
  const maxTemperature = await resolveThreshold(buildingId, roomId);

  if (temperature <= maxTemperature) {
    return;
  }

  try {
    const response = await fetch(`${getServerUrl()}/notification/push/temperature`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ buildingId, roomId, temperature }),
    });

    if (!response.ok) {
      const details = await response.text();
      console.error(`Temperature alert dispatch failed (${response.status}): ${details}`);
    }
  } catch (error) {
    console.error("Temperature alert dispatch failed:", error);
  }
};
