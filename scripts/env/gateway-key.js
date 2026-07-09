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
    console.log("🔑 Generating stable gateway signing key (dev)...");
    const { privateKey } = crypto.generateKeyPairSync("rsa", {
        modulusLength: 2048,
        privateKeyEncoding: { type: "pkcs8", format: "pem" },
    });

    fs.mkdirSync(secretsDir, { recursive: true });
    try {
        // 'wx' creates exclusively and fails with EEXIST if the file already
        // exists — atomic, so there's no check-then-write race between two
        // concurrent invocations (e.g. two `just stack dev` runs).
        fs.writeFileSync(keyPath, privateKey, { mode: 0o600, flag: "wx" });
        console.log(`✅ Gateway signing key written to secrets/gateway-dev-key.pem`);
    } catch (err) {
        if (err.code === "EEXIST") {
            console.log("✅ Gateway signing key already present. Skipping generation.");
            return;
        }
        throw err;
    }
}

generateGatewayKey();
