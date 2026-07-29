FROM rust:1.96-bookworm AS chef
# hadolint ignore=DL3008
RUN apt-get update \
    && apt-get install -y --no-install-recommends mold \
    && rm -rf /var/lib/apt/lists/* \
    && cargo install cargo-chef --locked
WORKDIR /app/server/twin-service
ENV RUSTFLAGS="-C link-arg=-fuse-ld=mold"

# ── capture the dependency graph ────────────────────────────────────────
FROM chef AS planner
COPY server/twin-service .
RUN cargo chef prepare --recipe-path recipe.json

FROM chef AS dev
RUN cargo install cargo-watch --locked
COPY --from=planner /app/server/twin-service/recipe.json recipe.json
RUN cargo chef cook --recipe-path recipe.json
COPY server/auth-policy /app/server/auth-policy
COPY server/auth-contracts /app/server/auth-contracts
COPY server/twin-service .
CMD ["cargo", "watch", "-x", "run"]

FROM chef AS builder
COPY --from=planner /app/server/twin-service/recipe.json recipe.json
RUN cargo chef cook --release --recipe-path recipe.json
COPY server/auth-policy /app/server/auth-policy
COPY server/auth-contracts /app/server/auth-contracts
COPY server/twin-service .
RUN cargo build --release

FROM debian:bookworm-slim AS production
# Patch base-image OS CVEs for the cd-registry Trivy scan. DL3005 (no apt upgrade) is intentionally waived here.
# hadolint ignore=DL3005
RUN apt-get update \
    && apt-get upgrade -y \
    && apt-get install -y --no-install-recommends ca-certificates=20230311+deb12u1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY --from=builder /app/server/twin-service/target/release/twin-service /usr/local/bin/twin-service

EXPOSE 3000
CMD ["twin-service"]
