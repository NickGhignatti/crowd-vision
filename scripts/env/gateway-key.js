const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

// A stable RSA signing key for claims-gateway in local dev. Without it,
// claims-gateway generates a fresh ephemeral key on every restart, which
// invalidates all existing sessions and churns the JWKS every consumer caches.
// Kept out of git (see .gitignore) and mounted into the container as a file,
// since a multi-line PEM can't live in a .env value.
const secretsDir = path.join(__dirname, "../..", "secrets");
const keyPath = path.join(secretsDir, "gateway-dev-key.pem");

function generateGatewayKey() {
    if (fs.existsSync(keyPath)) {
        console.log("✅ Gateway signing key already present. Skipping generation.");
        return;
    }

    console.log("🔑 Generating stable gateway signing key (dev)...");
    const { privateKey } = crypto.generateKeyPairSync("rsa", {
        modulusLength: 2048,
        privateKeyEncoding: { type: "pkcs8", format: "pem" },
    });

    fs.mkdirSync(secretsDir, { recursive: true });
    fs.writeFileSync(keyPath, privateKey, { mode: 0o600 });

    console.log(`✅ Gateway signing key written to secrets/gateway-dev-key.pem`);
}

generateGatewayKey();
