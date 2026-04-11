const fs = require("node:fs");
const path = require("node:path");

const envPath = path.join(__dirname, "..", ".env");

if (!fs.existsSync(envPath)) {
    console.log("📝 Creating .env file with default configuration...");
    fs.writeFileSync(envPath, "");
}