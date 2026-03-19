import crypto from "crypto";

// 1. Configuration — fail fast if required env vars are absent
const SECRET = process.env.INTERNAL_ADMIN_SECRET;
const DEV_URL = process.env.DEV_URL;
const SERVER_PORT = process.env.SERVER_PORT;
const PASSWORD = process.env.YARVUE_PASSWORD;

if (!SECRET) {
  console.error("Error: INTERNAL_ADMIN_SECRET environment variable is required");
  process.exit(1);
}
if (!DEV_URL || !SERVER_PORT) {
  console.error("Error: DEV_URL and SERVER_PORT environment variables are required");
  process.exit(1);
}
if (!PASSWORD) {
  console.error("Error: YARVUE_PASSWORD environment variable is required");
  process.exit(1);
}

const API_URL = DEV_URL + ":" + SERVER_PORT;

// 2. The data we want to send
const payload = {
  companyName: "YarVue",
  companyAdminMail: "yarvue.admin@yarvue.com",
  companyPassword: PASSWORD,
  companyDomain: 'yarvue.com'
};

// 3. Stringify the payload (Must match the server's JSON format exactly)
const payloadString = JSON.stringify(payload);

// 4. Generate the HMAC Signature
const signature = crypto
  .createHmac("sha256", SECRET)
  .update(payloadString)
  .digest("hex");

console.log("Sending request...\n");

// 5. Send the request
async function provisionEnterprise() {
  try {
    const response = await fetch(API_URL + "/auth/business/register", {
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
    console.error("Network Error:", err.message);
  }
}

provisionEnterprise();
