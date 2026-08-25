#!/usr/bin/env python3
"""Ingest documentation into the agent knowledge base: mints a short-lived
HS256 token (see backend/agent/CLAUDE.md) and POSTs each file to {AGENT_URL}/agent/ingest."""

import base64
import hashlib
import hmac
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
ENV_PATH = ROOT / ".env"
AGENT_URL = os.environ.get("AGENT_URL", "http://localhost/agent")
READY_TIMEOUT_S = float(os.environ.get("READY_TIMEOUT_MS", 60000)) / 1000
HEALTH_TIMEOUT_S = 5
INGEST_TIMEOUT_S = 120


def load_env():
    out = {}
    for line in ENV_PATH.read_text(encoding="utf-8").split("\n"):
        match = re.match(r"^([A-Z_][A-Z0-9_]*)=(.*)$", line)
        if match:
            out[match.group(1)] = re.sub(r'^"|"$', "", match.group(2))
    return out


def b64url(raw):
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode()


def sign_jwt(payload, secret):
    header = {"alg": "HS256", "typ": "JWT"}
    dump = lambda obj: json.dumps(obj, separators=(",", ":")).encode()
    body = b64url(dump(header)) + "." + b64url(dump(payload))
    signature = hmac.new(secret.encode(), body.encode(), hashlib.sha256).digest()
    return body + "." + b64url(signature)


def walk(directory):
    out = []
    for entry in sorted(os.listdir(directory)):
        full = os.path.join(directory, entry)
        if os.path.isdir(full):
            out.extend(walk(full))
        elif re.search(r"\.(qd|md|markdown)$", entry, re.IGNORECASE):
            out.append(full)
    return out


def strip_qd_directives(text):
    return re.sub(r"^\.[a-zA-Z_]\w*\s*\{[^}]*\}\s*\n?", "", text, flags=re.MULTILINE)


def wait_for_ready():
    deadline = time.monotonic() + READY_TIMEOUT_S
    last_error = ""
    while time.monotonic() < deadline:
        try:
            with urllib.request.urlopen(f"{AGENT_URL}/health", timeout=HEALTH_TIMEOUT_S) as response:
                if 200 <= response.status < 300:
                    return
                last_error = f"HTTP {response.status}"
        except urllib.error.HTTPError as error:
            last_error = f"HTTP {error.code}"
        except Exception as error:
            last_error = str(error)
        time.sleep(1.5)
    raise RuntimeError(
        f"agent did not become ready at {AGENT_URL} within "
        f"{int(READY_TIMEOUT_S * 1000)}ms (last: {last_error})"
    )


def ingest(file, token):
    content = strip_qd_directives(Path(file).read_text(encoding="utf-8"))
    source = os.path.relpath(file, ROOT)
    payload = json.dumps(
        {
            "source": source,
            "content": content,
            "metadata": {"type": "user_doc", "path": source},
            "permissions": [],
        },
        separators=(",", ":"),
        ensure_ascii=False,
    ).encode("utf-8")
    request = urllib.request.Request(
        f"{AGENT_URL}/ingest",
        data=payload,
        method="POST",
        headers={
            "content-type": "application/json",
            "cookie": f"authentication_token={token}",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=INGEST_TIMEOUT_S) as response:
            return source, response.status, response.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as error:
        return source, error.code, error.read().decode("utf-8", "replace")


def main():
    secret = load_env().get("EVAL_JWT_SECRET")
    if not secret:
        print("EVAL_JWT_SECRET not found in .env — run `just stack env` first.", file=sys.stderr)
        sys.exit(1)

    dirs = sys.argv[1:] or [str(ROOT / "documentation/user"), str(ROOT / "documentation/developer")]
    files = [f for d in dirs if os.path.exists(d) for f in walk(d)]
    if not files:
        print("No .qd/.md files found in:", ", ".join(dirs), file=sys.stderr)
        sys.exit(1)

    now = int(time.time())
    token = sign_jwt(
        {"sub": "docs-ingester", "roles": [], "domains": [], "iat": now, "exp": now + 600},
        secret,
    )

    print(f"Waiting for agent at {AGENT_URL} ...")
    wait_for_ready()
    print(f"Ingesting {len(files)} file(s) into {AGENT_URL} ...")

    ok = skipped = failed = 0
    for file in files:
        try:
            source, status, body = ingest(file, token)
            if 200 <= status < 300:
                data = json.loads(body)
                chunks = data.get("chunks")
                if data.get("skipped"):
                    skipped += 1
                else:
                    ok += 1
                mark = "↺" if data.get("skipped") else "✓"
                note = " (already ingested)" if data.get("skipped") else ""
                print(f"  {mark} {source}  chunks={'-' if chunks is None else chunks}{note}")
            else:
                failed += 1
                print(f"  ✗ {source}  HTTP {status}  {body[:200]}")
        except Exception as error:
            failed += 1
            print(f"  ✗ {file}  {error}")

    print(f"\nDone. ingested={ok} unchanged={skipped} failed={failed}")
    if failed:
        sys.exit(1)


try:
    main()
except SystemExit:
    raise
except Exception as error:
    print(error, file=sys.stderr)
    sys.exit(1)
