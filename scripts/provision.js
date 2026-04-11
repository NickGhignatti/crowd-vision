const crypto = require("node:crypto");
const readline = require("node:readline");
const fs = require("node:fs");
const path = require("node:path");

const envPath = path.join(__dirname, "..", ".env");

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

const existingEnv = parseEnv();
const internalAdminSecret = existingEnv["INTERNAL_ADMIN_SECRET"];

if (!internalAdminSecret) {
    console.error("❌ Error: INTERNAL_ADMIN_SECRET not found in the .env file.");
    console.error("💡 Tip: Run the generate-secret.js script first.");
    process.exit(1);
}

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
});

const askQuestion = (query, defaultVal) => {
    return new Promise((resolve) => {
        const prompt = defaultVal ? `${query} [${defaultVal}]: ` : `${query}: `;
        rl.question(prompt, (answer) => {
            resolve(answer.trim() || defaultVal);
        });
    });
};

async function provisionEnterprise() {
    console.log("🚀 Interactive Enterprise Provisioning\n");

    let devUrl = existingEnv["DEV_URL"];
    if (devUrl) {
        console.log(`⏩ Skipping DEV_URL prompt (Found in .env: ${devUrl})`);
    } else {
        devUrl = await askQuestion("Enter DEV_URL", "http://localhost");
    }

    let serverPort = existingEnv["SERVER_PORT"];
    if (serverPort) {
        console.log(`⏩ Skipping SERVER_PORT prompt (Found in .env: ${serverPort})\n`);
    } else {
        serverPort = await askQuestion("Enter SERVER_PORT", "80");
        console.log("");
    }

    const companyName = await askQuestion("Enter Company Name", "someRandomCompanyName");
    const companyAdminMail = await askQuestion("Enter Admin Email", "some.random.company@name.com");
    const companyDomain = await askQuestion("Enter Company Domain", "somerandomcompany.com");

    const companyPassword = await askQuestion("Enter Admin Password", "");

    rl.close();

    if (!companyPassword) {
        console.error("\n❌ Error: Password is required to provision the enterprise.");
        process.exit(1);
    }

    const apiUrl = `${devUrl}:${serverPort}`;

    const payload = {
        companyName,
        companyAdminMail,
        companyPassword,
        companyDomain,
    };

    const payloadString = JSON.stringify(payload);

    const signature = crypto
        .createHmac("sha256", internalAdminSecret)
        .update(payloadString)
        .digest("hex");

    console.log(`\n📡 Sending provisioning request to ${apiUrl}...`);

    try {
        const response = await fetch(`${apiUrl}/auth/business/register`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "x-signature": signature,
            },
            body: payloadString,
        });

        const data = await response.json();

        if (response.ok) {
            console.log("✅ Success:", data);
        } else {
            console.error("❌ Failed:", data);
        }
    } catch (err) {
        console.error("❌ Network Error:", err.message);
        console.log("💡 Tip: Make sure your server is currently running and DEV_URL/SERVER_PORT are correct.");
    }
}

provisionEnterprise();