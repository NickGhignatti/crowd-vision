const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const envPath = path.join(__dirname, "..", ".env");

const currentEnv = fs.readFileSync(envPath, "utf8");

if (!currentEnv.includes("JWT_SECRET")) {
    console.log("🔑 Generating secure JWT secret...");

    const jwtSecret = crypto.randomBytes(32).toString("hex"); // 64-char hex, 256 bits entropy

    const jwtEnv = `
# JWT Secret (Auto-Generated, 256-bit)
JWT_SECRET=${jwtSecret}
`;

    fs.appendFileSync(envPath, jwtEnv);
    console.log("✅ JWT secret generated and appended to .env");
} else {
    console.log("✅ JWT_SECRET already present.");
}