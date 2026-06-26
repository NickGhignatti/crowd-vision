const fs = require("node:fs");
const path = require("node:path");
const readline = require("node:readline");

const envPath = process.env.ENV_FILE || path.join(__dirname, "../..", ".env");

function parseEnv() {
    const envVars = {};
    let content = "";
    try {
        content = fs.readFileSync(envPath, "utf8");
    } catch (e) {
        if (e.code !== "ENOENT") throw e;
    }
    content.split(/\r?\n/).forEach(line => {
        const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
        if (match) {
            let key = match[1];
            let value = match[2] || '';
            value = value.replace(/^['"](.*)['"]$/, '$1'); // Remove quotes if present
            envVars[key] = value;
        }
    });
    return envVars;
}

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
});

const askQuestion = (query, defaultVal) => {
    return new Promise((resolve) => {
        rl.question(`${query} [${defaultVal}]: `, (answer) => {
            resolve(answer.trim() || defaultVal);
        });
    });
};

// Local-dev defaults written non-interactively. Override by editing .env.
const DEFAULT_CONFIG = {
    SERVER_PORT: "80",
    CLIENT_PORT: "8080",
    DEV_URL: "http://localhost",
};

async function setupConfig() {
    console.log("📝 Setting up environment configuration...\n");

    const existingEnv = parseEnv();
    const newConfigs = [];

    for (const [key, defaultVal] of Object.entries(DEFAULT_CONFIG)) {
        if (existingEnv[key]) {
            console.log(`⏩ ${key} already set (${existingEnv[key]})`);
        } else {
            newConfigs.push(`${key}=${defaultVal}`);
        }
    }

    async function checkAndAskOptional(key, promptText) {
        if (existingEnv[key]) {
            console.log(`⏩ ${promptText} already set`);
            return;
        }
        const val = await askQuestion(`${promptText} (leave empty to skip)`, "");
        // Always write the key so the agent-service config picks up an empty default
        // rather than crashing on a missing alias.
        newConfigs.push(`${key}=${val}`);
    }

    // Agent-service LLM credentials. The agent talks to any OpenAI-compatible
    // endpoint; we default to OpenRouter (chat + embeddings via one key). Optional —
    // the service boots without it, but /ask fails on the first LLM/tool-calling hop.
    // Get a key at https://openrouter.ai/keys. The legacy GOOGLE_API_KEY /
    // DEEPSEEK_API_KEY names are still honoured if already present in .env.
    await checkAndAskOptional("OPENROUTER_API_KEY", "Enter OPENROUTER_API_KEY");

    rl.close();

    if (newConfigs.length > 0) {
        const envConfig = `\n# Generated interactively by config script\n` + newConfigs.join("\n") + "\n";

        // appendFileSync creates the file if absent (no existsSync → no TOCTOU race).
        fs.appendFileSync(envPath, envConfig);
        console.log("\n✅ Saved new configurations to .env.");
    } else {
        console.log("\n✅ All configurations are already present in .env. Nothing was added.");
    }
}

setupConfig();
