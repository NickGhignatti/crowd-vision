export const getSensorServiceUrl = () =>
  process.env.SENSOR_SERVICE_URL || "http://localhost:3000";
export const shouldSyncThresholds = () => process.env.NODE_ENV !== "test";
export const getClientUrl = () =>
  process.env.CLIENT_URL || "http://localhost:5173";
