export const getServerUrl = () => process.env.VITE_SERVER_URL || "http://localhost:3000"
export const getClientUrl = () => process.env.CLIENT_URL || "http://localhost:5173";
export const getAdminSecret = () => process.env.INTERNAL_ADMIN_SECRET;
export const getTokenSecret = () => process.env.JWT_SECRET;