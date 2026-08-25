FROM rust:1.96-bookworm AS chef
# hadolint ignore=DL3008
# build-essential: rdkafka-sys vendors and compiles librdkafka's C sources at build time.
RUN apt-get update \
    && apt-get install -y --no-install-recommends mold build-essential \
    && rm -rf /var/lib/apt/lists/* \
    && cargo install cargo-chef --locked
WORKDIR /app/backend/digital-twin
ENV RUSTFLAGS="-C link-arg=-fuse-ld=mold"

# ── capture the dependency graph ────────────────────────────────────────
FROM chef AS planner
COPY schemas/claims-schema /app/schemas/claims-schema
COPY schemas/twin-schema /app/schemas/twin-schema
COPY schemas/telemetry-schema /app/schemas/telemetry-schema
COPY backend/digital-twin .
RUN cargo chef prepare --recipe-path recipe.json

FROM chef AS dev
RUN cargo install cargo-watch --locked
COPY --from=planner /app/backend/digital-twin/recipe.json recipe.json
COPY schemas/claims-schema /app/schemas/claims-schema
COPY schemas/twin-schema /app/schemas/twin-schema
COPY schemas/telemetry-schema /app/schemas/telemetry-schema
RUN cargo chef cook --recipe-path recipe.json
COPY backend/libs/auth-policy /app/backend/libs/auth-policy
COPY backend/libs/auth-contracts /app/backend/libs/auth-contracts
COPY schemas/fixtures /app/schemas/fixtures
COPY schemas/json /app/schemas/json
COPY scripts/test/rust-integration-tests.sh /app/scripts/test/rust-integration-tests.sh
COPY backend/digital-twin .
CMD ["cargo", "watch", "-x", "run"]

FROM chef AS builder
COPY --from=planner /app/backend/digital-twin/recipe.json recipe.json
COPY schemas/claims-schema /app/schemas/claims-schema
COPY schemas/twin-schema /app/schemas/twin-schema
COPY schemas/telemetry-schema /app/schemas/telemetry-schema
RUN cargo chef cook --release --recipe-path recipe.json
COPY backend/libs/auth-policy /app/backend/libs/auth-policy
COPY backend/libs/auth-contracts /app/backend/libs/auth-contracts
COPY backend/digital-twin .
RUN cargo build --release

FROM gcr.io/distroless/cc-debian12:nonroot AS production
# Distroless: no shell, no package manager, patched upstream - so the cd-registry Trivy
# scan needs no apt-get upgrade step here. ca-certificates and libssl ship in the base
# image; zlib does not.
COPY --from=builder /usr/lib/x86_64-linux-gnu/libz.so.1 /usr/lib/x86_64-linux-gnu/libz.so.1
COPY --from=builder /app/backend/digital-twin/target/release/digital-twin /usr/local/bin/digital-twin

EXPOSE 3000
CMD ["/usr/local/bin/digital-twin"]
