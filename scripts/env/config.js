const fs = require("node:fs");
const path = require("node:path");
const readline = require("node:readline");

const envPath = path.join(__dirname, "../..", ".env");

function parseEnv() {
    const envVars = {};
    if (fs.existsSync(envPath)) {
        const content = fs.readFileSync(envPath, "utf8");
        content.split(/\r?\n/).forEach(line => {
            const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
            if (match) {
                let key = match[1];
                let value = match[2] || '';
                value = value.replace(/^['"](.*)['"]$/, '$1'); // Remove quotes if present
                envVars[key] = value;
            }
        });
    }
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

    // Agent-service LLM credentials. Optional — the service boots without them
    // but /ask will fail on the first tool-calling hop. Get them from:
    //   - GOOGLE_API_KEY:   https://aistudio.google.com/apikey
    //   - DEEPSEEK_API_KEY: https://platform.deepseek.com/api_keys
    await checkAndAskOptional("GOOGLE_API_KEY", "Enter GOOGLE_API_KEY (Gemini)");
    await checkAndAskOptional("DEEPSEEK_API_KEY", "Enter DEEPSEEK_API_KEY");

    rl.close();

    if (newConfigs.length > 0) {
        const envConfig = `\n# Generated interactively by config script\n` + newConfigs.join("\n") + "\n";

        if (!fs.existsSync(envPath)) {
            fs.writeFileSync(envPath, envConfig.trim() + "\n");
            console.log("\n✅ Created new .env file with your configurations.");
        } else {
            fs.appendFileSync(envPath, envConfig);
            console.log("\n✅ Appended new configurations to .env.");
        }
    } else {
        console.log("\n✅ All configurations are already present in .env. Nothing was added.");
    }
}

setupConfig();
