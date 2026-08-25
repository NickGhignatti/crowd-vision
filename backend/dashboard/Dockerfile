FROM rust:1.96-bookworm AS chef
# hadolint ignore=DL3008
RUN apt-get update \
    && apt-get install -y --no-install-recommends mold \
    && rm -rf /var/lib/apt/lists/* \
    && cargo install cargo-chef --locked
WORKDIR /app/backend/dashboard
# Use the faster mold linker for every cargo invocation in the build stages.
ENV RUSTFLAGS="-C link-arg=-fuse-ld=mold"

# ── capture the dependency graph ────────────────────────────────────────
FROM chef AS planner
COPY schemas/telemetry-schema /app/schemas/telemetry-schema
COPY schemas/claims-schema /app/schemas/claims-schema
COPY backend/dashboard .
RUN cargo chef prepare --recipe-path recipe.json

FROM chef AS dev
RUN cargo install cargo-watch --locked
COPY --from=planner /app/backend/dashboard/recipe.json recipe.json
COPY schemas/telemetry-schema /app/schemas/telemetry-schema
COPY schemas/claims-schema /app/schemas/claims-schema
RUN cargo chef cook --recipe-path recipe.json
COPY backend/dashboard .
CMD ["cargo", "watch", "-x", "run"]

FROM chef AS builder
COPY --from=planner /app/backend/dashboard/recipe.json recipe.json
COPY schemas/telemetry-schema /app/schemas/telemetry-schema
COPY schemas/claims-schema /app/schemas/claims-schema
RUN cargo chef cook --release --recipe-path recipe.json
COPY backend/dashboard .
RUN cargo build --release

FROM debian:bookworm-slim AS production
# Patch base-image OS CVEs for the cd-registry Trivy scan. DL3005 (no apt upgrade) is intentionally waived here.
# hadolint ignore=DL3005
RUN apt-get update \
    && apt-get upgrade -y \
    && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY --from=builder /app/backend/dashboard/target/release/dashboard /usr/local/bin/dashboard

EXPOSE 3000
CMD ["dashboard"]