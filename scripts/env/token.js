const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const envPath = path.join(__dirname, "../..", ".env");

const currentEnv = fs.readFileSync(envPath, "utf8");

// Local-dev-only secret for agent-service's evals/run_evals.py auto-minting
// bypass (see agent-service/CLAUDE.md's "Authentication" section) — nothing
// in a deployed environment reads this; production auth is RS256 against
// claims-gateway's JWKS, no shared secret involved.
if (!currentEnv.includes("EVAL_JWT_SECRET")) {
    console.log("🔑 Generating secure eval JWT secret...");

    const jwtSecret = crypto.randomBytes(32).toString("hex"); // 64-char hex, 256 bits entropy

    const jwtEnv = `
# Eval JWT Secret (Auto-Generated, 256-bit) — local-dev-only, see agent-service/CLAUDE.md
EVAL_JWT_SECRET=${jwtSecret}
`;

    fs.appendFileSync(envPath, jwtEnv);
    console.log("✅ EVAL_JWT_SECRET generated and appended to .env");
} else {
    console.log("✅ EVAL_JWT_SECRET already present.");
}
