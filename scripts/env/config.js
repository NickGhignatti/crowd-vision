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

async function setupConfig() {
    console.log("📝 Setting up environment configuration...\n");

    const existingEnv = parseEnv();
    const newConfigs = [];

    async function checkAndAsk(key, promptText, defaultVal) {
        if (existingEnv[key]) {
            console.log(`⏩ Skipping ${promptText} (Found in .env: ${existingEnv[key]})`);
        } else {
            const val = await askQuestion(promptText, defaultVal);
            newConfigs.push(`${key}=${val}`);
        }
    }

    async function checkAndAskOptional(key, promptText) {
        if (existingEnv[key]) {
            const masked = existingEnv[key] ? "***" : "(empty)";
            console.log(`⏩ Skipping ${promptText} (Found in .env: ${masked})`);
            return;
        }
        const val = await askQuestion(`${promptText} (leave empty to skip)`, "");
        // Always write the key so the agent-service config picks up an empty default
        // rather than crashing on a missing alias.
        newConfigs.push(`${key}=${val}`);
    }

    await checkAndAsk("MONGO_PORT", "Enter MONGO_PORT", "27017");
    await checkAndAsk("SERVER_PORT", "Enter SERVER_PORT", "80");
    await checkAndAsk("CLIENT_PORT", "Enter CLIENT_PORT", "8080");
    await checkAndAsk("DEV_URL", "Enter DEV_URL", "http://localhost");
    await checkAndAsk("PROD_URL", "Enter PROD_URL", "http://localhost");

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
