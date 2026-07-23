const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

// Stable RSA signing key for claims-gateway (dev), so restarts don't churn sessions/JWKS.
// Kept out of git; mounted as a file since a multi-line PEM can't live in .env.
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
        // 'wx' is atomic: fails with EEXIST if present, avoiding a check-then-write
        // race between concurrent invocations (e.g. two `just stack dev` runs).
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
