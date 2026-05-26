const fs = require("node:fs");
const path = require("node:path");
const { execSync } = require("node:child_process");

const envPath = path.join(__dirname, "../..", ".env");

const currentEnv = fs.readFileSync(envPath, "utf8");

if (!currentEnv.includes("VAPID_PUBLIC_KEY")) {
    console.log("🔑 Generating VAPID keys for Web Push...");

    try {
        const output = execSync("npx --yes web-push generate-vapid-keys", {
            encoding: "utf8",
        });

        const publicKeyMatch = output.match(/Public Key:\s*(.+)/);
        const privateKeyMatch = output.match(/Private Key:\s*(.+)/);

        if (publicKeyMatch && privateKeyMatch) {
            const publicKey = publicKeyMatch[1].trim();
            const privateKey = privateKeyMatch[1].trim();

            const newKeys = `
# Web Push Keys (Auto-Generated)
VAPID_PUBLIC_KEY=${publicKey}
VAPID_PRIVATE_KEY=${privateKey}
VITE_VAPID_PUBLIC_KEY=${publicKey}
`;

            fs.appendFileSync(envPath, newKeys);
            console.log("✅ VAPID keys generated and appended to .env");
        } else {
            console.error("❌ Failed to parse VAPID keys from output.");
        }
    } catch (error) {
        console.error("❌ Error generating keys:", error.message);
        console.error("Please install node and npx correctly.");
        process.exit(1);
    }
} else {
    console.log("✅ VAPID keys already present.");
}
