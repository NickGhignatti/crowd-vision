FROM rust:1.96-bookworm AS chef
RUN apt-get update \
    && apt-get install -y --no-install-recommends mold \
    && rm -rf /var/lib/apt/lists/* \
    && cargo install cargo-chef --locked
WORKDIR /app/backend/chat-service
# Use the faster mold linker for every cargo invocation in the build stages.
ENV RUSTFLAGS="-C link-arg=-fuse-ld=mold"

# ── capture the dependency graph ────────────────────────────────────────
FROM chef AS planner
COPY backend/claims-contracts /app/backend/claims-contracts
COPY backend/chat-service .
RUN cargo chef prepare --recipe-path recipe.json

# Debug-profile dependencies, shared by the `test` and `dev` stages below.
FROM chef AS debug-deps
COPY --from=planner /app/backend/chat-service/recipe.json recipe.json
COPY backend/claims-contracts /app/backend/claims-contracts
RUN cargo chef cook --recipe-path recipe.json

# Integration-test stage: deliberately does NOT install cargo-watch. It runs
# tests/*.rs once and exits, so compiling cargo-watch from source here is
# ~2 minutes of pure waste on every cold build.
FROM debug-deps AS test
COPY backend/chat-service .

FROM debug-deps AS dev
RUN cargo install cargo-watch --locked
COPY backend/chat-service .
CMD ["cargo", "watch", "-x", "run"]

FROM chef AS builder
COPY --from=planner /app/backend/chat-service/recipe.json recipe.json
COPY backend/claims-contracts /app/backend/claims-contracts
RUN cargo chef cook --release --recipe-path recipe.json
COPY backend/chat-service .
RUN cargo build --release

FROM debian:bookworm-slim AS production
# Patch base-image OS CVEs for the cd-registry Trivy scan. DL3005 (no apt upgrade) is intentionally waived here.
# curl is the compose healthcheck probe; kubernetes uses its own httpGet probe instead.
# hadolint ignore=DL3005
RUN apt-get update \
    && apt-get upgrade -y \
    && apt-get install -y --no-install-recommends ca-certificates curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY --from=builder /app/backend/chat-service/target/release/chat-service /usr/local/bin/chat-service

EXPOSE 3000
CMD ["chat-service"]
