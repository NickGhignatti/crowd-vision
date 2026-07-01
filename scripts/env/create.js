const fs = require("node:fs");
const path = require("node:path");

const envPath = path.join(__dirname, "../..", ".env");

// Atomic create-if-absent via the "wx" flag (no existsSync → no TOCTOU race).
try {
    fs.writeFileSync(envPath, "", { flag: "wx" });
    console.log("📝 Creating .env file with default configuration...");
} catch (e) {
    if (e.code !== "EEXIST") throw e;
}
