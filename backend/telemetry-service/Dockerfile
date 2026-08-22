FROM rust:1.96-bookworm AS chef
# hadolint ignore=DL3008
# build-essential: rdkafka-sys vendors and compiles librdkafka's C sources at build time.
RUN apt-get update \
    && apt-get install -y --no-install-recommends mold build-essential \
    && rm -rf /var/lib/apt/lists/* \
    && cargo install cargo-chef --locked
WORKDIR /app/backend/telemetry-service
ENV RUSTFLAGS="-C link-arg=-fuse-ld=mold"

# ── capture the dependency graph ────────────────────────────────────────
FROM chef AS planner
COPY backend/telemetry-contracts /app/backend/telemetry-contracts
COPY backend/telemetry-service .
RUN cargo chef prepare --recipe-path recipe.json

FROM chef AS dev
RUN cargo install cargo-watch --locked
COPY --from=planner /app/backend/telemetry-service/recipe.json recipe.json
COPY backend/telemetry-contracts /app/backend/telemetry-contracts
RUN cargo chef cook --recipe-path recipe.json
COPY backend/auth-policy /app/backend/auth-policy
COPY backend/auth-contracts /app/backend/auth-contracts
COPY scripts/rust-integration-tests.sh /app/scripts/rust-integration-tests.sh
COPY backend/telemetry-service .
CMD ["cargo", "watch", "-x", "run"]

FROM chef AS builder
COPY --from=planner /app/backend/telemetry-service/recipe.json recipe.json
COPY backend/telemetry-contracts /app/backend/telemetry-contracts
RUN cargo chef cook --release --recipe-path recipe.json
COPY backend/auth-policy /app/backend/auth-policy
COPY backend/auth-contracts /app/backend/auth-contracts
COPY backend/telemetry-service .
RUN cargo build --release

FROM debian:bookworm-slim AS production
# Patch base-image OS CVEs for the cd-registry Trivy scan. DL3005 (no apt upgrade) is intentionally waived here.
# hadolint ignore=DL3005
RUN apt-get update \
    && apt-get upgrade -y \
    && apt-get install -y --no-install-recommends ca-certificates curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY --from=builder /app/backend/telemetry-service/target/release/telemetry-service /usr/local/bin/telemetry-service

EXPOSE 3000
CMD ["telemetry-service"]
