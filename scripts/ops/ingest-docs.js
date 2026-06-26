#!/usr/bin/env node
/**
 * Ingest documentation into the agent-service knowledge base.
 *
 * Usage:
 *   node scripts/ops/ingest-docs.js [dir1 dir2 ...]
 *
 * Defaults to documentation/user and documentation/developer if no dirs are
 * passed. Reads JWT_SECRET from .env, mints a short-lived HS256 token, and
 * POSTs each file's content to {AGENT_URL}/agent/ingest.
 */
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const ROOT = path.resolve(__dirname, "../..");
const ENV_PATH = path.join(ROOT, ".env");
// AGENT_SERVICE_URL points at the agent-service base. From the host (default),
// Caddy fronts it at /agent. Inside the docker network, set
// AGENT_SERVICE_URL=http://agent-service:3000.
const AGENT_URL = process.env.AGENT_SERVICE_URL || "http://localhost/agent";
const READY_TIMEOUT_MS = Number(process.env.READY_TIMEOUT_MS || 60000);

function loadEnv() {
  const text = fs.readFileSync(ENV_PATH, "utf8");
  const out = {};
  for (const line of text.split("\n")) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m) out[m[1]] = m[2].replace(/^"|"$/g, "");
  }
  return out;
}

function b64url(buf) {
  return Buffer.from(buf)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function signJwt(payload, secret) {
  const header = { alg: "HS256", typ: "JWT" };
  const body =
    b64url(JSON.stringify(header)) + "." + b64url(JSON.stringify(payload));
  const sig = crypto.createHmac("sha256", secret).update(body).digest();
  return body + "." + b64url(sig);
}

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (/\.(qd|md|markdown)$/i.test(entry.name)) out.push(full);
  }
  return out;
}

function stripQdDirectives(text) {
  // Drop top-level Quarkdown directives (.docname {..}, .include {..}) — they
  // would otherwise show up as opaque chunks. Section headings carry the same
  // info via the chunker's section_path.
  return text.replace(/^\.[a-zA-Z_][\w]*\s*\{[^}]*\}\s*\n?/gm, "");
}

async function waitForReady() {
  const deadline = Date.now() + READY_TIMEOUT_MS;
  let lastErr = "";
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`${AGENT_URL}/health`);
      if (r.ok) return;
      lastErr = `HTTP ${r.status}`;
    } catch (e) {
      lastErr = e.message;
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  throw new Error(
    `agent-service did not become ready at ${AGENT_URL} within ${READY_TIMEOUT_MS}ms (last: ${lastErr})`,
  );
}

async function ingest(file, token) {
  const content = stripQdDirectives(fs.readFileSync(file, "utf8"));
  const source = path.relative(ROOT, file);
  const res = await fetch(`${AGENT_URL}/ingest`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      cookie: `authentication_token=${token}`,
    },
    body: JSON.stringify({
      source,
      content,
      metadata: { type: "user_doc", path: source },
      permissions: [], // public — visible to all callers
    }),
  });
  const body = await res.text();
  return { source, status: res.status, body };
}

async function main() {
  const env = loadEnv();
  const secret = env.JWT_SECRET;
  if (!secret) {
    console.error("JWT_SECRET not found in .env — run `just stack env` first.");
    process.exit(1);
  }

  const dirs =
    process.argv.slice(2).length > 0
      ? process.argv.slice(2)
      : [
          path.join(ROOT, "documentation/user"),
          path.join(ROOT, "documentation/developer"),
        ];

  const files = dirs.flatMap((d) => (fs.existsSync(d) ? walk(d) : []));
  if (files.length === 0) {
    console.error("No .qd/.md files found in:", dirs.join(", "));
    process.exit(1);
  }

  const token = signJwt(
    {
      accountName: "docs-ingester",
      accountId: "docs-ingester",
      accountMemberships: [],
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 600,
    },
    secret,
  );

  console.log(`Waiting for agent-service at ${AGENT_URL} ...`);
  await waitForReady();
  console.log(`Ingesting ${files.length} file(s) into ${AGENT_URL} ...`);
  let ok = 0;
  let skipped = 0;
  let failed = 0;
  for (const f of files) {
    try {
      const { source, status, body } = await ingest(f, token);
      if (status >= 200 && status < 300) {
        const j = JSON.parse(body);
        if (j.skipped) skipped++;
        else ok++;
        console.log(
          `  ${j.skipped ? "↺" : "✓"} ${source}  chunks=${j.chunks ?? "-"}${j.skipped ? " (already ingested)" : ""}`,
        );
      } else {
        failed++;
        console.log(`  ✗ ${source}  HTTP ${status}  ${body.slice(0, 200)}`);
      }
    } catch (e) {
      failed++;
      console.log(`  ✗ ${f}  ${e.message}`);
    }
  }
  console.log(`\nDone. ingested=${ok} unchanged=${skipped} failed=${failed}`);
  if (failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
