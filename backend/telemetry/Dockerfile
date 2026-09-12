FROM rust-base AS chef
WORKDIR /app/backend/telemetry

# ── capture the dependency graph ────────────────────────────────────────
FROM chef AS planner
COPY schemas/telemetry-schema /app/schemas/telemetry-schema
COPY schemas/claims-schema /app/schemas/claims-schema
COPY schemas/twin-schema /app/schemas/twin-schema
COPY backend/telemetry .
RUN cargo chef prepare --recipe-path recipe.json

FROM chef AS dev
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

FROM gcr.io/distroless/cc-debian12:nonroot AS production
# Distroless: no shell, no package manager, patched upstream - so the cd-registry Trivy
# scan needs no apt-get upgrade step here. The healthcheck runs `telemetry --health`, which
# probes /health in-process, so the image needs no probe binary either.
# ca-certificates and libssl ship in the base image; zlib does not.
COPY --from=builder /usr/lib/x86_64-linux-gnu/libz.so.1 /usr/lib/x86_64-linux-gnu/libz.so.1
COPY --from=builder /app/backend/telemetry/target/release/telemetry /usr/local/bin/telemetry

EXPOSE 3000
CMD ["/usr/local/bin/telemetry"]
