FROM rust:1.97-bookworm AS chef
# hadolint ignore=DL3008
RUN apt-get update \
    && apt-get install -y --no-install-recommends mold \
    && rm -rf /var/lib/apt/lists/* \
    && cargo install cargo-chef --locked
WORKDIR /app
# Use the faster mold linker for every cargo invocation in the build stages.
ENV RUSTFLAGS="-C link-arg=-fuse-ld=mold"

# ── capture the dependency graph ────────────────────────────────────────
FROM chef AS planner
COPY . .
RUN cargo chef prepare --recipe-path recipe.json

FROM chef AS dev
RUN cargo install cargo-watch --locked
COPY --from=planner /app/recipe.json recipe.json
RUN cargo chef cook --recipe-path recipe.json
COPY . .
CMD ["cargo", "watch", "-x", "run"]

FROM chef AS builder
COPY --from=planner /app/recipe.json recipe.json
RUN cargo chef cook --release --recipe-path recipe.json
COPY . .
RUN cargo build --release

FROM debian:bookworm-slim AS production
# Patch base-image OS CVEs for the cd-registry Trivy scan. DL3005 (no apt upgrade) is intentionally waived here.
# hadolint ignore=DL3005
RUN apt-get update \
    && apt-get upgrade -y \
    && apt-get install -y --no-install-recommends ca-certificates=20230311+deb12u1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY --from=builder /app/target/release/contracts-service /usr/local/bin/contracts-service

EXPOSE 3000
CMD ["contracts-service"]