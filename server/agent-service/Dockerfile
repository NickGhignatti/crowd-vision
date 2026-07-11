# Build context is the repo root (see docker-compose.yml / just/k8s.just) —
# agent-service reads the shared Cedar policy bundle at server/auth-policy
# AND the role-weight ladder at server/auth-contracts/roles.json (both
# siblings of server/agent-service), resolved in app/cedar_authz.py relative
# to this file's own location. COPY paths and WORKDIR below preserve the
# repo's real nesting so that relative path resolution is identical to local
# dev.
FROM python:3.12-slim AS builder
WORKDIR /app/server/agent-service
RUN pip install --no-cache-dir uv==0.11.16
COPY server/agent-service/pyproject.toml ./
COPY server/agent-service/app ./app
RUN uv pip install --system --no-cache .

FROM python:3.12-slim AS production
# Patch base-image OS CVEs for the cd-registry Trivy scan. DL3005 (no apt upgrade) is intentionally waived here.
# hadolint ignore=DL3005
RUN apt-get update && apt-get upgrade -y && rm -rf /var/lib/apt/lists/*
WORKDIR /app/server/agent-service
COPY --from=builder /usr/local/lib/python3.12/site-packages /usr/local/lib/python3.12/site-packages
COPY --from=builder /usr/local/bin /usr/local/bin
COPY server/auth-policy /app/server/auth-policy
COPY server/auth-contracts /app/server/auth-contracts
COPY server/agent-service/app ./app
COPY server/agent-service/alembic ./alembic
COPY server/agent-service/alembic.ini ./
EXPOSE 3000
CMD ["sh", "-c", "alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port 3000"]
