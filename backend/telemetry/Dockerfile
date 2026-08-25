FROM rust:1.96-bookworm AS chef
# hadolint ignore=DL3008
# build-essential: rdkafka-sys vendors and compiles librdkafka's C sources at build time.
RUN apt-get update \
    && apt-get install -y --no-install-recommends mold build-essential \
    && rm -rf /var/lib/apt/lists/* \
    && cargo install cargo-chef --locked
WORKDIR /app/backend/telemetry
ENV RUSTFLAGS="-C link-arg=-fuse-ld=mold"

# ── capture the dependency graph ────────────────────────────────────────
FROM chef AS planner
COPY schemas/telemetry-schema /app/schemas/telemetry-schema
COPY schemas/claims-schema /app/schemas/claims-schema
COPY schemas/twin-schema /app/schemas/twin-schema
COPY backend/telemetry .
RUN cargo chef prepare --recipe-path recipe.json

FROM chef AS dev
RUN cargo install cargo-watch --locked
COPY --from=planner /app/backend/telemetry/recipe.json recipe.json
COPY schemas/telemetry-schema /app/schemas/telemetry-schema
COPY schemas/claims-schema /app/schemas/claims-schema
COPY schemas/twin-schema /app/schemas/twin-schema
RUN cargo chef cook --recipe-path recipe.json
COPY backend/libs/auth-policy /app/backend/libs/auth-policy
COPY backend/libs/auth-contracts /app/backend/libs/auth-contracts
COPY schemas/fixtures /app/schemas/fixtures
COPY scripts/test/rust-integration-tests.sh /app/scripts/test/rust-integration-tests.sh
COPY backend/telemetry .
CMD ["cargo", "watch", "-x", "run"]

FROM chef AS builder
COPY --from=planner /app/backend/telemetry/recipe.json recipe.json
COPY schemas/telemetry-schema /app/schemas/telemetry-schema
COPY schemas/claims-schema /app/schemas/claims-schema
COPY schemas/twin-schema /app/schemas/twin-schema
RUN cargo chef cook --release --recipe-path recipe.json
COPY backend/libs/auth-policy /app/backend/libs/auth-policy
COPY backend/libs/auth-contracts /app/backend/libs/auth-contracts
COPY backend/telemetry .
RUN cargo build --release

FROM debian:bookworm-slim AS production
# Patch base-image OS CVEs for the cd-registry Trivy scan. DL3005 (no apt upgrade) is intentionally waived here.
# hadolint ignore=DL3005
RUN apt-get update \
    && apt-get upgrade -y \
    && apt-get install -y --no-install-recommends ca-certificates curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY --from=builder /app/backend/telemetry/target/release/telemetry /usr/local/bin/telemetry

EXPOSE 3000
CMD ["telemetry"]
